import { create } from 'zustand'
import type { ConfirmDialogState } from '../components/ConfirmModal'
import type {
  Account,
  ActiveView,
  AppSettings,
  AppUpdateStatus,
  AutopilotLogEntry,
  AutopilotRule,
  CalendarEvent,
  ComposerAttachment,
  CreateReminderPayload,
  Folder,
  HabitSuggestion,
  ImplicitCalendarEvent,
  InboxCategory,
  MailboxId,
  ParsedSearchQuery,
  Reminder,
  ScheduledEmail,
  SendEmailPayload,
  SenderPreference,
  SenderProfile,
  Snippet,
  SubscriptionGroup,
  ThreadAIMeta,
  ThreadDetail,
  ThreadPreDraft,
  ThreadSummary,
  VoiceProfile,
  Workspace
} from '../../../shared/types'

export interface QuotedMessageContext {
  fromName: string
  fromEmail: string
  to: string
  cc?: string
  date: number
  subject: string
  bodyHtml: string
  bodyText: string
}

export interface ComposerState {
  open: boolean
  mode: 'new' | 'reply' | 'replyAll' | 'forward'
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  bodyHtml?: string
  replyToThreadId?: string
  replyToMessageId?: string
  draftThreadId?: string
  draftRemoteId?: string
  attachments?: ComposerAttachment[]
  quotedMessage?: QuotedMessageContext
}

export interface UndoItem {
  label: string
  undo: () => Promise<void>
}

interface AppState {
  settings: AppSettings | null
  accounts: Account[]
  workspaces: Workspace[]
  folders: Folder[]
  snippets: Snippet[]
  counts: Record<string, number>

  // Focus Toggles: empty array = ALL accounts; non-empty = only those accountIds
  activeAccountIds: string[]
  activeWorkspaceId: string | null

  // Navigation
  activeView: ActiveView
  activeMailbox: MailboxId
  activeCategory: InboxCategory
  activeFolderName: string | null

  // Mail state
  threads: ThreadSummary[]
  selectedThreadId: string | null
  selectedThread: ThreadDetail | null
  lastSelectedThreadByAccount: Record<string, string>
  checkedThreadIds: string[]
  lastCheckedThreadId: string | null
  searchQuery: string
  parsedSearch: ParsedSearchQuery | null
  searchIncludeTrash: boolean
  searchScopeAccountId: string | null
  subscriptions: SubscriptionGroup[]
  scheduledEmails: ScheduledEmail[]

  // Calendar state
  todayEvents: CalendarEvent[]
  calendarEvents: CalendarEvent[]

  // Reminders, Pre-Drafts, Autopilot, Decision AI & Voice Profiles
  reminders: Reminder[]
  preDrafts: ThreadPreDraft[]
  threadAiMeta: Record<string, ThreadAIMeta>
  autopilotRules: AutopilotRule[]
  autopilotLogs: AutopilotLogEntry[]
  habitSuggestions: HabitSuggestion[]
  senderProfiles: SenderProfile[]
  activeHabitToast: HabitSuggestion | null
  voiceProfiles: VoiceProfile[]

  // UI Overlays
  sidebarVisible: boolean
  assistantOpen: boolean
  assistantDraftPrompt: string | null
  pendingSummarizeThreadId: string | null
  pendingDraftThreadId: string | null
  pendingCalendarDraft: {
    title?: string
    description?: string
    location?: string
    accountId?: string
    dateStr?: string
    startTime?: string
    endTime?: string
  } | null
  commandPaletteOpen: boolean
  shortcutHelpOpen: boolean
  confirmDialog: ConfirmDialogState | null
  settingsOpen: boolean
  settingsInitialTab: 'accounts' | 'ai' | 'general' | 'themes' | 'shortcuts' | 'privacy' | 'snippets' | 'mcp'
  composer: ComposerState
  toast: { id: number; message: string; undo?: () => Promise<void>; durationMs: number } | null
  isSyncing: boolean
  appVersion: string
  updateStatus: AppUpdateStatus | null
  checkingForUpdates: boolean

  // Actions
  bootstrap: () => Promise<void>
  refreshAll: () => Promise<void>
  refreshThreads: () => Promise<void>
  refreshTodayEvents: () => Promise<void>
  selectThread: (threadId: string | null) => Promise<void>
  setActiveView: (view: ActiveView) => void
  setActiveMailbox: (mailbox: MailboxId) => Promise<void>
  setActiveCategory: (cat: InboxCategory) => Promise<void>
  setActiveFolder: (folderName: string | null) => Promise<void>

