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
  FolderCreateInput,
  FolderDeleteInput,
  FolderDeletePreview,
  FolderMoveInput,
  FolderMutationResult,
  FolderPrefsInput,
  FolderRenameInput,
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

  // Persisted sidebar tree & folder UI state
  expandedAccountIds: Record<string, boolean>
  expandedFolderIds: Record<string, boolean>
  showHiddenFoldersByAccount: Record<string, boolean>
  moveToPopover: { open: boolean; threadIds: string[]; accountId?: string } | null
  recentMovedFolderIds: string[]

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
  autopilotDraftPrompt: string | null
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
  moveThreadsToFolder: (
    threadIds: string[],
    role: Folder['role'],
    folderName?: string,
    targetFolderId?: string
  ) => Promise<void>
  snoozeThreads: (threadIds: string[], untilMs: number, label: string) => Promise<void>

  // Sidebar tree expand state & Move-To popover
  toggleAccountExpanded: (accountId: string) => void
  setAccountExpanded: (accountId: string, expanded: boolean) => void
  toggleFolderExpanded: (folderId: string) => void
  setFolderExpanded: (folderId: string, expanded: boolean) => void
  toggleShowHiddenFolders: (accountId: string) => void
  openMoveToPopover: (threadIds: string[], accountId?: string) => void
  closeMoveToPopover: () => void

  // Folder CRUD & Preferences
  createFolder: (input: FolderCreateInput) => Promise<FolderMutationResult>
  renameFolder: (input: FolderRenameInput) => Promise<FolderMutationResult>
  moveFolder: (input: FolderMoveInput) => Promise<FolderMutationResult>
  reorderFolders: (accountId: string, orderedFolderIds: string[]) => Promise<{ ok: boolean }>
  deleteFolder: (input: FolderDeleteInput) => Promise<FolderMutationResult>
  getFolderDeletePreview: (folderId: string) => Promise<FolderDeletePreview | null>
  updateFolderPrefs: (input: FolderPrefsInput) => Promise<FolderMutationResult>
  syncSingleFolder: (accountId: string, folderPath: string) => Promise<{ ok: boolean; synced: number }>
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
  openAutopilotWithPrompt: (prompt: string) => void
  clearAutopilotDraftPrompt: () => void
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
let refreshAllInFlight: Promise<void> | null = null
let refreshAllPending = false

const SIDEBAR_TREE_STORAGE_KEY = 'everybox_sidebar_tree_v1'
const RECENT_MOVED_FOLDERS_STORAGE_KEY = 'everybox_recent_moved_folders_v1'
const MAX_RECENT_MOVED_FOLDERS = 6

interface PersistedSidebarTreeState {
  expandedAccountIds: Record<string, boolean>
  expandedFolderIds: Record<string, boolean>
  showHiddenFoldersByAccount: Record<string, boolean>
}

function toBoolRecord(val: unknown): Record<string, boolean> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

function loadSidebarTreeState(): PersistedSidebarTreeState {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_TREE_STORAGE_KEY)
    if (!raw) {
      return { expandedAccountIds: {}, expandedFolderIds: {}, showHiddenFoldersByAccount: {} }
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      expandedAccountIds: toBoolRecord(parsed.expandedAccountIds),
      expandedFolderIds: toBoolRecord(parsed.expandedFolderIds),
      showHiddenFoldersByAccount: toBoolRecord(parsed.showHiddenFoldersByAccount)
    }
  } catch {
    return { expandedAccountIds: {}, expandedFolderIds: {}, showHiddenFoldersByAccount: {} }
  }
}

function saveSidebarTreeState(state: PersistedSidebarTreeState): void {
  try {
    window.localStorage.setItem(SIDEBAR_TREE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function loadRecentMovedFolderIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_MOVED_FOLDERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, MAX_RECENT_MOVED_FOLDERS)
  } catch {
    return []
  }
}

function saveRecentMovedFolderIds(ids: string[]): void {
  try {
    window.localStorage.setItem(
      RECENT_MOVED_FOLDERS_STORAGE_KEY,
      JSON.stringify(ids.slice(0, MAX_RECENT_MOVED_FOLDERS))
    )
  } catch {
    // Ignore storage errors
  }
}

