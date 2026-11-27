import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppSettings,
  AssistantResponse,
  AutopilotLogEntry,
  AutopilotRule,
  CalendarEvent,
  ComposerAttachment,
  CreateCalendarEventPayload,
  CreateReminderPayload,
  DecisionAIIpcAPI,
  DecisionAISettings,
  DecisionProviderTestResult,
  Folder,
  ImplicitCalendarEvent,
  LocalAIStatus,
  MailboxId,
  OutlookCalendarInfo,
  OutlookStoreInfo,
  ParsedSearchQuery,
  Reminder,
  ScheduledEmail,
  SendEmailPayload,
  Snippet,
  SubscriptionGroup,
  ThreadAIMeta,
  ThreadAISummary,
  ThreadDetail,
  ThreadPreDraft,
  ThreadSummary,
  VoiceProfile,
  VoiceProfileKind,
  WaitingOnYouItem,
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
  onFocusThread: (cb: (threadId: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, threadId: string) => cb(threadId)
    ipcRenderer.on('glassmail:focus-thread', handler)
    return () => {
      ipcRenderer.removeListener('glassmail:focus-thread', handler)
    }
  },
  onReminderDue: (cb: (reminderId: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, reminderId: string) => cb(reminderId)
    ipcRenderer.on('glassmail:reminder-due', handler)
    return () => {
      ipcRenderer.removeListener('glassmail:reminder-due', handler)
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
  listOutlookStores: (): Promise<{ available: boolean; stores: OutlookStoreInfo[]; error?: string }> =>
    ipcRenderer.invoke('accounts:list-outlook-stores'),
  connectOutlookLocalAccount: (input: {
    name?: string
    email: string
    storeName: string
    calendarPath?: string
  }): Promise<{ ok: boolean; accountId?: string; error?: string }> =>
    ipcRenderer.invoke('accounts:connect-outlook-local', input),

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
    accountIds?: string[],
    includeTrashAndJunk?: boolean
  ): Promise<{ parsed: ParsedSearchQuery; threads: ThreadSummary[] }> =>
    ipcRenderer.invoke('mail:search', query, accountIds, includeTrashAndJunk),
  syncAll: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('mail:sync-all'),
  syncFolder: (folderName: string, accountIds?: string[]): Promise<{ ok: boolean; synced: number }> =>
    ipcRenderer.invoke('mail:sync-folder', folderName, accountIds),
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
  saveDraft: (payload: SendEmailPayload): Promise<{ ok: boolean; draftId?: string; error?: string }> =>
    ipcRenderer.invoke('mail:save-draft', payload),
  pickAttachmentFiles: (): Promise<ComposerAttachment[]> => ipcRenderer.invoke('dialog:pick-attachments'),
  openAttachment: (input: {
    accountId: string
    filename: string
    localPath?: string
    remoteMessageId?: string
    remoteAttachmentId?: string
    folderRole?: Folder['role']
    folderName?: string
  }): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('mail:open-attachment', input),
  downloadAttachment: (input: {
    accountId: string
    filename: string
    localPath?: string
    remoteMessageId?: string
    remoteAttachmentId?: string
    folderRole?: Folder['role']
    folderName?: string
    revealInFolder?: boolean
  }): Promise<{ ok: boolean; filePath?: string; filename?: string; error?: string }> =>
    ipcRenderer.invoke('mail:download-attachment', input),
  saveAttachmentAs: (input: {
    accountId: string
    filename: string
    localPath?: string
    remoteMessageId?: string
    remoteAttachmentId?: string
    folderRole?: Folder['role']
    folderName?: string
  }): Promise<{ ok: boolean; cancelled?: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('mail:save-attachment-as', input),
  saveAllAttachments: (
    inputs: {
      accountId: string
      filename: string
      localPath?: string
      remoteMessageId?: string
      remoteAttachmentId?: string
      folderRole?: Folder['role']
      folderName?: string
    }[]
  ): Promise<{ ok: boolean; cancelled?: boolean; savedCount?: number; folderPath?: string; error?: string }> =>
    ipcRenderer.invoke('mail:save-all-attachments', inputs),
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
  summarizeThread: (threadId: string, forceRefresh?: boolean): Promise<ThreadAISummary> =>
    ipcRenderer.invoke('ai:summarize', threadId, forceRefresh),
  draftReply: (opts: {
    accountId: string
    threadId?: string
    instruction: string
    voiceProfileId?: string
  }): Promise<{ draft: string; providerLabel: string; error?: string }> => ipcRenderer.invoke('ai:draft', opts),

  // Decision AI & Thread Triage
  saveDecisionApiKey: (
    provider: 'jev' | 'openrouter' | 'gemini' | 'openai',
    apiKey: string
  ): Promise<{ ok: boolean }> => ipcRenderer.invoke('ai:saveDecisionApiKey', provider, apiKey),
  testDecisionProvider: (override?: Partial<DecisionAISettings>): Promise<DecisionProviderTestResult> =>
    ipcRenderer.invoke('ai:testDecisionProvider', override),
  getThreadAiMeta: (threadId: string): Promise<ThreadAIMeta | null> =>
    ipcRenderer.invoke('ai:getThreadMeta', threadId),
  getThreadAiMetaBatch: (threadIds: string[]): Promise<Record<string, ThreadAIMeta>> =>
    ipcRenderer.invoke('ai:getThreadMetaBatch', threadIds),
  reclassifyThread: (threadId: string): Promise<ThreadAIMeta | null> =>
    ipcRenderer.invoke('ai:reclassifyThread', threadId),
  dismissPreDraft: (threadId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('ai:dismissPreDraft', threadId),
  createCalendarEventFromImplicit: (input: {
    accountId: string
    threadId: string
    event: ImplicitCalendarEvent
  }): Promise<{ ok: boolean; id?: string; error?: string }> =>
    ipcRenderer.invoke('calendar:createFromImplicitEvent', input),

  // Reminders
  listReminders: (accountIds?: string[]): Promise<Reminder[]> => ipcRenderer.invoke('reminders:list', accountIds),
  createReminder: (payload: CreateReminderPayload): Promise<Reminder> =>
    ipcRenderer.invoke('reminders:create', payload),
  completeReminder: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('reminders:complete', id),
  snoozeReminder: (id: string, dueAt: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('reminders:snooze', id, dueAt),
  deleteReminder: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('reminders:delete', id),

  // AI Pre-Drafts
  listPreDrafts: (): Promise<ThreadPreDraft[]> => ipcRenderer.invoke('predrafts:list'),
  getPreDraft: (threadId: string): Promise<ThreadPreDraft | null> => ipcRenderer.invoke('predrafts:get', threadId),
  generatePreDraft: (opts: {
    threadId: string
    accountId: string
    instruction?: string
    voiceProfileId?: string
  }): Promise<{ ok: boolean; preDraft?: ThreadPreDraft; error?: string; providerLabel?: string }> =>
    ipcRenderer.invoke('predrafts:generate', opts),
  deletePreDraft: (threadId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('predrafts:delete', threadId),
  deletePreDraftsBySender: (senderEmail: string): Promise<{ ok: boolean; removed: number }> =>
    ipcRenderer.invoke('predrafts:delete-by-sender', senderEmail),
  clearAllPreDrafts: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('predrafts:clear-all'),

  // Autopilot
  listAutopilotRules: (): Promise<AutopilotRule[]> => ipcRenderer.invoke('autopilot:list-rules'),
  compileAutopilotRule: (
    prompt: string
  ): Promise<{ rule: Omit<AutopilotRule, 'id' | 'runCount' | 'lastRunAt' | 'createdAt'>; usedAI: boolean }> =>
    ipcRenderer.invoke('autopilot:compile-rule', prompt),
  saveAutopilotRule: (rule: AutopilotRule): Promise<AutopilotRule> => ipcRenderer.invoke('autopilot:save-rule', rule),
  toggleAutopilotRule: (id: string, enabled: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('autopilot:toggle-rule', id, enabled),
  deleteAutopilotRule: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('autopilot:delete-rule', id),
  runAutopilotNow: (): Promise<{ actionsTaken: number }> => ipcRenderer.invoke('autopilot:run-now'),
  getWaitingOnYou: (accountIds?: string[], useAI?: boolean): Promise<WaitingOnYouItem[]> =>
    ipcRenderer.invoke('mail:waiting-on-you', accountIds, useAI),
  listAutopilotLogs: (limit?: number): Promise<AutopilotLogEntry[]> => ipcRenderer.invoke('autopilot:list-logs', limit),
  undoAutopilotLog: (logId: string, threadId: string, undoAction: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('autopilot:undo-log', logId, threadId, undoAction),

  // Voice Profiles
  listVoiceProfiles: (): Promise<VoiceProfile[]> => ipcRenderer.invoke('voices:list'),
  learnVoiceProfile: (opts: {
    id?: string
    kind: VoiceProfileKind
    name: string
    description: string
    accountIds: string[]
    recipientFilter?: string
  }): Promise<{ profile?: VoiceProfile; providerLabel: string; error?: string }> =>
    ipcRenderer.invoke('voices:learn', opts),
  saveVoiceProfile: (profile: VoiceProfile): Promise<{ ok: boolean }> => ipcRenderer.invoke('voices:save', profile),
  deleteVoiceProfile: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('voices:delete', id),

  // Utilities & MCP
  copyText: (text: string, notifyLabel?: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('util:copy-text', text, notifyLabel),
  openExternal: (url: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('util:open-external', url),
  openThreadWindow: (threadId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('window:open-thread', threadId),
  getMcpConfig: (): Promise<{ command: string; args: string[]; env: Record<string, string> }> =>
    ipcRenderer.invoke('mcp:get-config')
}

export type GlassmailAPI = typeof api
// Compile-time check that GlassmailAPI satisfies DecisionAIIpcAPI
const _decisionApiCheck: DecisionAIIpcAPI = api
void _decisionApiCheck
contextBridge.exposeInMainWorld('glassmail', api)
