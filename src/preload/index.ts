import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppSettings,
  AssistantResponse,
  CalendarEvent,
  CreateCalendarEventPayload,
  Folder,
  LocalAIStatus,
  MailboxId,
  OutlookCalendarInfo,
  ParsedSearchQuery,
  ScheduledEmail,
  SendEmailPayload,
  Snippet,
  SubscriptionGroup,
  ThreadAISummary,
  ThreadDetail,
  ThreadSummary,
  Workspace
} from '../shared/types'

const api = {
  // Events
  onDataUpdated: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('glassmail:data-updated', handler)
    return () => {
      ipcRenderer.removeListener('glassmail:data-updated', handler)
    }
  },

  // Settings & Secrets
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<{ ok: boolean }> => ipcRenderer.invoke('settings:save', settings),
  setSecret: (key: string, value: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('secrets:set', key, value),
  hasSecret: (key: string): Promise<boolean> => ipcRenderer.invoke('secrets:has', key),

  // Accounts & Workspaces
  listAccounts: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
  clearDemoAccounts: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('accounts:clear-demo'),
  deleteAccount: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('accounts:delete', id),
  updateAccount: (account: Account): Promise<{ ok: boolean }> => ipcRenderer.invoke('accounts:update', account),
  reorderAccounts: (accountIds: string[]): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('accounts:reorder', accountIds),
  connectGmail: (): Promise<{ ok: boolean; accountId?: string; email?: string; error?: string }> =>
    ipcRenderer.invoke('accounts:connect-gmail'),
  addImapAccount: (input: Record<string, unknown>): Promise<{ ok: boolean; accountId?: string; error?: string }> =>
    ipcRenderer.invoke('accounts:add-imap', input),

  listWorkspaces: (): Promise<Workspace[]> => ipcRenderer.invoke('workspaces:list'),
  saveWorkspace: (ws: Workspace): Promise<{ ok: boolean }> => ipcRenderer.invoke('workspaces:save', ws),
  deleteWorkspace: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('workspaces:delete', id),

  // Mail
  listFolders: (accountIds?: string[]): Promise<Folder[]> => ipcRenderer.invoke('folders:list', accountIds),
  getMailboxCounts: (accountIds?: string[]): Promise<Record<string, number>> =>
    ipcRenderer.invoke('mail:counts', accountIds),
  listThreads: (opts: {
    accountIds?: string[]
    mailbox: MailboxId
    category?: 'all' | 'people' | 'updates'
    folderName?: string
  }): Promise<ThreadSummary[]> => ipcRenderer.invoke('mail:list-threads', opts),
  getThread: (threadId: string): Promise<ThreadDetail | null> => ipcRenderer.invoke('mail:get-thread', threadId),
  searchMail: (
    query: string,
    accountIds?: string[]
  ): Promise<{ parsed: ParsedSearchQuery; threads: ThreadSummary[] }> =>
    ipcRenderer.invoke('mail:search', query, accountIds),
  syncAll: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('mail:sync-all'),
  setRead: (threadIds: string[], isRead: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mail:set-read', threadIds, isRead),
  setStarred: (threadIds: string[], isStarred: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mail:set-starred', threadIds, isStarred),
  moveThreads: (threadIds: string[], folderRole: Folder['role'], folderName?: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mail:move', threadIds, folderRole, folderName),
  snoozeThreads: (threadIds: string[], untilMs: number | null): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mail:snooze', threadIds, untilMs),
  deleteThreadsPermanently: (threadIds: string[]): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mail:delete-permanently', threadIds),
  emptyFolder: (role: 'trash' | 'junk', accountIds?: string[]): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mail:empty-folder', role, accountIds),
  sendEmail: (payload: SendEmailPayload): Promise<{ ok: boolean; scheduledId?: string; error?: string }> =>
    ipcRenderer.invoke('mail:send', payload),
  listSubscriptions: (accountIds?: string[]): Promise<SubscriptionGroup[]> =>
    ipcRenderer.invoke('mail:subscriptions', accountIds),
  listScheduledEmails: (accountIds?: string[]): Promise<ScheduledEmail[]> =>
    ipcRenderer.invoke('mail:scheduled-list', accountIds),
  cancelScheduledEmail: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('mail:scheduled-cancel', id),

  // Snippets
  listSnippets: (): Promise<Snippet[]> => ipcRenderer.invoke('snippets:list'),
  saveSnippet: (s: Snippet): Promise<{ ok: boolean }> => ipcRenderer.invoke('snippets:save', s),
  deleteSnippet: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('snippets:delete', id),

  // Combined Calendar
  listCalendarEvents: (startAt: number, endAt: number, accountIds?: string[]): Promise<CalendarEvent[]> =>
    ipcRenderer.invoke('calendar:list', startAt, endAt, accountIds),
  syncCalendars: (): Promise<{ synced: number }> => ipcRenderer.invoke('calendar:sync'),
  createCalendarEvent: (payload: CreateCalendarEventPayload): Promise<{ ok: boolean; id?: string; error?: string }> =>
    ipcRenderer.invoke('calendar:create', payload),
  deleteCalendarEvent: (eventId: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('calendar:delete', eventId),
  importIcsCalendar: (
    accountId: string
  ): Promise<{ ok: boolean; imported: number; cancelled?: boolean; error?: string }> =>
    ipcRenderer.invoke('calendar:import-ics', accountId),
  exportIcsCalendar: (
    accountIds?: string[]
  ): Promise<{ ok: boolean; count: number; filePath?: string; cancelled?: boolean; error?: string }> =>
    ipcRenderer.invoke('calendar:export-ics', accountIds),
  listOutlookCalendars: (): Promise<{ available: boolean; calendars: OutlookCalendarInfo[]; error?: string }> =>
    ipcRenderer.invoke('calendar:outlook-list'),
  importOutlookCalendar: (
    accountId: string,
    folderPath: string
  ): Promise<{ ok: boolean; imported: number; calendarName?: string; error?: string }> =>
    ipcRenderer.invoke('calendar:outlook-import', accountId, folderPath),

  // AI Suite
  detectLocalAI: (overrides?: {
    localOpenAiUrl?: string
    ollamaUrl?: string
    lmStudioUrl?: string
  }): Promise<LocalAIStatus> => ipcRenderer.invoke('ai:detect-local', overrides),
  askAssistant: (question: string, accountIds?: string[]): Promise<AssistantResponse> =>
    ipcRenderer.invoke('ai:ask', question, accountIds),
  summarizeThread: (threadId: string): Promise<ThreadAISummary> => ipcRenderer.invoke('ai:summarize', threadId),
  draftReply: (opts: {
    accountId: string
    threadId?: string
    instruction: string
  }): Promise<{ draft: string; providerLabel: string; error?: string }> => ipcRenderer.invoke('ai:draft', opts),

  // Utilities & MCP
  copyText: (text: string, notifyLabel?: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('util:copy-text', text, notifyLabel),
  openExternal: (url: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('util:open-external', url),
  getMcpConfig: (): Promise<{ command: string; args: string[]; env: Record<string, string> }> =>
    ipcRenderer.invoke('mcp:get-config')
}

export type GlassmailAPI = typeof api
contextBridge.exposeInMainWorld('glassmail', api)