const initialSidebarTree = loadSidebarTreeState()
const initialRecentMovedFolderIds = loadRecentMovedFolderIds()

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

  expandedAccountIds: initialSidebarTree.expandedAccountIds,
  expandedFolderIds: initialSidebarTree.expandedFolderIds,
  showHiddenFoldersByAccount: initialSidebarTree.showHiddenFoldersByAccount,
  moveToPopover: null,
  recentMovedFolderIds: initialRecentMovedFolderIds,

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
  autopilotDraftPrompt: null,
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
    if (refreshAllInFlight) {
      refreshAllPending = true
      await refreshAllInFlight
      return
    }

    const run = async () => {
      do {
        refreshAllPending = false
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
      } while (refreshAllPending)
    }

    refreshAllInFlight = run().finally(() => {
      refreshAllInFlight = null
    })
    await refreshAllInFlight
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

  moveThreadsToFolder: async (threadIds, role, folderName, targetFolderId) => {
    if (!threadIds.length) return
    const { threads, selectedThreadId, selectedThread, folders, activeAccountIds, recentMovedFolderIds } = get()
    const currentIdx = threads.findIndex((t) => t.id === selectedThreadId)

    // Resolve target folder ID for fast Move-To recency ranking
    let resolvedFolderId = targetFolderId
    if (!resolvedFolderId) {
      const sampleThread =
        threads.find((t) => threadIds.includes(t.id)) ||
        (selectedThread && threadIds.includes(selectedThread.id) ? selectedThread : null)
      const preferredAccountId = sampleThread?.accountId || (activeAccountIds.length === 1 ? activeAccountIds[0] : undefined)
      const lowerName = (folderName || '').toLowerCase()
      const findMatch = (list: Folder[]): Folder | undefined => {
        if (role === 'custom' && lowerName) {
          return list.find((f) => f.name.toLowerCase() === lowerName || f.path.toLowerCase() === lowerName)
        }
        return list.find((f) => f.role === role)
      }
      const accountScoped = preferredAccountId ? folders.filter((f) => f.accountId === preferredAccountId) : folders
      const match = findMatch(accountScoped) || findMatch(folders)
      if (match) resolvedFolderId = match.id
    }

    if (resolvedFolderId) {
      const nextRecent = [
        resolvedFolderId,
        ...recentMovedFolderIds.filter((id) => id !== resolvedFolderId)
      ].slice(0, MAX_RECENT_MOVED_FOLDERS)
      saveRecentMovedFolderIds(nextRecent)
      set({ recentMovedFolderIds: nextRecent })
    }

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

  // ---- Sidebar tree expand state & Move-To popover ----
  toggleAccountExpanded: (accountId) => {
    set((s) => {
      const expandedAccountIds = { ...s.expandedAccountIds, [accountId]: !s.expandedAccountIds[accountId] }
      saveSidebarTreeState({
        expandedAccountIds,
        expandedFolderIds: s.expandedFolderIds,
        showHiddenFoldersByAccount: s.showHiddenFoldersByAccount
      })
      return { expandedAccountIds }
    })
  },

  setAccountExpanded: (accountId, expanded) => {
    set((s) => {
      if (s.expandedAccountIds[accountId] === expanded) return s
      const expandedAccountIds = { ...s.expandedAccountIds, [accountId]: expanded }
      saveSidebarTreeState({
        expandedAccountIds,
        expandedFolderIds: s.expandedFolderIds,
        showHiddenFoldersByAccount: s.showHiddenFoldersByAccount
      })
      return { expandedAccountIds }
    })
  },

  toggleFolderExpanded: (folderId) => {
    set((s) => {
      const expandedFolderIds = { ...s.expandedFolderIds, [folderId]: !s.expandedFolderIds[folderId] }
      saveSidebarTreeState({
        expandedAccountIds: s.expandedAccountIds,
        expandedFolderIds,
        showHiddenFoldersByAccount: s.showHiddenFoldersByAccount
      })
      return { expandedFolderIds }
    })
  },

  setFolderExpanded: (folderId, expanded) => {
    set((s) => {
      if (s.expandedFolderIds[folderId] === expanded) return s
      const expandedFolderIds = { ...s.expandedFolderIds, [folderId]: expanded }
      saveSidebarTreeState({
        expandedAccountIds: s.expandedAccountIds,
        expandedFolderIds,
        showHiddenFoldersByAccount: s.showHiddenFoldersByAccount
      })
      return { expandedFolderIds }
    })
  },

  toggleShowHiddenFolders: (accountId) => {
    set((s) => {
      const showHiddenFoldersByAccount = {
        ...s.showHiddenFoldersByAccount,
        [accountId]: !s.showHiddenFoldersByAccount[accountId]
      }
      saveSidebarTreeState({
        expandedAccountIds: s.expandedAccountIds,
        expandedFolderIds: s.expandedFolderIds,
        showHiddenFoldersByAccount
      })
      return { showHiddenFoldersByAccount }
    })
  },

  openMoveToPopover: (threadIds, accountId) => {
    if (!threadIds.length) return
    set({ moveToPopover: { open: true, threadIds, accountId } })
  },

  closeMoveToPopover: () => set({ moveToPopover: null }),

  // ---- Folder CRUD & Preferences ----
  createFolder: async (input) => {
    const res = await window.glassmail.createFolder(input)
    if (res.ok) {
      await get().refreshAll()
      const label = res.folder?.name || input.name.trim()
      get().showToast(`Created folder "${label}"`, undefined, 3000)
    } else {
      get().showToast(res.error || 'Could not create folder', undefined, 4000)
    }
    return res
  },

  renameFolder: async (input) => {
    const prevFolder = get().folders.find((f) => f.id === input.folderId)
    const res = await window.glassmail.renameFolder(input)
    if (res.ok) {
      const { activeFolderName } = get()
      if (activeFolderName && prevFolder && res.folder) {
        const lowerActive = activeFolderName.toLowerCase()
        const lowerPrevName = prevFolder.name.toLowerCase()
        const lowerPrevPath = prevFolder.path.toLowerCase()
        const delim = prevFolder.delimiter || '/'
        if (lowerActive === lowerPrevName || lowerActive === lowerPrevPath) {
          set({ activeFolderName: res.folder.name })
        } else if (lowerActive.startsWith(`${lowerPrevName}/`)) {
          set({ activeFolderName: `${res.folder.name}${activeFolderName.slice(prevFolder.name.length)}` })
        } else if (lowerActive.startsWith(`${lowerPrevPath}${delim.toLowerCase()}`)) {
          set({ activeFolderName: `${res.folder.path}${activeFolderName.slice(prevFolder.path.length)}` })
        }
      }
      await get().refreshAll()
      get().showToast(`Renamed folder to "${input.newName.trim()}"`, undefined, 3000)
    } else {
      get().showToast(res.error || 'Could not rename folder', undefined, 4000)
    }
    return res
  },

  deleteFolder: async (input) => {
    const prevFolder = get().folders.find((f) => f.id === input.folderId)
    const res = await window.glassmail.deleteFolder(input)
    if (res.ok) {
      // Remove deleted folder from recents
      const nextRecent = get().recentMovedFolderIds.filter((id) => id !== input.folderId)
      if (nextRecent.length !== get().recentMovedFolderIds.length) {
        saveRecentMovedFolderIds(nextRecent)
        set({ recentMovedFolderIds: nextRecent })
      }

      // If currently viewing the deleted folder (or a deleted descendant), navigate back to Inbox
      const { activeFolderName } = get()
      if (activeFolderName && prevFolder) {
        const lowerActive = activeFolderName.toLowerCase()
        const lowerPrevName = prevFolder.name.toLowerCase()
        const lowerPrevPath = prevFolder.path.toLowerCase()
        const delim = (prevFolder.delimiter || '/').toLowerCase()
        const matchesDeleted =
          lowerActive === lowerPrevName ||
          lowerActive === lowerPrevPath ||
          (input.deleteChildren !== false &&
            (lowerActive.startsWith(`${lowerPrevName}/`) || lowerActive.startsWith(`${lowerPrevPath}${delim}`)))
        if (matchesDeleted) {
          set({
            activeView: 'mail',
            activeMailbox: 'inbox',
            activeFolderName: null,
            selectedThreadId: null,
            selectedThread: null,
            checkedThreadIds: [],
            lastCheckedThreadId: null
          })
        }
      }

      await get().refreshAll()
      const folderLabel = prevFolder?.name || 'folder'
      const pausedRules = res.disabledRuleNames || []
      const pausedSuffix =
        pausedRules.length > 0
          ? ` — paused Autopilot rule${pausedRules.length === 1 ? '' : 's'}: ${pausedRules.join(', ')}`
          : ''
      get().showToast(`Deleted "${folderLabel}"${pausedSuffix}`, undefined, pausedRules.length > 0 ? 6000 : 3500)
    } else {
      get().showToast(res.error || 'Could not delete folder', undefined, 4000)
    }
    return res
  },

  moveFolder: async (input) => {
    const res = await window.glassmail.moveFolder(input)
    if (res.ok) {
      await get().refreshAll()
      const movedName = res.folder?.name || 'folder'
      get().showToast(`Moved "${movedName}"`)
    } else {
      get().showToast(res.error || 'Could not move folder', undefined, 4500)
    }
    return res
  },

  reorderFolders: async (accountId, orderedFolderIds) => {
    const orderMap = new Map<string, number>()
    orderedFolderIds.forEach((id, idx) => orderMap.set(id, idx + 1))
    set((s) => ({
      folders: s.folders.map((f) =>
        f.accountId === accountId && orderMap.has(f.id)
          ? { ...f, sortOrder: orderMap.get(f.id)! }
          : f
      )
    }))
    const res = await window.glassmail.reorderFolders(accountId, orderedFolderIds)
    if (!res.ok) {
      await get().refreshAll()
    }
    return res
  },

  getFolderDeletePreview: async (folderId) => {
    return window.glassmail.getFolderDeletePreview(folderId)
  },

  updateFolderPrefs: async (input) => {
    const prevFolders = get().folders
    const { folderId, ...prefs } = input
    // Optimistically update the folder in store
    set({
      folders: prevFolders.map((f) => {
        if (f.id !== folderId) return f
        const next: Folder = { ...f }
        if (prefs.color !== undefined) next.color = prefs.color
        if (prefs.icon !== undefined) next.icon = prefs.icon
        if (prefs.isPinned !== undefined) next.isPinned = prefs.isPinned
        if (prefs.isHidden !== undefined) next.isHidden = prefs.isHidden
        if (prefs.muteBadge !== undefined) next.muteBadge = prefs.muteBadge
        if (prefs.sortOrder !== undefined) next.sortOrder = prefs.sortOrder
        if (prefs.syncEnabled !== undefined) next.syncEnabled = prefs.syncEnabled
        return next
      })
    })
    const res = await window.glassmail.updateFolderPrefs(input)
    if (res.ok) {
      if (res.folder) {
        set((s) => ({
          folders: s.folders.map((f) => (f.id === folderId ? res.folder! : f))
        }))
      }
      await get().refreshAll()
    } else {
      set({ folders: prevFolders })
      get().showToast(res.error || 'Could not update folder preferences', undefined, 4000)
    }
    return res
  },

  syncSingleFolder: async (accountId, folderPath) => {
    set({ isSyncing: true })
    try {
      const res = await window.glassmail.syncSingleFolder(accountId, folderPath)
      await get().refreshAll()
      const folder = get().folders.find(
        (f) =>
          f.accountId === accountId &&
          (f.path.toLowerCase() === folderPath.toLowerCase() || f.name.toLowerCase() === folderPath.toLowerCase())
      )
      const label = folder?.name || folderPath
      if (res.ok) {
        const suffix = res.synced > 0 ? ` (${res.synced} updated)` : ''
        get().showToast(`Synced "${label}"${suffix}`, undefined, 3000)
      } else {
        get().showToast(`Could not sync "${label}"`, undefined, 4000)
      }
      return res
    } finally {
      set({ isSyncing: false })
    }
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
  openAutopilotWithPrompt: (prompt) => set({ activeView: 'autopilot', autopilotDraftPrompt: prompt }),
  clearAutopilotDraftPrompt: () => set({ autopilotDraftPrompt: null }),
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
