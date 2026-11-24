import { create } from 'zustand'
import type {
  Account,
  ActiveView,
  AppSettings,
  CalendarEvent,
  Folder,
  InboxCategory,
  MailboxId,
  ParsedSearchQuery,
  ScheduledEmail,
  Snippet,
  SubscriptionGroup,
  ThreadDetail,
  ThreadSummary,
  Workspace
} from '../../../shared/types'

export interface ComposerState {
  open: boolean
  mode: 'new' | 'reply' | 'replyAll' | 'forward'
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  replyToThreadId?: string
  replyToMessageId?: string
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
  searchQuery: string
  parsedSearch: ParsedSearchQuery | null
  subscriptions: SubscriptionGroup[]
  scheduledEmails: ScheduledEmail[]

  // Calendar state
  todayEvents: CalendarEvent[]
  calendarEvents: CalendarEvent[]

  // UI Overlays
  sidebarVisible: boolean
  commandPaletteOpen: boolean
  settingsOpen: boolean
  settingsInitialTab: 'accounts' | 'ai' | 'general' | 'privacy' | 'snippets' | 'mcp'
  composer: ComposerState
  toast: { message: string; undo?: () => Promise<void> } | null
  isSyncing: boolean

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
  toggleAccountFilter: (accountId: string) => Promise<void>
  selectWorkspace: (ws: Workspace) => Promise<void>

  // Search
  runSearch: (query: string) => Promise<void>
  clearSearch: () => Promise<void>

  // Multi-select
  toggleCheckThread: (threadId: string) => void
  clearCheckedThreads: () => void

  // Mutations with Undo
  archiveThreads: (threadIds: string[]) => Promise<void>
  trashThreads: (threadIds: string[]) => Promise<void>
  snoozeThreads: (threadIds: string[], untilMs: number, label: string) => Promise<void>
  toggleStarThread: (threadId: string, current: boolean) => Promise<void>
  toggleReadThread: (threadId: string, current: boolean) => Promise<void>

  // Overlays
  setSidebarVisible: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  openSettings: (tab?: AppState['settingsInitialTab']) => void
  closeSettings: () => void
  openComposer: (partial?: Partial<ComposerState>) => void
  closeComposer: () => void
  showToast: (message: string, undo?: () => Promise<void>) => void
  clearToast: () => void
  triggerSync: () => Promise<void>
  saveSettings: (s: AppSettings) => Promise<void>
}

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
  searchQuery: '',
  parsedSearch: null,
  subscriptions: [],
  scheduledEmails: [],

  todayEvents: [],
  calendarEvents: [],

  sidebarVisible: true,
  commandPaletteOpen: false,
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

  bootstrap: async () => {
    const [settings, accounts, workspaces, snippets] = await Promise.all([
      window.glassmail.getSettings(),
      window.glassmail.listAccounts(),
      window.glassmail.listWorkspaces(),
      window.glassmail.listSnippets()
    ])
    document.documentElement.setAttribute('data-theme', settings.theme)
    set({ settings, accounts, workspaces, snippets })
    await get().refreshAll()
  },

  refreshAll: async () => {
    const { activeAccountIds } = get()
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
    const [accounts, workspaces, folders, counts, snippets] = await Promise.all([
      window.glassmail.listAccounts(),
      window.glassmail.listWorkspaces(),
      window.glassmail.listFolders(filterIds),
      window.glassmail.getMailboxCounts(filterIds),
      window.glassmail.listSnippets()
    ])
    set({ accounts, workspaces, folders, counts, snippets })
    await Promise.all([get().refreshThreads(), get().refreshTodayEvents()])
  },

  refreshThreads: async () => {
    const { activeAccountIds, activeMailbox, activeCategory, activeFolderName, searchQuery } = get()
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined

    if (searchQuery.trim()) {
      const { parsed, threads } = await window.glassmail.searchMail(searchQuery, filterIds)
      set({ parsedSearch: parsed, threads })
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
      searchQuery: '',
      parsedSearch: null
    })
    await get().refreshThreads()
  },

  setActiveCategory: async (cat) => {
    set({ activeCategory: cat, checkedThreadIds: [] })
    await get().refreshThreads()
  },

  setActiveFolder: async (folderName) => {
    set({
      activeView: 'mail',
      activeFolderName: folderName,
      selectedThreadId: null,
      selectedThread: null,
      checkedThreadIds: []
    })
    await get().refreshThreads()
  },

  // ---- Multi-Account Focus Toggles ----
  selectAllAccounts: async () => {
    set({
      activeAccountIds: [],
      activeWorkspaceId: 'ws-all',
      activeFolderName: null,
      selectedThreadId: null,
      selectedThread: null
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
      selectedThread: null
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
    set({ searchQuery: '', parsedSearch: null })
    await get().refreshThreads()
  },

  toggleCheckThread: (threadId) => {
    const cur = get().checkedThreadIds
    set({
      checkedThreadIds: cur.includes(threadId) ? cur.filter((id) => id !== threadId) : [...cur, threadId]
    })
  },

  clearCheckedThreads: () => set({ checkedThreadIds: [] }),

  archiveThreads: async (threadIds) => {
    if (!threadIds.length) return
    const { threads, selectedThreadId } = get()
    const currentIdx = threads.findIndex((t) => t.id === selectedThreadId)
    await window.glassmail.moveThreads(threadIds, 'archive', 'Archive')
    set({ checkedThreadIds: [] })
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
    set({ checkedThreadIds: [] })
    await get().refreshAll()

    if (selectedThreadId && threadIds.includes(selectedThreadId)) {
      const remaining = get().threads
      const next = remaining[currentIdx] || remaining[currentIdx - 1] || null
      await get().selectThread(next?.id || null)
    }
    if (activeMailbox !== 'trash') {
      get().showToast(`Moved to Trash`, async () => {
        await window.glassmail.moveThreads(threadIds, 'inbox', 'Inbox')
        await get().refreshAll()
      })
    }
  },

  snoozeThreads: async (threadIds, untilMs, label) => {
    if (!threadIds.length) return
    await window.glassmail.snoozeThreads(threadIds, untilMs)
    set({ checkedThreadIds: [] })
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

  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
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
        replyToThreadId: partial?.replyToThreadId,
        replyToMessageId: partial?.replyToMessageId
      }
    })
  },

  closeComposer: () =>
    set((s) => ({
      composer: { ...s.composer, open: false }
    })),

  showToast: (message, undo) => {
    set({ toast: { message, undo } })
    setTimeout(() => {
      if (get().toast?.message === message) {
        set({ toast: null })
      }
    }, 6000)
  },

  clearToast: () => set({ toast: null }),

  triggerSync: async () => {
    set({ isSyncing: true })
    try {
      await window.glassmail.syncAll()
      await get().refreshAll()
    } finally {
      set({ isSyncing: false })
    }
  },

  saveSettings: async (s) => {
    await window.glassmail.saveSettings(s)
    document.documentElement.setAttribute('data-theme', s.theme)
    set({ settings: s })
  }
}))