  // Account Focus Toggles
  selectAllAccounts: () => Promise<void>
  soloAccount: (accountId: string) => Promise<void>
  selectAccountMailbox: (accountId: string, mailbox: MailboxId, folderName?: string | null) => Promise<void>
  toggleAccountFilter: (accountId: string) => Promise<void>
  selectWorkspace: (ws: Workspace) => Promise<void>

  // Search
  runSearch: (query: string) => Promise<void>
  clearSearch: () => Promise<void>
  setSearchIncludeTrash: (include: boolean) => Promise<void>
  setSearchScopeAccountId: (accountId: string | null) => Promise<void>

  // Multi-select
  toggleCheckThread: (threadId: string) => void
  checkThreadRange: (targetId: string, orderedIds: string[]) => void
  setCheckedThreads: (threadIds: string[]) => void
  clearCheckedThreads: () => void

  // Mutations with Undo
  archiveThreads: (threadIds: string[]) => Promise<void>
  trashThreads: (threadIds: string[]) => Promise<void>
  moveThreadsToFolder: (threadIds: string[], role: Folder['role'], folderName?: string) => Promise<void>
  snoozeThreads: (threadIds: string[], untilMs: number, label: string) => Promise<void>
  toggleStarThread: (threadId: string, current: boolean) => Promise<void>
  toggleReadThread: (threadId: string, current: boolean) => Promise<void>
  setStarredThreads: (threadIds: string[], isStarred: boolean) => Promise<void>
  setReadThreads: (threadIds: string[], isRead: boolean) => Promise<void>
  markFolderRead: (opts: {
    mailbox: MailboxId
    accountIds?: string[]
    folderName?: string
    label: string
  }) => Promise<void>

  // Decision AI & Thread Triage
  loadThreadAiMetaBatch: (threadIds: string[]) => Promise<void>
  reclassifyThread: (threadId: string) => Promise<ThreadAIMeta | null>
  dismissPreDraft: (threadId: string) => Promise<void>
  createCalendarEventFromImplicit: (
    accountId: string,
    event: ImplicitCalendarEvent,
    threadId: string
  ) => Promise<{ ok: boolean; id?: string; error?: string }>

  // Habit Learning & Autopilot Undo
  refreshHabits: () => Promise<void>
  acceptHabitSuggestion: (id: string) => Promise<void>
  dismissHabitSuggestion: (id: string) => Promise<void>
  setSenderPreference: (senderEmail: string, preference: SenderPreference) => Promise<void>
  undoAutopilotLog: (logId: string, pauseRule?: boolean) => Promise<void>
  setActiveHabitToast: (suggestion: HabitSuggestion | null) => void

  // Overlays
  setSidebarVisible: (v: boolean) => void
  setAssistantOpen: (v: boolean) => void
  toggleAssistant: () => void
  askAssistantPrompt: (prompt: string) => void
  clearAssistantDraftPrompt: () => void
  requestSummarizeThread: (threadId: string) => Promise<void>
  clearPendingSummarize: () => void
  requestDraftReply: (threadId: string) => Promise<void>
  clearPendingDraft: () => void
  createReminder: (payload: CreateReminderPayload) => Promise<void>
  completeReminder: (id: string) => Promise<void>
  deleteReminder: (id: string) => Promise<void>
  openCalendarCreate: (draft?: AppState['pendingCalendarDraft']) => void
  clearCalendarDraft: () => void
  setCommandPaletteOpen: (v: boolean) => void
  setShortcutHelpOpen: (v: boolean) => void
  openConfirm: (dialog: ConfirmDialogState) => void
  closeConfirm: () => void
  openSettings: (tab?: AppState['settingsInitialTab']) => void
  closeSettings: () => void
  openComposer: (partial?: Partial<ComposerState>) => void
  closeComposer: () => void
  showToast: (message: string, undo?: () => Promise<void>, durationMs?: number) => void
  clearToast: () => void
  queueSendWithUndo: (
    payload: SendEmailPayload,
    draftRestore: Partial<ComposerState>,
    delaySeconds: number
  ) => void
  triggerSync: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>
  checkForUpdates: (opts?: { silent?: boolean }) => Promise<AppUpdateStatus | null>
}

