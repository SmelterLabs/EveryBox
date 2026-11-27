import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, Notification, shell } from 'electron'
import { basename, extname, join } from 'path'
import { tmpdir } from 'os'
import { copyFile, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { GlassmailDB } from './db/database'
import { seedDemoDataIfEmpty } from './db/seed'
import { SecretStore } from './security/secrets'
import { getAuthorizedGoogleClient, runGoogleOAuthLoopback } from './mail/gmail-oauth'
import { fetchGmailAttachment } from './mail/gmail-sync'
import { fetchImapAttachment, testImapConnection } from './mail/imap-sync'
import {
  listOutlookStores,
  saveOutlookComAttachment,
  sendOrSaveOutlookComMessage
} from './mail/outlook-com-sync'
import { SyncManager } from './mail/sync-manager'
import { CalendarManager } from './calendar/calendar-manager'
import { detectLocalAI } from './ai/provider'
import { DECISION_SECRET_KEYS, readDecisionApiKeys, testDecisionProvider } from './ai/decisions'
import { TriageWorker } from './ai/triage-worker'
import { askInboxAssistant } from './ai/assistant'
import { summarizeThread } from './ai/summarizer'
import { draftVoiceMatchedReply, learnVoiceProfile } from './ai/writer'
import {
  checkDueReminders,
  compileNaturalLanguageRule,
  getWaitingOnYouItems,
  runAutopilotPass
} from './ai/autopilot'
import { acceptHabitSuggestion, dismissHabitSuggestion, recordUserHabitAction } from './ai/habits'
import { parseNaturalLanguageSearch } from './ai/nl-search'
import { checkForAppUpdates } from './updater'
import type {
  Account,
  AppSettings,
  AutopilotRule,
  ComposerAttachment,
  CreateCalendarEventPayload,
  CreateReminderPayload,
  DecisionAISettings,
  Folder,
  FolderCreateInput,
  FolderDeleteInput,
  FolderMoveInput,
  FolderPrefsInput,
  FolderRenameInput,
  HabitActionType,
  ImplicitCalendarEvent,
  MailboxId,
  SendEmailPayload,
  SenderPreference,
  Snippet,
  ThreadPreDraft,
  VoiceProfile,
  VoiceProfileKind,
  Workspace
} from '../shared/types'

let mainWindow: BrowserWindow | null = null
const threadWindows = new Map<string, BrowserWindow>()
let db: GlassmailDB
let secrets: SecretStore
let syncManager: SyncManager
let calendarManager: CalendarManager
let triageWorker: TriageWorker

// Prevent transient network/socket errors (e.g. IMAP TLS ECONNRESET) from popping up
// Electron's blocking native modal dialog and freezing the main process.
process.on('uncaughtException', (err) => {
  console.error('[EveryBox main uncaughtException]', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[EveryBox main unhandledRejection]', reason)
})

const ACCOUNT_COLORS = ['#3B82F6', '#2DD4BF', '#A78BFA', '#34C77B', '#F5B841', '#EC5C8A']

function getAppIconPath(): string {
  const base = app.getAppPath()
  return process.platform === 'win32' ? join(base, 'build/icon.ico') : join(base, 'build/icon.png')
}

function loadAppIcon() {
  const primary = nativeImage.createFromPath(getAppIconPath())
  if (!primary.isEmpty()) return primary
  const fallback = join(
    app.getAppPath(),
    process.platform === 'win32' ? 'build/icon.png' : 'build/icon.ico'
  )
  return nativeImage.createFromPath(fallback)
}

function createWindow(): void {
  const iconPath = getAppIconPath()
  const appIcon = loadAppIcon()
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 540,
    icon: process.platform === 'win32' ? iconPath : appIcon,
    backgroundColor: '#11151d',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#11151d',
      symbolColor: '#9aa7bc',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (!appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon)
  }

  mainWindow.on('focus', () => {
    mainWindow?.flashFrame(false)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
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

function getWindowBackgroundColor(settings: AppSettings): string {
  if (settings.theme === 'black') return '#000000'
  if (settings.theme === 'graphite') return '#14181f'
  if (settings.theme === 'dark') return '#11151d'
  if (settings.theme === 'paper') return '#f2f0eb'
  return '#f4f6fa'
}

function openThreadWindow(threadId: string): void {
  const existing = threadWindows.get(threadId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return
  }

  const settings = db.getSettings()
  const thread = db.getThreadDetail(threadId)
  const iconPath = getAppIconPath()
  const appIcon = loadAppIcon()

  // Gently cascade pop-out windows so opening multiple threads doesn't stack them invisibly
  const openCount = threadWindows.size
  let x: number | undefined
  let y: number | undefined
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [mx, my] = mainWindow.getPosition()
    const [mw, mh] = mainWindow.getSize()
    const offset = (openCount % 6) * 28
    x = Math.round(mx + Math.max(40, (mw - 920) / 2) + offset)
    y = Math.round(my + Math.max(40, (mh - 760) / 2) + offset)
  }

  const win = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 620,
    minHeight: 460,
    ...(x !== undefined && y !== undefined ? { x, y } : {}),
    title: thread?.subject ? `${thread.subject} — EveryBox` : 'EveryBox',
    icon: process.platform === 'win32' ? iconPath : appIcon,
    backgroundColor: getWindowBackgroundColor(settings),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: getWindowBackgroundColor(settings),
      symbolColor: ['dark', 'black', 'graphite'].includes(settings.theme) ? '#9aa7bc' : '#4a5568',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (!appIcon.isEmpty()) {
    win.setIcon(appIcon)
  }

  applyTitleBarOverlayToWindow(win, settings)
  threadWindows.set(threadId, win)

  win.on('closed', () => {
    threadWindows.delete(threadId)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    const sep = process.env.ELECTRON_RENDERER_URL.includes('?') ? '&' : '?'
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${sep}popoutThread=${encodeURIComponent(threadId)}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { popoutThread: threadId }
    })
  }
}

let broadcastTimer: NodeJS.Timeout | null = null

function broadcastDataUpdated(): void {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('glassmail:data-updated')
    }
    for (const win of threadWindows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send('glassmail:data-updated')
      }
    }
  }, 150)
}

