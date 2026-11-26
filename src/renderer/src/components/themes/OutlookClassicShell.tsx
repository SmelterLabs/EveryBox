import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  Folder as FolderIcon,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  MailPlus,
  Newspaper,
  PanelLeft,
  Paperclip,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { getDateGroupLabel } from '../../utils/dateGroups'
import { EmailHtmlBody } from '../EmailHtmlBody'
import { AttachmentBar } from '../AttachmentBar'
import { CalendarView } from '../CalendarView'
import { TriageView } from '../TriageView'
import { SubscriptionsView } from '../SubscriptionsView'
import { AssistantView } from '../AssistantView'
import { TodayBrief } from '../TodayBrief'
import { buildReplyComposerState } from '../../utils/replyHelper'
import appIcon from '../../assets/icon.png'
import type { Account, InboxCategory, MailboxId, Message, ThreadAISummary, ThreadSummary } from '../../../../shared/types'

type RibbonTab = 'home' | 'send-receive' | 'view'
type ListFilter = 'all' | 'unread' | 'people' | 'updates'
type SortField = 'date' | 'sender' | 'subject' | 'unread'

function formatOutlookTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400_000)
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })
  }
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })
}

export const OutlookClassicShell: React.FC<{
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
    toggleAssistant,
    selectAllAccounts,
    soloAccount,
    selectAccountMailbox,
    selectThread,
    runSearch,
    clearSearch,
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
    saveSettings,
    showToast
  } = useAppStore()

  const isDark = ['dark', 'black', 'graphite'].includes(settings?.theme || 'dark')
  const showDateGroups = settings?.showDateGroups !== false
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>('home')
  const [readingPaneVisible, setReadingPaneVisible] = useState(true)
  const [showBriefOnEmpty, setShowBriefOnEmpty] = useState(false)
  const [favoritesExpanded, setFavoritesExpanded] = useState(true)
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [listFilter, setListFilter] = useState<ListFilter>('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [localFilter, setLocalFilter] = useState('')
  const [summary, setSummary] = useState<ThreadAISummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [expandedMsgIds, setExpandedMsgIds] = useState<Record<string, boolean>>({})

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const latestMsgRef = useRef<HTMLElement | null>(null)
  const initializedThreadIdRef = useRef<string | null>(null)

  const [folderPaneWidth, setFolderPaneWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('everybox:outlook:folderWidth'))
    return Number.isFinite(saved) && saved >= 170 && saved <= 360 ? saved : 224
  })
  const [listPaneWidth, setListPaneWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('everybox:outlook:listWidth'))
    return Number.isFinite(saved) && saved >= 260 && saved <= 620 ? saved : 344
  })
  const [assistantWidth] = useState<number>(380)

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

  const startResize = (
    e: React.MouseEvent,
    startWidth: number,
    min: number,
    max: number,
    storageKey: string,
    setter: (w: number) => void
  ) => {
    e.preventDefault()
    const startX = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(max, Math.max(min, startWidth + (ev.clientX - startX)))
      setter(next)
      localStorage.setItem(storageKey, String(next))
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Outlook Classic color palette (Light = Office Colorful, Dark = Office Dark Gray)
  const c = isDark
    ? {
        titleBg: '#1F1F1F',
        titleText: '#FFFFFF',
        ribbonTabBg: '#252423',
        ribbonBg: '#292827',
        railBg: '#1B1A19',
        folderBg: '#201F1E',
        listBg: '#1F1F1F',
        readerBg: '#1F1F1F',
        readerHeaderBg: '#252423',
        statusBg: '#1B1A19',
        border: '#3B3A39',
        borderSubtle: '#2D2C2B',
        hover: '#323130',
        selected: '#1D354D',
        selectedBorder: '#4BA0E8',
        blue: '#4BA0E8',
        bluePrimary: '#0F6CBD',
        text: '#F3F2F1',
        textSec: '#C8C6C4',
        textMuted: '#8A8886'
      }
    : {
        titleBg: '#0F6CBD',
        titleText: '#FFFFFF',
        ribbonTabBg: '#F3F2F1',
        ribbonBg: '#FFFFFF',
        railBg: '#EDEBE9',
        folderBg: '#F3F2F1',
        listBg: '#FFFFFF',
        readerBg: '#FFFFFF',
        readerHeaderBg: '#FAF9F8',
        statusBg: '#F3F2F1',
        border: '#E1DFDD',
        borderSubtle: '#EDEBE9',
        hover: '#EFF6FC',
        selected: '#CFE4FA',
        selectedBorder: '#0F6CBD',
        blue: '#0F6CBD',
        bluePrimary: '#0F6CBD',
        text: '#242424',
        textSec: '#484644',
        textMuted: '#605E5C'
      }

  const actionTargets = checkedThreadIds.length > 0 ? checkedThreadIds : selectedThreadId ? [selectedThreadId] : []

  const openReply = (mode: 'reply' | 'replyAll' | 'forward', targetMsg?: Message) => {
    if (!selectedThread) return
    openComposer(buildReplyComposerState(selectedThread, mode, targetMsg, { outlookPrefixes: true }))
  }

  const handleFilterChange = (f: ListFilter) => {
    setListFilter(f)
    if (f === 'people' || f === 'updates') {
      void setActiveCategory(f as InboxCategory)
    } else if (activeCategory !== 'all') {
      void setActiveCategory('all')
    }
  }

  const filteredSortedThreads = useMemo(() => {
    let list = [...threads]
    if (listFilter === 'unread') {
      list = list.filter((t) => !t.isRead)
    }
    const q = localFilter.trim().toLowerCase()
    if (q) {
      list = list.filter((t) =>
        `${t.latestFrom.name} ${t.latestFrom.email} ${t.subject} ${t.snippet} ${t.accountEmail}`
          .toLowerCase()
          .includes(q)
      )
    }
    const mult = sortAsc ? 1 : -1
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') cmp = a.lastMessageAt - b.lastMessageAt
      else if (sortField === 'sender')
        cmp = (a.latestFrom.name || a.latestFrom.email).localeCompare(b.latestFrom.name || b.latestFrom.email)
      else if (sortField === 'subject') cmp = (a.subject || '').localeCompare(b.subject || '')
      else if (sortField === 'unread') cmp = (a.isRead ? 0 : 1) - (b.isRead ? 0 : 1)
      return cmp !== 0 ? cmp * mult : b.lastMessageAt - a.lastMessageAt
    })
    return list
  }, [threads, listFilter, localFilter, sortField, sortAsc])

  const groupedThreads = useMemo(() => {
    if (!showDateGroups) {
      return { '': filteredSortedThreads }
    }
    if (sortField !== 'date') {
      return { [`Arranged by ${sortField.charAt(0).toUpperCase() + sortField.slice(1)}`]: filteredSortedThreads }
    }
    const now = new Date()
    return filteredSortedThreads.reduce<Record<string, ThreadSummary[]>>((acc, t) => {
      const b = getDateGroupLabel(t.lastMessageAt, now)
      if (!acc[b]) acc[b] = []
      acc[b].push(t)
      return acc
    }, {})
  }, [filteredSortedThreads, sortField, showDateGroups])

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

  const mailboxDisplayTitle =
    activeFolderName ||
    ({
      inbox: 'Inbox',
      starred: 'Flagged',
      sent: 'Sent Items',
      drafts: 'Drafts',
      archive: 'Archive',
      junk: 'Junk Email',
      trash: 'Deleted Items',
      snoozed: 'Snoozed',
      waiting: 'Waiting',
      subscriptions: 'Subscriptions',
      scheduled: 'Outbox / Scheduled'
    }[activeMailbox] || activeMailbox)

  const favoriteItems: { id: MailboxId; label: string; icon: React.ReactNode; total?: number; unread?: number }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={14} />, total: counts.inboxTotal, unread: counts.inbox },
    { id: 'sent', label: 'Sent Items', icon: <Send size={14} />, total: counts.sent, unread: counts.sentUnread },
    { id: 'drafts', label: 'Drafts', icon: <FileText size={14} />, total: counts.drafts, unread: counts.draftsUnread },
    { id: 'trash', label: 'Deleted Items', icon: <Trash2 size={14} />, total: counts.trash, unread: counts.trashUnread },
    { id: 'starred', label: 'Flagged', icon: <Flag size={14} />, total: counts.starred, unread: counts.starredUnread }
  ]

  const renderOutlookCounts = (total?: number, unread?: number) => {
    const hasTotal = Boolean(total && total > 0)
    const hasUnread = Boolean(unread && unread > 0)
    if (!hasTotal && !hasUnread) return null
    return (
      <span className="ml-1.5 inline-flex shrink-0 items-baseline gap-1.5 tabular-nums">
        {hasUnread && (
          <span className="text-[11.5px] font-bold" style={{ color: c.blue }} title={`${unread} unread`}>
            {unread}
          </span>
        )}
        {hasTotal && (
          <span className="text-[10.5px] font-normal" style={{ color: c.textMuted }} title={`${total} total`}>
            {total}
          </span>
        )}
      </span>
    )
  }

  const getAccountTreeItems = (acc: Account) => {
    const accFolders = folders.filter((f) => f.accountId === acc.id)
    const standard: { role: 'inbox' | 'drafts' | 'sent' | 'trash' | 'junk' | 'archive'; label: string; icon: React.ReactNode }[] = [
      { role: 'inbox', label: 'Inbox', icon: <Inbox size={13} /> },
      { role: 'drafts', label: 'Drafts', icon: <FileText size={13} /> },
      { role: 'sent', label: 'Sent Items', icon: <Send size={13} /> },
      { role: 'trash', label: 'Deleted Items', icon: <Trash2 size={13} /> },
      { role: 'junk', label: 'Junk Email', icon: <ShieldAlert size={13} /> },
      { role: 'archive', label: 'Archive', icon: <Archive size={13} /> }
    ]
    const std = standard.map((s) => {
      const m = accFolders.find((f) => f.role === s.role)
      return {
        key: `${acc.id}:${s.role}`,
        label: s.label,
        mailbox: s.role as MailboxId,
        customFolderName: null as string | null,
        icon: s.icon,
        total: s.role === 'inbox' ? acc.totalCount || m?.totalCount || 0 : m?.totalCount || 0,
        unread: s.role === 'inbox' ? acc.unreadCount || 0 : m?.unreadCount || 0
      }
    })
    const custom = accFolders
      .filter((f) => f.role === 'custom')
      .map((f) => ({
        key: f.id,
        label: f.name,
        mailbox: 'inbox' as MailboxId,
        customFolderName: f.name,
        icon: <FolderIcon size={13} />,
        total: f.totalCount || 0,
        unread: f.unreadCount || 0
      }))
    return [...std, ...custom]
  }

  const readerWidthMode = settings?.readerWidth || 'comfortable'
  const readerBodyScale = readerWidthMode === 'narrow' ? 1 : readerWidthMode === 'wide' ? 1.2 : 1.05

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden select-none"
      style={{
        background: c.listBg,
        color: c.text,
        fontFamily: '"Segoe UI", "Segoe UI Variable", -apple-system, BlinkMacSystemFont, sans-serif'
      }}
    >
      {/* 1. Office Blue Title Bar */}
      <header
        className="app-drag flex h-9 shrink-0 items-center justify-between pl-2.5 pr-36"
        style={{ background: c.titleBg, color: c.titleText }}
      >
        {/* Quick Access Toolbar + App Title */}
        <div className="app-no-drag flex items-center gap-1.5">
          <button
            onClick={() => void triggerSync()}
            className="rounded p-1 transition hover:bg-white/15"
            title="Send/Receive All Folders"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => openComposer({ mode: 'new' })}
            className="rounded p-1 transition hover:bg-white/15"
            title="New Email (Ctrl+N)"
          >
            <MailPlus size={13} />
          </button>
          <img
            src={appIcon}
            alt="EveryBox"
            className="ml-1 h-4 w-4 shrink-0 rounded-[3px] object-contain"
          />
          <span className="ml-1 text-[12px] font-semibold tracking-tight opacity-95">
            EveryBox — Mail
          </span>
        </div>

        {/* Classic Outlook Top Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch(searchQuery)
          }}
          className="app-no-drag flex h-[26px] w-full max-w-[460px] items-center gap-2 rounded-[4px] px-2.5"
          style={{
            background: isDark ? '#323130' : 'rgba(255, 255, 255, 0.92)',
            color: isDark ? '#F3F2F1' : '#242424'
          }}
        >
          <Search size={13} style={{ color: isDark ? '#8A8886' : '#0F6CBD' }} className="shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:opacity-70"
          />
          {searchQuery && (
            <button type="button" onClick={() => void clearSearch()} className="rounded p-0.5 hover:bg-black/10">
              <X size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium opacity-70 hover:opacity-100"
            title="Command Palette (Ctrl+K)"
          >
            Ctrl+K
          </button>
        </form>

        <div className="w-6" />
      </header>

      {/* 2. Classic Outlook Ribbon */}
      <div className="shrink-0 border-b" style={{ background: c.ribbonTabBg, borderColor: c.border }}>
        {/* Ribbon Tabs */}
        <div className="flex h-7 items-center gap-1 px-2 text-[12px]">
          <button
            onClick={() => openSettings('accounts')}
            className="mr-1 rounded-[3px] px-3 py-0.5 font-medium text-white transition hover:opacity-90"
            style={{ background: c.bluePrimary }}
          >
            File
          </button>
          {(
            [
              { id: 'home', label: 'Home' },
              { id: 'send-receive', label: 'Send / Receive' },
              { id: 'view', label: 'View' }
            ] as { id: RibbonTab; label: string }[]
          ).map((t) => {
            const active = ribbonTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setRibbonTab(t.id)}
                className="relative h-full px-3 text-[12px] transition hover:bg-black/5"
                style={{
                  fontWeight: active ? 600 : 400,
                  color: active ? c.text : c.textSec
                }}
              >
                {t.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px]"
                    style={{ background: c.blue }}
                  />
                )}
              </button>
            )
          })}
          <div className="flex-1" />
          <button
            onClick={() => openSettings('themes')}
            className="rounded px-2 py-0.5 text-[11px] transition hover:bg-black/5"
            style={{ color: c.textMuted }}
            title="Switch Experience Theme"
          >
            Theme: Outlook Classic
          </button>
        </div>

        {/* Ribbon Command Strip */}
        <div
          className="flex h-[42px] items-center gap-1 overflow-x-auto border-t px-2.5"
          style={{ background: c.ribbonBg, borderColor: c.borderSubtle }}
        >
          {ribbonTab === 'home' && (
            <>
              <button
                onClick={() => openComposer({ mode: 'new' })}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                style={{ background: c.bluePrimary }}
              >
                <MailPlus size={14} />
                New Email
              </button>

              <div className="mx-1.5 h-6 w-px" style={{ background: c.border }} />

              <button
                disabled={actionTargets.length === 0}
                onClick={() => void trashThreads(actionTargets)}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                title="Delete"
              >
                <Trash2 size={14} style={{ color: '#d13438' }} />
                Delete
              </button>
              <button
                disabled={actionTargets.length === 0}
                onClick={() => void archiveThreads(actionTargets)}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                title="Archive (E)"
              >
                <Archive size={14} style={{ color: '#107c10' }} />
                Archive
              </button>

              <div className="mx-1.5 h-6 w-px" style={{ background: c.border }} />

              <button
                disabled={!selectedThread}
                onClick={() => openReply('reply')}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                title="Reply (R)"
              >
                <Reply size={14} style={{ color: c.blue }} />
                Reply
              </button>
              <button
                disabled={!selectedThread}
                onClick={() => openReply('replyAll')}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                title="Reply All (A)"
              >
                <ReplyAll size={14} style={{ color: c.blue }} />
                Reply All
              </button>
              <button
                disabled={!selectedThread}
                onClick={() => openReply('forward')}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                title="Forward (F)"
              >
                <Forward size={14} style={{ color: c.blue }} />
                Forward
              </button>

              <div className="mx-1.5 h-6 w-px" style={{ background: c.border }} />

              <button
                disabled={!selectedThread}
                onClick={() => selectedThread && void toggleReadThread(selectedThread.id, selectedThread.isRead)}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                title="Toggle Read / Unread"
              >
                <MailOpen size={14} />
                {selectedThread?.isRead ? 'Mark Unread' : 'Mark Read'}
              </button>
              <button
                disabled={!selectedThread}
                onClick={() => selectedThread && void toggleStarThread(selectedThread.id, selectedThread.isStarred)}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                title="Flag / Follow Up"
              >
                <Flag
                  size={14}
                  fill={selectedThread?.isStarred ? '#d13438' : 'none'}
                  style={{ color: selectedThread?.isStarred ? '#d13438' : 'currentColor' }}
                />
                Flag
              </button>

              <div className="relative">
                <button
                  disabled={actionTargets.length === 0}
                  onClick={() => setShowSnoozeMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] disabled:opacity-40"
                  title="Snooze"
                >
                  <Clock size={14} />
                  Snooze
                </button>
                {showSnoozeMenu && actionTargets.length > 0 && (
                  <div
                    className="absolute left-0 top-9 z-40 w-44 rounded border py-1 shadow-lg"
                    style={{ background: c.ribbonBg, borderColor: c.border }}
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
                          void snoozeThreads(actionTargets, Date.now() + opt.h * 3600_000, opt.label)
                        }}
                        className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)]"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mx-1.5 h-6 w-px" style={{ background: c.border }} />

              <button
                onClick={toggleAssistant}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium transition"
                style={{
                  background: assistantOpen ? c.selected : 'transparent',
                  color: assistantOpen ? c.blue : c.text
                }}
                title="EveryBox AI Assistant"
              >
                <Sparkles size={14} style={{ color: c.blue }} />
                AI Assistant
              </button>
            </>
          )}

          {ribbonTab === 'send-receive' && (
            <>
              <button
                onClick={() => void triggerSync()}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} style={{ color: c.blue }} />
                Send/Receive All Folders
              </button>
              <div className="mx-1.5 h-6 w-px" style={{ background: c.border }} />
              <button
                onClick={() => openSettings('accounts')}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)]"
              >
                <Settings size={14} />
                Account Settings
              </button>
            </>
          )}

          {ribbonTab === 'view' && (
            <>
              <button
                onClick={() => setSidebarVisible(!sidebarVisible)}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)]"
              >
                <PanelLeft size={14} />
                Folder Pane: {sidebarVisible ? 'Normal' : 'Hidden'}
              </button>
              <button
                onClick={() => setReadingPaneVisible((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)]"
              >
                Reading Pane: {readingPaneVisible ? 'Right' : 'Off'}
              </button>
              <div className="mx-1.5 h-6 w-px" style={{ background: c.border }} />
              <button
                onClick={() => setShowBriefOnEmpty((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)]"
              >
                Empty Pane: {showBriefOnEmpty ? 'Today Brief' : 'Classic Blank'}
              </button>
              <button
                onClick={() => settings && void saveSettings({ ...settings, showDateGroups: !showDateGroups })}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)]"
              >
                Day Separators: {showDateGroups ? 'On' : 'Off'}
              </button>
              <div className="mx-1.5 h-6 w-px" style={{ background: c.border }} />
              <button
                onClick={() => openSettings('themes')}
                className="inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)]"
              >
                Switch Theme…
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. Main Outlook Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Far-Left Classic Outlook Navigation Rail */}
        <nav
          className="flex w-[46px] shrink-0 flex-col items-center justify-between border-r py-2"
          style={{ background: c.railBg, borderColor: c.border }}
        >
          <div className="flex flex-col items-center gap-1 w-full">
            {[
              { id: 'mail' as const, label: 'Mail', icon: <Mail size={18} />, active: activeView === 'mail' },
              { id: 'calendar' as const, label: 'Calendar', icon: <Calendar size={18} />, active: activeView === 'calendar' },
              { id: 'subscriptions' as const, label: 'Subscriptions', icon: <Newspaper size={18} />, active: activeView === 'subscriptions' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className="relative flex h-10 w-full items-center justify-center transition hover:bg-black/5"
                style={{ color: item.active ? c.blue : c.textSec }}
                title={item.label}
              >
                {item.active && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: c.blue }} />
                )}
                {item.icon}
              </button>
            ))}
            <button
              onClick={toggleAssistant}
              className="relative flex h-10 w-full items-center justify-center transition hover:bg-black/5"
              style={{ color: assistantOpen ? c.blue : c.textSec }}
              title="AI Assistant"
            >
              {assistantOpen && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: c.blue }} />
              )}
              <Sparkles size={18} />
            </button>
          </div>

          <button
            onClick={() => openSettings('accounts')}
            className="flex h-10 w-full items-center justify-center transition hover:bg-black/5"
            style={{ color: c.textSec }}
            title="Settings"
          >
            <Settings size={17} />
          </button>
        </nav>

        {/* Left Folder Pane (Favorites + Per-Account Collapsible Trees) */}
        {sidebarVisible && activeView !== 'triage' && (
          <>
            <aside
              className="flex h-full shrink-0 flex-col overflow-y-auto border-r py-2"
              style={{ width: folderPaneWidth, background: c.folderBg, borderColor: c.border }}
            >
              {/* Favorites */}
              <div className="mb-2">
                <button
                  onClick={() => setFavoritesExpanded((v) => !v)}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wide"
                  style={{ color: c.textSec }}
                >
                  {favoritesExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Favorites
                </button>
                {favoritesExpanded && (
                  <div className="mt-0.5">
                    {favoriteItems.map((item) => {
                      const isActive =
                        activeView === 'mail' &&
                        activeAccountIds.length === 0 &&
                        !activeFolderName &&
                        activeMailbox === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={async () => {
                            if (activeAccountIds.length > 0) await selectAllAccounts()
                            await setActiveMailbox(item.id)
                          }}
                          className="flex w-full items-center justify-between px-4 py-1.5 text-[12.5px] transition"
                            style={{
                            background: isActive ? c.selected : 'transparent',
                            color: isActive ? c.blue : c.text,
                            fontWeight: isActive || (item.unread && item.unread > 0) ? 600 : 400
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {item.icon}
                            <span className="truncate">{item.label}</span>
                          </span>
                          {renderOutlookCounts(item.total, item.unread)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="mx-3 my-1.5 h-px" style={{ background: c.border }} />

              {/* All Mailboxes Focus Reset */}
              <button
                onClick={() => void selectAllAccounts()}
                className="mb-1 flex w-full items-center justify-between px-3 py-1.5 text-[12px] font-semibold transition"
                style={{
                  background: activeAccountIds.length === 0 && !activeFolderName ? c.hover : 'transparent',
                  color: activeAccountIds.length === 0 ? c.blue : c.textSec
                }}
              >
                <span>All Mailboxes ({accounts.length})</span>
                {renderOutlookCounts(counts.inboxTotal, counts.inbox)}
              </button>

              {/* Per-Account Collapsible Trees */}
              <div className="space-y-1">
                {accounts.map((acc) => {
                  const isExpanded = Boolean(expandedAccounts[acc.id])
                  const isSolo = activeAccountIds.length === 1 && activeAccountIds[0] === acc.id
                  const treeItems = getAccountTreeItems(acc)
                  return (
                    <div key={acc.id}>
                      <div
                        className="flex items-center gap-1 px-2 py-1 text-[12.5px] font-semibold"
                        style={{
                          background: isSolo && !activeFolderName ? c.hover : 'transparent',
                          color: c.text
                        }}
                      >
                        <button
                          onClick={() =>
                            setExpandedAccounts((prev) => ({ ...prev, [acc.id]: !prev[acc.id] }))
                          }
                          className="rounded p-0.5 hover:bg-black/10"
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                        <button
                          onClick={() => void soloAccount(acc.id)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                          title={`Focus ${acc.email}`}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: acc.color }} />
                          <span className="truncate">{acc.email}</span>
                        </button>
                        <span className="pr-1">{renderOutlookCounts(acc.totalCount, acc.unreadCount)}</span>
                      </div>

                      {isExpanded && (
                        <div className="pl-5">
                          {treeItems.map((fi) => {
                            const active =
                              activeView === 'mail' &&
                              isSolo &&
                              (fi.customFolderName
                                ? activeFolderName === fi.customFolderName
                                : !activeFolderName && activeMailbox === fi.mailbox)
                            return (
                              <button
                                key={fi.key}
                                onClick={() =>
                                  void selectAccountMailbox(acc.id, fi.mailbox, fi.customFolderName)
                                }
                                className="flex w-full items-center justify-between px-2.5 py-1 text-[12px] transition"
                                style={{
                                  background: active ? c.selected : 'transparent',
                                  color: active ? c.blue : c.text,
                                  fontWeight: active || fi.unread > 0 ? 600 : 400
                                }}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  {fi.icon}
                                  <span className="truncate">{fi.label}</span>
                                </span>
                                {renderOutlookCounts(fi.total, fi.unread)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </aside>

            <div
              onMouseDown={(e) =>
                startResize(e, folderPaneWidth, 170, 360, 'everybox:outlook:folderWidth', setFolderPaneWidth)
              }
              className="w-1 shrink-0 cursor-col-resize hover:bg-[#0F6CBD]/40"
            />
          </>
        )}

        {/* Active Center / Right Views */}
        {activeView === 'calendar' && <CalendarView />}
        {activeView === 'triage' && <TriageView />}
        {activeView === 'subscriptions' && <SubscriptionsView />}
        {(activeView === 'mail' || activeView === 'assistant') && (
          <>
            {/* Message List Pane */}
            <section
              className="flex h-full shrink-0 flex-col border-r"
              style={{
                width: readingPaneVisible ? listPaneWidth : '100%',
                flex: readingPaneVisible ? undefined : 1,
                background: c.listBg,
                borderColor: c.border
              }}
            >
              {/* Classic Outlook List Header */}
              <div className="border-b px-3 py-2" style={{ borderColor: c.border }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-[12.5px]">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'unread', label: 'Unread' },
                        { id: 'people', label: 'Focused' },
                        { id: 'updates', label: 'Other' }
                      ] as { id: ListFilter; label: string }[]
                    ).map((tab) => {
                      const active = listFilter === tab.id
                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleFilterChange(tab.id)}
                          className="relative pb-1 transition"
                          style={{
                            fontWeight: active ? 600 : 400,
                            color: active ? c.blue : c.textSec
                          }}
                        >
                          {tab.label}
                          {active && (
                            <span
                              className="absolute bottom-0 left-0 right-0 h-[2px]"
                              style={{ background: c.blue }}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => {
                      const order: SortField[] = ['date', 'sender', 'subject', 'unread']
                      const next = order[(order.indexOf(sortField) + 1) % order.length]
                      setSortField(next)
                      setSortAsc(next === 'sender' || next === 'subject')
                    }}
                    className="rounded px-1.5 py-0.5 text-[11px] transition hover:bg-black/5"
                    style={{ color: c.textMuted }}
                    title="Cycle sort order"
                  >
                    By {sortField.charAt(0).toUpperCase() + sortField.slice(1)} {sortAsc ? '↑' : '↓'}
                  </button>
                </div>

                {/* Inline Mailbox Search */}
                <div
                  className="mt-1.5 flex items-center gap-1.5 rounded-[3px] border px-2 py-1"
                  style={{ borderColor: c.border, background: isDark ? '#252423' : '#FAF9F8' }}
                >
                  <Search size={12} style={{ color: c.textMuted }} />
                  <input
                    value={localFilter}
                    onChange={(e) => setLocalFilter(e.target.value)}
                    placeholder={`Search ${mailboxDisplayTitle}`}
                    className="flex-1 bg-transparent text-[11.5px] outline-none"
                  />
                  {localFilter && (
                    <button onClick={() => setLocalFilter('')}>
                      <X size={11} style={{ color: c.textMuted }} />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Message Rows */}
              <div className="flex-1 overflow-y-auto">
                {Object.keys(groupedThreads).length === 0 ? (
                  <div className="p-8 text-center text-[12.5px]" style={{ color: c.textMuted }}>
                    We didn&apos;t find anything to show here.
                  </div>
                ) : (
                  Object.entries(groupedThreads).map(([bucket, items]) => {
                    const isCollapsed = bucket ? Boolean(collapsedGroups[bucket]) : false
                    return (
                    <div key={bucket || 'all'}>
                      {bucket && (
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedGroups((prev) => ({ ...prev, [bucket]: !prev[bucket] }))
                          }
                          className="sticky top-0 z-10 flex w-full items-center justify-between border-y px-2.5 py-1 text-left text-[11.5px] font-semibold transition"
                          style={{
                            background: isDark ? '#3F3E3D' : '#E5E3E1',
                            borderColor: isDark ? '#525150' : '#D2D0CE',
                            color: isDark ? '#FFFFFF' : '#242424'
                          }}
                        >
                          <span className="flex items-center gap-1.5">
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                            <span>{bucket}</span>
                          </span>
                          {isCollapsed && (
                            <span className="text-[11px] font-normal opacity-80">
                              {items.length}
                            </span>
                          )}
                        </button>
                      )}
                      {!isCollapsed && items.map((t) => {
                        const isSelected = selectedThreadId === t.id
                        const unread = !t.isRead
                        return (
                          <div
                            key={t.id}
                            onClick={() => void selectThread(t.id)}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              void window.glassmail.openThreadWindow(t.id)
                            }}
                            className="group relative cursor-pointer border-b py-2 pl-3 pr-2.5 transition"
                            style={{
                              background: isSelected ? c.selected : c.listBg,
                              borderColor: c.borderSubtle,
                              borderLeft: unread
                                ? `3px solid ${c.blue}`
                                : isSelected
                                  ? `3px solid ${c.selectedBorder}`
                                  : '3px solid transparent'
                            }}
                          >
                            {/* Top line: Sender + Time / Hover Quick Actions */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                {activeAccountIds.length !== 1 && (
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ background: t.accountColor }}
                                    title={t.accountEmail}
                                  />
                                )}
                                <span
                                  className="truncate text-[13px]"
                                  style={{
                                    fontWeight: unread ? 600 : 400,
                                    color: c.text
                                  }}
                                >
                                  {t.latestFrom.name || t.latestFrom.email}
                                </span>
                                {t.messageCount > 1 && (
                                  <span className="text-[11px]" style={{ color: c.textMuted }}>
                                    ({t.messageCount})
                                  </span>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <div className="hidden items-center gap-0.5 group-hover:flex">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void toggleReadThread(t.id, t.isRead)
                                    }}
                                    className="rounded p-0.5 hover:bg-black/10"
                                    title={t.isRead ? 'Mark as unread' : 'Mark as read'}
                                  >
                                    <MailOpen size={12} style={{ color: c.textSec }} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void toggleStarThread(t.id, t.isStarred)
                                    }}
                                    className="rounded p-0.5 hover:bg-black/10"
                                    title="Flag"
                                  >
                                    <Flag
                                      size={12}
                                      fill={t.isStarred ? '#d13438' : 'none'}
                                      style={{ color: t.isStarred ? '#d13438' : c.textSec }}
                                    />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      void trashThreads([t.id])
                                    }}
                                    className="rounded p-0.5 hover:bg-black/10"
                                    title="Delete"
                                  >
                                    <Trash2 size={12} style={{ color: '#d13438' }} />
                                  </button>
                                </div>
                                <span
                                  className="text-[11px] group-hover:hidden"
                                  style={{
                                    color: unread ? c.blue : c.textMuted,
                                    fontWeight: unread ? 600 : 400
                                  }}
                                >
                                  {formatOutlookTime(t.lastMessageAt)}
                                </span>
                              </div>
                            </div>

                            {/* Line 2: Subject + Attachment / Flag */}
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                              <span
                                className="truncate text-[12px]"
                                style={{
                                  fontWeight: unread ? 600 : 400,
                                  color: unread ? c.blue : c.textSec
                                }}
                              >
                                {t.subject || '(No subject)'}
                              </span>
                              <div className="flex shrink-0 items-center gap-1">
                                {t.hasAttachments && <Paperclip size={11} style={{ color: c.textMuted }} />}
                                {t.isStarred && <Flag size={11} fill="#d13438" style={{ color: '#d13438' }} />}
                              </div>
                            </div>

                            {/* Line 3: Preview Snippet */}
                            <div className="mt-0.5 truncate text-[11.5px]" style={{ color: c.textMuted }}>
                              {t.snippet}
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

            {/* Resizer between List and Reading Pane */}
            {readingPaneVisible && (
              <>
                <div
                  onMouseDown={(e) =>
                    startResize(e, listPaneWidth, 260, 620, 'everybox:outlook:listWidth', setListPaneWidth)
                  }
                  className="w-1 shrink-0 cursor-col-resize hover:bg-[#0F6CBD]/40"
                />

                {/* Right Reading Pane */}
                <section className="flex min-w-0 flex-1 flex-col overflow-hidden" style={{ background: c.readerBg }}>
                  {selectedThread ? (
                    <div ref={scrollContainerRef} className="flex h-full flex-col overflow-y-auto">
                      {/* Subject Header */}
                      <div
                        className="border-b px-6 py-3.5"
                        style={{ background: c.readerHeaderBg, borderColor: c.border }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h1 className="text-[18px] font-semibold leading-snug">{selectedThread.subject}</h1>
                          <div className="flex shrink-0 items-center gap-2">
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
                                className="inline-flex items-center gap-1 rounded-[3px] border px-2.5 py-1 text-[11.5px] font-medium transition hover:bg-black/5"
                                style={{ borderColor: c.border, color: c.textSec }}
                              >
                                {selectedThread.messages.every((m) => expandedMsgIds[m.id] !== false)
                                  ? 'Collapse older'
                                  : `Expand all (${selectedThread.messages.length})`}
                              </button>
                            )}
                            <button
                              onClick={() => void handleSummarize()}
                              disabled={loadingSummary}
                              className="inline-flex items-center gap-1 rounded-[3px] border px-2.5 py-1 text-[11.5px] font-medium transition hover:bg-black/5"
                              style={{ borderColor: c.border, color: c.blue }}
                            >
                              <Sparkles size={12} />
                              {loadingSummary ? 'Summarizing…' : 'AI Summary'}
                            </button>
                            <span
                              className="inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-[11px]"
                              style={{ borderColor: c.border, color: c.textMuted }}
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: selectedThread.accountColor }}
                              />
                              {selectedThread.accountEmail}
                            </span>
                          </div>
                        </div>

                        {selectedThread.scamWarning && (
                          <div
                            className="mt-2.5 flex items-center gap-2 rounded-[3px] border px-3 py-2 text-[12px]"
                            style={{ background: 'rgba(209,52,56,0.1)', borderColor: '#d13438' }}
                          >
                            <AlertTriangle size={14} style={{ color: '#d13438' }} />
                            <span>{selectedThread.scamWarning}</span>
                          </div>
                        )}

                        {summary && (
                          <div
                            className="mt-3 rounded-[4px] border p-3 text-[12.5px]"
                            style={{ background: c.listBg, borderColor: c.border }}
                          >
                            <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: c.blue }}>
                              <span className="inline-flex items-center gap-1">
                                <Sparkles size={12} /> AI Summary
                              </span>
                              <span style={{ color: c.textMuted }}>{summary.providerLabel}</span>
                            </div>
                            <p className="mt-1.5 leading-relaxed">{summary.gist}</p>
                            {summary.actionItems.length > 0 && (
                              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px]" style={{ color: c.textSec }}>
                                {summary.actionItems.map((it, idx) => (
                                  <li key={idx}>{it}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Messages */}
                      <div className="flex-1 space-y-4 px-6 py-4 select-text">
                        {selectedThread.messages.map((m, idx) => {
                          const isLatest = idx === selectedThread.messages.length - 1
                          const isMulti = selectedThread.messages.length > 1
                          const isExpanded = expandedMsgIds[m.id] ?? (isLatest || !isMulti)

                          if (!isExpanded) {
                            return (
                              <article
                                key={m.id}
                                onClick={() => setExpandedMsgIds((prev) => ({ ...prev, [m.id]: true }))}
                                className="flex cursor-pointer items-center justify-between gap-3 rounded-[4px] border px-3 py-2 transition hover:bg-black/5"
                                style={{ background: c.readerHeaderBg, borderColor: c.border }}
                                title="Click to expand message"
                              >
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <ChevronRight size={13} className="shrink-0" style={{ color: c.textMuted }} />
                                  <span className="shrink-0 text-[12.5px] font-semibold">
                                    {m.from.name || m.from.email}
                                  </span>
                                  <span className="truncate text-[12px]" style={{ color: c.textMuted }}>
                                    {m.snippet || m.bodyText.slice(0, 120)}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 text-[11.5px]" style={{ color: c.textMuted }}>
                                  {m.hasAttachments && <Paperclip size={11} />}
                                  <span>{formatOutlookTime(m.date)}</span>
                                </div>
                              </article>
                            )
                          }

                          return (
                          <article
                            key={m.id}
                            ref={isLatest ? latestMsgRef : undefined}
                            className="scroll-mt-4 border-b pb-5 last:border-b-0"
                            style={{ borderColor: c.borderSubtle }}
                          >
                            {/* Classic Outlook Message Header with inline Reply/Reply All/Forward */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                {isMulti && !isLatest && (
                                  <button
                                    onClick={() => setExpandedMsgIds((prev) => ({ ...prev, [m.id]: false }))}
                                    className="mt-1 rounded p-0.5 hover:bg-black/10"
                                    style={{ color: c.textMuted }}
                                    title="Collapse message"
                                  >
                                    <ChevronDown size={13} />
                                  </button>
                                )}
                                <div
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                                  style={{ background: c.bluePrimary }}
                                >
                                  {(m.from.name || m.from.email).slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold">
                                    <span>{m.from.name || m.from.email}</span>
                                    <span className="text-[12px] font-normal" style={{ color: c.textMuted }}>
                                      &lt;{m.from.email}&gt;
                                    </span>
                                    {isMulti && isLatest && (
                                      <span
                                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                        style={{ background: c.selected, color: c.blue }}
                                      >
                                        Latest
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 text-[11.5px]" style={{ color: c.textMuted }}>
                                    {new Date(m.date).toLocaleString([], {
                                      weekday: 'short',
                                      month: 'numeric',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                  <div className="mt-0.5 text-[11.5px]" style={{ color: c.textSec }}>
                                    <span className="font-semibold">To:</span>{' '}
                                    {m.to.map((r) => r.name || r.email).join('; ') || selectedThread.accountEmail}
                                  </div>
                                </div>
                              </div>

                              {/* Signature Classic Outlook Inline Action Buttons */}
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  onClick={() => openReply('reply', m)}
                                  className="inline-flex items-center gap-1 rounded-[3px] border px-2 py-1 text-[11.5px] transition hover:bg-[var(--bg-hover)]"
                                  style={{ borderColor: c.border }}
                                >
                                  <Reply size={12} style={{ color: c.blue }} /> Reply
                                </button>
                                <button
                                  onClick={() => openReply('replyAll', m)}
                                  className="inline-flex items-center gap-1 rounded-[3px] border px-2 py-1 text-[11.5px] transition hover:bg-[var(--bg-hover)]"
                                  style={{ borderColor: c.border }}
                                >
                                  <ReplyAll size={12} style={{ color: c.blue }} /> Reply All
                                </button>
                                <button
                                  onClick={() => openReply('forward', m)}
                                  className="inline-flex items-center gap-1 rounded-[3px] border px-2 py-1 text-[11.5px] transition hover:bg-[var(--bg-hover)]"
                                  style={{ borderColor: c.border }}
                                >
                                  <Forward size={12} style={{ color: c.blue }} /> Forward
                                </button>
                              </div>
                            </div>

                            {m.calendarInvite && (
                              <div
                                className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border p-3"
                                style={{ background: c.readerHeaderBg, borderColor: c.border }}
                              >
                                <div className="flex items-center gap-2.5">
                                  <Calendar size={16} style={{ color: c.blue }} />
                                  <div>
                                    <div className="text-[12.5px] font-semibold">{m.calendarInvite.summary}</div>
                                    <div className="text-[11.5px]" style={{ color: c.textMuted }}>
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
                                  className="rounded-[3px] px-3 py-1 text-[12px] font-semibold text-white"
                                  style={{ background: c.bluePrimary }}
                                >
                                  Accept
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
                              fontFamily='"Segoe UI", Calibri, -apple-system, sans-serif'
                            />
                          </article>
                          )
                        })}
                      </div>
                    </div>
                  ) : showBriefOnEmpty ? (
                    <TodayBrief />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                      <Mail size={40} strokeWidth={1.25} style={{ color: c.textMuted, opacity: 0.45 }} />
                      <div className="text-[14px] font-medium" style={{ color: c.textSec }}>
                        Select an item to read
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowBriefOnEmpty(true)}
                          className="rounded-[3px] border px-3 py-1 text-[12px] transition hover:bg-[var(--bg-hover)]"
                          style={{ borderColor: c.border, color: c.blue }}
                        >
                          Show Today Brief
                        </button>
                        <button
                          onClick={toggleAssistant}
                          className="inline-flex items-center gap-1 rounded-[3px] border px-3 py-1 text-[12px] transition hover:bg-[var(--bg-hover)]"
                          style={{ borderColor: c.border, color: c.textSec }}
                        >
                          <Sparkles size={12} style={{ color: c.blue }} /> Ask AI Assistant
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {assistantOpen && activeView !== 'triage' && <AssistantView width={assistantWidth} />}
      </div>

      {/* 4. Classic Outlook Bottom Status Bar */}
      <footer
        className="flex h-6 shrink-0 items-center justify-between border-t px-3 text-[11px]"
        style={{ background: c.statusBg, borderColor: c.border, color: c.textMuted }}
      >
        <div className="flex items-center gap-3">
          <span>Items: {filteredSortedThreads.length}</span>
          <span>Unread: {counts.inbox || 0}</span>
          {activeAccountIds.length > 0 && (
            <button
              onClick={() => void selectAllAccounts()}
              className="hover:underline"
              style={{ color: c.blue }}
            >
              Filter: {activeAccountIds.length === 1 ? accounts.find((a) => a.id === activeAccountIds[0])?.email : `${activeAccountIds.length} accounts`} (Show all)
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>{isSyncing ? 'Updating folders…' : 'All folders are up to date. Connected.'}</span>
        </div>
      </footer>
    </div>
  )
}
