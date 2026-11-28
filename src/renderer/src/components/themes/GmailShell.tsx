import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Columns2,
  FileText,
  Folder as FolderIcon,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  Menu,
  Newspaper,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Users,
  X
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { groupThreadsByDate } from '../../utils/dateGroups'
import { EmailHtmlBody } from '../EmailHtmlBody'
import { AttachmentBar } from '../AttachmentBar'
import { CalendarView } from '../CalendarView'
import { TriageView } from '../TriageView'
import { SubscriptionsView } from '../SubscriptionsView'
import { AssistantView } from '../AssistantView'
import { buildReplyComposerState } from '../../utils/replyHelper'
import appIcon from '../../assets/icon.png'
import type { InboxCategory, MailboxId, Message, ThreadAISummary } from '../../../../shared/types'

function formatGmailDate(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function avatarColor(str: string): string {
  const palette = ['#1A73E8', '#D93025', '#188038', '#E37400', '#9334E6', '#007B83', '#C5221F', '#1967D2']
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

export const GmailShell: React.FC<{
  searchInputRef: React.RefObject<HTMLInputElement | null>
}> = ({ searchInputRef }) => {
  const {
    settings,
    accounts,
    folders,
    counts,
    activeAccountIds,
    activeView,
    activeMailbox,
    activeCategory,
    activeFolderName,
    threads,
    selectedThreadId,
    selectedThread,
    checkedThreadIds,
    searchQuery,
    sidebarVisible,
    assistantOpen,
    isSyncing,
    setSidebarVisible,
    setActiveView,
    setActiveMailbox,
    setActiveCategory,
    setActiveFolder,
    toggleAssistant,
    selectAllAccounts,
    soloAccount,
    selectThread,
    setVisibleThreadIds,
    runSearch,
    clearSearch,
    toggleCheckThread,
    checkThreadRange,
    clearCheckedThreads,
    openComposer,
    openSettings,
    setCommandPaletteOpen,
    archiveThreads,
    trashThreads,
    snoozeThreads,
    toggleStarThread,
    toggleReadThread,
    triggerSync,
    refreshTodayEvents,
    showToast
  } = useAppStore()

  const isDark = ['dark', 'black', 'graphite'].includes(settings?.theme || 'dark')
  const showDateGroups = settings?.showDateGroups !== false
  const [showMoreNav, setShowMoreNav] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [splitPane, setSplitPane] = useState<boolean>(() => localStorage.getItem('everybox:gmail:splitPane') === '1')
  const [summary, setSummary] = useState<ThreadAISummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [expandedMsgIds, setExpandedMsgIds] = useState<Record<string, boolean>>({})

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const latestMsgRef = useRef<HTMLElement | null>(null)
  const initializedThreadIdRef = useRef<string | null>(null)

  const groupedThreads = useMemo<[string, typeof threads][]>(() => {
    if (!showDateGroups) return [['', threads]]
    return groupThreadsByDate(threads)
  }, [threads, showDateGroups])

  const visibleThreadIds = useMemo(() => {
    const ids: string[] = []
    for (const [, items] of groupedThreads) {
      for (const t of items) ids.push(t.id)
    }
    return ids
  }, [groupedThreads])

  useEffect(() => {
    setVisibleThreadIds(visibleThreadIds)
  }, [visibleThreadIds, setVisibleThreadIds])

  useEffect(() => {
    setSummary(null)
    setLoadingSummary(false)
    setShowSnoozeMenu(false)
  }, [selectedThread?.id])

  useEffect(() => {
    if (!selectedThread) {
      initializedThreadIdRef.current = null
      return
    }
    if (initializedThreadIdRef.current === selectedThread.id) return
    initializedThreadIdRef.current = selectedThread.id

    const msgs = selectedThread.messages
    const nextExpanded: Record<string, boolean> = {}
    msgs.forEach((m, idx) => {
      const isLatest = idx === msgs.length - 1
      nextExpanded[m.id] = msgs.length <= 1 || isLatest || !m.isRead
    })
    setExpandedMsgIds(nextExpanded)

    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (msgs.length > 1 && latestMsgRef.current) {
          latestMsgRef.current.scrollIntoView({ block: 'start', behavior: 'auto' })
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0
        }
      })
    })
    return () => cancelAnimationFrame(raf1)
  }, [selectedThread])

  const toggleSplitPane = () => {
    const next = !splitPane
    setSplitPane(next)
    localStorage.setItem('everybox:gmail:splitPane', next ? '1' : '0')
  }

  // Gmail Material You Color Tokens (Light vs Dark)
  const g = isDark
    ? {
        shellBg: '#111111',
        surfaceBg: '#1E1F20',
        searchBg: '#282A2C',
        composeBg: '#FFFFFF',
        composeText: '#1F1F1F',
        navActiveBg: '#394457',
        navActiveText: '#C2E7FF',
        rowUnreadBg: '#2A2B2E',
        rowReadBg: '#1E1F20',
        rowSelectedBg: '#1E3A5F',
        hoverBg: '#303134',
        border: '#333537',
        text: '#E3E3E3',
        textSec: '#C4C7C5',
        textMuted: '#8E918F',
        blue: '#8AB4F8',
        tabActive: '#8AB4F8',
        chipBg: '#333537'
      }
    : {
        shellBg: '#F6F8FC',
        surfaceBg: '#FFFFFF',
        searchBg: '#EAF1FB',
        composeBg: '#C2E7FF',
        composeText: '#001D35',
        navActiveBg: '#D3E3FD',
        navActiveText: '#001D35',
        rowUnreadBg: '#FFFFFF',
        rowReadBg: '#F2F6FC',
        rowSelectedBg: '#C2DBFF',
        hoverBg: '#E8EAED',
        border: '#ECEFF1',
        text: '#1F1F1F',
        textSec: '#444746',
        textMuted: '#5F6368',
        blue: '#0B57D0',
        tabActive: '#0B57D0',
        chipBg: '#EEEEEE'
      }

  const openReply = (mode: 'reply' | 'replyAll' | 'forward', targetMsg?: Message) => {
    if (!selectedThread) return
    openComposer(buildReplyComposerState(selectedThread, mode, targetMsg))
  }

  const handleSummarize = async () => {
    if (!selectedThread) return
    setLoadingSummary(true)
    try {
      const res = await window.glassmail.summarizeThread(selectedThread.id)
      setSummary(res)
    } finally {
      setLoadingSummary(false)
    }
  }

  const primaryNav: { id: MailboxId; label: string; icon: React.ReactNode; total?: number; unread?: number }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={17} />, total: counts.inboxTotal, unread: counts.inbox },
    { id: 'starred', label: 'Starred', icon: <Star size={17} />, total: counts.starred, unread: counts.starredUnread },
    { id: 'snoozed', label: 'Snoozed', icon: <Clock size={17} />, total: counts.snoozed, unread: counts.snoozedUnread },
    { id: 'sent', label: 'Sent', icon: <Send size={17} />, total: counts.sent, unread: counts.sentUnread },
    { id: 'drafts', label: 'Drafts', icon: <FileText size={17} />, total: counts.drafts, unread: counts.draftsUnread }
  ]

  const moreNav: { id: MailboxId; label: string; icon: React.ReactNode; total?: number; unread?: number }[] = [
    { id: 'archive', label: 'All Mail / Archive', icon: <Archive size={17} />, total: counts.archive, unread: counts.archiveUnread },
    { id: 'junk', label: 'Spam', icon: <ShieldAlert size={17} />, total: counts.junk, unread: counts.junkUnread },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={17} />, total: counts.trash, unread: counts.trashUnread },
    { id: 'subscriptions', label: 'Subscriptions', icon: <Newspaper size={17} /> },
    { id: 'scheduled', label: 'Scheduled', icon: <Mail size={17} />, total: counts.scheduled }
  ]

  const renderGmailCounts = (total?: number, unread?: number) => {
    const hasTotal = Boolean(total && total > 0)
    const hasUnread = Boolean(unread && unread > 0)
    if (!hasTotal && !hasUnread) return null
    return (
      <span className="ml-1.5 inline-flex shrink-0 items-baseline gap-1.5 tabular-nums">
        {hasUnread && (
          <span className="text-[12px] font-bold" style={{ color: g.text }} title={`${unread} unread`}>
            {unread}
          </span>
        )}
        {hasTotal && (
          <span className="text-[11px] font-normal" style={{ color: g.textMuted }} title={`${total} total`}>
            {total}
          </span>
        )}
      </span>
    )
  }

  const visibleCustomFolders = folders.filter(
    (f) => f.role === 'custom' && (activeAccountIds.length === 0 || activeAccountIds.includes(f.accountId))
  )

  const allChecked = threads.length > 0 && checkedThreadIds.length === threads.length
  const toggleCheckAll = () => {
    if (allChecked || checkedThreadIds.length > 0) {
      clearCheckedThreads()
    } else {
      threads.forEach((t) => toggleCheckThread(t.id))
    }
  }

  const curThreadIdx = selectedThreadId ? threads.findIndex((t) => t.id === selectedThreadId) : -1
  const readerWidthMode = settings?.readerWidth || 'comfortable'
  const readerBodyScale = readerWidthMode === 'narrow' ? 1 : readerWidthMode === 'wide' ? 1.2 : 1.05

  const showFullWidthReader = !splitPane && Boolean(selectedThreadId)

  const renderThreadView = () => {
    if (!selectedThread) {
      return (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center" style={{ color: g.textMuted }}>
          <Mail size={40} strokeWidth={1.25} className="mb-3 opacity-40" />
          <div className="text-[14px]">No conversation selected</div>
        </div>
      )
    }

    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden" style={{ background: g.surfaceBg }}>
        {/* Gmail Thread Action Toolbar */}
        <div
          className="flex h-12 shrink-0 items-center justify-between border-b px-3"
          style={{ borderColor: g.border }}
        >
          <div className="flex items-center gap-1">
            {!splitPane && (
              <button
                onClick={() => void selectThread(null)}
                className="rounded-full p-2 transition hover:bg-black/10"
                style={{ color: g.textSec }}
                title="Back to inbox"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <button
              onClick={() => void archiveThreads([selectedThread.id])}
              className="rounded-full p-2 transition hover:bg-black/10"
              style={{ color: g.textSec }}
              title="Archive (E)"
            >
              <Archive size={17} />
            </button>
            <button
              onClick={() => void trashThreads([selectedThread.id])}
              className="rounded-full p-2 transition hover:bg-black/10"
              style={{ color: g.textSec }}
              title="Delete"
            >
              <Trash2 size={17} />
            </button>
            <button
              onClick={async () => {
                await toggleReadThread(selectedThread.id, selectedThread.isRead)
                if (!splitPane && selectedThread.isRead) {
                  void selectThread(null)
                }
              }}
              className="rounded-full p-2 transition hover:bg-black/10"
              style={{ color: g.textSec }}
              title={selectedThread.isRead ? 'Mark as unread' : 'Mark as read'}
            >
              <MailOpen size={17} />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowSnoozeMenu((v) => !v)}
                className="rounded-full p-2 transition hover:bg-black/10"
                style={{ color: g.textSec }}
                title="Snooze"
              >
                <Clock size={17} />
              </button>
              {showSnoozeMenu && (
                <div
                  className="absolute left-0 top-10 z-40 w-44 rounded-xl border py-1.5 shadow-xl"
                  style={{ background: g.surfaceBg, borderColor: g.border }}
                >
                  {[
                    { h: 3, label: 'Later today (+3h)' },
                    { h: 24, label: 'Tomorrow morning' },
                    { h: 72, label: 'In 3 days' },
                    { h: 168, label: 'Next week' }
                  ].map((opt) => (
                    <button
                      key={opt.h}
                      onClick={() => {
                        setShowSnoozeMenu(false)
                        void snoozeThreads([selectedThread.id], Date.now() + opt.h * 3600_000, opt.label)
                      }}
                      className="block w-full px-3.5 py-2 text-left text-[12.5px] transition hover:bg-black/5"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 text-[12px]" style={{ color: g.textMuted }}>
            {curThreadIdx >= 0 && (
              <span className="mr-1">
                {curThreadIdx + 1} of {threads.length}
              </span>
            )}
            <button
              disabled={curThreadIdx <= 0}
              onClick={() => curThreadIdx > 0 && void selectThread(threads[curThreadIdx - 1].id)}
              className="rounded-full p-1.5 transition hover:bg-black/10 disabled:opacity-35"
              title="Newer"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              disabled={curThreadIdx < 0 || curThreadIdx >= threads.length - 1}
              onClick={() =>
                curThreadIdx >= 0 &&
                curThreadIdx < threads.length - 1 &&
                void selectThread(threads[curThreadIdx + 1].id)
              }
              className="rounded-full p-1.5 transition hover:bg-black/10 disabled:opacity-35"
              title="Older"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        {/* Scrollable Gmail Conversation */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-5 select-text">
          <div className="mx-auto w-full max-w-[960px]">
            {/* Subject Row with Gmail Label Chips */}
            <div className="flex flex-wrap items-center gap-2.5 pl-12">
              <h1 className="text-[22px] font-normal leading-snug" style={{ color: g.text }}>
                {selectedThread.subject || '(no subject)'}
              </h1>
              <span
                className="rounded px-2 py-0.5 text-[11px] font-medium"
                style={{ background: g.chipBg, color: g.textSec }}
              >
                {activeFolderName || activeMailbox.charAt(0).toUpperCase() + activeMailbox.slice(1)}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium"
                style={{ background: g.chipBg, color: g.textSec }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: selectedThread.accountColor }} />
                {selectedThread.accountEmail}
              </span>
              {selectedThread.messages.length > 1 && (
                <button
                  onClick={() => {
                    const allExp = selectedThread.messages.every((m) => expandedMsgIds[m.id] !== false)
                    const next: Record<string, boolean> = {}
                    selectedThread.messages.forEach((m, idx) => {
                      next[m.id] = allExp ? idx === selectedThread.messages.length - 1 : true
                    })
                    setExpandedMsgIds(next)
                  }}
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11.5px] font-medium transition hover:bg-black/5"
                  style={{ borderColor: g.border, color: g.textSec }}
                >
                  {selectedThread.messages.every((m) => expandedMsgIds[m.id] !== false)
                    ? 'Collapse older'
                    : `Expand all (${selectedThread.messages.length})`}
                </button>
              )}
              <button
                onClick={() => void handleSummarize()}
                disabled={loadingSummary}
                className="ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-medium transition hover:bg-black/5"
                style={{ borderColor: g.border, color: g.blue }}
              >
                <Sparkles size={13} />
                {loadingSummary ? 'Summarizing…' : 'Summarize'}
              </button>
            </div>

            {selectedThread.scamWarning && (
              <div
                className="ml-12 mt-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px]"
                style={{ background: 'rgba(217,48,37,0.1)', borderColor: '#d93025' }}
              >
                <AlertTriangle size={16} style={{ color: '#d93025' }} />
                <span>{selectedThread.scamWarning}</span>
              </div>
            )}

            {summary && (
              <div
                className="ml-12 mt-4 rounded-2xl border p-4 text-[13px]"
                style={{ background: isDark ? '#282A2C' : '#F8FAFD', borderColor: g.border }}
              >
                <div className="flex items-center justify-between text-[11.5px] font-semibold" style={{ color: g.blue }}>
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles size={13} /> AI Thread Summary
                  </span>
                  <span style={{ color: g.textMuted }}>{summary.providerLabel}</span>
                </div>
                <p className="mt-1.5 leading-relaxed">{summary.gist}</p>
                {summary.actionItems.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px]" style={{ color: g.textSec }}>
                    {summary.actionItems.map((it, idx) => (
                      <li key={idx}>{it}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Message Cards */}
            <div className="mt-5 space-y-4">
              {selectedThread.messages.map((m, idx) => {
                const displayName = m.from.name || m.from.email
                const isLatest = idx === selectedThread.messages.length - 1
                const isMulti = selectedThread.messages.length > 1
                const isExpanded = expandedMsgIds[m.id] ?? (isLatest || !isMulti)

                if (!isExpanded) {
                  return (
                    <article
                      key={m.id}
                      onClick={() => setExpandedMsgIds((prev) => ({ ...prev, [m.id]: true }))}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition hover:bg-black/5"
                      style={{ borderColor: g.border, background: isDark ? '#242527' : '#F8FAFD' }}
                      title="Click to expand message"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-white"
                          style={{ background: avatarColor(displayName) }}
                        >
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="shrink-0 text-[13.5px] font-semibold" style={{ color: g.text }}>
                          {displayName}
                        </span>
                        <span className="truncate text-[13px]" style={{ color: g.textMuted }}>
                          {m.snippet || m.bodyText.slice(0, 120)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-[12px]" style={{ color: g.textMuted }}>
                        {m.hasAttachments && <Paperclip size={13} />}
                        <span>
                          {new Date(m.date).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </article>
                  )
                }

                return (
                  <article
                    key={m.id}
                    ref={isLatest ? latestMsgRef : undefined}
                    className="scroll-mt-4 border-t pt-5 first:border-t-0 first:pt-0"
                    style={{ borderColor: g.border }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          onClick={
                            isMulti && !isLatest
                              ? () => setExpandedMsgIds((prev) => ({ ...prev, [m.id]: false }))
                              : undefined
                          }
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-medium text-white ${
                            isMulti && !isLatest ? 'cursor-pointer' : ''
                          }`}
                          style={{ background: avatarColor(displayName) }}
                          title={isMulti && !isLatest ? 'Click to collapse message' : undefined}
                        >
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-baseline gap-1.5">
                            <span className="text-[14px] font-semibold" style={{ color: g.text }}>
                              {displayName}
                            </span>
                            <span className="text-[12px]" style={{ color: g.textMuted }}>
                              &lt;{m.from.email}&gt;
                            </span>
                            {isMulti && isLatest && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                style={{ background: g.navActiveBg, color: g.blue }}
                              >
                                Latest
                              </span>
                            )}
                          </div>
                          <div className="text-[12px]" style={{ color: g.textMuted }}>
                            to {m.to.map((r) => r.name || r.email).join(', ') || 'me'}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <span className="mr-1 text-[12px]" style={{ color: g.textMuted }}>
                          {new Date(m.date).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </span>
                        <button
                          onClick={() => void toggleStarThread(selectedThread.id, selectedThread.isStarred)}
                          className="rounded-full p-1.5 transition hover:bg-black/10"
                          title="Star"
                        >
                          <Star
                            size={16}
                            fill={selectedThread.isStarred ? '#F4B400' : 'none'}
                            style={{ color: selectedThread.isStarred ? '#F4B400' : g.textMuted }}
                          />
                        </button>
                        <button
                          onClick={() => openReply('reply', m)}
                          className="rounded-full p-1.5 transition hover:bg-black/10"
                          style={{ color: g.textSec }}
                          title="Reply"
                        >
                          <Reply size={16} />
                        </button>
                        <button
                          onClick={() => openReply('replyAll', m)}
                          className="rounded-full p-1.5 transition hover:bg-black/10"
                          style={{ color: g.textSec }}
                          title="Reply all"
                        >
                          <ReplyAll size={16} />
                        </button>
                        <button
                          onClick={() => openReply('forward', m)}
                          className="rounded-full p-1.5 transition hover:bg-black/10"
                          style={{ color: g.textSec }}
                          title="Forward"
                        >
                          <Forward size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="pl-[52px]">
                      {m.calendarInvite && (
                        <div
                          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
                          style={{ background: isDark ? '#282A2C' : '#F8FAFD', borderColor: g.border }}
                        >
                          <div className="flex items-center gap-3">
                            <Calendar size={18} style={{ color: g.blue }} />
                            <div>
                              <div className="text-[13px] font-medium">{m.calendarInvite.summary}</div>
                              <div className="text-[12px]" style={{ color: g.textMuted }}>
                                {new Date(m.calendarInvite.startIso).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              await window.glassmail.createCalendarEvent({
                                accountId: m.accountId,
                                title: m.calendarInvite!.summary,
                                location: m.calendarInvite!.location,
                                description: m.calendarInvite!.description,
                                startAt: new Date(m.calendarInvite!.startIso).getTime(),
                                endAt: new Date(m.calendarInvite!.endIso).getTime(),
                                allDay: false
                              })
                              await refreshTodayEvents()
                              showToast('Added invite to Calendar')
                            }}
                            className="rounded-full px-4 py-1.5 text-[12px] font-medium text-white"
                            style={{ background: g.blue }}
                          >
                            Yes, add to Calendar
                          </button>
                        </div>
                      )}

                      <AttachmentBar
                        attachments={m.attachments}
                        accountId={selectedThread.accountId}
                        remoteMessageId={m.remoteId}
                        folderRole={m.folderRole}
                        folderName={m.folderName}
                        onToast={showToast}
                        className="mb-4"
                      />

                      <EmailHtmlBody
                        html={m.bodyHtml || `<p>${m.bodyText.replace(/\n/g, '<br/>')}</p>`}
                        scale={readerBodyScale}
                        fontFamily='Roboto, "Google Sans", "Segoe UI", Arial, sans-serif'
                      />
                    </div>
                  </article>
                )
              })}
            </div>

            {/* Signature Gmail Pill Reply / Reply All / Forward Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-2.5 pl-[52px]">
              <button
                onClick={() => openReply('reply')}
                className="inline-flex items-center gap-2 rounded-full border px-5 py-2 text-[13px] font-medium transition hover:bg-black/5"
                style={{ borderColor: g.textMuted, color: g.textSec }}
              >
                <Reply size={15} /> Reply
              </button>
              <button
                onClick={() => openReply('replyAll')}
                className="inline-flex items-center gap-2 rounded-full border px-5 py-2 text-[13px] font-medium transition hover:bg-black/5"
                style={{ borderColor: g.textMuted, color: g.textSec }}
              >
                <ReplyAll size={15} /> Reply all
              </button>
              <button
                onClick={() => openReply('forward')}
                className="inline-flex items-center gap-2 rounded-full border px-5 py-2 text-[13px] font-medium transition hover:bg-black/5"
                style={{ borderColor: g.textMuted, color: g.textSec }}
              >
                <Forward size={15} /> Forward
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden select-none"
      style={{
        background: g.shellBg,
        color: g.text,
        fontFamily: '"Google Sans", Roboto, "Segoe UI", Arial, sans-serif'
      }}
    >
      {/* 1. Gmail Top Header Bar */}
      <header className="app-drag flex h-14 shrink-0 items-center justify-between pl-3 pr-36">
        {/* Left: Hamburger + Gmail-style EveryBox Logo */}
        <div className="app-no-drag flex w-[236px] shrink-0 items-center gap-2">
          <button
            onClick={() => setSidebarVisible(!sidebarVisible)}
            className="rounded-full p-2.5 transition hover:bg-black/10"
            style={{ color: g.textSec }}
            title="Main menu"
          >
            <Menu size={20} />
          </button>
          <button
            onClick={() => {
              setActiveView('mail')
              void setActiveMailbox('inbox')
            }}
            className="flex items-center gap-2 rounded-lg px-1 py-1"
            title="EveryBox Mail"
          >
            <img
              src={appIcon}
              alt="EveryBox"
              className="h-8 w-8 shrink-0 object-contain"
            />
            <span className="text-[19px] font-medium tracking-tight" style={{ color: g.textSec }}>
              EveryBox
            </span>
          </button>
        </div>

        {/* Center: Iconic Gmail Rounded Pill Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch(searchQuery)
          }}
          className="app-no-drag flex h-11 flex-1 max-w-[680px] items-center gap-3 rounded-full px-4 transition focus-within:shadow-md"
          style={{ background: g.searchBg }}
        >
          <Search size={18} style={{ color: g.textSec }} className="shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="Search mail"
            className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:opacity-75"
            style={{ color: g.text }}
          />
          {searchQuery && (
            <button type="button" onClick={() => void clearSearch()} className="rounded-full p-1 hover:bg-black/10">
              <X size={16} style={{ color: g.textSec }} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="rounded-full px-2 py-0.5 text-[11px] font-medium opacity-70 hover:opacity-100"
            style={{ background: g.surfaceBg, color: g.textSec }}
            title="Command Palette (Ctrl+K)"
          >
            Ctrl+K
          </button>
        </form>

        {/* Right: Quick Action Icons */}
        <div className="app-no-drag ml-3 flex items-center gap-1">
          <button
            onClick={toggleAssistant}
            className="rounded-full p-2 transition hover:bg-black/10"
            style={{
              background: assistantOpen ? g.navActiveBg : 'transparent',
              color: assistantOpen ? g.blue : g.textSec
            }}
            title="AI Assistant"
          >
            <Sparkles size={19} />
          </button>
          <button
            onClick={() => setActiveView(activeView === 'calendar' ? 'mail' : 'calendar')}
            className="rounded-full p-2 transition hover:bg-black/10"
            style={{
              background: activeView === 'calendar' ? g.navActiveBg : 'transparent',
              color: activeView === 'calendar' ? g.blue : g.textSec
            }}
            title="Calendar"
          >
            <Calendar size={19} />
          </button>
          <button
            onClick={() => void triggerSync()}
            className="rounded-full p-2 transition hover:bg-black/10"
            style={{ color: g.textSec }}
            title="Refresh"
          >
            <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => openSettings('themes')}
            className="rounded-full p-2 transition hover:bg-black/10"
            style={{ color: g.textSec }}
            title="Settings & Themes"
          >
            <Settings size={19} />
          </button>
        </div>
      </header>

      {/* 2. Main Gmail Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Gmail Sidebar */}
        {activeView !== 'triage' && (
          <aside
            className="flex h-full shrink-0 flex-col overflow-y-auto pb-4 transition-all"
            style={{ width: sidebarVisible ? 252 : 68 }}
          >
            {/* Iconic Floating Compose Button */}
            <div className="px-3 pb-4 pt-1">
              <button
                onClick={() => openComposer({ mode: 'new' })}
                className="flex items-center justify-center gap-3 rounded-2xl shadow-sm transition hover:shadow-md"
                style={{
                  background: g.composeBg,
                  color: g.composeText,
                  height: 54,
                  width: sidebarVisible ? 142 : 46,
                  padding: sidebarVisible ? '0 20px' : '0'
                }}
                title="Compose"
              >
                <Pencil size={19} />
                {sidebarVisible && <span className="text-[14px] font-medium">Compose</span>}
              </button>
            </div>

            {/* Primary Gmail Pill Nav */}
            <nav className="space-y-0.5 pr-3">
              {primaryNav.map((item) => {
                const active = activeView === 'mail' && !activeFolderName && activeMailbox === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => void setActiveMailbox(item.id)}
                    className="flex h-8 w-full items-center justify-between rounded-r-full transition"
                    style={{
                      paddingLeft: sidebarVisible ? 24 : 22,
                      paddingRight: sidebarVisible ? 14 : 0,
                      background: active ? g.navActiveBg : 'transparent',
                      color: active ? g.navActiveText : g.textSec,
                      fontWeight: active || (item.id === 'inbox' && (item.unread || 0) > 0) ? 600 : 400
                    }}
                    title={item.label}
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      {item.icon}
                      {sidebarVisible && <span className="truncate text-[13.5px]">{item.label}</span>}
                    </span>
                    {sidebarVisible && renderGmailCounts(item.total, item.unread)}
                  </button>
                )
              })}

              {/* More / Less toggle */}
              <button
                onClick={() => setShowMoreNav((v) => !v)}
                className="flex h-8 w-full items-center gap-4 rounded-r-full transition hover:bg-black/5"
                style={{
                  paddingLeft: sidebarVisible ? 24 : 22,
                  color: g.textSec
                }}
              >
                {showMoreNav ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                {sidebarVisible && <span className="text-[13.5px]">{showMoreNav ? 'Less' : 'More'}</span>}
              </button>

              {showMoreNav &&
                moreNav.map((item) => {
                  const active =
                    (activeView === 'mail' || activeView === 'subscriptions') &&
                    !activeFolderName &&
                    activeMailbox === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => void setActiveMailbox(item.id)}
                      className="flex h-8 w-full items-center justify-between rounded-r-full transition"
                      style={{
                        paddingLeft: sidebarVisible ? 24 : 22,
                        paddingRight: sidebarVisible ? 14 : 0,
                        background: active ? g.navActiveBg : 'transparent',
                        color: active ? g.navActiveText : g.textSec,
                        fontWeight: active ? 600 : 400
                      }}
                      title={item.label}
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        {item.icon}
                        {sidebarVisible && <span className="truncate text-[13.5px]">{item.label}</span>}
                      </span>
                      {sidebarVisible && renderGmailCounts(item.total, item.unread)}
                    </button>
                  )
                })}
            </nav>

            {/* Accounts Section (Native Gmail "Labels" style) */}
            {sidebarVisible && (
              <div className="mt-5 pr-3">
                <div className="flex items-center justify-between pl-6 pr-2 pb-1.5">
                  <span className="text-[13.5px] font-medium" style={{ color: g.text }}>
                    Accounts
                  </span>
                  <button
                    onClick={() => openSettings('accounts')}
                    className="rounded-full p-1 transition hover:bg-black/10"
                    style={{ color: g.textSec }}
                    title="Add or manage accounts"
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <button
                  onClick={() => void selectAllAccounts()}
                  className="flex h-8 w-full items-center justify-between rounded-r-full pl-6 pr-3.5 text-[13px] transition"
                  style={{
                    background: activeAccountIds.length === 0 ? g.hoverBg : 'transparent',
                    fontWeight: activeAccountIds.length === 0 ? 600 : 400,
                    color: g.textSec
                  }}
                >
                  <span className="truncate">All Inboxes</span>
                  {renderGmailCounts(counts.inboxTotal, counts.inbox)}
                </button>

                {accounts.map((acc) => {
                  const isSolo = activeAccountIds.length === 1 && activeAccountIds[0] === acc.id
                  return (
                    <button
                      key={acc.id}
                      onClick={() => void soloAccount(acc.id)}
                      className="flex h-8 w-full items-center justify-between rounded-r-full pl-6 pr-3.5 text-[13px] transition hover:bg-black/5"
                      style={{
                        background: isSolo ? g.navActiveBg : 'transparent',
                        color: isSolo ? g.navActiveText : g.textSec,
                        fontWeight: isSolo ? 600 : 400
                      }}
                      title={`Focus ${acc.email}`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: acc.color }} />
                        <span className="truncate">{acc.name || acc.email}</span>
                      </span>
                      {renderGmailCounts(acc.totalCount, acc.unreadCount)}
                    </button>
                  )
                })}

                {visibleCustomFolders.length > 0 && (
                  <div className="mt-4">
                    <div className="pl-6 pb-1 text-[12.5px] font-medium" style={{ color: g.textMuted }}>
                      Labels
                    </div>
                    {visibleCustomFolders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => void setActiveFolder(f.name)}
                        className="flex h-8 w-full items-center justify-between rounded-r-full pl-6 pr-3.5 text-[13px] transition hover:bg-black/5"
                        style={{
                          background: activeFolderName === f.name ? g.navActiveBg : 'transparent',
                          color: activeFolderName === f.name ? g.navActiveText : g.textSec
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <FolderIcon size={14} />
                          <span className="truncate">{f.name}</span>
                        </span>
                        {renderGmailCounts(f.totalCount, f.unreadCount)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* Main Rounded Gmail Surface Card */}
        <div
          className="mb-3 mr-3 flex min-w-0 flex-1 overflow-hidden rounded-2xl shadow-xs"
          style={{ background: g.surfaceBg }}
        >
          {activeView === 'calendar' && <CalendarView />}
          {activeView === 'triage' && <TriageView />}
          {activeView === 'subscriptions' && <SubscriptionsView />}
          {(activeView === 'mail' || activeView === 'assistant') && (
            <>
              {/* Inbox List (Hidden when full-width Gmail thread is open) */}
              {!showFullWidthReader && (
                <section
                  className="flex h-full flex-col overflow-hidden"
                  style={{
                    width: splitPane ? '42%' : '100%',
                    borderRight: splitPane ? `1px solid ${g.border}` : undefined
                  }}
                >
                  {/* Gmail Top Action Toolbar */}
                  <div
                    className="flex h-12 shrink-0 items-center justify-between border-b px-3"
                    style={{ borderColor: g.border }}
                  >
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleCheckAll}
                        className="mx-2 h-4 w-4 cursor-pointer accent-[#0B57D0]"
                        title="Select all"
                      />
                      {checkedThreadIds.length > 0 ? (
                        <>
                          <button
                            onClick={() => void archiveThreads(checkedThreadIds)}
                            className="rounded-full p-2 transition hover:bg-black/10"
                            style={{ color: g.textSec }}
                            title="Archive selected"
                          >
                            <Archive size={17} />
                          </button>
                          <button
                            onClick={() => void trashThreads(checkedThreadIds)}
                            className="rounded-full p-2 transition hover:bg-black/10"
                            style={{ color: g.textSec }}
                            title="Delete selected"
                          >
                            <Trash2 size={17} />
                          </button>
                          <button
                            onClick={() =>
                              void snoozeThreads(checkedThreadIds, Date.now() + 24 * 3600_000, 'Tomorrow')
                            }
                            className="rounded-full p-2 transition hover:bg-black/10"
                            style={{ color: g.textSec }}
                            title="Snooze until tomorrow"
                          >
                            <Clock size={17} />
                          </button>
                          <span className="ml-1 text-[12px]" style={{ color: g.textMuted }}>
                            {checkedThreadIds.length} selected
                          </span>
                        </>
                      ) : (
                        <button
                          onClick={() => void triggerSync()}
                          className="rounded-full p-2 transition hover:bg-black/10"
                          style={{ color: g.textSec }}
                          title="Refresh"
                        >
                          <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[12px]" style={{ color: g.textMuted }}>
                      <span>
                        {threads.length === 0 ? '0' : `1–${threads.length}`} of {threads.length}
                      </span>
                      <button
                        onClick={toggleSplitPane}
                        className="rounded-full p-1.5 transition hover:bg-black/10"
                        style={{
                          background: splitPane ? g.navActiveBg : 'transparent',
                          color: splitPane ? g.blue : g.textSec
                        }}
                        title={splitPane ? 'Switch to Classic Full-Width Gmail View' : 'Toggle Split Reading Pane'}
                      >
                        <Columns2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Gmail Category Tabs (Primary / People / Updates) */}
                  {activeMailbox === 'inbox' && !activeFolderName && !searchQuery && (
                    <div className="flex shrink-0 border-b" style={{ borderColor: g.border }}>
                      {(
                        [
                          { id: 'all', label: 'Primary', icon: <Inbox size={16} /> },
                          { id: 'people', label: 'People', icon: <Users size={16} />, count: counts.people },
                          { id: 'updates', label: 'Updates', icon: <Tag size={16} />, count: counts.updates }
                        ] as { id: InboxCategory; label: string; icon: React.ReactNode; count?: number }[]
                      ).map((cat) => {
                        const active = activeCategory === cat.id
                        return (
                          <button
                            key={cat.id}
                            onClick={() => void setActiveCategory(cat.id)}
                            className="relative flex h-12 min-w-[160px] items-center gap-3 px-4 text-[13.5px] font-medium transition hover:bg-black/5"
                            style={{ color: active ? g.tabActive : g.textSec }}
                          >
                            {cat.icon}
                            <span>{cat.label}</span>
                            {cat.count !== undefined && cat.count > 0 && (
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
                                style={{ background: cat.id === 'people' ? '#188038' : '#1A73E8' }}
                              >
                                {cat.count} new
                              </span>
                            )}
                            {active && (
                              <span
                                className="absolute bottom-0 left-2 right-2 h-[3px] rounded-t-full"
                                style={{ background: g.tabActive }}
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Dense Single-Row Gmail Message List */}
                  <div className="flex-1 overflow-y-auto">
                    {threads.length === 0 ? (
                      <div className="p-12 text-center text-[13.5px]" style={{ color: g.textMuted }}>
                        No conversations in {activeFolderName || activeMailbox}.
                      </div>
                    ) : (
                      groupedThreads.map(([bucket, items]) => {
                        const isCollapsed = bucket ? Boolean(collapsedGroups[bucket]) : false
                        return (
                          <div key={bucket || 'all'}>
                            {bucket && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedGroups((prev) => ({ ...prev, [bucket]: !prev[bucket] }))
                                }
                                className="sticky top-0 z-10 flex w-full items-center justify-between border-b px-3 py-1.5 text-left text-[12px] font-semibold transition"
                                style={{
                                  background: isDark ? '#282A2C' : '#EEF2F7',
                                  borderColor: g.border,
                                  color: g.textSec
                                }}
                              >
                                <span className="flex items-center gap-1.5">
                                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                  <span>{bucket}</span>
                                </span>
                                {isCollapsed && (
                                  <span className="text-[11px] font-normal" style={{ color: g.textMuted }}>
                                    {items.length}
                                  </span>
                                )}
                              </button>
                            )}
                            {!isCollapsed &&
                              items.map((t) => {
                        const unread = !t.isRead
                        const checked = checkedThreadIds.includes(t.id)
                        const isSelected = splitPane && selectedThreadId === t.id
                        return (
                          <div
                            key={t.id}
                            onClick={() => void selectThread(t.id)}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              void window.glassmail.openThreadWindow(t.id)
                            }}
                            className="group relative flex h-10 cursor-pointer items-center gap-2 border-b px-3 text-[13.5px] transition hover:z-10 hover:shadow-[inset_1px_0_0_rgba(100,121,143,0.18),inset_-1px_0_0_rgba(100,121,143,0.18),0_1px_2px_0_rgba(60,64,67,0.25)]"
                            style={{
                              background: checked || isSelected ? g.rowSelectedBg : unread ? g.rowUnreadBg : g.rowReadBg,
                              borderColor: g.border
                            }}
                          >
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={checked}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (e.shiftKey) {
                                  e.preventDefault()
                                  checkThreadRange(
                                    t.id,
                                    threads.map((th) => th.id)
                                  )
                                }
                              }}
                              onChange={() => toggleCheckThread(t.id)}
                              className="h-4 w-4 shrink-0 cursor-pointer accent-[#0B57D0] opacity-60 group-hover:opacity-100"
                            />

                            {/* Star */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                void toggleStarThread(t.id, t.isStarred)
                              }}
                              className="shrink-0 rounded-full p-1 transition hover:bg-black/10"
                              title={t.isStarred ? 'Starred' : 'Not starred'}
                            >
                              <Star
                                size={16}
                                fill={t.isStarred ? '#F4B400' : 'none'}
                                style={{ color: t.isStarred ? '#F4B400' : g.textMuted }}
                              />
                            </button>

                            {/* Sender Column */}
                            <div
                              className="flex w-44 shrink-0 items-center gap-1.5 truncate pr-2"
                              style={{
                                fontWeight: unread ? 700 : 400,
                                color: g.text
                              }}
                            >
                              {activeAccountIds.length !== 1 && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ background: t.accountColor }}
                                  title={t.accountEmail}
                                />
                              )}
                              <span className="truncate">{t.latestFrom.name || t.latestFrom.email}</span>
                              {t.messageCount > 1 && (
                                <span className="shrink-0 text-[11.5px] font-normal" style={{ color: g.textMuted }}>
                                  {t.messageCount}
                                </span>
                              )}
                            </div>

                            {/* Subject + Snippet */}
                            <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                              <span
                                className="truncate"
                                style={{ fontWeight: unread ? 700 : 400, color: g.text }}
                              >
                                {t.subject || '(no subject)'}
                              </span>
                              {t.snippet && (
                                <span className="truncate font-normal" style={{ color: g.textMuted }}>
                                  — {t.snippet}
                                </span>
                              )}
                            </div>

                            {/* Attachment indicator */}
                            {t.hasAttachments && (
                              <Paperclip size={14} className="shrink-0" style={{ color: g.textMuted }} />
                            )}

                            {/* Right: Timestamp OR Hover Quick Actions */}
                            <div className="flex shrink-0 items-center justify-end pl-2">
                              <div className="hidden items-center gap-0.5 group-hover:flex">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void archiveThreads([t.id])
                                  }}
                                  className="rounded-full p-1.5 hover:bg-black/10"
                                  style={{ color: g.textSec }}
                                  title="Archive"
                                >
                                  <Archive size={15} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void trashThreads([t.id])
                                  }}
                                  className="rounded-full p-1.5 hover:bg-black/10"
                                  style={{ color: g.textSec }}
                                  title="Delete"
                                >
                                  <Trash2 size={15} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void toggleReadThread(t.id, t.isRead)
                                  }}
                                  className="rounded-full p-1.5 hover:bg-black/10"
                                  style={{ color: g.textSec }}
                                  title={t.isRead ? 'Mark as unread' : 'Mark as read'}
                                >
                                  <MailOpen size={15} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void snoozeThreads([t.id], Date.now() + 24 * 3600_000, 'Tomorrow')
                                  }}
                                  className="rounded-full p-1.5 hover:bg-black/10"
                                  style={{ color: g.textSec }}
                                  title="Snooze until tomorrow"
                                >
                                  <Clock size={15} />
                                </button>
                              </div>
                              <span
                                className="min-w-[58px] text-right text-[12px] group-hover:hidden"
                                style={{
                                  fontWeight: unread ? 700 : 400,
                                  color: unread ? g.text : g.textMuted
                                }}
                              >
                                {formatGmailDate(t.lastMessageAt)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>
              )}

              {/* Full-Width Thread View (default Gmail) OR Right Split Pane */}
              {(showFullWidthReader || splitPane) && renderThreadView()}
            </>
          )}
        </div>

        {assistantOpen && activeView !== 'triage' && (
          <div className="mb-3 mr-3 flex overflow-hidden rounded-2xl shadow-xs">
            <AssistantView width={380} />
          </div>
        )}
      </div>
    </div>
  )
}
