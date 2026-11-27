import { create } from 'zustand'
import type { Account, AccountRowStyle, InboxCategory, ThemeId } from '@everybox/shared'
import {
  DEMO_ACCOUNTS,
  DEMO_CALENDAR_EVENTS,
  DEMO_THREADS,
  type MobileCalendarItem,
  type MobileThreadItem
} from '../data/demoData'

export interface UndoToastState {
  id: number
  message: string
  durationMs: number
  onUndo?: () => void
}

interface MobileAppState {
  themeId: ThemeId
  rowStyle: AccountRowStyle
  focusAccountId: string | 'all'
  category: InboxCategory
  accounts: Account[]
  threads: MobileThreadItem[]
  calendarEvents: MobileCalendarItem[]
  isSyncing: boolean
  toast: UndoToastState | null

  setThemeId: (id: ThemeId) => void
  setRowStyle: (style: AccountRowStyle) => void
  selectFocusAccount: (id: string | 'all') => void
  setCategory: (category: InboxCategory) => void
  markThreadRead: (threadId: string, isRead: boolean) => void
  toggleStarThread: (threadId: string) => void
  archiveThread: (threadId: string) => void
  trashThread: (threadId: string) => void
  sendReplyWithUndo: (threadId: string, recipientName: string, body: string) => void
  sendComposedEmailWithUndo: (opts: {
    accountId: string
    to: string
    subject: string
    body: string
    scheduledLabel?: string
  }) => void
  showToast: (message: string, onUndo?: () => void, durationMs?: number) => void
  dismissToast: () => void
  triggerUndo: () => void
  triggerSync: () => void
}

let toastSeq = 1
let toastTimeout: ReturnType<typeof setTimeout> | null = null

export const useMobileStore = create<MobileAppState>((set, get) => ({
  themeId: 'dark',
  rowStyle: 'gradient',
  focusAccountId: 'all',
  category: 'all',
  accounts: DEMO_ACCOUNTS,
  threads: DEMO_THREADS,
  calendarEvents: DEMO_CALENDAR_EVENTS,
  isSyncing: false,
  toast: null,

  setThemeId: (themeId) => set({ themeId }),
  setRowStyle: (rowStyle) => set({ rowStyle }),

  selectFocusAccount: (id) =>
    set((state) => ({
      focusAccountId: state.focusAccountId === id && id !== 'all' ? 'all' : id
    })),

  setCategory: (category) => set({ category }),

  markThreadRead: (threadId, isRead) =>
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, isRead } : t))
    })),

  toggleStarThread: (threadId) =>
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, isStarred: !t.isStarred } : t))
    })),

  archiveThread: (threadId) => {
    const prev = get().threads.find((t) => t.id === threadId)
    if (!prev) return
    const prevRole = prev.folderRole
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, folderRole: 'archive' } : t))
    }))
    get().showToast(
      `Archived "${prev.subject.slice(0, 26)}${prev.subject.length > 26 ? '…' : ''}"`,
      () => {
        set((state) => ({
          threads: state.threads.map((t) => (t.id === threadId ? { ...t, folderRole: prevRole } : t))
        }))
      },
      5000
    )
  },

  trashThread: (threadId) => {
    const prev = get().threads.find((t) => t.id === threadId)
    if (!prev) return
    const prevRole = prev.folderRole
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, folderRole: 'trash' } : t))
    }))
    get().showToast(
      `Moved to Trash`,
      () => {
        set((state) => ({
          threads: state.threads.map((t) => (t.id === threadId ? { ...t, folderRole: prevRole } : t))
        }))
      },
      5000
    )
  },

  sendReplyWithUndo: (threadId, recipientName, body) => {
    const prev = get().threads.find((t) => t.id === threadId)
    const trimmed = body.trim()
    if (!prev || !trimmed) return
    const snapshot = { ...prev, messages: [...prev.messages] }
    const newMsgId = `m-sent-${Date.now()}`
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              isRead: true,
              isReplied: true,
              messageCount: t.messageCount + 1,
              snippet: `You: ${trimmed.replace(/\s+/g, ' ').slice(0, 90)}`,
              timeLabel: 'Just now',
              aiDrafts: undefined,
              messages: [
                ...t.messages,
                {
                  id: newMsgId,
                  fromName: 'Alex Rivera',
                  fromEmail: t.accountEmail,
                  initials: 'AR',
                  toLabel: `to ${recipientName}`,
                  timeLabel: 'Just now',
                  dateLabel: 'Today',
                  snippet: trimmed.slice(0, 80),
                  body: trimmed,
                  isSelf: true
                }
              ]
            }
          : t
      )
    }))
    get().showToast(
      `Sending reply to ${recipientName}…`,
      () => {
        set((state) => ({
          threads: state.threads.map((t) => (t.id === threadId ? snapshot : t))
        }))
      },
      5000
    )
  },

  sendComposedEmailWithUndo: ({ to, scheduledLabel }) => {
    const label = scheduledLabel
      ? `Scheduled for ${scheduledLabel}`
      : `Sending to ${to || 'recipient'}…`
    get().showToast(label, () => {}, 5000)
  },

  showToast: (message, onUndo, durationMs = 5000) => {
    if (toastTimeout) clearTimeout(toastTimeout)
    const id = ++toastSeq
    set({ toast: { id, message, onUndo, durationMs } })
    toastTimeout = setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : state))
    }, durationMs)
  },

  dismissToast: () => {
    if (toastTimeout) clearTimeout(toastTimeout)
    set({ toast: null })
  },

  triggerUndo: () => {
    const current = get().toast
    if (toastTimeout) clearTimeout(toastTimeout)
    set({ toast: null })
    current?.onUndo?.()
  },

  triggerSync: () => {
    if (get().isSyncing) return
    set({ isSyncing: true })
    setTimeout(() => {
      set({ isSyncing: false })
      get().showToast('All 3 accounts up to date', undefined, 2400)
    }, 650)
  }
}))
