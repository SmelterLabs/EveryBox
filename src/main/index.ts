import { app, BrowserWindow, clipboard, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { GlassmailDB } from './db/database'
import { seedDemoDataIfEmpty } from './db/seed'
import { SecretStore } from './security/secrets'
import { runGoogleOAuthLoopback } from './mail/gmail-oauth'
import { testImapConnection } from './mail/imap-sync'
import { SyncManager } from './mail/sync-manager'
import { CalendarManager } from './calendar/calendar-manager'
import { detectLocalAI } from './ai/provider'
import { askInboxAssistant } from './ai/assistant'
import { summarizeThread } from './ai/summarizer'
import { draftVoiceMatchedReply } from './ai/writer'
import { parseNaturalLanguageSearch } from './ai/nl-search'
import type {
  Account,
  AppSettings,
  CreateCalendarEventPayload,
  Folder,
  MailboxId,
  SendEmailPayload,
  Snippet,
  Workspace
} from '../shared/types'

let mainWindow: BrowserWindow | null = null
let db: GlassmailDB
let secrets: SecretStore
let syncManager: SyncManager
let calendarManager: CalendarManager

const ACCOUNT_COLORS = ['#E87A48', '#4F9CF9', '#34C77B', '#B77CFF', '#F5B841', '#EC5C8A']

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#171615',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#171615',
      symbolColor: '#b8b3ac',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function broadcastDataUpdated(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('glassmail:data-updated')
  }
}