let toastTimer: number | null = null

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  accounts: [],
  workspaces: [],
  folders: [],
  snippets: [],
  counts: {},
  activeAccountIds: [],
  activeWorkspaceId: 'ws-all',

  activeView: 'mail',
  activeMailbox: 'inbox',
  activeCategory: 'all',
  activeFolderName: null,

  threads: [],
  selectedThreadId: null,
  selectedThread: null,
  lastSelectedThreadByAccount: {},
  checkedThreadIds: [],
  lastCheckedThreadId: null,
  searchQuery: '',
  parsedSearch: null,
  searchIncludeTrash: false,
  searchScopeAccountId: null,
  subscriptions: [],
  scheduledEmails: [],

  todayEvents: [],
  calendarEvents: [],

  reminders: [],
  preDrafts: [],
  threadAiMeta: {},
  autopilotRules: [],
  autopilotLogs: [],
  habitSuggestions: [],
  senderProfiles: [],
  activeHabitToast: null,
  voiceProfiles: [],

  sidebarVisible: true,
  assistantOpen: false,
  assistantDraftPrompt: null,
  pendingSummarizeThreadId: null,
  pendingDraftThreadId: null,
  pendingCalendarDraft: null,
  commandPaletteOpen: false,
  shortcutHelpOpen: false,
  confirmDialog: null,
  settingsOpen: false,
  settingsInitialTab: 'accounts',
  composer: {
    open: false,
    mode: 'new',
    accountId: '',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: ''
  },
  toast: null,
  isSyncing: false,
  appVersion: '',
  updateStatus: null,
  checkingForUpdates: false,

  bootstrap: async () => {
    const [settings, accounts, workspaces, snippets, appVersion] = await Promise.all([
      window.glassmail.getSettings(),
      window.glassmail.listAccounts(),
      window.glassmail.listWorkspaces(),
      window.glassmail.listSnippets(),
      window.glassmail.getAppVersion().catch(() => '')
    ])
    document.documentElement.setAttribute('data-theme', settings.theme)
    document.documentElement.setAttribute('data-ui-theme', settings.uiTheme || 'everybox')
    set({ settings, accounts, workspaces, snippets, appVersion })
    await get().refreshAll()
  },

  refreshAll: async () => {
    const { activeAccountIds } = get()
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
    const [
      accounts,
      workspaces,
      folders,
      counts,
      snippets,
      reminders,
      preDrafts,
      autopilotRules,
      autopilotLogs,
      habitSuggestions,
      senderProfiles,
      voiceProfiles
    ] = await Promise.all([
      window.glassmail.listAccounts(),
      window.glassmail.listWorkspaces(),
      window.glassmail.listFolders(),
      window.glassmail.getMailboxCounts(filterIds),
      window.glassmail.listSnippets(),
      window.glassmail.listReminders(filterIds),
      window.glassmail.listPreDrafts(),
      window.glassmail.listAutopilotRules(),
      window.glassmail.listAutopilotLogs(50),
      window.glassmail.listHabitSuggestions('pending'),
      window.glassmail.listSenderProfiles(40),
      window.glassmail.listVoiceProfiles()
    ])
    set({
      accounts,
      workspaces,
      folders,
      counts,
      snippets,
      reminders,
      preDrafts,
      autopilotRules,
      autopilotLogs,
      habitSuggestions,
      senderProfiles,
      voiceProfiles
    })
    await Promise.all([get().refreshThreads(), get().refreshTodayEvents()])
  },

  refreshThreads: async () => {
    const {
      activeAccountIds,
      activeMailbox,
      activeCategory,
      activeFolderName,
      searchQuery,
      searchIncludeTrash,
      searchScopeAccountId
    } = get()
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined

    if (searchQuery.trim()) {
      // Top search searches All Accounts by default, or a single account when explicitly scoped in the search bar
      const searchAccountIds = searchScopeAccountId ? [searchScopeAccountId] : undefined
      const { parsed, threads } = await window.glassmail.searchMail(searchQuery, searchAccountIds, searchIncludeTrash)
      set({ parsedSearch: parsed, threads })
      void get().loadThreadAiMetaBatch(threads.map((t) => t.id))
      return
    }

    if (activeMailbox === 'subscriptions') {
      const subs = await window.glassmail.listSubscriptions(filterIds)
      set({ subscriptions: subs })
    }
    if (activeMailbox === 'scheduled') {
      const sched = await window.glassmail.listScheduledEmails(filterIds)
      set({ scheduledEmails: sched })
    }

    const threads = await window.glassmail.listThreads({
      accountIds: filterIds,
      mailbox: activeMailbox,
      category: activeMailbox === 'inbox' ? activeCategory : 'all',
      folderName: activeFolderName || undefined
    })
    set({ threads, parsedSearch: null })
    void get().loadThreadAiMetaBatch(threads.map((t) => t.id))

    // Keep selected thread fresh if open
    const selId = get().selectedThreadId
    if (selId) {
      const detail = await window.glassmail.getThread(selId)
      set({ selectedThread: detail })
    }
  },

  refreshTodayEvents: async () => {
    const { activeAccountIds } = get()
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 2 * 86400_000)
    const todayEvents = await window.glassmail.listCalendarEvents(start.getTime(), end.getTime(), filterIds)
    set({ todayEvents })
  },

  selectThread: async (threadId) => {
    if (!threadId) {
      set({ selectedThreadId: null, selectedThread: null })
      return
    }
    set({ selectedThreadId: threadId })
    const detail = await window.glassmail.getThread(threadId)
    set((s) => ({
      selectedThread: detail,
      lastSelectedThreadByAccount: detail
        ? { ...s.lastSelectedThreadByAccount, [detail.accountId]: threadId }
        : s.lastSelectedThreadByAccount
    }))
    if (!get().threadAiMeta[threadId]) {
      void window.glassmail.getThreadAiMeta(threadId).then((meta) => {
        if (meta) {
          set((s) => ({ threadAiMeta: { ...s.threadAiMeta, [threadId]: meta } }))
        }
      })
    }
    if (detail && !detail.isRead) {
      await window.glassmail.setRead([threadId], true)
      await get().refreshAll()
    }
  },

  setActiveView: (view) => {
    set({ activeView: view })
    if (view === 'subscriptions') {
      void get().setActiveMailbox('subscriptions')
    }
  },

  setActiveMailbox: async (mailbox) => {
    set({
      activeView: mailbox === 'subscriptions' ? 'subscriptions' : 'mail',
      activeMailbox: mailbox,
      activeFolderName: null,
      selectedThreadId: null,
      selectedThread: null,
      checkedThreadIds: [],
      lastCheckedThreadId: null,
      searchQuery: '',
      parsedSearch: null
    })
    await get().refreshThreads()
  },

  setActiveCategory: async (cat) => {
    set({ activeCategory: cat, checkedThreadIds: [], lastCheckedThreadId: null })
    await get().refreshThreads()
  },

  setActiveFolder: async (folderName) => {
    set({
      activeView: 'mail',
      activeFolderName: folderName,
      selectedThreadId: null,
      selectedThread: null,
      checkedThreadIds: [],
      lastCheckedThreadId: null
    })
    await get().refreshThreads()
    if (folderName) {
      const activeIds = get().activeAccountIds
      const filterIds = activeIds.length > 0 ? activeIds : undefined
      set({ isSyncing: true })
      try {
        await window.glassmail.syncFolder(folderName, filterIds)
        await get().refreshAll()
      } finally {
        set({ isSyncing: false })
      }
    }
  },

  // ---- Multi-Account Focus Toggles ----
  selectAllAccounts: async () => {
    set({
      activeAccountIds: [],
      activeWorkspaceId: 'ws-all',
      activeFolderName: null,
      selectedThreadId: null,
      selectedThread: null,
      checkedThreadIds: [],
      lastCheckedThreadId: null
    })
    await get().refreshAll()
  },

  soloAccount: async (accountId) => {
    const current = get().activeAccountIds
    const wasOnHome = !get().selectedThreadId
    // If already soloed on this account, clicking again returns to All Accounts (Inbox Home)
    if (current.length === 1 && current[0] === accountId) {
      await get().selectAllAccounts()
      return
    }
    set({
      activeAccountIds: [accountId],
      activeWorkspaceId: null,
      activeFolderName: null,
      selectedThreadId: null,
      selectedThread: null,
      checkedThreadIds: [],
      lastCheckedThreadId: null
    })
    await get().refreshAll()

    // If Inbox Home was already open, keep Inbox Home open for the new account
    if (wasOnHome) return

    const behavior = get().settings?.accountSwitchBehavior || 'home'
    if (behavior === 'last-email') {
      const lastId = get().lastSelectedThreadByAccount[accountId]
      if (lastId && get().threads.some((t) => t.id === lastId)) {
        await get().selectThread(lastId)
      }
    } else if (behavior === 'first-email') {
      const first = get().threads[0]
      if (first) {
        await get().selectThread(first.id)
      }
    }
  },

  selectAccountMailbox: async (accountId, mailbox, folderName = null) => {
    set({
      activeAccountIds: [accountId],
      activeWorkspaceId: null,
      activeView: mailbox === 'subscriptions' ? 'subscriptions' : 'mail',
      activeMailbox: mailbox,
      activeFolderName: folderName,
      selectedThreadId: null,
      selectedThread: null,
      checkedThreadIds: [],
      searchQuery: '',
      parsedSearch: null
    })
    await get().refreshAll()
    if (folderName) {
      set({ isSyncing: true })
      try {
        await window.glassmail.syncFolder(folderName, [accountId])
        await get().refreshAll()
      } finally {
        set({ isSyncing: false })
      }
    }
  },

  toggleAccountFilter: async (accountId) => {
    const { activeAccountIds, accounts } = get()
    let next: string[]
    if (activeAccountIds.length === 0) {
      // Currently showing all -> unchecking one means show all OTHER accounts
      next = accounts.map((a) => a.id).filter((id) => id !== accountId)
    } else if (activeAccountIds.includes(accountId)) {
      next = activeAccountIds.filter((id) => id !== accountId)
    } else {
      next = [...activeAccountIds, accountId]
    }
    // If all accounts are now checked (or none), normalize back to All ([])
    if (next.length === 0 || next.length === accounts.length) {
      next = []
    }
    set({ activeAccountIds: next, activeWorkspaceId: next.length === 0 ? 'ws-all' : null, activeFolderName: null })
    await get().refreshAll()
  },

  selectWorkspace: async (ws) => {
    set({ activeAccountIds: ws.accountIds, activeWorkspaceId: ws.id, activeFolderName: null })
    await get().refreshAll()
  },

  runSearch: async (query) => {
    set({ searchQuery: query, activeView: 'mail' })
    await get().refreshThreads()
  },

  clearSearch: async () => {
    set({ searchQuery: '', parsedSearch: null, searchIncludeTrash: false })
    await get().refreshThreads()
  },

  setSearchIncludeTrash: async (include) => {
    set({ searchIncludeTrash: include })
    await get().refreshThreads()
  },

  setSearchScopeAccountId: async (accountId) => {
    set({ searchScopeAccountId: accountId })
    if (get().searchQuery.trim()) {
      await get().refreshThreads()
    }
  },

  toggleCheckThread: (threadId) => {
    const cur = get().checkedThreadIds
    const exists = cur.includes(threadId)
    const next = exists ? cur.filter((id) => id !== threadId) : [...cur, threadId]
    set({
      checkedThreadIds: next,
      lastCheckedThreadId: next.length > 0 ? threadId : null
    })
  },

  checkThreadRange: (targetId, orderedIds) => {
    const { checkedThreadIds, lastCheckedThreadId } = get()
    const targetIdx = orderedIds.indexOf(targetId)
    if (targetIdx === -1) {
      get().toggleCheckThread(targetId)
      return
    }
    const anchorId =
      lastCheckedThreadId && orderedIds.includes(lastCheckedThreadId)
        ? lastCheckedThreadId
        : checkedThreadIds.length > 0 && orderedIds.includes(checkedThreadIds[checkedThreadIds.length - 1])
          ? checkedThreadIds[checkedThreadIds.length - 1]
          : null

    if (!anchorId) {
      const next = checkedThreadIds.includes(targetId) ? checkedThreadIds : [...checkedThreadIds, targetId]
      set({ checkedThreadIds: next, lastCheckedThreadId: targetId })
      return
    }

    const anchorIdx = orderedIds.indexOf(anchorId)
    const [start, end] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
    const rangeIds = orderedIds.slice(start, end + 1)
    const merged = Array.from(new Set([...checkedThreadIds, ...rangeIds]))
    set({ checkedThreadIds: merged, lastCheckedThreadId: targetId })
  },

  setCheckedThreads: (threadIds) => {
    const unique = Array.from(new Set(threadIds))
    set({
      checkedThreadIds: unique,
      lastCheckedThreadId: unique.length > 0 ? unique[unique.length - 1] : null
    })
  },

  clearCheckedThreads: () => set({ checkedThreadIds: [], lastCheckedThreadId: null }),

  archiveThreads: async (threadIds) => {
    if (!threadIds.length) return
    const { threads, selectedThreadId } = get()
    const currentIdx = threads.findIndex((t) => t.id === selectedThreadId)
    await window.glassmail.moveThreads(threadIds, 'archive', 'Archive')
    set({ checkedThreadIds: [], lastCheckedThreadId: null })
    await get().refreshAll()

    // Auto-advance to next thread like Glassmail
    if (selectedThreadId && threadIds.includes(selectedThreadId)) {
      const remaining = get().threads
      const next = remaining[currentIdx] || remaining[currentIdx - 1] || null
      await get().selectThread(next?.id || null)
    }
    get().showToast(`Archived ${threadIds.length === 1 ? 'conversation' : `${threadIds.length} conversations`}`, async () => {
      await window.glassmail.moveThreads(threadIds, 'inbox', 'Inbox')
      await get().refreshAll()
    })
  },

  trashThreads: async (threadIds) => {
    if (!threadIds.length) return
    const { threads, selectedThreadId, activeMailbox } = get()
    const currentIdx = threads.findIndex((t) => t.id === selectedThreadId)
    if (activeMailbox === 'trash') {
      await window.glassmail.deleteThreadsPermanently(threadIds)
    } else {
      await window.glassmail.moveThreads(threadIds, 'trash', 'Trash')
    }
    set({ checkedThreadIds: [], lastCheckedThreadId: null })
    await get().refreshAll()

    if (selectedThreadId && threadIds.includes(selectedThreadId)) {
      const remaining = get().threads
      const next = remaining[currentIdx] || remaining[currentIdx - 1] || null
      await get().selectThread(next?.id || null)
    }
    if (activeMailbox !== 'trash') {
      get().showToast(
        threadIds.length === 1 ? 'Deleted email' : `Deleted ${threadIds.length} emails`,
        async () => {
          await window.glassmail.moveThreads(threadIds, 'inbox', 'Inbox')
          await get().refreshAll()
        },
        5000
      )
    }
  },

  snoozeThreads: async (threadIds, untilMs, label) => {
    if (!threadIds.length) return
    await window.glassmail.snoozeThreads(threadIds, untilMs)
    set({ checkedThreadIds: [], lastCheckedThreadId: null })
    if (get().selectedThreadId && threadIds.includes(get().selectedThreadId!)) {
      set({ selectedThreadId: null, selectedThread: null })
    }
    await get().refreshAll()
    get().showToast(`Snoozed until ${label}`, async () => {
      await window.glassmail.snoozeThreads(threadIds, null)
      await get().refreshAll()
    })
  },

  toggleStarThread: async (threadId, current) => {
    await window.glassmail.setStarred([threadId], !current)
    await get().refreshAll()
  },

  toggleReadThread: async (threadId, current) => {
    await window.glassmail.setRead([threadId], !current)
    await get().refreshAll()
  },

  setStarredThreads: async (threadIds, isStarred) => {
    if (!threadIds.length) return
    await window.glassmail.setStarred(threadIds, isStarred)
    await get().refreshAll()
    const n = threadIds.length
    get().showToast(
      isStarred
        ? n === 1
          ? 'Starred conversation'
          : `Starred ${n} conversations`
        : n === 1
          ? 'Removed star'
          : `Removed star from ${n} conversations`,
      undefined,
      3000
    )
  },

  setReadThreads: async (threadIds, isRead) => {
    if (!threadIds.length) return
    await window.glassmail.setRead(threadIds, isRead)
    await get().refreshAll()
    const n = threadIds.length
    get().showToast(
      isRead
        ? n === 1
          ? 'Marked as read'
          : `Marked ${n} conversations as read`
        : n === 1
          ? 'Marked as unread'
          : `Marked ${n} conversations as unread`,
      undefined,
      3000
    )
  },

  moveThreadsToFolder: async (threadIds, role, folderName) => {
    if (!threadIds.length) return
    const { threads, selectedThreadId } = get()
    const currentIdx = threads.findIndex((t) => t.id === selectedThreadId)
    await window.glassmail.moveThreads(threadIds, role, folderName)
    set({ checkedThreadIds: [], lastCheckedThreadId: null })
    await get().refreshAll()

    if (selectedThreadId && threadIds.includes(selectedThreadId)) {
      const remaining = get().threads
      const next = remaining[currentIdx] || remaining[currentIdx - 1] || null
      await get().selectThread(next?.id || null)
    }
    const destLabel = folderName || role.charAt(0).toUpperCase() + role.slice(1)
    get().showToast(
      `Moved ${threadIds.length === 1 ? 'conversation' : `${threadIds.length} conversations`} to ${destLabel}`,
      async () => {
        await window.glassmail.moveThreads(threadIds, 'inbox', 'Inbox')
        await get().refreshAll()
      }
    )
  },

  markFolderRead: async ({ mailbox, accountIds, folderName, label }) => {
    const list = await window.glassmail.listThreads({
      accountIds: accountIds && accountIds.length > 0 ? accountIds : undefined,
      mailbox,
      category: 'all',
      folderName
    })
    const unreadIds = list.filter((t) => !t.isRead).map((t) => t.id)
    if (unreadIds.length === 0) {
      get().showToast(`${label} is already all read`, undefined, 2500)
      return
    }
    await window.glassmail.setRead(unreadIds, true)
    await get().refreshAll()
    get().showToast(`Marked ${unreadIds.length} email${unreadIds.length === 1 ? '' : 's'} in ${label} as read`, undefined, 3000)
  },

  loadThreadAiMetaBatch: async (threadIds) => {
    const uniqueIds = Array.from(new Set(threadIds.filter(Boolean)))
    if (uniqueIds.length === 0) return
    try {
      const batch = await window.glassmail.getThreadAiMetaBatch(uniqueIds)
      if (batch && Object.keys(batch).length > 0) {
        set((s) => ({ threadAiMeta: { ...s.threadAiMeta, ...batch } }))
      }
    } catch {
      // Ignore batch metadata fetch errors to keep thread list responsive
    }
  },

  reclassifyThread: async (threadId) => {
    const meta = await window.glassmail.reclassifyThread(threadId)
    if (meta) {
      set((s) => ({ threadAiMeta: { ...s.threadAiMeta, [threadId]: meta } }))
    }
    return meta
  },

  dismissPreDraft: async (threadId) => {
    set((s) => ({
      preDrafts: s.preDrafts.filter((p) => p.threadId !== threadId)
    }))
    await window.glassmail.dismissPreDraft(threadId)
    const preDrafts = await window.glassmail.listPreDrafts()
    set({ preDrafts })
  },

  createCalendarEventFromImplicit: async (accountId, event, threadId) => {
    const res = await window.glassmail.createCalendarEventFromImplicit({
      accountId,
      threadId,
      event
    })
    if (res.ok) {
      await get().refreshTodayEvents()
      get().showToast(`Added "${event.title}" to Calendar`, undefined, 3000)
    } else {
      get().showToast(res.error || 'Could not add event to Calendar', undefined, 4000)
    }
    return res
  },

  refreshHabits: async () => {
    const [habitSuggestions, senderProfiles] = await Promise.all([
      window.glassmail.listHabitSuggestions('pending'),
      window.glassmail.listSenderProfiles(40)
    ])
    set({ habitSuggestions, senderProfiles })
  },

  acceptHabitSuggestion: async (id) => {
    const res = await window.glassmail.acceptHabitSuggestion(id)
    if (get().activeHabitToast?.id === id) {
      set({ activeHabitToast: null })
    }
    const [autopilotRules] = await Promise.all([
      window.glassmail.listAutopilotRules(),
      get().refreshHabits()
    ])
    set({ autopilotRules })
    if (res.ok) {
      get().showToast('Rule enabled in Autopilot', undefined, 3500)
    } else if (res.error) {
      get().showToast(res.error, undefined, 4000)
    }
  },

  dismissHabitSuggestion: async (id) => {
    await window.glassmail.dismissHabitSuggestion(id)
    if (get().activeHabitToast?.id === id) {
      set({ activeHabitToast: null })
    }
    await get().refreshHabits()
  },

  setSenderPreference: async (senderEmail, preference) => {
    await window.glassmail.setSenderPreference(senderEmail, preference, true)
    await get().refreshHabits()
  },

  undoAutopilotLog: async (logId, pauseRule = false) => {
    const res = await window.glassmail.undoAutopilotLog(logId, pauseRule)
    await get().refreshAll()
    if (res.ok) {
      get().showToast(pauseRule ? 'Restored to Inbox — rule paused' : 'Restored to Inbox', undefined, 3500)
    } else if (res.error) {
      get().showToast(res.error, undefined, 4000)
    }
  },

  setActiveHabitToast: (suggestion) => set({ activeHabitToast: suggestion }),

  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setAssistantOpen: (v) => set({ assistantOpen: v }),
  toggleAssistant: () => set((s) => ({ assistantOpen: !s.assistantOpen })),
  askAssistantPrompt: (prompt) => set({ assistantOpen: true, assistantDraftPrompt: prompt }),
  clearAssistantDraftPrompt: () => set({ assistantDraftPrompt: null }),
  requestSummarizeThread: async (threadId) => {
    set({ activeView: 'mail', pendingSummarizeThreadId: threadId })
    await get().selectThread(threadId)
  },
  clearPendingSummarize: () => set({ pendingSummarizeThreadId: null }),
  requestDraftReply: async (threadId) => {
    set({ activeView: 'mail', pendingDraftThreadId: threadId })
    await get().selectThread(threadId)
  },
  clearPendingDraft: () => set({ pendingDraftThreadId: null }),
  createReminder: async (payload) => {
    await window.glassmail.createReminder(payload)
    await get().refreshAll()
    get().showToast(`Reminder set: ${payload.title}`, undefined, 3000)
  },
  completeReminder: async (id) => {
    await window.glassmail.completeReminder(id)
    await get().refreshAll()
    get().showToast('Reminder completed', undefined, 2500)
  },
  deleteReminder: async (id) => {
    await window.glassmail.deleteReminder(id)
    await get().refreshAll()
  },
  openCalendarCreate: (draft) => set({ activeView: 'calendar', pendingCalendarDraft: draft || {} }),
  clearCalendarDraft: () => set({ pendingCalendarDraft: null }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setShortcutHelpOpen: (v) => set({ shortcutHelpOpen: v }),
  openConfirm: (dialog) => set({ confirmDialog: dialog }),
  closeConfirm: () => set({ confirmDialog: null }),
  openSettings: (tab = 'accounts') => set({ settingsOpen: true, settingsInitialTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),

  openComposer: (partial) => {
    const accounts = get().accounts
    const activeIds = get().activeAccountIds
    const defaultAccId = partial?.accountId || (activeIds.length === 1 ? activeIds[0] : accounts[0]?.id || '')
    set({
      composer: {
        open: true,
        mode: partial?.mode || 'new',
        accountId: defaultAccId,
        to: partial?.to || '',
        cc: partial?.cc || '',
        bcc: partial?.bcc || '',
        subject: partial?.subject || '',
        body: partial?.body || '',
        bodyHtml: partial?.bodyHtml,
        replyToThreadId: partial?.replyToThreadId,
        replyToMessageId: partial?.replyToMessageId,
        draftThreadId: partial?.draftThreadId,
        draftRemoteId: partial?.draftRemoteId,
        attachments: partial?.attachments || [],
        quotedMessage: partial?.quotedMessage
      }
    })
  },

  closeComposer: () =>
    set((s) => ({
      composer: { ...s.composer, open: false }
    })),

  showToast: (message, undo, durationMs = 5000) => {
    if (toastTimer) {
      window.clearTimeout(toastTimer)
      toastTimer = null
    }
    const id = Date.now() + Math.random()
    set({ toast: { id, message, undo, durationMs } })
    toastTimer = window.setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null })
      }
      toastTimer = null
    }, durationMs)
  },

  clearToast: () => {
    if (toastTimer) {
      window.clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toast: null })
  },

  queueSendWithUndo: (payload, draftRestore, delaySeconds) => {
    const ms = Math.max(0, delaySeconds) * 1000
    let timerId: number | null = null
    let cancelled = false

    const doSend = async () => {
      timerId = null
      if (cancelled) return
      const res = await window.glassmail.sendEmail(payload)
      if (res.ok) {
        await get().refreshAll()
        get().showToast('Message sent', undefined, 3000)
      } else {
        get().openComposer(draftRestore)
        get().showToast(res.error || 'Failed to send message', undefined, 5000)
      }
    }

    if (ms === 0) {
      void doSend()
      return
    }

    // Independent timer per send so rapid-fire sending of multiple emails/drafts never cancels earlier sends
    timerId = window.setTimeout(() => {
      void doSend()
    }, ms)

    get().showToast(
      `Sending message…`,
      async () => {
        cancelled = true
        if (timerId !== null) {
          window.clearTimeout(timerId)
          timerId = null
        }
        get().openComposer(draftRestore)
        get().showToast('Send cancelled — draft restored', undefined, 3000)
      },
      ms
    )
  },

  triggerSync: async () => {
    set({ isSyncing: true })
    try {
      await window.glassmail.syncAll()
      const { activeFolderName, activeAccountIds } = get()
      if (activeFolderName) {
        await window.glassmail.syncFolder(
          activeFolderName,
          activeAccountIds.length > 0 ? activeAccountIds : undefined
        )
      }
      await get().refreshAll()
    } finally {
      set({ isSyncing: false })
    }
  },

  saveSettings: async (s) => {
    await window.glassmail.saveSettings(s)
    document.documentElement.setAttribute('data-theme', s.theme)
    document.documentElement.setAttribute('data-ui-theme', s.uiTheme || 'everybox')
    set({ settings: s })
  },

  checkForUpdates: async (opts) => {
    if (get().checkingForUpdates) return get().updateStatus
    set({ checkingForUpdates: true })
    try {
      const status = await window.glassmail.checkForUpdates()
      set({
        updateStatus: status,
        appVersion: status.currentVersion || get().appVersion
      })
      if (!opts?.silent) {
        if (status.error) {
          get().showToast(status.error, undefined, 4000)
        } else if (status.updateAvailable && status.latestVersion) {
          get().showToast(`Update available: v${status.latestVersion}`, undefined, 4500)
        } else {
          get().showToast(`EveryBox v${status.currentVersion} is up to date`, undefined, 3000)
        }
      }
      return status
    } catch {
      if (!opts?.silent) {
        get().showToast('Could not check for updates', undefined, 4000)
      }
      return null
    } finally {
      set({ checkingForUpdates: false })
    }
  }
}))
