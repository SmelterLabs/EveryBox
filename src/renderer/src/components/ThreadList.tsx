import React, { useEffect, useMemo, useState } from 'react'
import {
  AlignJustify,
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Folder as FolderIcon,
  FolderInput,
  Forward,
  Inbox,
  Mail,
  MailOpen,
  Minus,
  Paperclip,
  Reply,
  ReplyAll,
  Rows2,
  Rows3,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import { getDateGroupLabel } from '../utils/dateGroups'
import { isMac } from '../utils/platform'
import { buildReplyComposerState } from '../utils/replyHelper'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'
import { AccountBadge } from './AccountIcon'
import type { InboxCategory, ListDensity, ThreadSummary } from '../../../shared/types'

type SortField = 'date' | 'sender' | 'subject' | 'unread' | 'starred' | 'account'
type SortDir = 'desc' | 'asc'

function formatTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase() || '?'
}

export const ThreadList: React.FC<{ width?: number }> = ({ width = 340 }) => {
  const {
    settings,
    settingsOpen,
    composer,
    accounts,
    folders,
    activeView,
    activeAccountIds,
    activeMailbox,
    activeCategory,
    activeFolderName,
    counts,
    threads,
    preDrafts,
    threadAiMeta,
    selectedThreadId,
    checkedThreadIds,
    parsedSearch,
    searchIncludeTrash,
    searchScopeAccountId,
    scheduledEmails,
    setActiveCategory,
    selectThread,
    selectAllAccounts,
    runSearch,
    clearSearch,
    setSearchIncludeTrash,
    setSearchScopeAccountId,
    openComposer,
    openConfirm,
    toggleCheckThread,
    checkThreadRange,
    setCheckedThreads,
    clearCheckedThreads,
    archiveThreads,
    trashThreads,
    moveThreadsToFolder,
    snoozeThreads,
    toggleStarThread,
    setStarredThreads,
    setReadThreads,
    requestSummarizeThread,
    requestDraftReply,
    createReminder,
    saveSettings,
    showToast,
    refreshAll
  } = useAppStore()

  const soloAccountFolderName =
    !activeFolderName && activeAccountIds.length === 1
      ? folders.find((f) => f.accountId === activeAccountIds[0] && f.role === activeMailbox)?.name
      : undefined
  const mailboxTitle =
    activeFolderName || soloAccountFolderName || activeMailbox.charAt(0).toUpperCase() + activeMailbox.slice(1)
  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLElement>('list')
  const [inboxFilter, setInboxFilter] = useState('')
  const [showListFilter, setShowListFilter] = useState(false)
  const [showDensityMenu, setShowDensityMenu] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const showDateGroups = settings?.showDateGroups !== false
  const accountRowStyle = settings?.accountRowStyle || 'gradient'
  const listDensity: ListDensity = settings?.listDensity || 'expanded'
  const showAccountTint = accounts.length > 1 && activeAccountIds.length !== 1

  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = localStorage.getItem('everybox:sortField') as SortField | null
    return saved && ['date', 'sender', 'subject', 'unread', 'starred', 'account'].includes(saved) ? saved : 'date'
  })
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    const saved = localStorage.getItem('everybox:sortDir') as SortDir | null
    return saved === 'asc' || saved === 'desc' ? saved : 'desc'
  })

  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      const nextDir: SortDir = sortDir === 'desc' ? 'asc' : 'desc'
      setSortDir(nextDir)
      localStorage.setItem('everybox:sortDir', nextDir)
    } else {
      setSortField(field)
      localStorage.setItem('everybox:sortField', field)
      const defaultDir: SortDir = field === 'sender' || field === 'subject' || field === 'account' ? 'asc' : 'desc'
      setSortDir(defaultDir)
      localStorage.setItem('everybox:sortDir', defaultDir)
    }
  }

  const sortedThreads = useMemo(() => {
    const resolveCorrespondent = (t: ThreadSummary) => {
      const selfEmail = (t.accountEmail || '').toLowerCase()
      const latestIsSelf =
        Boolean(t.waitingSince) || (t.latestFrom.email || '').toLowerCase() === selfEmail
      if (latestIsSelf) {
        const external =
          t.latestExternalFrom ||
          t.participants.find((p) => p.email && p.email.toLowerCase() !== selfEmail)
        if (external) return external
      }
      return t.latestFrom
    }

    const q = inboxFilter.trim().toLowerCase()
    const copy = q
      ? threads.filter((t) => {
          const corr = resolveCorrespondent(t)
          const hay = `${t.latestFrom.name} ${t.latestFrom.email} ${corr.name} ${corr.email} ${t.subject} ${t.snippet} ${t.accountEmail}`.toLowerCase()
          return hay.includes(q)
        })
      : [...threads]
    const mult = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        cmp = a.lastMessageAt - b.lastMessageAt
      } else if (sortField === 'sender') {
        const ca = resolveCorrespondent(a)
        const cb = resolveCorrespondent(b)
        const sa = (ca.name || ca.email || '').toLowerCase()
        const sb = (cb.name || cb.email || '').toLowerCase()
        cmp = sa.localeCompare(sb)
      } else if (sortField === 'subject') {
        const sa = (a.subject || '').replace(/^(re|fwd|fw):\s*/gi, '').toLowerCase()
        const sb = (b.subject || '').replace(/^(re|fwd|fw):\s*/gi, '').toLowerCase()
        cmp = sa.localeCompare(sb)
      } else if (sortField === 'unread') {
        cmp = (a.isRead ? 0 : 1) - (b.isRead ? 0 : 1)
      } else if (sortField === 'starred') {
        cmp = (a.isStarred ? 1 : 0) - (b.isStarred ? 1 : 0)
      } else if (sortField === 'account') {
        cmp = a.accountEmail.toLowerCase().localeCompare(b.accountEmail.toLowerCase())
      }
      if (cmp !== 0) return cmp * mult
      return b.lastMessageAt - a.lastMessageAt
    })
    return copy
  }, [threads, inboxFilter, sortField, sortDir])

  const grouped = useMemo(() => {
    if (!showDateGroups) {
      return { '': sortedThreads }
    }
    if (sortField !== 'date') {
      const labels: Record<SortField, string> = {
        date: 'Date',
        sender: 'Sender',
        subject: 'Subject',
        unread: 'Unread',
        starred: 'Starred',
        account: 'Account'
      }
      const dirLabel =
        sortField === 'sender' || sortField === 'subject' || sortField === 'account'
          ? sortDir === 'asc'
            ? 'A–Z'
            : 'Z–A'
          : sortDir === 'desc'
            ? 'First'
            : 'Last'
      return { [`Sorted by ${labels[sortField]} (${dirLabel})`]: sortedThreads }
    }
    const now = new Date()
    return sortedThreads.reduce<Record<string, ThreadSummary[]>>((acc, t) => {
      const b = getDateGroupLabel(t.lastMessageAt, now)
      if (!acc[b]) acc[b] = []
      acc[b].push(t)
      return acc
    }, {})
  }, [sortedThreads, sortField, sortDir, showDateGroups])

  const visibleThreadIds = useMemo(() => {
    const ids: string[] = []
    for (const [bucket, items] of Object.entries(grouped)) {
      if (bucket && collapsedGroups[bucket]) continue
      for (const t of items) ids.push(t.id)
    }
    return ids
  }, [grouped, collapsedGroups])

  const isSelecting = checkedThreadIds.length > 0
  const checkedSet = useMemo(() => new Set(checkedThreadIds), [checkedThreadIds])
  const preDraftThreadIds = useMemo(
    () => new Set(preDrafts.filter((p) => p.status !== 'dismissed').map((p) => p.threadId)),
    [preDrafts]
  )
  const allVisibleSelected =
    visibleThreadIds.length > 0 && visibleThreadIds.every((id) => checkedSet.has(id))
  const selectedThreadObjs = useMemo(
    () => threads.filter((t) => checkedSet.has(t.id)),
    [threads, checkedSet]
  )
  const anySelectedUnread = selectedThreadObjs.some((t) => !t.isRead)
  const anySelectedUnstarred = selectedThreadObjs.some((t) => !t.isStarred)

  // Ctrl+A / Cmd+A selects all visible emails when not typing or inside the reading pane
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen || composer.open || activeView !== 'mail' || activeMailbox === 'scheduled') return
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'a') return

      const target = e.target as HTMLElement | null
      const inInput =
        Boolean(target) &&
        (target!.tagName === 'INPUT' || target!.tagName === 'TEXTAREA' || target!.isContentEditable)
      if (inInput) return
      if (target?.closest('[data-reading-pane="true"]')) return

      if (visibleThreadIds.length === 0) return
      e.preventDefault()
      setCheckedThreads(visibleThreadIds)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen, composer.open, activeView, activeMailbox, visibleThreadIds, setCheckedThreads])

  const categories: { id: InboxCategory; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'people', label: 'People', count: counts.people },
    { id: 'updates', label: 'Updates', count: counts.updates }
  ]

  const copyCode = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation()
    await window.glassmail.copyText(code.replace(/\s+/g, ''), `Copied sign-in code ${code}`)
    showToast(`Copied code ${code}`)
  }

  const openThreadReply = async (threadId: string, mode: 'reply' | 'replyAll' | 'forward') => {
    const detail = await window.glassmail.getThread(threadId)
    if (!detail) return
    openComposer(buildReplyComposerState(detail, mode))
  }

  const handleThreadContextMenu = (e: React.MouseEvent, t: ThreadSummary) => {
    e.preventDefault()
    e.stopPropagation()

    const isBulk = checkedSet.has(t.id) && checkedThreadIds.length > 1
    const targetIds = isBulk ? checkedThreadIds : [t.id]
    const targetThreads = isBulk ? selectedThreadObjs : [t]
    const n = targetIds.length
    const anyUnread = targetThreads.some((x) => !x.isRead)
    const anyUnstarred = targetThreads.some((x) => !x.isStarred)

    // Snooze timestamps
    const now = new Date()
    const laterToday = Date.now() + 3 * 3600_000
    const tomorrowMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0).getTime()
    const daysToSat = (6 - now.getDay() + 7) % 7 || 7
    const thisWeekend = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToSat, 9, 0, 0).getTime()
    const daysToMon = (1 - now.getDay() + 7) % 7 || 7
    const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMon, 9, 0, 0).getTime()

    // Custom folders available for target accounts (all folders, sorted A-Z; submenu scrolls + filters)
    const targetAccIds = new Set(targetThreads.map((x) => x.accountId))
    const customFolderNames = Array.from(
      new Set(
        folders
          .filter((f) => f.role === 'custom' && targetAccIds.has(f.accountId))
          .map((f) => f.name)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

    const moveChildren: ContextMenuItem[] = [
      {
        label: 'Inbox',
        icon: <Inbox size={13} />,
        onClick: () => void moveThreadsToFolder(targetIds, 'inbox', 'Inbox')
      },
      {
        label: 'Archive',
        icon: <Archive size={13} />,
        onClick: () => void archiveThreads(targetIds)
      },
      {
        label: 'Junk / Spam',
        icon: <ShieldAlert size={13} />,
        onClick: () => void moveThreadsToFolder(targetIds, 'junk', 'Junk')
      },
      {
        label: 'Trash',
        icon: <Trash2 size={13} />,
        onClick: () => void trashThreads(targetIds)
      }
    ]
    if (customFolderNames.length > 0) {
      moveChildren.push({ type: 'separator' })
      for (const name of customFolderNames) {
        moveChildren.push({
          label: name,
          icon: <FolderIcon size={13} />,
          onClick: () => void moveThreadsToFolder(targetIds, 'custom', name)
        })
      }
    }

    const items: ContextMenuItem[] = []

    if (isBulk) {
      items.push({ type: 'header', label: `${n} emails selected` })
    } else {
      items.push(
        {
          label: 'Reply',
          icon: <Reply size={13} />,
          shortcut: 'R',
          onClick: () => void openThreadReply(t.id, 'reply')
        },
        {
          label: 'Reply all',
          icon: <ReplyAll size={13} />,
          onClick: () => void openThreadReply(t.id, 'replyAll')
        },
        {
          label: 'Forward',
          icon: <Forward size={13} />,
          onClick: () => void openThreadReply(t.id, 'forward')
        },
        {
          label: 'Open in new window',
          icon: <ExternalLink size={13} />,
          onClick: () => void window.glassmail.openThreadWindow(t.id)
        },
        { type: 'separator' }
      )
    }

    items.push(
      {
        label: anyUnread
          ? isBulk
            ? `Mark ${n} as read`
            : 'Mark as read'
          : isBulk
            ? `Mark ${n} as unread`
            : 'Mark as unread',
        icon: anyUnread ? <MailOpen size={13} /> : <Mail size={13} />,
        onClick: () => void setReadThreads(targetIds, anyUnread)
      },
      {
        label: anyUnstarred
          ? isBulk
            ? `Star ${n} emails`
            : 'Star'
          : isBulk
            ? `Remove star from ${n}`
            : 'Remove star',
        icon: (
          <Star
            size={13}
            fill={!anyUnstarred ? '#f5b841' : 'none'}
            style={{ color: !anyUnstarred ? '#f5b841' : 'currentColor' }}
          />
        ),
        shortcut: 'S',
        onClick: () => void setStarredThreads(targetIds, anyUnstarred)
      },
      {
        label: 'Remind me',
        icon: <Bell size={13} />,
        children: [
          {
            label: 'In 10 minutes',
            onClick: () =>
              void createReminder({
                accountId: t.accountId,
                threadId: t.id,
                threadSubject: t.subject,
                threadSender: t.latestFrom.name || t.latestFrom.email,
                title: t.subject || 'Follow up',
                dueAt: Date.now() + 10 * 60_000
              })
          },
          {
            label: 'In 30 minutes',
            onClick: () =>
              void createReminder({
                accountId: t.accountId,
                threadId: t.id,
                threadSubject: t.subject,
                threadSender: t.latestFrom.name || t.latestFrom.email,
                title: t.subject || 'Follow up',
                dueAt: Date.now() + 30 * 60_000
              })
          },
          {
            label: 'In 1 hour',
            onClick: () =>
              void createReminder({
                accountId: t.accountId,
                threadId: t.id,
                threadSubject: t.subject,
                threadSender: t.latestFrom.name || t.latestFrom.email,
                title: t.subject || 'Follow up',
                dueAt: Date.now() + 60 * 60_000
              })
          },
          {
            label: 'Tomorrow morning',
            onClick: () =>
              void createReminder({
                accountId: t.accountId,
                threadId: t.id,
                threadSubject: t.subject,
                threadSender: t.latestFrom.name || t.latestFrom.email,
                title: t.subject || 'Follow up',
                dueAt: tomorrowMorning
              })
          },
          {
            label: 'Next week',
            onClick: () =>
              void createReminder({
                accountId: t.accountId,
                threadId: t.id,
                threadSubject: t.subject,
                threadSender: t.latestFrom.name || t.latestFrom.email,
                title: t.subject || 'Follow up',
                dueAt: nextWeek
              })
          },
          { type: 'separator' },
          {
            label: 'In 2 days if no reply',
            onClick: () =>
              void createReminder({
                accountId: t.accountId,
                threadId: t.id,
                threadSubject: t.subject,
                threadSender: t.latestFrom.name || t.latestFrom.email,
                title: `Follow up: ${t.subject || t.latestFrom.name}`,
                dueAt: Date.now() + 48 * 3600_000,
                onlyIfNoReply: true
              })
          }
        ]
      },
      {
        label: 'Snooze',
        icon: <Clock size={13} />,
        children: [
          {
            label: 'Later today (+3h)',
            onClick: () => void snoozeThreads(targetIds, laterToday, 'Later today')
          },
          {
            label: 'Tomorrow morning',
            onClick: () => void snoozeThreads(targetIds, tomorrowMorning, 'Tomorrow morning')
          },
          {
            label: 'This weekend',
            onClick: () => void snoozeThreads(targetIds, thisWeekend, 'This weekend')
          },
          {
            label: 'Next week',
            onClick: () => void snoozeThreads(targetIds, nextWeek, 'Next week')
          }
        ]
      },
      {
        label: 'Move to',
        icon: <FolderInput size={13} />,
        children: moveChildren
      },
      {
        label: isBulk ? `Archive ${n} emails` : 'Archive',
        icon: <Archive size={13} />,
        shortcut: 'E',
        onClick: () => void archiveThreads(targetIds)
      },
      {
        label: isBulk ? `Delete ${n} emails` : 'Delete',
        icon: <Trash2 size={13} />,
        shortcut: 'Del',
        danger: true,
        onClick: () => void trashThreads(targetIds)
      }
    )

    if (!isBulk) {
      const selfEmail = (t.accountEmail || '').toLowerCase()
      const latestIsSelf =
        Boolean(t.waitingSince) || (t.latestFrom.email || '').toLowerCase() === selfEmail
      const correspondent =
        latestIsSelf && activeMailbox !== 'sent'
          ? t.latestExternalFrom ||
            t.participants.find((p) => p.email && p.email.toLowerCase() !== selfEmail) ||
            t.latestFrom
          : t.latestFrom
      const senderEmail = correspondent.email
      const senderLabel = correspondent.name || senderEmail
      items.push(
        { type: 'separator' },
        {
          label: 'Draft reply with AI',
          icon: <Sparkles size={13} />,
          onClick: () => void requestDraftReply(t.id)
        },
        {
          label: 'Summarize with AI',
          icon: <Sparkles size={13} />,
          onClick: () => void requestSummarizeThread(t.id)
        }
      )
      if (senderEmail) {
        const lowerSender = senderEmail.toLowerCase()
        const excluded = (settings?.autopilot?.preDraftExcludedSenders || []).map((s) => s.toLowerCase())
        const alwaysList = (settings?.autopilot?.preDraftAlwaysSenders || []).map((s) => s.toLowerCase())
        const isMutedPreDraft = excluded.includes(lowerSender)
        const isAlwaysPreDraft = alwaysList.includes(lowerSender)
        if (isAlwaysPreDraft) {
          items.push({
            label: `Stop always auto-drafting for ${senderLabel}`,
            icon: <Sparkles size={13} />,
            onClick: async () => {
              if (!settings) return
              const prevSettings = settings
              const nextAlways = (settings.autopilot?.preDraftAlwaysSenders || []).filter(
                (s) => s.toLowerCase() !== lowerSender
              )
              await saveSettings({
                ...settings,
                autopilot: {
                  ...settings.autopilot,
                  autoPreDraftPeople: Boolean(settings.autopilot?.autoPreDraftPeople),
                  preDraftDisabledAccountIds: settings.autopilot?.preDraftDisabledAccountIds || [],
                  preDraftAlwaysSenders: nextAlways,
                  preDraftExcludedSenders: settings.autopilot?.preDraftExcludedSenders || [],
                  waitingDismissedThreadIds: settings.autopilot?.waitingDismissedThreadIds || [],
                  autoClean2FAHours: settings.autopilot?.autoClean2FAHours ?? null
                }
              })
              await refreshAll()
              showToast(`Removed ${senderEmail} from Always auto-draft`, async () => {
                await saveSettings(prevSettings)
                await refreshAll()
              })
            }
          })
        }
        if (preDraftThreadIds.has(t.id) || isMutedPreDraft) {
          items.push({
            label: isMutedPreDraft ? `Allow pre-drafts for ${senderLabel}` : `Don't pre-draft for ${senderLabel}`,
            icon: <Sparkles size={13} />,
            onClick: async () => {
              if (!settings) return
              const prevList = settings.autopilot?.preDraftExcludedSenders || []
              const nextList = isMutedPreDraft
                ? prevList.filter((s) => s.toLowerCase() !== lowerSender)
                : Array.from(new Set([...prevList, lowerSender]))
              const nextAlways = isMutedPreDraft
                ? settings.autopilot?.preDraftAlwaysSenders || []
                : (settings.autopilot?.preDraftAlwaysSenders || []).filter(
                    (s) => s.toLowerCase() !== lowerSender
                  )
              const prevSettings = settings
              await saveSettings({
                ...settings,
                autopilot: {
                  ...settings.autopilot,
                  autoPreDraftPeople: Boolean(settings.autopilot?.autoPreDraftPeople),
                  preDraftDisabledAccountIds: settings.autopilot?.preDraftDisabledAccountIds || [],
                  preDraftAlwaysSenders: nextAlways,
                  preDraftExcludedSenders: nextList,
                  waitingDismissedThreadIds: settings.autopilot?.waitingDismissedThreadIds || [],
                  autoClean2FAHours: settings.autopilot?.autoClean2FAHours ?? null
                }
              })
              let removedCount = 0
              if (!isMutedPreDraft) {
                const purged = await window.glassmail.deletePreDraftsBySender(lowerSender)
                removedCount = purged.removed
                if (preDraftThreadIds.has(t.id)) {
                  await window.glassmail.deletePreDraft(t.id)
                }
              }
              await refreshAll()
              const clearedSuffix = removedCount > 1 ? ` (cleared ${removedCount} drafts)` : ''
              showToast(
                isMutedPreDraft
                  ? `Re-enabled pre-drafts for ${senderEmail}`
                  : `Won't pre-draft replies for ${senderEmail}${clearedSuffix}`,
                async () => {
                  await saveSettings(prevSettings)
                  await refreshAll()
                }
              )
            }
          })
        }
        items.push(
          {
            label: `Find all from ${senderLabel}`,
            icon: <Search size={13} />,
            onClick: () => void runSearch(`from:${senderEmail}`)
          },
          {
            label: `Select all from ${senderLabel}`,
            icon: <CheckSquare size={13} />,
            onClick: () => {
              const matching = sortedThreads
                .filter((x) => x.latestFrom.email.toLowerCase() === senderEmail.toLowerCase())
                .map((x) => x.id)
              if (matching.length > 0) {
                setCheckedThreads(matching)
                showToast(`Selected ${matching.length} email${matching.length === 1 ? '' : 's'} from ${senderLabel}`, undefined, 2500)
              }
            }
          },
          {
            label: 'Copy sender email',
            icon: <Copy size={13} />,
            onClick: async () => {
              await window.glassmail.copyText(senderEmail, 'Copied sender email')
              showToast(`Copied ${senderEmail}`, undefined, 2500)
            }
          }
        )
      }
      if (t.subject) {
        items.push({
          label: 'Copy subject',
          icon: <Copy size={13} />,
          onClick: async () => {
            await window.glassmail.copyText(t.subject, 'Copied subject')
            showToast('Copied subject', undefined, 2500)
          }
        })
      }
    }

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  return (
    <section
      ref={zoomRef}
      onClick={() => {
        if (showDensityMenu) setShowDensityMenu(false)
      }}
      className="relative flex h-full shrink-0 flex-col border-r"
      style={{ width, background: 'var(--bg-list)', borderColor: 'var(--border-subtle)' }}
    >
      {zoomBadge}
      <div className="flex min-h-0 flex-1 flex-col" style={{ zoom }}>
      {/* Header */}
      <div className="border-b px-4 pb-3 pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-semibold leading-tight tracking-tight">
              {parsedSearch ? 'Search' : mailboxTitle}
            </h2>
            <p className="mt-1 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              {parsedSearch
                ? `${sortedThreads.length} result${sortedThreads.length === 1 ? '' : 's'}`
                : activeMailbox === 'inbox'
                  ? `${counts.inbox || 0} unread`
                  : `${threads.length} conversations`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {activeMailbox !== 'scheduled' && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setShowDensityMenu((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:bg-[var(--bg-hover)]"
                  style={{
                    borderColor: showDensityMenu ? 'var(--accent)' : 'var(--border-subtle)',
                    background: showDensityMenu ? 'var(--accent-soft)' : 'transparent',
                    color: showDensityMenu ? 'var(--accent-text)' : 'var(--text-secondary)'
                  }}
                  title={`List view: ${listDensity === 'compact' ? 'Compact (1 line)' : listDensity === 'comfortable' ? 'Comfortable (2 lines)' : 'Expanded (3 lines)'}`}
                  aria-label="Change message list density"
                  aria-expanded={showDensityMenu}
                >
                  {listDensity === 'compact' ? (
                    <AlignJustify size={13} />
                  ) : listDensity === 'comfortable' ? (
                    <Rows2 size={13} />
                  ) : (
                    <Rows3 size={13} />
                  )}
                </button>
                {showDensityMenu && (
                  <div
                    className="absolute right-0 top-9 z-40 w-56 rounded-xl border p-1.5 shadow-2xl"
                    style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                  >
                    <div
                      className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      List density
                    </div>
                    {(
                      [
                        { id: 'compact', label: 'Compact', desc: 'Sender only · 1 line', icon: <AlignJustify size={13} /> },
                        { id: 'comfortable', label: 'Comfortable', desc: 'Sender & subject · 2 lines', icon: <Rows2 size={13} /> },
                        { id: 'expanded', label: 'Expanded', desc: 'With preview · 3 lines', icon: <Rows3 size={13} /> }
                      ] as { id: ListDensity; label: string; desc: string; icon: React.ReactNode }[]
                    ).map((opt) => {
                      const active = listDensity === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setShowDensityMenu(false)
                            if (settings) {
                              void saveSettings({ ...settings, listDensity: opt.id })
                            }
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-[var(--bg-hover)]"
                          style={{ background: active ? 'var(--accent-soft)' : undefined }}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span style={{ color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                              {opt.icon}
                            </span>
                            <span className="min-w-0">
                              <span
                                className="block text-[12.5px] font-medium"
                                style={{ color: active ? 'var(--accent-text)' : 'var(--text-primary)' }}
                              >
                                {opt.label}
                              </span>
                              <span className="block text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                                {opt.desc}
                              </span>
                            </span>
                          </span>
                          {active && <Check size={13} className="shrink-0" style={{ color: 'var(--accent-text)' }} />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {activeMailbox !== 'scheduled' && (
              <button
                type="button"
                onClick={() => {
                  setShowDensityMenu(false)
                  if (showListFilter && !inboxFilter) {
                    setShowListFilter(false)
                  } else {
                    setShowListFilter(true)
                  }
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:bg-[var(--bg-hover)]"
                style={{
                  borderColor: showListFilter || inboxFilter ? 'var(--accent)' : 'var(--border-subtle)',
                  background: showListFilter || inboxFilter ? 'var(--accent-soft)' : 'transparent',
                  color: showListFilter || inboxFilter ? 'var(--accent-text)' : 'var(--text-secondary)'
                }}
                title={`Filter this ${mailboxTitle.toLowerCase()}`}
                aria-label={`Filter this ${mailboxTitle.toLowerCase()}`}
                aria-expanded={showListFilter || Boolean(inboxFilter)}
              >
                <SlidersHorizontal size={13} />
              </button>
            )}
            {(activeMailbox === 'trash' || activeMailbox === 'junk') && threads.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const count = threads.length
                  openConfirm({
                    title: `Empty ${mailboxTitle}?`,
                    description: `This will permanently delete ${count} conversation${count === 1 ? '' : 's'} in ${mailboxTitle}. This action cannot be undone.`,
                    confirmLabel: `Empty ${mailboxTitle}`,
                    danger: true,
                    onConfirm: async () => {
                      await window.glassmail.emptyFolder(
                        activeMailbox,
                        activeAccountIds.length ? activeAccountIds : undefined
                      )
                      await refreshAll()
                      showToast(`Emptied ${mailboxTitle}`)
                    }
                  })
                }}
                className="shrink-0 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition hover:opacity-85"
                style={{ background: 'rgba(209, 52, 56, 0.12)', color: 'var(--danger)' }}
              >
                Empty {mailboxTitle}
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Scoped List Filter (hidden until toggled or active) */}
        {activeMailbox !== 'scheduled' && (showListFilter || inboxFilter) && (
          <div
            className="mt-2.5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            <Search size={13} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
            <input
              autoFocus
              value={inboxFilter}
              onChange={(e) => setInboxFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setInboxFilter('')
                  setShowListFilter(false)
                }
              }}
              placeholder={
                activeAccountIds.length === 1
                  ? `Filter ${accounts.find((a) => a.id === activeAccountIds[0])?.name || 'this'} ${mailboxTitle.toLowerCase()}…`
                  : `Filter this ${mailboxTitle.toLowerCase()}…`
              }
              aria-label={`Filter ${mailboxTitle}`}
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => {
                setInboxFilter('')
                setShowListFilter(false)
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="Close filter (Esc)"
              aria-label="Close filter"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Active Account Focus Strip (for mailbox view) or Search Scope Strip (for search view) */}
        {parsedSearch && searchScopeAccountId ? (() => {
          const scopedAcc = accounts.find((x) => x.id === searchScopeAccountId)
          if (!scopedAcc) return null
          return (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: scopedAcc.color }} />
                Searching {scopedAcc.name}
              </span>
              <button
                type="button"
                onClick={() => void setSearchScopeAccountId(null)}
                className="text-[10.5px] font-medium hover:underline"
                style={{ color: 'var(--accent-text)' }}
              >
                Search all accounts
              </button>
            </div>
          )
        })() : !parsedSearch && activeAccountIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {activeAccountIds.map((id) => {
              const a = accounts.find((x) => x.id === id)
              if (!a) return null
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </span>
              )
            })}
            <button
              onClick={() => void selectAllAccounts()}
              className="text-[10.5px] font-medium hover:underline"
              style={{ color: 'var(--accent-text)' }}
            >
              Show all
            </button>
          </div>
        ) : null}

        {/* People / Updates / All Tabs + Right-Aligned Sort Tabs */}
        {activeMailbox !== 'scheduled' && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">
            {activeMailbox === 'inbox' && !parsedSearch ? (
              <div className="flex items-center gap-1">
                {categories.map((c) => {
                  const active = activeCategory === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => void setActiveCategory(c.id)}
                      className="rounded-md px-2.5 py-1 text-[12px] font-medium transition"
                      style={{
                        background: active ? 'var(--bg-elevated)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-muted)'
                      }}
                    >
                      {c.label}
                      {c.count ? <span className="ml-1 opacity-70">{c.count}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div />
            )}

            <div className="ml-auto flex items-center gap-0.5">
              {(
                [
                  { id: 'date', label: 'Date' },
                  { id: 'sender', label: 'Sender' },
                  { id: 'subject', label: 'Subject' }
                ] as { id: SortField; label: string }[]
              ).map((s) => {
                const active = sortField === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSortClick(s.id)}
                    className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition hover:bg-[var(--bg-hover)]"
                    style={{
                      background: active ? 'var(--bg-elevated)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}
                    title={
                      active
                        ? `Sorted by ${s.label} (${sortDir === 'desc' ? 'descending' : 'ascending'}) — click to flip`
                        : `Sort by ${s.label}`
                    }
                  >
                    <span>{s.label}</span>
                    {active && (sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Natural-Language Search Pills + Include Trash & Junk Toggle */}
        {parsedSearch && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {parsedSearch.pills.map((p) => (
              <span
                key={`${p.key}-${p.value}`}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                {p.label}
              </span>
            ))}
            {!parsedSearch.folder && (
              <button
                type="button"
                onClick={() => void setSearchIncludeTrash(!searchIncludeTrash)}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                style={{
                  borderColor: searchIncludeTrash ? 'var(--danger)' : 'var(--border-subtle)',
                  background: searchIncludeTrash ? 'rgba(229, 83, 75, 0.12)' : 'var(--bg-elevated)',
                  color: searchIncludeTrash ? 'var(--danger)' : 'var(--text-muted)'
                }}
                title={
                  searchIncludeTrash
                    ? 'Showing Trash & Junk in search results — click to hide'
                    : 'Click to also include deleted and junk emails in search results'
                }
              >
                <Trash2 size={10} />
                <span>{searchIncludeTrash ? 'Including Trash & Junk' : 'Include Trash & Junk'}</span>
              </button>
            )}
            <button
              onClick={() => void clearSearch()}
              className="ml-auto inline-flex items-center gap-0.5 text-[11px] hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={11} /> Clear
            </button>
          </div>
        )}

        {/* Bulk Multi-Select Bar */}
        {isSelecting && (
          <div
            className="mt-2 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[12px]"
            style={{ background: 'var(--bg-selected)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (allVisibleSelected) {
                    clearCheckedThreads()
                  } else {
                    setCheckedThreads(visibleThreadIds)
                  }
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded transition hover:opacity-90"
                style={{
                  background: 'var(--accent)',
                  color: '#fff'
                }}
                title={allVisibleSelected ? 'Deselect all' : `Select all ${visibleThreadIds.length} visible (${isMac ? '⌘A' : 'Ctrl+A'})`}
              >
                {allVisibleSelected ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
              </button>
              <span className="truncate font-medium">
                {allVisibleSelected && visibleThreadIds.length > 1
                  ? `All ${checkedThreadIds.length} selected`
                  : `${checkedThreadIds.length} selected`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => void setReadThreads(checkedThreadIds, anySelectedUnread)}
                className="rounded p-1 transition hover:bg-[var(--bg-hover)]"
                title={anySelectedUnread ? 'Mark selected as read' : 'Mark selected as unread'}
              >
                {anySelectedUnread ? <MailOpen size={14} /> : <Mail size={14} />}
              </button>
              <button
                type="button"
                onClick={() => void setStarredThreads(checkedThreadIds, anySelectedUnstarred)}
                className="rounded p-1 transition hover:bg-[var(--bg-hover)]"
                title={anySelectedUnstarred ? 'Star selected' : 'Remove star from selected'}
              >
                <Star
                  size={14}
                  fill={!anySelectedUnstarred ? '#f5b841' : 'none'}
                  style={{ color: !anySelectedUnstarred ? '#f5b841' : 'currentColor' }}
                />
              </button>
              <button
                type="button"
                onClick={() => void snoozeThreads(checkedThreadIds, Date.now() + 24 * 3600_000, 'Tomorrow')}
                className="rounded p-1 transition hover:bg-[var(--bg-hover)]"
                title="Snooze selected until tomorrow (H)"
              >
                <Clock size={14} />
              </button>
              <button
                type="button"
                onClick={() => void archiveThreads(checkedThreadIds)}
                className="rounded p-1 transition hover:bg-[var(--bg-hover)]"
                title="Archive selected (E)"
              >
                <Archive size={14} />
              </button>
              <button
                type="button"
                onClick={() => void trashThreads(checkedThreadIds)}
                className="rounded p-1 transition hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                title="Delete selected (Del)"
              >
                <Trash2 size={14} />
              </button>
              <button
                type="button"
                onClick={clearCheckedThreads}
                className="ml-0.5 rounded p-1 transition hover:bg-[var(--bg-hover)]"
                title="Clear selection (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scheduled Mailbox Special View */}
      {activeMailbox === 'scheduled' ? (
        <div className="flex-1 overflow-y-auto p-3">
          {scheduledEmails.length === 0 ? (
            <p className="mt-10 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              No scheduled messages waiting to send.
            </p>
          ) : (
            <div className="space-y-2">
              {scheduledEmails.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border p-3"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[13px] font-semibold">{s.subject || '(No subject)'}</span>
                    <button
                      onClick={async () => {
                        await window.glassmail.cancelScheduledEmail(s.id)
                        await refreshAll()
                      }}
                      className="text-[11px] font-medium hover:underline"
                      style={{ color: 'var(--danger)' }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mt-1 truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    To: {s.to.join(', ')}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: 'var(--accent-text)' }}>
                    Sends {new Date(s.sendAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Normal Thread List */
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sortedThreads.length === 0 ? (
            <div className="mt-16 px-6 text-center">
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                All clear here
              </p>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                No conversations match the current filter.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([bucket, items]) => {
              const isCollapsed = bucket ? Boolean(collapsedGroups[bucket]) : false
              return (
              <div key={bucket || 'all'} className="mb-2.5">
                {bucket && (
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((prev) => ({ ...prev, [bucket]: !prev[bucket] }))
                    }
                    className="mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-left text-[11.5px] font-semibold transition hover:opacity-90"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      <span>{bucket}</span>
                    </span>
                    {isCollapsed && (
                      <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
                        {items.length}
                      </span>
                    )}
                  </button>
                )}
                {!isCollapsed && (
                <div className={listDensity === 'compact' ? 'space-y-0.5' : 'space-y-1'} role="listbox" aria-label={mailboxTitle}>
                  {items.map((t) => {
                    const isSelected = selectedThreadId === t.id
                    const isChecked = checkedThreadIds.includes(t.id)
                    const aiMeta = threadAiMeta[t.id]
                    const hasPreDraft = preDraftThreadIds.has(t.id)
                    const showUrgency = Boolean(aiMeta && aiMeta.urgency >= 2)
                    const showNeedsReply = Boolean(aiMeta && aiMeta.needsReply && aiMeta.urgency >= 1)
                    const selfEmail = (t.accountEmail || '').toLowerCase()
                    const sentOrDraftRecipient =
                      activeMailbox === 'sent' || activeMailbox === 'drafts'
                        ? t.participants.find(
                            (p) => p.email && p.email.toLowerCase() !== selfEmail
                          )
                        : undefined
                    const latestIsSelf =
                      activeMailbox !== 'sent' &&
                      activeMailbox !== 'drafts' &&
                      (Boolean(t.waitingSince) || (t.latestFrom.email || '').toLowerCase() === selfEmail)
                    const repliedCorrespondent = latestIsSelf
                      ? t.latestExternalFrom ||
                        t.participants.find((p) => p.email && p.email.toLowerCase() !== selfEmail)
                      : undefined
                    const showRepliedIndicator = Boolean(latestIsSelf && repliedCorrespondent)
                    const displayParty = sentOrDraftRecipient
                      ? `To: ${sentOrDraftRecipient.name || sentOrDraftRecipient.email}`
                      : activeMailbox === 'drafts'
                        ? '(No recipient)'
                        : repliedCorrespondent
                          ? repliedCorrespondent.name || repliedCorrespondent.email
                          : t.latestFrom.name || t.latestFrom.email
                    const avatarParty = sentOrDraftRecipient
                      ? sentOrDraftRecipient.name || sentOrDraftRecipient.email
                      : repliedCorrespondent
                        ? repliedCorrespondent.name || repliedCorrespondent.email
                        : t.latestFrom.name || t.latestFrom.email
                    const hasAccountWash = showAccountTint && accountRowStyle === 'gradient'
                    const hasAccountBar = showAccountTint && (accountRowStyle === 'gradient' || accountRowStyle === 'bar')
                    const rowBackground = isSelected
                      ? hasAccountWash
                        ? `linear-gradient(90deg, color-mix(in srgb, ${t.accountColor} 16%, var(--bg-selected)) 0%, var(--bg-selected) 58%)`
                        : 'var(--bg-selected)'
                      : isChecked
                        ? 'var(--bg-elevated)'
                        : hasAccountWash
                          ? `linear-gradient(90deg, color-mix(in srgb, ${t.accountColor} 12%, transparent) 0%, color-mix(in srgb, ${t.accountColor} 4%, transparent) 38%, transparent 72%)`
                          : 'transparent'

                    return (
                      <div
                        key={t.id}
                        role="option"
                        aria-selected={isSelected}
                        onClick={async () => {
                          if (activeMailbox === 'drafts') {
                            const detail = await window.glassmail.getThread(t.id)
                            const msg =
                              [...(detail?.messages || [])].reverse().find((m) => m.isDraft) ||
                              detail?.messages[detail.messages.length - 1]
                            if (detail && msg) {
                              openComposer({
                                mode: detail.messages.length > 1 ? 'reply' : 'new',
                                accountId: detail.accountId,
                                to: msg.to.map((p) => p.email).filter(Boolean).join(', '),
                                cc: msg.cc.map((p) => p.email).filter(Boolean).join(', '),
                                bcc: msg.bcc.map((p) => p.email).filter(Boolean).join(', '),
                                subject: msg.subject || detail.subject,
                                body: msg.bodyText || '',
                                replyToThreadId: detail.messages.length > 1 ? detail.id : undefined,
                                draftThreadId: detail.messages.length === 1 ? detail.id : undefined,
                                draftRemoteId: msg.remoteId,
                                attachments: msg.attachments
                                  .filter((a) => !a.isInline)
                                  .map((a) => ({
                                    id: a.id,
                                    filename: a.filename,
                                    mimeType: a.mimeType,
                                    size: a.size,
                                    localPath: a.localPath,
                                    remoteMessageId: msg.remoteId,
                                    remoteAttachmentId: a.remoteAttachmentId
                                  }))
                              })
                              return
                            }
                          }
                          void selectThread(t.id)
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          void window.glassmail.openThreadWindow(t.id)
                        }}
                        onContextMenu={(e) => handleThreadContextMenu(e, t)}
                        className={`group relative flex cursor-pointer overflow-hidden transition ${
                          listDensity === 'compact'
                            ? 'items-center gap-2 rounded-lg py-1.5 pl-3 pr-2.5'
                            : listDensity === 'comfortable'
                              ? 'items-start gap-2.5 rounded-xl py-2 pl-3 pr-2.5'
                              : 'items-start gap-2.5 rounded-xl py-2.5 pl-3 pr-2.5'
                        }`}
                        style={{
                          background: rowBackground
                        }}
                      >
                        {/* Left Account Accent Rail */}
                        {hasAccountBar && (
                          <span
                            className={`pointer-events-none absolute left-0.5 w-[3px] rounded-full ${
                              listDensity === 'compact' ? 'bottom-1 top-1' : 'bottom-1.5 top-1.5'
                            }`}
                            style={{ background: t.accountColor, opacity: isSelected ? 1 : 0.85 }}
                          />
                        )}
                        {/* Unread dot */}
                        <div className={`flex w-2 shrink-0 justify-center ${listDensity === 'compact' ? '' : 'mt-2.5'}`}>
                          {!t.isRead && (
                            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                          )}
                        </div>

                        {/* Avatar + Account Color Dot + Hover/Multi-Select Checkbox */}
                        <div className={`relative shrink-0 ${listDensity === 'compact' ? '' : 'mt-0.5'}`}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isChecked}
                            onMouseDown={(e) => {
                              if (e.shiftKey) e.preventDefault()
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (e.shiftKey) {
                                e.preventDefault()
                                checkThreadRange(t.id, visibleThreadIds)
                              } else {
                                toggleCheckThread(t.id)
                              }
                            }}
                            className={`group/avatar relative flex items-center justify-center rounded-full font-semibold transition ${
                              listDensity === 'compact'
                                ? 'h-6 w-6 text-[10px]'
                                : listDensity === 'comfortable'
                                  ? 'h-7 w-7 text-[10.5px]'
                                  : 'h-8 w-8 text-[11px]'
                            }`}
                            style={{
                              background: isChecked ? 'var(--accent)' : 'var(--bg-elevated)',
                              color: isChecked ? '#fff' : 'var(--text-secondary)',
                              boxShadow:
                                !isChecked && isSelecting
                                  ? 'inset 0 0 0 1.5px var(--border-strong)'
                                  : undefined
                            }}
                            title={
                              isSelecting
                                ? 'Click to toggle · Shift+Click for range'
                                : 'Click to select · Shift+Click for range'
                            }
                          >
                            {isChecked ? (
                              <Check size={14} strokeWidth={2.5} />
                            ) : isSelecting ? (
                              <Check
                                size={13}
                                strokeWidth={2.2}
                                className="opacity-0 transition-opacity group-hover/avatar:opacity-60"
                              />
                            ) : (
                              <>
                                <span className="transition-opacity group-hover/avatar:opacity-0">
                                  {initials(avatarParty)}
                                </span>
                                <span
                                  className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover/avatar:opacity-100"
                                  style={{
                                    background: 'var(--bg-elevated)',
                                    boxShadow: 'inset 0 0 0 1.5px var(--accent)'
                                  }}
                                >
                                  <Check size={13} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
                                </span>
                              </>
                            )}
                          </button>
                          {(accounts.length > 1 && (activeAccountIds.length !== 1 || Boolean(parsedSearch))) && (
                            <span className="pointer-events-none absolute -bottom-1 -right-1">
                              <AccountBadge
                                icon={t.accountIcon}
                                color={t.accountColor}
                                size={t.accountIcon && t.accountIcon !== 'none' ? 'xs' : 'sm'}
                                borderColor={isSelected ? 'var(--bg-selected)' : 'var(--bg-list)'}
                                title={t.accountEmail}
                              />
                            </span>
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="flex min-w-0 items-center gap-1 truncate text-[13px]"
                              style={{
                                fontWeight: !t.isRead ? 650 : 500,
                                color: 'var(--text-primary)'
                              }}
                            >
                              {showRepliedIndicator && !t.hasDraft && (
                                <span
                                  className="inline-flex shrink-0 items-center"
                                  style={{ color: 'var(--accent)' }}
                                  title="You replied to this email"
                                >
                                  <Reply size={12} strokeWidth={2.4} />
                                </span>
                              )}
                              <span className="truncate">{displayParty}</span>
                              {t.hasDraft && activeMailbox !== 'drafts' && (
                                <span
                                  className="ml-1 shrink-0 rounded px-1.5 py-0.2 text-[10px] font-semibold"
                                  style={{ background: 'rgba(229, 83, 75, 0.14)', color: 'var(--danger)' }}
                                  title="Unsent draft in this thread"
                                >
                                  Draft
                                </span>
                              )}
                              {t.messageCount > 1 && (
                                <span className="ml-0.5 shrink-0 text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
                                  {t.messageCount}
                                </span>
                              )}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              {listDensity === 'compact' && showUrgency && (
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    background: aiMeta!.urgency >= 3 ? 'var(--danger)' : '#e5a424'
                                  }}
                                  title={aiMeta!.aiReason || (aiMeta!.urgency >= 3 ? 'Urgent' : 'High priority')}
                                />
                              )}
                              {listDensity === 'compact' && hasPreDraft && (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium"
                                  style={{ background: 'rgba(245, 184, 65, 0.18)', color: '#d99a1e' }}
                                  title="AI reply draft ready"
                                >
                                  <Sparkles size={10} fill="#f5b841" style={{ color: '#e5a424' }} />
                                </span>
                              )}
                              {t.hasAttachments && <Paperclip size={11} style={{ color: 'var(--text-muted)' }} />}
                              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {formatTime(t.lastMessageAt)}
                              </span>
                            </div>
                          </div>

                          {listDensity !== 'compact' && (
                            <div className="flex items-center justify-between gap-2">
                              <div
                                className="min-w-0 flex-1 truncate text-[12.5px]"
                                style={{
                                  fontWeight: !t.isRead ? 600 : 400,
                                  color: !t.isRead ? 'var(--text-primary)' : 'var(--text-secondary)'
                                }}
                              >
                                {t.subject}
                              </div>
                              {(Boolean(parsedSearch) ||
                                (!activeFolderName && (activeMailbox === 'starred' || activeMailbox === 'waiting'))) && (() => {
                                const role = t.folderRole
                                const folderLabel =
                                  role === 'custom'
                                    ? t.folderName || 'Folder'
                                    : role === 'inbox'
                                      ? 'Inbox'
                                      : role === 'sent'
                                        ? 'Sent'
                                        : role === 'drafts'
                                          ? 'Drafts'
                                          : role === 'archive'
                                            ? 'Archive'
                                            : role === 'trash'
                                              ? 'Trash'
                                              : role === 'junk'
                                                ? 'Junk'
                                                : t.folderName || role
                                const isTrashOrJunk = role === 'trash' || role === 'junk'
                                const isInbox = role === 'inbox'
                                return (
                                  <span
                                    className="inline-flex max-w-[130px] shrink-0 items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
                                    style={{
                                      background: isTrashOrJunk
                                        ? 'rgba(229, 83, 75, 0.14)'
                                        : isInbox
                                          ? 'var(--accent-soft)'
                                          : 'var(--bg-elevated)',
                                      borderColor: isTrashOrJunk
                                        ? 'rgba(229, 83, 75, 0.35)'
                                        : isInbox
                                          ? 'transparent'
                                          : 'var(--border-subtle)',
                                      color: isTrashOrJunk
                                        ? 'var(--danger)'
                                        : isInbox
                                          ? 'var(--accent-text)'
                                          : 'var(--text-secondary)'
                                    }}
                                    title={`Folder: ${folderLabel}`}
                                  >
                                    {role === 'trash' ? (
                                      <Trash2 size={9} className="shrink-0" />
                                    ) : role === 'junk' ? (
                                      <ShieldAlert size={9} className="shrink-0" />
                                    ) : role === 'custom' ? (
                                      <FolderIcon size={9} className="shrink-0" />
                                    ) : null}
                                    <span className="truncate">{folderLabel}</span>
                                  </span>
                                )
                              })()}
                            </div>
                          )}

                          {listDensity === 'expanded' && (
                            <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
                              {t.hasDraft && activeMailbox !== 'drafts' && showRepliedIndicator ? (
                                <>
                                  <span className="font-semibold" style={{ color: 'var(--danger)' }}>
                                    Draft:{' '}
                                  </span>
                                  {t.snippet}
                                </>
                              ) : showRepliedIndicator && t.waitingSince ? (
                                <>
                                  <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                                    You:{' '}
                                  </span>
                                  {t.snippet}
                                </>
                              ) : (
                                t.snippet
                              )}
                            </div>
                          )}

                          {/* Subtle AI Signals (max 2 tiny pills per row) */}
                          {listDensity !== 'compact' && (showUrgency || hasPreDraft || showNeedsReply) && (() => {
                            const pills: React.ReactNode[] = []
                            if (showUrgency && aiMeta) {
                              const isCritical = aiMeta.urgency >= 3
                              pills.push(
                                <span
                                  key="urgency"
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{
                                    background: isCritical
                                      ? 'rgba(240, 96, 96, 0.14)'
                                      : 'rgba(245, 184, 65, 0.16)',
                                    color: isCritical ? 'var(--danger)' : '#d99a1e'
                                  }}
                                  title={aiMeta.aiReason || (isCritical ? 'Urgent' : 'Priority')}
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ background: isCritical ? 'var(--danger)' : '#e5a424' }}
                                  />
                                  {isCritical ? 'Urgent' : 'Priority'}
                                </span>
                              )
                            }
                            if (hasPreDraft && pills.length < 2) {
                              pills.push(
                                <span
                                  key="draft-ready"
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{ background: 'rgba(245, 184, 65, 0.16)', color: '#d99a1e' }}
                                  title="AI reply draft ready"
                                >
                                  <Sparkles size={9.5} fill="#f5b841" style={{ color: '#e5a424' }} />
                                  Draft ready
                                </span>
                              )
                            }
                            if (showNeedsReply && pills.length < 2) {
                              pills.push(
                                <span
                                  key="needs-reply"
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                                  title={aiMeta?.aiReason || 'Reply expected'}
                                >
                                  Needs reply
                                </span>
                              )
                            }
                            return (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {pills}
                              </div>
                            )
                          })()}

                          {/* Inline 2FA Sign-In Code Copy Pill */}
                          {listDensity !== 'compact' && t.signInCode && (
                            <button
                              onClick={(e) => void copyCode(e, t.signInCode!)}
                              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11.5px] font-semibold transition hover:opacity-90"
                              style={{
                                background: 'var(--accent-soft)',
                                borderColor: 'var(--accent)',
                                color: 'var(--accent-text)'
                              }}
                              title="Click to copy sign-in code"
                            >
                              <span>{t.signInCode}</span>
                              <Copy size={11} />
                            </button>
                          )}
                        </div>

                        {/* Hover Actions (Archive leftmost for safe mouse sweep; Delete far right) */}
                        <div
                          className={`absolute right-2 hidden items-center gap-0.5 rounded-xl border px-1 shadow-lg group-hover:flex ${
                            listDensity === 'compact' ? 'top-1/2 -translate-y-1/2 py-0.5' : 'top-2 py-1'
                          }`}
                          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void archiveThreads([t.id])
                            }}
                            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
                            title="Archive (E)"
                            aria-label="Archive conversation"
                          >
                            <Archive size={15} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void toggleStarThread(t.id, t.isStarred)
                            }}
                            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
                            title="Star (S)"
                            aria-label={t.isStarred ? 'Unstar conversation' : 'Star conversation'}
                          >
                            <Star
                              size={15}
                              fill={t.isStarred ? '#f5b841' : 'none'}
                              style={{ color: t.isStarred ? '#f5b841' : 'var(--text-secondary)' }}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void requestDraftReply(t.id)
                            }}
                            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
                            style={{ color: 'var(--accent)' }}
                            title="Draft reply with AI"
                            aria-label="Draft reply with AI"
                          >
                            <Sparkles size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void trashThreads([t.id])
                            }}
                            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
                            title="Delete"
                            aria-label="Delete conversation"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
              )
            })
          )}
        </div>
      )}
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  )
}