function registerIpc(): void {
  // ---- Settings ----
  ipcMain.handle('settings:get', () => db.getSettings())
  ipcMain.handle('settings:save', (_, settings: AppSettings) => {
    db.saveSettings(settings)
    if (mainWindow && !mainWindow.isDestroyed()) {
      const darkThemes = ['dark', 'black', 'graphite']
      const isDark = darkThemes.includes(settings.theme)
      mainWindow.setTitleBarOverlay?.({
        color: settings.theme === 'black' ? '#000000' : isDark ? '#171615' : settings.theme === 'paper' ? '#F6F2EA' : '#FAFAFA',
        symbolColor: isDark ? '#b8b3ac' : '#4a4642',
        height: 36
      })
    }
    return { ok: true }
  })
  ipcMain.handle('secrets:set', (_, key: string, value: string) => {
    secrets.set(key, value)
    return { ok: true }
  })
  ipcMain.handle('secrets:has', (_, key: string) => secrets.has(key))

  // ---- Accounts & Workspaces ----
  ipcMain.handle('accounts:list', () => db.listAccounts())
  ipcMain.handle('accounts:clear-demo', () => {
    db.clearDemoAccounts()
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('accounts:delete', (_, id: string) => {
    db.deleteAccount(id)
    secrets.delete(`google_tokens:${id}`)
    secrets.delete(`imap_pass:${id}`)
    secrets.delete(`smtp_pass:${id}`)
    secrets.delete(`caldav_pass:${id}`)
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('accounts:update', (_, account: Account) => {
    db.upsertAccount(account)
    broadcastDataUpdated()
    return { ok: true }
  })

  ipcMain.handle('accounts:connect-gmail', async () => {
    const settings = db.getSettings()
    if (!settings.googleOAuthClientId || !settings.googleOAuthClientSecret) {
      return {
        ok: false,
        error: 'Please enter your free Google Cloud Desktop OAuth Client ID and Secret in Settings › Accounts first.'
      }
    }
    try {
      const { email, name, tokens } = await runGoogleOAuthLoopback(
        settings.googleOAuthClientId,
        settings.googleOAuthClientSecret
      )
      // Remove demo accounts when user connects first real account
      db.clearDemoAccounts()
      const existing = db.listAccounts().find((a) => a.email.toLowerCase() === email.toLowerCase())
      const id = existing?.id || `gmail-${randomUUID().slice(0, 8)}`
      const color = existing?.color || ACCOUNT_COLORS[db.listAccounts().length % ACCOUNT_COLORS.length]
      secrets.set(`google_tokens:${id}`, JSON.stringify(tokens))
      db.upsertAccount({
        id,
        provider: 'gmail',
        name: existing?.name || name || email.split('@')[0],
        email,
        color,
        signatureHtml: existing?.signatureHtml || `<p>Best,<br/>${name}</p>`,
        isEnabled: true,
        isDemo: false,
        calendarEnabled: true,
        syncStatus: 'syncing'
      })
      broadcastDataUpdated()
      // Kick off mail + calendar sync in background
      void syncManager.syncAccount(id).then(() => calendarManager.syncAllCalendars()).then(broadcastDataUpdated)
      return { ok: true, accountId: id, email }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'accounts:add-imap',
    async (
      _,
      input: {
        name: string
        email: string
        password: string
        imapHost: string
        imapPort: number
        imapSecure: boolean
        smtpHost: string
        smtpPort: number
        smtpSecure: boolean
        smtpSeparateAuth?: boolean
        smtpUsername?: string
        smtpPassword?: string
        caldavUrl?: string
        caldavUsername?: string
        caldavPassword?: string
        icsFeedUrl?: string
      }
    ) => {
      const test = await testImapConnection({
        host: input.imapHost,
        port: input.imapPort,
        secure: input.imapSecure,
        user: input.email,
        pass: input.password
      })
      if (!test.ok) return { ok: false, error: test.error || 'IMAP connection failed.' }

      db.clearDemoAccounts()
      const id = `imap-${randomUUID().slice(0, 8)}`
      const color = ACCOUNT_COLORS[db.listAccounts().length % ACCOUNT_COLORS.length]
      secrets.set(`imap_pass:${id}`, input.password)
      if (input.smtpSeparateAuth && input.smtpPassword) {
        secrets.set(`smtp_pass:${id}`, input.smtpPassword)
      }
      if (input.caldavPassword) {
        secrets.set(`caldav_pass:${id}`, input.caldavPassword)
      }

      db.upsertAccount({
        id,
        provider: 'imap',
        name: input.name || input.email.split('@')[0],
        email: input.email,
        color,
        signatureHtml: `<p>Best,<br/>${input.name || ''}</p>`,
        isEnabled: true,
        isDemo: false,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapSecure: input.imapSecure,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        smtpSeparateAuth: input.smtpSeparateAuth,
        smtpUsername: input.smtpUsername,
        caldavUrl: input.caldavUrl,
        caldavUsername: input.caldavUsername,
        icsFeedUrl: input.icsFeedUrl,
        calendarEnabled: Boolean(input.caldavUrl || input.icsFeedUrl),
        syncStatus: 'syncing'
      })
      broadcastDataUpdated()
      void syncManager.syncAccount(id).then(() => calendarManager.syncAllCalendars()).then(broadcastDataUpdated)
      return { ok: true, accountId: id }
    }
  )

  ipcMain.handle('workspaces:list', () => db.listWorkspaces())
  ipcMain.handle('workspaces:save', (_, ws: Workspace) => {
    db.upsertWorkspace(ws)
    return { ok: true }
  })
  ipcMain.handle('workspaces:delete', (_, id: string) => {
    db.deleteWorkspace(id)
    return { ok: true }
  })

  // ---- Mail Queries & Actions ----
  ipcMain.handle('folders:list', (_, accountIds?: string[]) => db.listFolders(accountIds))
  ipcMain.handle('mail:counts', (_, accountIds?: string[]) => db.getMailboxCounts(accountIds))
  ipcMain.handle(
    'mail:list-threads',
    (_, opts: { accountIds?: string[]; mailbox: MailboxId; category?: 'all' | 'people' | 'updates'; folderName?: string }) =>
      db.listThreads(opts)
  )
  ipcMain.handle('mail:get-thread', (_, threadId: string) => db.getThreadDetail(threadId))
  ipcMain.handle('mail:search', (_, query: string, accountIds?: string[]) => {
    const parsed = parseNaturalLanguageSearch(query)
    const threads = db.searchThreads(parsed, accountIds)
    return { parsed, threads }
  })

  ipcMain.handle('mail:sync-all', async () => {
    await syncManager.syncAllAccounts(true)
    await calendarManager.syncAllCalendars()
    broadcastDataUpdated()
    return { ok: true }
  })

  ipcMain.handle('mail:set-read', async (_, threadIds: string[], isRead: boolean) => {
    db.setThreadRead(threadIds, isRead)
    broadcastDataUpdated()
    void syncManager.syncThreadMutationToRemote(threadIds, isRead ? 'read' : 'unread')
    return { ok: true }
  })

  ipcMain.handle('mail:set-starred', async (_, threadIds: string[], isStarred: boolean) => {
    db.setThreadStarred(threadIds, isStarred)
    broadcastDataUpdated()
    void syncManager.syncThreadMutationToRemote(threadIds, isStarred ? 'star' : 'unstar')
    return { ok: true }
  })

  ipcMain.handle('mail:move', async (_, threadIds: string[], folderRole: Folder['role'], folderName?: string) => {
    db.moveThreads(threadIds, folderRole, folderName)
    broadcastDataUpdated()
    void syncManager.syncThreadMutationToRemote(threadIds, 'move', folderRole)
    return { ok: true }
  })

  ipcMain.handle('mail:snooze', async (_, threadIds: string[], untilMs: number | null) => {
    db.snoozeThreads(threadIds, untilMs)
    broadcastDataUpdated()
    return { ok: true }
  })

  ipcMain.handle('mail:delete-permanently', (_, threadIds: string[]) => {
    db.deleteThreadsPermanently(threadIds)
    broadcastDataUpdated()
    return { ok: true }
  })

  ipcMain.handle('mail:empty-folder', (_, role: 'trash' | 'junk', accountIds?: string[]) => {
    db.emptyFolder(role, accountIds)
    broadcastDataUpdated()
    return { ok: true }
  })

  ipcMain.handle('mail:send', (_, payload: SendEmailPayload) => syncManager.sendEmail(payload))
  ipcMain.handle('mail:subscriptions', (_, accountIds?: string[]) => db.listSubscriptions(accountIds))
  ipcMain.handle('mail:scheduled-list', (_, accountIds?: string[]) => db.listScheduledEmails(accountIds))
  ipcMain.handle('mail:scheduled-cancel', (_, id: string) => {
    db.updateScheduledStatus(id, 'cancelled')
    broadcastDataUpdated()
    return { ok: true }
  })

  // ---- Snippets ----
  ipcMain.handle('snippets:list', () => db.listSnippets())
  ipcMain.handle('snippets:save', (_, s: Snippet) => {
    db.upsertSnippet(s)
    return { ok: true }
  })
  ipcMain.handle('snippets:delete', (_, id: string) => {
    db.deleteSnippet(id)
    return { ok: true }
  })

  // ---- Combined Calendar ----
  ipcMain.handle('calendar:list', (_, startAt: number, endAt: number, accountIds?: string[]) =>
    calendarManager.listEvents(startAt, endAt, accountIds)
  )
  ipcMain.handle('calendar:sync', async () => {
    const res = await calendarManager.syncAllCalendars()
    broadcastDataUpdated()
    return res
  })
  ipcMain.handle('calendar:create', async (_, payload: CreateCalendarEventPayload) => {
    const res = await calendarManager.createEvent(payload)
    broadcastDataUpdated()
    return res
  })
  ipcMain.handle('calendar:delete', async (_, eventId: string) => {
    const res = await calendarManager.deleteEvent(eventId)
    broadcastDataUpdated()
    return res
  })

  // ---- AI Suite ----
  ipcMain.handle('ai:detect-local', () => detectLocalAI(db.getSettings().ai))
  ipcMain.handle('ai:ask', (_, question: string, accountIds?: string[]) =>
    askInboxAssistant(question, accountIds, db, secrets)
  )
  ipcMain.handle('ai:summarize', (_, threadId: string) => summarizeThread(threadId, db, secrets))
  ipcMain.handle(
    'ai:draft',
    (_, opts: { accountId: string; threadId?: string; instruction: string }) =>
      draftVoiceMatchedReply({ ...opts, db, secrets })
  )

  // ---- Utilities & MCP ----
  ipcMain.handle('util:copy-text', (_, text: string, notifyLabel?: string) => {
    clipboard.writeText(text)
    if (notifyLabel && Notification.isSupported()) {
      new Notification({ title: 'EveryBox', body: notifyLabel }).show()
    }
    return { ok: true }
  })
  ipcMain.handle('util:open-external', (_, url: string) => {
    shell.openExternal(url)
    return { ok: true }
  })
  ipcMain.handle('mcp:get-config', () => {
    const serverPath = join(__dirname, 'mcp-server.js')
    return {
      command: 'node',
      args: [serverPath],
      env: { EVERYBOX_DATA_DIR: app.getPath('userData') }
    }
  })
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  db = new GlassmailDB(userData)
  secrets = new SecretStore(userData)
  seedDemoDataIfEmpty(db)

  syncManager = new SyncManager(db, secrets, broadcastDataUpdated)
  calendarManager = new CalendarManager(db, secrets)

  registerIpc()
  createWindow()
  syncManager.startBackgroundLoop()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  syncManager?.stop()
  if (process.platform !== 'darwin') app.quit()
})