function recordHabitForThread(
  threadId: string,
  action: HabitActionType,
  opts?: { folderName?: string }
): void {
  try {
    const detail = db.getThreadDetail(threadId)
    if (!detail) return
    const accEmail = (detail.accountEmail || '').toLowerCase().trim()
    const inboundMsgs = detail.messages.filter(
      (m) => !m.isDraft && !m.isSent && (m.from?.email || '').toLowerCase().trim() !== accEmail
    )
    const latestInbound = inboundMsgs.length > 0 ? inboundMsgs[inboundMsgs.length - 1] : null
    const sender = latestInbound?.from || detail.latestExternalFrom || detail.latestFrom
    const senderEmail = (sender?.email || '').trim().toLowerCase()
    if (!senderEmail || senderEmail === accEmail) return

    const meta = db.getThreadAiMeta(threadId)
    const res = recordUserHabitAction(db, {
      senderEmail,
      displayName: sender?.name || '',
      action,
      folderName: opts?.folderName ?? null,
      bundle: meta?.bundle ?? null,
      hadOpened: detail.isRead,
      threadId
    })

    if (res.newSuggestion) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('habits:new-suggestion', res.newSuggestion)
      }
      broadcastDataUpdated()
    }
  } catch (err) {
    console.warn('[EveryBox Habit] failed to record habit action:', err)
  }
}

function applyTitleBarOverlayToWindow(win: BrowserWindow, settings: AppSettings): void {
  if (win.isDestroyed()) return
  const darkThemes = ['dark', 'black', 'graphite']
  const isDark = darkThemes.includes(settings.theme)
  const uiTheme = settings.uiTheme || 'everybox'

  if (uiTheme === 'outlook-classic') {
    win.setTitleBarOverlay?.({
      color: isDark ? '#1F1F1F' : '#0F6CBD',
      symbolColor: '#ffffff',
      height: 36
    })
    return
  }

  if (uiTheme === 'gmail') {
    win.setTitleBarOverlay?.({
      color: isDark ? '#111111' : '#F6F8FC',
      symbolColor: isDark ? '#e3e3e3' : '#444746',
      height: 36
    })
    return
  }

  win.setTitleBarOverlay?.({
    color:
      settings.theme === 'black'
        ? '#000000'
        : settings.theme === 'graphite'
          ? '#14181f'
          : isDark
            ? '#11151d'
            : settings.theme === 'paper'
              ? '#f2f0eb'
              : '#f4f6fa',
    symbolColor: isDark ? '#9aa7bc' : '#4a5568',
    height: 36
  })
}

function applyTitleBarOverlay(settings: AppSettings): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyTitleBarOverlayToWindow(mainWindow, settings)
  }
  for (const win of threadWindows.values()) {
    applyTitleBarOverlayToWindow(win, settings)
  }
}

function registerIpc(): void {
  // ---- Settings ----
  ipcMain.handle('settings:get', () => {
    const s = db.getSettings()
    applyTitleBarOverlay(s)
    return s
  })
  ipcMain.handle('settings:save', (_, settings: AppSettings) => {
    db.saveSettings(settings)
    applyTitleBarOverlay(settings)
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
    const prev = db.getAccount(account.id)
    db.upsertAccount(account)
    broadcastDataUpdated()
    if (
      account.provider === 'outlook-local' &&
      (prev?.outlookFocusedMode || 'all') !== (account.outlookFocusedMode || 'all')
    ) {
      void syncManager.syncAccount(account.id)
    }
    return { ok: true }
  })
  ipcMain.handle('accounts:reorder', (_, accountIds: string[]) => {
    db.reorderAccounts(accountIds)
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

  ipcMain.handle('accounts:list-outlook-stores', () => listOutlookStores())
  ipcMain.handle(
    'accounts:connect-outlook-local',
    async (
      _,
      input: {
        name?: string
        email: string
        storeName: string
        calendarPath?: string
      }
    ) => {
      try {
        const email = input.email.trim().toLowerCase()
        const existing = db.listAccounts().find((a) => !a.isDemo && a.email.toLowerCase() === email)
        if (existing) {
          return { ok: false, error: `${email} is already connected in EveryBox.` }
        }
        const realCount = db.listAccounts().filter((a) => !a.isDemo).length
        const id = `acc-outlook-${randomUUID().slice(0, 8)}`
        const account: Account = {
          id,
          provider: 'outlook-local',
          name: input.name?.trim() || email.split('@')[0],
          email,
          color: ACCOUNT_COLORS[realCount % ACCOUNT_COLORS.length],
          signatureHtml: '',
          isEnabled: true,
          isDemo: false,
          imapHost: input.storeName || email,
          caldavUrl: input.calendarPath || undefined,
          calendarEnabled: true,
          syncStatus: 'idle'
        }
        db.clearDemoAccounts()
        db.upsertAccount(account)
        broadcastDataUpdated()
        void syncManager
          .syncAccount(id)
          .then(() => calendarManager.syncAllCalendars())
          .then(broadcastDataUpdated)
        return { ok: true, accountId: id }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

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
        calendarEnabled: true,
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
  ipcMain.handle('folders:create', async (_, input: FolderCreateInput) => {
    const res = await syncManager.createFolder(input)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('folders:rename', async (_, input: FolderRenameInput) => {
    const res = await syncManager.renameFolder(input)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('folders:move', async (_, input: FolderMoveInput) => {
    const res = await syncManager.moveFolder(input)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('folders:reorder', (_, accountId: string, orderedFolderIds: string[]) => {
    const res = syncManager.reorderFolders(accountId, orderedFolderIds)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('folders:delete', async (_, input: FolderDeleteInput) => {
    const res = await syncManager.deleteFolder(input)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('folders:delete-preview', (_, folderId: string) => syncManager.getFolderDeletePreview(folderId))
  ipcMain.handle('folders:update-prefs', async (_, input: FolderPrefsInput) => {
    const res = await syncManager.updateFolderPrefs(input)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('folders:sync-one', async (_, accountId: string, folderPath: string) => {
    const res = await syncManager.syncFolder(folderPath, [accountId])
    broadcastDataUpdated()
    return res
  })
  ipcMain.handle('mail:counts', (_, accountIds?: string[]) => db.getMailboxCounts(accountIds))
  ipcMain.handle(
    'mail:list-threads',
    (_, opts: { accountIds?: string[]; mailbox: MailboxId; category?: 'all' | 'people' | 'updates'; folderName?: string }) =>
      db.listThreads(opts)
  )
  ipcMain.handle('mail:get-thread', (_, threadId: string) => db.getThreadDetail(threadId))
  ipcMain.handle('mail:search', (_, query: string, accountIds?: string[], includeTrashAndJunk?: boolean) => {
    const parsed = parseNaturalLanguageSearch(query)
    const threads = db.searchThreads(parsed, accountIds, Boolean(includeTrashAndJunk))
    return { parsed, threads }
  })

  ipcMain.handle('mail:sync-all', async () => {
    await syncManager.syncAllAccounts(true)
    await calendarManager.syncAllCalendars()
    broadcastDataUpdated()
    return { ok: true }
  })

  ipcMain.handle('mail:sync-folder', async (_, folderName: string, accountIds?: string[]) => {
    const res = await syncManager.syncFolder(folderName, accountIds)
    broadcastDataUpdated()
    return res
  })

  ipcMain.handle('mail:set-read', async (_, threadIds: string[], isRead: boolean) => {
    db.setThreadRead(threadIds, isRead)
    broadcastDataUpdated()
    void syncManager.syncThreadMutationToRemote(threadIds, isRead ? 'read' : 'unread')
    return { ok: true }
  })

  ipcMain.handle('mail:set-starred', async (_, threadIds: string[], isStarred: boolean) => {
    db.setThreadStarred(threadIds, isStarred)
    if (isStarred) {
      for (const tid of threadIds) {
        recordHabitForThread(tid, 'star')
      }
    }
    broadcastDataUpdated()
    void syncManager.syncThreadMutationToRemote(threadIds, isStarred ? 'star' : 'unstar')
    return { ok: true }
  })

  ipcMain.handle('mail:move', async (_, threadIds: string[], folderRole: Folder['role'], folderName?: string) => {
    const snapshots = threadIds
      .map((tid) => db.getThreadDetail(tid))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => ({
        threadId: d.id,
        accountId: d.accountId,
        folderRole: d.folderRole,
        folderName: d.folderName,
        messageRemoteIds: d.messages.map((m) => m.remoteId),
        messageFolders: d.messages.map((m) => ({
          remoteId: m.remoteId,
          folderRole: m.folderRole,
          folderName: m.folderName
        }))
      }))
    db.moveThreads(threadIds, folderRole, folderName)
    if (folderRole === 'archive') {
      for (const tid of threadIds) recordHabitForThread(tid, 'archive')
    } else if (folderRole === 'trash') {
      for (const tid of threadIds) recordHabitForThread(tid, 'trash')
    } else if (folderRole === 'custom' && folderName) {
      for (const tid of threadIds) recordHabitForThread(tid, 'move_folder', { folderName })
    }
    broadcastDataUpdated()
    void syncManager.syncThreadMutationToRemote(threadIds, 'move', folderRole, snapshots, folderName)
    return { ok: true }
  })

  ipcMain.handle('mail:snooze', async (_, threadIds: string[], untilMs: number | null) => {
    db.snoozeThreads(threadIds, untilMs)
    broadcastDataUpdated()
    return { ok: true }
  })

  ipcMain.handle('mail:delete-permanently', (_, threadIds: string[]) => {
    const snapshots = threadIds
      .map((tid) => db.getThreadDetail(tid))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => ({
        threadId: d.id,
        accountId: d.accountId,
        folderRole: d.folderRole,
        messageRemoteIds: d.messages.map((m) => m.remoteId),
        messageFolders: d.messages.map((m) => ({
          remoteId: m.remoteId,
          folderRole: m.folderRole,
          folderName: m.folderName
        }))
      }))
    db.deleteThreadsPermanently(threadIds)
    broadcastDataUpdated()
    void syncManager.syncThreadMutationToRemote(threadIds, 'delete', undefined, snapshots)
    return { ok: true }
  })

  ipcMain.handle('mail:empty-folder', (_, role: 'trash' | 'junk', accountIds?: string[]) => {
    const threads = db.listThreads({ accountIds, mailbox: role, limit: 500 })
    const snapshots = threads
      .map((t) => db.getThreadDetail(t.id))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => ({
        threadId: d.id,
        accountId: d.accountId,
        folderRole: d.folderRole,
        messageRemoteIds: d.messages.map((m) => m.remoteId)
      }))
    db.emptyFolder(role, accountIds)
    broadcastDataUpdated()
    if (snapshots.length > 0) {
      void syncManager.syncThreadMutationToRemote(
        snapshots.map((s) => s.threadId),
        'delete',
        undefined,
        snapshots
      )
    }
    return { ok: true }
  })

  ipcMain.handle('mail:send', async (_, payload: SendEmailPayload) => {
    const res = await syncManager.sendEmail(payload)
    if (res.ok && payload.threadId) {
      const preDraft = db.getPreDraft(payload.threadId)
      if (preDraft && (preDraft.status === 'ready' || !preDraft.status)) {
        db.updatePreDraftStatus(payload.threadId, 'promoted')
        recordHabitForThread(payload.threadId, 'draft_accepted')
      }
      recordHabitForThread(payload.threadId, 'reply')
    }
    return res
  })
  ipcMain.handle('mail:save-draft', async (_, payload: SendEmailPayload) => {
    const acc = db.getAccount(payload.accountId)
    if (!acc) return { ok: false, error: 'Account not found' }
    if (acc.provider === 'outlook-local') {
      await sendOrSaveOutlookComMessage(acc, payload, 'draft').catch(() => {})
    }
    const draftId = `local-draft-${randomUUID()}`
    const now = Date.now()
    const toAddrs = (payload.to || []).filter(Boolean).map((e) => ({ name: '', email: e }))
    const ccAddrs = (payload.cc || []).filter(Boolean).map((e) => ({ name: '', email: e }))
    const bccAddrs = (payload.bcc || []).filter(Boolean).map((e) => ({ name: '', email: e }))
    const plain = (payload.bodyText || '').trim()
    db.upsertMessageAndThread(
      {
        id: draftId,
        accountId: acc.id,
        threadId: draftId,
        remoteId: draftId,
        messageIdHeader: payload.replyToMessageId,
        from: { name: acc.name, email: acc.email },
        to: toAddrs,
        cc: ccAddrs,
        bcc: bccAddrs,
        subject: payload.subject || '(No subject)',
        snippet: plain.slice(0, 180) || '(Draft)',
        bodyText: plain,
        bodyHtml: payload.bodyHtml || `<p>${plain.replace(/\n/g, '<br/>')}</p>`,
        date: now,
        isRead: true,
        isStarred: false,
        isDraft: true,
        isSent: false,
        folderRole: 'drafts',
        folderName: 'Drafts',
        labels: ['DRAFT'],
        category: 'people',
        hasAttachments: Boolean(payload.attachments && payload.attachments.length > 0),
        attachments: (payload.attachments || []).map((a) => ({
          id: a.id || `${draftId}|att-${randomUUID().slice(0, 8)}`,
          messageId: draftId,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          isInline: false,
          localPath: a.localPath,
          remoteAttachmentId: a.remoteAttachmentId
        })),
        trackersBlocked: 0
      },
      draftId
    )
    broadcastDataUpdated()
    return { ok: true, draftId }
  })

  ipcMain.handle('dialog:pick-attachments', async (): Promise<ComposerAttachment[]> => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    const opts: Electron.OpenDialogOptions = {
      title: 'Attach files',
      properties: ['openFile', 'multiSelections']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return []

    const mimeByExt: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.zip': 'application/zip'
    }

    const out: ComposerAttachment[] = []
    for (const filePath of res.filePaths) {
      try {
        const info = await stat(filePath)
        const ext = extname(filePath).toLowerCase()
        out.push({
          id: `local-att-${randomUUID().slice(0, 8)}`,
          filename: basename(filePath),
          mimeType: mimeByExt[ext] || 'application/octet-stream',
          size: info.size,
          localPath: filePath
        })
      } catch {
        // skip unreadable file
      }
    }
    return out
  })

  interface AttachmentLookupInput {
    accountId: string
    filename: string
    localPath?: string
    remoteMessageId?: string
    remoteAttachmentId?: string
    folderRole?: Folder['role']
    folderName?: string
  }

  const resolveAttachmentToCache = async (
    input: AttachmentLookupInput
  ): Promise<{ ok: true; filePath: string; safeName: string } | { ok: false; error: string }> => {
    const safeName = (input.filename || 'attachment').replace(/[<>:"/\\|?*]/g, '_')
    if (input.localPath) {
      return { ok: true, filePath: input.localPath, safeName }
    }
    const account = db.getAccount(input.accountId)
    if (!account) return { ok: false, error: 'Account not found.' }

    const dir = join(tmpdir(), 'everybox-attachments')
    await mkdir(dir, { recursive: true })
    const cacheTag = (input.remoteAttachmentId || input.remoteMessageId || randomUUID())
      .slice(0, 12)
      .replace(/[^a-zA-Z0-9_-]/g, '')
    const dest = join(dir, `${cacheTag}-${safeName}`)

    // Reuse cached download if already fetched earlier this session
    try {
      const existing = await stat(dest)
      if (existing.size > 0) {
        return { ok: true, filePath: dest, safeName }
      }
    } catch {
      // not cached yet
    }

    if (account.provider === 'gmail' && input.remoteMessageId && input.remoteAttachmentId) {
      const settings = db.getSettings()
      const auth = getAuthorizedGoogleClient(
        account.id,
        settings.googleOAuthClientId || '',
        settings.googleOAuthClientSecret || '',
        secrets
      )
      if (!auth) return { ok: false, error: 'Gmail authorization missing.' }
      const buf = await fetchGmailAttachment(auth, input.remoteMessageId, input.remoteAttachmentId)
      if (buf.length === 0) return { ok: false, error: 'Attachment was empty.' }
      await writeFile(dest, buf)
      return { ok: true, filePath: dest, safeName }
    }

    if (account.provider === 'imap' && input.remoteMessageId) {
      const uid = Number(input.remoteMessageId)
      const buf = await fetchImapAttachment(account, secrets, {
        uid,
        folderRole: input.folderRole || 'inbox',
        folderName: input.folderName,
        filename: input.filename
      })
      if (!buf || buf.length === 0) {
        return { ok: false, error: 'Could not download attachment from IMAP server.' }
      }
      await writeFile(dest, buf)
      return { ok: true, filePath: dest, safeName }
    }

    if (account.provider === 'outlook-local' && input.remoteMessageId) {
      const res = await saveOutlookComAttachment(input.remoteMessageId, input.filename, dest)
      if (!res.ok) return { ok: false, error: res.error || 'Could not export attachment from Outlook.' }
      return { ok: true, filePath: dest, safeName }
    }

    return { ok: false, error: 'Attachment could not be resolved for this message.' }
  }

  const pickUniqueDestPath = async (dir: string, safeName: string): Promise<string> => {
    const ext = extname(safeName)
    const stem = ext ? safeName.slice(0, -ext.length) : safeName
    let candidate = join(dir, safeName)
    for (let n = 1; n <= 999; n++) {
      try {
        await stat(candidate)
        candidate = join(dir, `${stem} (${n})${ext}`)
      } catch {
        return candidate
      }
    }
    return join(dir, `${stem}-${Date.now()}${ext}`)
  }

  ipcMain.handle(
    'mail:open-attachment',
    async (_, input: AttachmentLookupInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const resolved = await resolveAttachmentToCache(input)
        if (!resolved.ok) return resolved
        const err = await shell.openPath(resolved.filePath)
        return err ? { ok: false, error: err } : { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'mail:download-attachment',
    async (
      _,
      input: AttachmentLookupInput & { revealInFolder?: boolean }
    ): Promise<{ ok: boolean; filePath?: string; filename?: string; error?: string }> => {
      try {
        const resolved = await resolveAttachmentToCache(input)
        if (!resolved.ok) return resolved
        const downloadsDir = app.getPath('downloads')
        await mkdir(downloadsDir, { recursive: true })
        const target = await pickUniqueDestPath(downloadsDir, resolved.safeName)
        await copyFile(resolved.filePath, target)
        if (input.revealInFolder) {
          shell.showItemInFolder(target)
        }
        return { ok: true, filePath: target, filename: basename(target) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'mail:save-attachment-as',
    async (
      event,
      input: AttachmentLookupInput
    ): Promise<{ ok: boolean; cancelled?: boolean; filePath?: string; error?: string }> => {
      try {
        const parentWin = BrowserWindow.fromWebContents(event.sender) || mainWindow
        const safeName = (input.filename || 'attachment').replace(/[<>:"/\\|?*]/g, '_')
        const dialogOpts: Electron.SaveDialogOptions = {
          title: 'Save Attachment As',
          defaultPath: join(app.getPath('downloads'), safeName)
        }
        const pick = parentWin
          ? await dialog.showSaveDialog(parentWin, dialogOpts)
          : await dialog.showSaveDialog(dialogOpts)
        if (pick.canceled || !pick.filePath) {
          return { ok: false, cancelled: true }
        }
        const resolved = await resolveAttachmentToCache(input)
        if (!resolved.ok) return resolved
        await copyFile(resolved.filePath, pick.filePath)
        return { ok: true, filePath: pick.filePath }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'mail:save-all-attachments',
    async (
      event,
      inputs: AttachmentLookupInput[]
    ): Promise<{ ok: boolean; cancelled?: boolean; savedCount?: number; folderPath?: string; error?: string }> => {
      try {
        if (!Array.isArray(inputs) || inputs.length === 0) {
          return { ok: false, error: 'No attachments to save.' }
        }
        const parentWin = BrowserWindow.fromWebContents(event.sender) || mainWindow
        const dialogOpts: Electron.OpenDialogOptions = {
          title: `Save ${inputs.length} Attachments`,
          defaultPath: app.getPath('downloads'),
          properties: ['openDirectory', 'createDirectory']
        }
        const pick = parentWin
          ? await dialog.showOpenDialog(parentWin, dialogOpts)
          : await dialog.showOpenDialog(dialogOpts)
        if (pick.canceled || pick.filePaths.length === 0) {
          return { ok: false, cancelled: true }
        }
        const folderPath = pick.filePaths[0]
        let savedCount = 0
        for (const item of inputs) {
          const resolved = await resolveAttachmentToCache(item)
          if (resolved.ok) {
            const target = await pickUniqueDestPath(folderPath, resolved.safeName)
            await copyFile(resolved.filePath, target)
            savedCount++
          }
        }
        if (savedCount === 0) {
          return { ok: false, error: 'Could not save any attachments.' }
        }
        return { ok: true, savedCount, folderPath }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
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
  ipcMain.handle(
    'calendar:find-for-invite',
    (_, input: { accountId: string; uid?: string; startAt?: number; title?: string }) =>
      calendarManager.findEventForInvite(input.accountId, input.uid, input.startAt, input.title)
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
  ipcMain.handle('calendar:import-ics', async (_, accountId: string) => {
    const pick = await dialog.showOpenDialog({
      title: 'Import iCalendar (.ics) File',
      properties: ['openFile'],
      filters: [{ name: 'iCalendar Files', extensions: ['ics'] }]
    })
    if (pick.canceled || pick.filePaths.length === 0) {
      return { ok: false, imported: 0, cancelled: true }
    }
    try {
      const filePath = pick.filePaths[0]
      const text = await readFile(filePath, 'utf8')
      const label = basename(filePath).replace(/\.ics$/i, '')
      const res = calendarManager.importIcsText(accountId, text, label)
      if (res.ok) broadcastDataUpdated()
      return res
    } catch (err) {
      return { ok: false, imported: 0, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('calendar:export-ics', async (_, accountIds?: string[]) => {
    const save = await dialog.showSaveDialog({
      title: 'Export Calendar (.ics)',
      defaultPath: 'everybox-calendar.ics',
      filters: [{ name: 'iCalendar Files', extensions: ['ics'] }]
    })
    if (save.canceled || !save.filePath) {
      return { ok: false, count: 0, cancelled: true }
    }
    try {
      const { ics, count } = calendarManager.exportIcs(accountIds)
      await writeFile(save.filePath, ics, 'utf8')
      return { ok: true, count, filePath: save.filePath }
    } catch (err) {
      return { ok: false, count: 0, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('calendar:outlook-list', () => calendarManager.listOutlookCalendars())
  ipcMain.handle('calendar:outlook-import', async (_, accountId: string, folderPath: string) => {
    const res = await calendarManager.importOutlookCalendar(accountId, folderPath)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle(
    'calendar:createFromImplicitEvent',
    async (
      _,
      input: {
        accountId: string
        threadId?: string
        event: ImplicitCalendarEvent
      }
    ): Promise<{ ok: boolean; id?: string; error?: string }> => {
      try {
        const startAt = Date.parse(input.event.startIso)
        if (!Number.isFinite(startAt)) {
          return { ok: false, error: 'Invalid event start time.' }
        }
        const parsedEnd = input.event.endIso ? Date.parse(input.event.endIso) : NaN
        const endAt = Number.isFinite(parsedEnd) && parsedEnd > startAt ? parsedEnd : startAt + 60 * 60_000

        const descriptionParts: string[] = []
        if (input.event.notes?.trim()) descriptionParts.push(input.event.notes.trim())
        if (input.threadId) {
          const detail = db.getThreadDetail(input.threadId)
          if (detail?.subject) {
            descriptionParts.push(`From email: ${detail.subject}`)
          }
        }

        const res = await calendarManager.createEvent({
          accountId: input.accountId,
          title: input.event.title,
          description: descriptionParts.join('\n\n'),
          location: input.event.location,
          startAt,
          endAt,
          allDay: false
        })
        if (res.ok) broadcastDataUpdated()
        return res
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ---- AI Suite ----
  ipcMain.handle(
    'ai:detect-local',
    (_, overrides?: { localOpenAiUrl?: string; ollamaUrl?: string; lmStudioUrl?: string }) =>
      detectLocalAI(db.getSettings().ai, secrets, overrides)
  )
  ipcMain.handle('ai:ask', (_, question: string, accountIds?: string[]) =>
    askInboxAssistant(question, accountIds, db, secrets)
  )
  ipcMain.handle('ai:summarize', async (_, threadId: string, forceRefresh?: boolean) => {
    const detail = db.getThreadDetail(threadId)
    const meta = db.getThreadAiMeta(threadId)
    const cachedSummary =
      !forceRefresh && meta?.summary && (!detail || meta.updatedAt >= detail.lastMessageAt)
        ? meta.summary
        : null
    const summary = await summarizeThread(threadId, db, secrets, { cachedSummary, forceRefresh })
    if (summary && !summary.providerLabel.startsWith('AI Error')) {
      db.updateThreadAiSummary(threadId, summary)
    }
    return summary
  })
  ipcMain.handle(
    'ai:draft',
    (_, opts: { accountId: string; threadId?: string; instruction: string; voiceProfileId?: string }) =>
      draftVoiceMatchedReply({ ...opts, db, secrets })
  )

  // ---- Decision AI & Thread Triage ----
  ipcMain.handle(
    'ai:saveDecisionApiKey',
    (_, provider: 'jev' | 'openrouter' | 'gemini' | 'openai', apiKey: string) => {
      const secretKey = DECISION_SECRET_KEYS[provider]
      const trimmed = (apiKey || '').trim()
      if (trimmed) {
        secrets.set(secretKey, trimmed)
      } else {
        secrets.delete(secretKey)
      }
      return { ok: true }
    }
  )
  ipcMain.handle('ai:testDecisionProvider', (_, override?: Partial<DecisionAISettings>) => {
    const settings = db.getSettings()
    const mergedAi = override
      ? {
          ...settings.ai,
          decision: {
            enabled: true,
            provider: 'auto' as const,
            ...settings.ai.decision,
            ...override
          }
        }
      : settings.ai
    return testDecisionProvider(mergedAi, readDecisionApiKeys(secrets), secrets)
  })
  ipcMain.handle('ai:getThreadMeta', (_, threadId: string) => db.getThreadAiMeta(threadId))
  ipcMain.handle('ai:getThreadMetaBatch', (_, threadIds: string[]) => db.getThreadAiMetaBatch(threadIds))
  ipcMain.handle('ai:reclassifyThread', (_, threadId: string) => triageWorker.classifyThreadNow(threadId, true))
  ipcMain.handle('ai:dismissPreDraft', (_, threadId: string) => {
    db.updatePreDraftStatus(threadId, 'dismissed')
    recordHabitForThread(threadId, 'draft_dismissed')
    broadcastDataUpdated()
    return { ok: true }
  })

  // ---- Reminders ----
  ipcMain.handle('reminders:list', (_, accountIds?: string[]) => db.listReminders(accountIds))
  ipcMain.handle('reminders:create', (_, payload: CreateReminderPayload) => {
    const reminder = db.createReminder(randomUUID(), payload)
    broadcastDataUpdated()
    return reminder
  })
  ipcMain.handle('reminders:complete', (_, id: string) => {
    db.completeReminder(id)
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('reminders:snooze', (_, id: string, dueAt: number) => {
    db.snoozeReminder(id, dueAt)
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('reminders:delete', (_, id: string) => {
    db.deleteReminder(id)
    broadcastDataUpdated()
    return { ok: true }
  })

  // ---- AI Pre-Drafts ----
  ipcMain.handle('predrafts:list', () => db.listPreDrafts())
  ipcMain.handle('predrafts:get', (_, threadId: string) => db.getPreDraft(threadId))
  ipcMain.handle(
    'predrafts:generate',
    async (_, opts: { threadId: string; accountId: string; instruction?: string; voiceProfileId?: string }) => {
      const detail = db.getThreadDetail(opts.threadId)
      const res = await draftVoiceMatchedReply({
        accountId: opts.accountId,
        threadId: opts.threadId,
        instruction: opts.instruction || 'Write a concise, natural, voice-matched reply to this email.',
        voiceProfileId: opts.voiceProfileId,
        db,
        secrets
      })
      if (res.error || !res.draft) {
        return { ok: false, error: res.error || 'Could not generate draft', providerLabel: res.providerLabel }
      }
      const subj = detail?.subject
        ? detail.subject.startsWith('Re:')
          ? detail.subject
          : `Re: ${detail.subject}`
        : 'Re:'
      const latestMsg = detail?.messages[detail.messages.length - 1]
      const pd: ThreadPreDraft = {
        threadId: opts.threadId,
        accountId: opts.accountId,
        subject: subj,
        body: res.draft,
        providerLabel: res.providerLabel,
        createdAt: Date.now(),
        messageId: latestMsg?.id,
        status: 'ready',
        source: 'manual'
      }
      db.upsertPreDraft(pd)
      broadcastDataUpdated()
      return { ok: true, preDraft: pd }
    }
  )
  ipcMain.handle('predrafts:delete', (_, threadId: string) => {
    db.deletePreDraft(threadId)
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('predrafts:delete-by-sender', (_, senderEmail: string) => {
    const removed = db.deletePreDraftsBySender(senderEmail)
    broadcastDataUpdated()
    return { ok: true, removed }
  })
  ipcMain.handle('predrafts:clear-all', () => {
    db.clearAllPreDrafts()
    broadcastDataUpdated()
    return { ok: true }
  })

  // ---- Autopilot Rules & Logs ----
  ipcMain.handle('autopilot:list-rules', () => db.listAutopilotRules())
  ipcMain.handle('autopilot:compile-rule', (_, prompt: string) => compileNaturalLanguageRule(prompt, db, secrets))
  ipcMain.handle('autopilot:save-rule', (_, rule: AutopilotRule) => {
    const saved: AutopilotRule = { ...rule, id: rule.id || randomUUID(), createdAt: rule.createdAt || Date.now() }
    db.upsertAutopilotRule(saved)
    broadcastDataUpdated()
    return saved
  })
  ipcMain.handle('autopilot:toggle-rule', (_, id: string, enabled: boolean) => {
    db.toggleAutopilotRule(id, enabled)
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('autopilot:delete-rule', (_, id: string) => {
    db.deleteAutopilotRule(id)
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('autopilot:run-now', () => runAutopilotPass(db, secrets, broadcastDataUpdated, syncManager))
  ipcMain.handle('mail:waiting-on-you', (_, accountIds?: string[], useAI?: boolean) =>
    getWaitingOnYouItems(db, secrets, accountIds, Boolean(useAI))
  )
  ipcMain.handle('autopilot:list-logs', (_, limit?: number) => db.listAutopilotLogs(limit))
  const undoAutopilotLogEntry = async (
    logId: string,
    opts?: { pauseRule?: boolean; fallbackThreadId?: string; fallbackUndoAction?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    const log = db.getAutopilotLog(logId)
    if (!log) {
      if (opts?.fallbackThreadId && opts?.fallbackUndoAction) {
        if (opts.fallbackUndoAction === 'restoreInbox') {
          db.moveThreads([opts.fallbackThreadId], 'inbox', 'Inbox')
        } else if (opts.fallbackUndoAction === 'markUnread') {
          db.setThreadRead([opts.fallbackThreadId], false)
        } else if (opts.fallbackUndoAction === 'unstar') {
          db.setThreadStarred([opts.fallbackThreadId], false)
        }
        broadcastDataUpdated()
        return { ok: true }
      }
      return { ok: false, error: 'Autopilot log entry not found' }
    }

    if (log.undoneAt) {
      return { ok: true }
    }

    const threadId = log.threadId || opts?.fallbackThreadId
    const inferredUndoAction =
      log.undoAction ||
      opts?.fallbackUndoAction ||
      (log.actionType === 'archive' || log.actionType === 'trash' || log.actionType === 'moveToFolder'
        ? 'restoreInbox'
        : log.actionType === 'markRead'
          ? 'markUnread'
          : log.actionType === 'star'
            ? 'unstar'
            : null)

    if (threadId) {
      if (inferredUndoAction === 'restoreInbox') {
        const detail = db.getThreadDetail(threadId)
        const snapshots = detail
          ? [
              {
                threadId: detail.id,
                accountId: detail.accountId,
                folderRole: detail.folderRole,
                folderName: detail.folderName,
                messageRemoteIds: detail.messages.map((m) => m.remoteId),
                messageFolders: detail.messages.map((m) => ({
                  remoteId: m.remoteId,
                  folderRole: m.folderRole,
                  folderName: m.folderName
                }))
              }
            ]
          : undefined
        db.moveThreads([threadId], 'inbox', 'Inbox')
        void syncManager.syncThreadMutationToRemote([threadId], 'move', 'inbox', snapshots, 'Inbox')
      } else if (inferredUndoAction === 'markUnread') {
        db.setThreadRead([threadId], false)
        void syncManager.syncThreadMutationToRemote([threadId], 'unread')
      } else if (inferredUndoAction === 'unstar') {
        db.setThreadStarred([threadId], false)
        void syncManager.syncThreadMutationToRemote([threadId], 'unstar')
      }
    }

    db.markAutopilotLogUndone(logId)
    if (opts?.pauseRule && log.ruleId) {
      db.toggleAutopilotRule(log.ruleId, false)
    }
    broadcastDataUpdated()
    return { ok: true }
  }

  ipcMain.handle('autopilot:undoLog', (_, logId: string, pauseRule?: boolean) =>
    undoAutopilotLogEntry(logId, { pauseRule })
  )
  ipcMain.handle('autopilot:undo-log', (_, logId: string, threadId?: string, undoAction?: string) =>
    undoAutopilotLogEntry(logId, { fallbackThreadId: threadId, fallbackUndoAction: undoAction })
  )

  // ---- Habit Learning & Rule Suggestions ----
  ipcMain.handle('habits:listSuggestions', (_, status?: 'pending' | 'accepted' | 'dismissed' | 'all') =>
    db.listHabitSuggestions(status)
  )
  ipcMain.handle('habits:acceptSuggestion', async (_, id: string) => {
    const res = await acceptHabitSuggestion(db, secrets, id)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('habits:dismissSuggestion', (_, id: string) => {
    const res = dismissHabitSuggestion(db, id)
    if (res.ok) broadcastDataUpdated()
    return res
  })
  ipcMain.handle('habits:listSenderProfiles', (_, limit?: number) => db.listSenderProfiles(limit))
  ipcMain.handle(
    'habits:setSenderPreference',
    (_, senderEmail: string, preference: SenderPreference, locked = true) => {
      const profile = db.setSenderPreference(senderEmail, preference, locked)
      broadcastDataUpdated()
      return { ok: true, profile }
    }
  )

  // ---- Voice Profiles ----
  ipcMain.handle('voices:list', () => db.listVoiceProfiles())
  ipcMain.handle(
    'voices:learn',
    async (
      _,
      opts: {
        id?: string
        kind: VoiceProfileKind
        name: string
        description: string
        accountIds: string[]
        recipientFilter?: string
      }
    ) => {
      const res = await learnVoiceProfile({ ...opts, db, secrets })
      if (res.profile) broadcastDataUpdated()
      return res
    }
  )
  ipcMain.handle('voices:save', (_, profile: VoiceProfile) => {
    db.upsertVoiceProfile({ ...profile, updatedAt: Date.now() })
    broadcastDataUpdated()
    return { ok: true }
  })
  ipcMain.handle('voices:delete', (_, id: string) => {
    db.deleteVoiceProfile(id)
    broadcastDataUpdated()
    return { ok: true }
  })

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
  ipcMain.handle('window:open-thread', (_, threadId: string) => {
    openThreadWindow(threadId)
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

  // ---- App Version & Updates ----
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:checkForUpdates', () => checkForAppUpdates(app.getVersion()))
}

if (process.platform === 'win32') {
  app.setAppUserModelId('app.everybox.desktop')
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  db = new GlassmailDB(userData)
  secrets = new SecretStore(userData)
  seedDemoDataIfEmpty(db)

  syncManager = new SyncManager(db, secrets, broadcastDataUpdated)
  calendarManager = new CalendarManager(db, secrets)
  triageWorker = new TriageWorker(db, secrets, broadcastDataUpdated)
  syncManager.setOnThreadsSynced((threadIds) => triageWorker.enqueueThreads(threadIds))

  registerIpc()
  createWindow()
  syncManager.startBackgroundLoop()
  // Triage recent inbox & sent threads shortly after startup
  setTimeout(() => {
    triageWorker.enqueueRecentInbox(40)
  }, 4_000)
  // Sync calendars on startup and every 5 minutes so primary-calendar updates appear automatically
  setTimeout(() => {
    void calendarManager.syncAllCalendars().then(broadcastDataUpdated)
  }, 1500)
  setInterval(() => {
    void calendarManager.syncAllCalendars().then(broadcastDataUpdated)
  }, 5 * 60_000)

  // Check due reminders every 20 seconds (Windows native notifications + auto-cancel on reply)
  setInterval(() => {
    checkDueReminders(db, () => mainWindow, broadcastDataUpdated)
  }, 20_000)

  // Run Autopilot rules & optional background pre-drafts on startup and every 3 minutes
  setTimeout(() => {
    void runAutopilotPass(db, secrets, broadcastDataUpdated, syncManager)
  }, 10_000)
  setInterval(() => {
    void runAutopilotPass(db, secrets, broadcastDataUpdated, syncManager)
  }, 3 * 60_000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  triageWorker?.stop()
  syncManager?.stop()
  if (process.platform !== 'darwin') app.quit()
})
