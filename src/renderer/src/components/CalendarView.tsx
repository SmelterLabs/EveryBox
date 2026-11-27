import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Layers,
  MapPin,
  Maximize2,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Video,
  X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import { AccountBadge } from './AccountIcon'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'
import { EventDetailPane } from './calendar/EventDetailPane'
import { EventDetailModal } from './calendar/EventDetailModal'
import {
  addDays,
  extractMeetingUrl,
  formatAgendaPlainText,
  formatTimeShort,
  isSameDay,
  layoutDayTimedEvents,
  mergeDuplicateEvents,
  startOfDay,
  type MergedCalendarEvent,
  type RichCalendarEvent
} from './calendar/eventUtils'
import type { CalendarEvent, OutlookCalendarInfo } from '../../../shared/types'

type CalMode = 'day' | 'week' | 'month'

const HOUR_HEIGHT = 56
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_PANE_HEIGHT_PCT = 44
const MIN_PANE_HEIGHT_PCT = 22
const MAX_PANE_HEIGHT_PCT = 72

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

function getLocalTzShort(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

export const CalendarView: React.FC = () => {
  const {
    accounts,
    activeAccountIds,
    pendingCalendarDraft,
    clearCalendarDraft,
    selectAllAccounts,
    showToast,
    refreshTodayEvents
  } = useAppStore()

  const [mode, setMode] = useState<CalMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [syncing, setSyncing] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<MergedCalendarEvent | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [paneHeightPct, setPaneHeightPct] = useState(DEFAULT_PANE_HEIGHT_PCT)
  const [isResizingPane, setIsResizingPane] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [mergeDuplicates, setMergeDuplicates] = useState(true)
  const [now, setNow] = useState(() => new Date())

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importAccountId, setImportAccountId] = useState('')
  const [scanningOutlook, setScanningOutlook] = useState(false)
  const [outlookCalendars, setOutlookCalendars] = useState<OutlookCalendarInfo[] | null>(null)
  const [outlookError, setOutlookError] = useState<string | null>(null)
  const [importingFolder, setImportingFolder] = useState<string | null>(null)
  const [importedFolders, setImportedFolders] = useState<Record<string, { count: number; targetName: string }>>({})
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importingIcs, setImportingIcs] = useState(false)
  const [exportingIcs, setExportingIcs] = useState(false)

  // Create form state
  const [title, setTitle] = useState('')
  const [accountId, setAccountId] = useState('')
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:00')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  const splitContainerRef = useRef<HTMLDivElement | null>(null)
  const timeGridScrollRef = useRef<HTMLDivElement | null>(null)
  const hasAutoScrolledRef = useRef(false)
  const pendingSelectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pendingSelectTimerRef.current !== null) {
        window.clearTimeout(pendingSelectTimerRef.current)
      }
    }
  }, [])

  const imapAccounts = useMemo(() => accounts.filter((a) => a.provider === 'imap' && !a.isDemo), [accounts])
  const importTargetAccounts = imapAccounts.length > 0 ? imapAccounts : accounts
  const accountPriority = useMemo(() => new Map(accounts.map((a, idx) => [a.id, idx])), [accounts])
  const rankOf = useCallback(
    (id: string) => (accountPriority.has(id) ? accountPriority.get(id)! : Number.MAX_SAFE_INTEGER),
    [accountPriority]
  )
  const tzShort = useMemo(() => getLocalTzShort(), [])

  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLDivElement>('calendar')

  // Live current-time clock for the time needle
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Auto-scroll time grid to working hours (~7:30 AM or 1.5h before now)
  useEffect(() => {
    if (mode === 'month') {
      hasAutoScrolledRef.current = false
      return
    }
    const el = timeGridScrollRef.current
    if (!el || hasAutoScrolledRef.current) return
    const currentHour = new Date().getHours()
    const targetHour = currentHour >= 7 && currentHour <= 20 ? Math.max(0, currentHour - 1.5) : 7.5
    el.scrollTop = Math.round(targetHour * HOUR_HEIGHT)
    hasAutoScrolledRef.current = true
  }, [mode])

  // Keyboard shortcuts: Escape closes modals first, then bottom details pane
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (contextMenu) {
        setContextMenu(null)
        return
      }
      if (createOpen) {
        setCreateOpen(false)
        return
      }
      if (importOpen) {
        setImportOpen(false)
        return
      }
      if (detailModalOpen) {
        setDetailModalOpen(false)
        return
      }
      if (selectedEvent) {
        setSelectedEvent(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [contextMenu, createOpen, importOpen, detailModalOpen, selectedEvent])

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(activeAccountIds[0] || accounts[0].id)
    }
    if (importTargetAccounts.length > 0 && !importTargetAccounts.some((a) => a.id === importAccountId)) {
      setImportAccountId(importTargetAccounts[0].id)
    }
  }, [accounts, activeAccountIds, accountId, importAccountId, importTargetAccounts])

  useEffect(() => {
    if (!pendingCalendarDraft) return
    if (pendingCalendarDraft.title !== undefined) setTitle(pendingCalendarDraft.title)
    if (pendingCalendarDraft.description !== undefined) setDescription(pendingCalendarDraft.description)
    if (pendingCalendarDraft.location !== undefined) setLocation(pendingCalendarDraft.location)
    if (pendingCalendarDraft.accountId) setAccountId(pendingCalendarDraft.accountId)
    if (pendingCalendarDraft.dateStr) setDateStr(pendingCalendarDraft.dateStr)
    if (pendingCalendarDraft.startTime) setStartTime(pendingCalendarDraft.startTime)
    if (pendingCalendarDraft.endTime) setEndTime(pendingCalendarDraft.endTime)
    setCreateOpen(true)
    clearCalendarDraft()
  }, [pendingCalendarDraft, clearCalendarDraft])

  const { start, end, days } = useMemo(() => {
    if (mode === 'day') {
      const s = startOfDay(anchor)
      return { start: s, end: addDays(s, 1), days: [s] }
    }
    if (mode === 'week') {
      const s = addDays(startOfDay(anchor), -anchor.getDay())
      const d = Array.from({ length: 7 }, (_, i) => addDays(s, i))
      return { start: s, end: addDays(s, 7), days: d }
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    const s = addDays(first, -first.getDay())
    const totalCells = first.getDay() + last.getDate() > 35 ? 42 : 35
    const d = Array.from({ length: totalCells }, (_, i) => addDays(s, i))
    return { start: s, end: addDays(s, totalCells), days: d }
  }, [mode, anchor])

  const loadEvents = useCallback(async () => {
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
    const list = await window.glassmail.listCalendarEvents(start.getTime(), end.getTime(), filterIds)
    setEvents(list)
  }, [start, end, activeAccountIds])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  useEffect(() => {
    const unsub = window.glassmail.onDataUpdated(() => {
      void loadEvents()
    })
    return unsub
  }, [loadEvents])

  const handleCopy = useCallback(
    async (text: string, message: string) => {
      await window.glassmail.copyText(text, message)
      showToast(message, undefined, 2400)
    },
    [showToast]
  )

  const handleOpenExternal = useCallback((url: string) => {
    void window.glassmail.openExternal(url)
  }, [])

  const openDuplicateEvent = useCallback(
    (item: MergedCalendarEvent) => {
      const ev = item.primary
      const s = new Date(ev.startAt)
      const en = new Date(ev.endAt)
      const pad2 = (n: number) => String(n).padStart(2, '0')
      setTitle(ev.title)
      setAccountId(ev.accountId || activeAccountIds[0] || accounts[0]?.id || '')
      setDateStr(`${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`)
      setStartTime(`${pad2(s.getHours())}:${pad2(s.getMinutes())}`)
      setEndTime(`${pad2(en.getHours())}:${pad2(en.getMinutes())}`)
      setLocation(ev.location || '')
      setDescription(ev.descriptionHtml || ev.description ? formatAgendaPlainText(ev.descriptionHtml || ev.description || '') : '')
      setCreateOpen(true)
    },
    [accounts, activeAccountIds]
  )

  const handleDeleteEvent = useCallback(
    async (item: MergedCalendarEvent) => {
      const ev = item.primary
      const ok = window.confirm(`Delete "${ev.title}"?`)
      if (!ok) return
      const res = await window.glassmail.deleteCalendarEvent(ev.id)
      if (res.ok) {
        if (selectedEvent?.primary.id === ev.id) {
          setSelectedEvent(null)
          setDetailModalOpen(false)
        }
        await loadEvents()
        await refreshTodayEvents()
        showToast('Deleted event')
      } else {
        showToast(res.error || 'Could not delete event')
      }
    },
    [loadEvents, refreshTodayEvents, selectedEvent, showToast]
  )

  const openCreateAtSlot = useCallback(
    (day: Date, hour = 10) => {
      const pad2 = (n: number) => String(n).padStart(2, '0')
      const clampedStart = Math.max(0, Math.min(23, hour))
      const clampedEnd = Math.min(23, clampedStart + 1)
      setTitle('')
      setLocation('')
      setDescription('')
      setDateStr(`${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`)
      setStartTime(`${pad2(clampedStart)}:00`)
      setEndTime(clampedStart === 23 ? '23:55' : `${pad2(clampedEnd)}:00`)
      setCreateOpen(true)
    },
    []
  )

  // Single-click selects & opens bottom details pane (brief delay only when pane is closed
  // so a double-click on a lower-viewport event isn't occluded before click 2 lands);
  // double-click immediately promotes to the full detail modal.
  const handleSelectEvent = useCallback(
    (item: MergedCalendarEvent) => {
      if (pendingSelectTimerRef.current !== null) {
        window.clearTimeout(pendingSelectTimerRef.current)
        pendingSelectTimerRef.current = null
      }
      if (selectedEvent !== null) {
        setSelectedEvent(item)
        return
      }
      pendingSelectTimerRef.current = window.setTimeout(() => {
        pendingSelectTimerRef.current = null
        setSelectedEvent(item)
      }, 190)
    },
    [selectedEvent]
  )

  const handleOpenEventModal = useCallback((item: MergedCalendarEvent) => {
    if (pendingSelectTimerRef.current !== null) {
      window.clearTimeout(pendingSelectTimerRef.current)
      pendingSelectTimerRef.current = null
    }
    setSelectedEvent(item)
    setDetailModalOpen(true)
  }, [])

  // Drag-to-resize bottom details pane
  const handleStartResizePane = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const container = splitContainerRef.current
      if (!container) return
      const startY = e.clientY
      const startPct = paneHeightPct
      const containerHeight = container.getBoundingClientRect().height
      if (containerHeight <= 0) return

      setIsResizingPane(true)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const onMove = (moveEvt: MouseEvent) => {
        const deltaY = (startY - moveEvt.clientY) / (zoom || 1)
        const deltaPct = (deltaY / (containerHeight / (zoom || 1))) * 100
        const nextPct = Math.max(MIN_PANE_HEIGHT_PCT, Math.min(MAX_PANE_HEIGHT_PCT, startPct + deltaPct))
        setPaneHeightPct(nextPct)
      }

      const onUp = () => {
        setIsResizingPane(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [paneHeightPct, zoom]
  )

  const openEventContextMenu = (e: React.MouseEvent, item: MergedCalendarEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ev = item.primary
    const meetingUrl = extractMeetingUrl(ev)
    const items: ContextMenuItem[] = []

    if (meetingUrl) {
      items.push(
        {
          label: 'Join meeting',
          icon: <Video size={13} />,
          onClick: () => handleOpenExternal(meetingUrl)
        },
        {
          label: 'Copy meeting link',
          icon: <Copy size={13} />,
          onClick: () => void handleCopy(meetingUrl, 'Copied meeting link')
        },
        { type: 'separator' }
      )
    }

    items.push(
      {
        label: 'View in details pane',
        icon: <CalendarIcon size={13} />,
        onClick: () => {
          setSelectedEvent(item)
          setDetailModalOpen(false)
        }
      },
      {
        label: 'Open in full window',
        icon: <Maximize2 size={13} />,
        onClick: () => handleOpenEventModal(item)
      },
      {
        label: 'Duplicate event…',
        icon: <Plus size={13} />,
        onClick: () => openDuplicateEvent(item)
      },
      {
        label: 'Copy title',
        icon: <Copy size={13} />,
        onClick: () => void handleCopy(ev.title, 'Copied event title')
      }
    )

    if (ev.location) {
      items.push({
        label: 'Copy location',
        icon: <MapPin size={13} />,
        onClick: () => void handleCopy(ev.location!, 'Copied location')
      })
    }

    if (!ev.readOnly) {
      items.push(
        { type: 'separator' },
        {
          label: 'Delete event',
          icon: <Trash2 size={13} />,
          danger: true,
          onClick: () => void handleDeleteEvent(item)
        }
      )
    }

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await window.glassmail.syncCalendars()
      await loadEvents()
      await refreshTodayEvents()
      showToast('Calendars synced')
    } finally {
      setSyncing(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !accountId) return
    const startAt = new Date(`${dateStr}T${startTime}:00`).getTime()
    const endAt = new Date(`${dateStr}T${endTime}:00`).getTime()
    const res = await window.glassmail.createCalendarEvent({
      accountId,
      title: title.trim(),
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      startAt,
      endAt: Math.max(endAt, startAt + 15 * 60_000),
      allDay: false
    })
    if (res.ok) {
      setCreateOpen(false)
      setTitle('')
      setLocation('')
      setDescription('')
      await loadEvents()
      await refreshTodayEvents()
      showToast('Event added to calendar')
    } else {
      showToast(res.error || 'Could not create event')
    }
  }

  const handleScanOutlook = async () => {
    setScanningOutlook(true)
    setOutlookError(null)
    try {
      const res = await window.glassmail.listOutlookCalendars()
      if (res.available) {
        setOutlookCalendars(res.calendars)
        if (res.calendars.length === 0) {
          setOutlookError('Connected to Classic Outlook, but no calendar folders were found.')
        }
      } else {
        setOutlookCalendars([])
        setOutlookError(res.error || 'Classic Outlook was not detected.')
      }
    } finally {
      setScanningOutlook(false)
    }
  }

  const handleImportOutlook = async (folderPath: string) => {
    if (!importAccountId) return
    setImportingFolder(folderPath)
    setImportStatus(null)
    try {
      const targetAcc = accounts.find((a) => a.id === importAccountId)
      const targetName = targetAcc?.name || targetAcc?.email || 'account'
      const res = await window.glassmail.importOutlookCalendar(importAccountId, folderPath)
      if (res.ok) {
        setImportedFolders((prev) => ({
          ...prev,
          [folderPath]: { count: res.imported, targetName }
        }))
        await loadEvents()
        await refreshTodayEvents()
        const msg =
          res.imported === 0
            ? `Checked "${res.calendarName || 'Outlook'}" — 0 events found in the active date window.`
            : `Imported ${res.imported} event${res.imported === 1 ? '' : 's'} from "${res.calendarName || 'Outlook'}" into ${targetName}.`
        setImportStatus(msg)
        showToast(msg)
      } else {
        setImportStatus(res.error || 'Outlook calendar import failed')
        showToast(res.error || 'Outlook calendar import failed')
      }
    } finally {
      setImportingFolder(null)
    }
  }

  const handleImportIcs = async () => {
    if (!importAccountId) return
    setImportingIcs(true)
    setImportStatus(null)
    try {
      const targetAcc = accounts.find((a) => a.id === importAccountId)
      const targetName = targetAcc?.name || targetAcc?.email || 'account'
      const res = await window.glassmail.importIcsCalendar(importAccountId)
      if (res.cancelled) return
      if (res.ok) {
        await loadEvents()
        await refreshTodayEvents()
        const msg = `Imported ${res.imported} event${res.imported === 1 ? '' : 's'} from .ics file into ${targetName}.`
        setImportStatus(msg)
        showToast(msg)
      } else {
        setImportStatus(res.error || 'Could not import .ics file')
        showToast(res.error || 'Could not import .ics file')
      }
    } finally {
      setImportingIcs(false)
    }
  }

  const handleExportIcs = async () => {
    setExportingIcs(true)
    setImportStatus(null)
    try {
      const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
      const res = await window.glassmail.exportIcsCalendar(filterIds)
      if (res.cancelled) return
      if (res.ok) {
        const msg = `Exported ${res.count} event${res.count === 1 ? '' : 's'} to .ics.`
        setImportStatus(msg)
        showToast(msg)
      } else {
        setImportStatus(res.error || 'Could not export calendar')
        showToast(res.error || 'Could not export calendar')
      }
    } finally {
      setExportingIcs(false)
    }
  }

  const stepAnchor = (dir: number) => {
    if (mode === 'day') setAnchor((d) => addDays(d, dir))
    else if (mode === 'week') setAnchor((d) => addDays(d, dir * 7))
    else setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1))
  }

  const headerTitle = useMemo(() => {
    if (mode === 'day') {
      return anchor.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    }
    if (mode === 'week') {
      const firstDay = days[0]
      const lastDay = days[days.length - 1]
      if (firstDay.getMonth() === lastDay.getMonth()) {
        return `${firstDay.toLocaleDateString('en-US', { month: 'long' })} ${firstDay.getDate()} – ${lastDay.getDate()}, ${lastDay.getFullYear()}`
      }
      if (firstDay.getFullYear() === lastDay.getFullYear()) {
        return `${firstDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${lastDay.getFullYear()}`
      }
      return `${firstDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [mode, anchor, days])

  // Precompute per-day all-day and timed events
  const dayBuckets = useMemo(() => {
    return days.map((d) => {
      const dayStart = startOfDay(d).getTime()
      const dayEnd = dayStart + 86_400_000
      const rawDayEvents = events.filter((ev) => ev.endAt > dayStart && ev.startAt < dayEnd) as RichCalendarEvent[]
      const combined: MergedCalendarEvent[] = mergeDuplicates
        ? mergeDuplicateEvents(rawDayEvents, accountPriority)
        : rawDayEvents.map((ev) => ({
            primary: ev,
            occurrences: [
              {
                accountId: ev.accountId,
                email: ev.accountEmail,
                color: ev.accountColor,
                calendarName: ev.calendarName,
                icon: ev.accountIcon
              }
            ]
          }))

      const allDayEvents = combined
        .filter((item) => item.primary.allDay)
        .sort((a, b) => {
          const ra = rankOf(a.primary.accountId)
          const rb = rankOf(b.primary.accountId)
          if (ra !== rb) return ra - rb
          return a.primary.title.localeCompare(b.primary.title)
        })

      const timedEvents = combined
        .filter((item) => !item.primary.allDay)
        .sort((a, b) => {
          if (a.primary.startAt !== b.primary.startAt) return a.primary.startAt - b.primary.startAt
          const ra = rankOf(a.primary.accountId)
          const rb = rankOf(b.primary.accountId)
          if (ra !== rb) return ra - rb
          return a.primary.title.localeCompare(b.primary.title)
        })

      const positioned = layoutDayTimedEvents(timedEvents, dayStart, HOUR_HEIGHT)

      return {
        date: d,
        dayStart,
        isToday: isSameDay(d, now),
        isCurrentMonth: d.getMonth() === anchor.getMonth(),
        allDayEvents,
        timedEvents,
        positioned
      }
    })
  }, [days, events, mergeDuplicates, accountPriority, rankOf, now, anchor])

  // Keep selectedEvent fresh from post-merge dayBuckets on background sync so merged
  // fields (meetingUrl, descriptionHtml, organizer, htmlLink, attendees, attachments, occurrences) are preserved.
  useEffect(() => {
    if (!selectedEvent) return
    const targetId = selectedEvent.primary.id
    for (const bucket of dayBuckets) {
      const match =
        bucket.allDayEvents.find((m) => m.primary.id === targetId) ||
        bucket.timedEvents.find((m) => m.primary.id === targetId)
      if (match) {
        setSelectedEvent(match)
        return
      }
    }
  }, [dayBuckets])

  const anyAllDay = useMemo(() => dayBuckets.some((b) => b.allDayEvents.length > 0), [dayBuckets])
  const todayVisible = useMemo(() => dayBuckets.some((b) => b.isToday), [dayBuckets])
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowTopPx = (nowMinutes / 60) * HOUR_HEIGHT

  return (
    <div
      ref={zoomRef}
      className="relative flex h-full flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-main)' }}
    >
      {zoomBadge}

      <div className="flex min-h-0 flex-1 flex-col" style={{ zoom }}>
        {/* Calm, Precision Calendar Toolbar */}
        <header
          className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-2.5"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-main)' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* Segmented Prev / Today / Next */}
            <div
              className="inline-flex items-center overflow-hidden rounded-lg border"
              style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-list)' }}
            >
              <button
                type="button"
                onClick={() => stepAnchor(-1)}
                className="px-2 py-1.5 transition hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-secondary)' }}
                title="Previous"
                aria-label="Previous period"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setAnchor(startOfDay(new Date()))}
                className="border-x px-2.5 py-1 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => stepAnchor(1)}
                className="px-2 py-1.5 transition hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-secondary)' }}
                title="Next"
                aria-label="Next period"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <h2
              className="truncate text-[15.5px] font-semibold tracking-[-0.015em] tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {headerTitle}
            </h2>

            {activeAccountIds.length > 0 && (
              <div className="hidden items-center gap-1.5 text-[11.5px] xl:flex">
                <span style={{ color: 'var(--text-muted)' }}>Filtered:</span>
                {activeAccountIds.map((id) => {
                  const a = accounts.find((x) => x.id === id)
                  if (!a) return null
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: 'var(--bg-elevated)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <AccountBadge icon={a.icon} color={a.color} size="xs" />
                      {a.name}
                    </span>
                  )
                })}
                <button
                  type="button"
                  onClick={() => void selectAllAccounts()}
                  className="font-medium hover:underline"
                  style={{ color: 'var(--accent-text)' }}
                >
                  Show all
                </button>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Day / Week / Month Segmented Control */}
            <div
              className="flex rounded-lg border p-0.5"
              style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-list)' }}
              role="tablist"
              aria-label="Calendar view mode"
            >
              {(['day', 'week', 'month'] as CalMode[]).map((m) => {
                const active = mode === m
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMode(m)}
                    className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition ${
                      active ? 'shadow-sm' : ''
                    }`}
                    style={{
                      background: active ? 'var(--bg-elevated)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}
                  >
                    {m}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setMergeDuplicates((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{
                borderColor: mergeDuplicates
                  ? 'color-mix(in srgb, var(--accent) 45%, var(--border-strong))'
                  : 'var(--border-strong)',
                color: mergeDuplicates ? 'var(--accent-text)' : 'var(--text-secondary)',
                background: mergeDuplicates ? 'var(--accent-soft)' : 'transparent'
              }}
              title="Combine duplicate events that appear across multiple connected accounts"
            >
              <Layers size={13} />
              <span className="hidden sm:inline">{mergeDuplicates ? 'Merged' : 'Raw'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSync()}
              className="rounded-lg border p-1.5 transition hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
              title="Sync calendars"
              aria-label="Sync calendars"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
              title="Import from Outlook or .ics, or export calendar"
            >
              <Upload size={13} />
              <span className="hidden md:inline">Import / Export</span>
            </button>

            <button
              type="button"
              onClick={() => openCreateAtSlot(anchor, 10)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={14} /> New event
            </button>
          </div>
        </header>

        {/* Main Split Container: Calendar Grid (Top) + Docked Event Details Pane (Bottom) */}
        <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Calendar Surface */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {mode === 'month' ? (
              /* ===================== MONTH VIEW ===================== */
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Weekday Header Strip */}
                <div
                  className="grid shrink-0 grid-cols-7 border-b"
                  style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-list)' }}
                >
                  {WEEKDAY_LABELS.map((dayName) => (
                    <div
                      key={dayName}
                      className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Month Cells Grid */}
                <div
                  className="grid min-h-0 flex-1 grid-cols-7 overflow-y-auto"
                  style={{
                    gridTemplateRows: `repeat(${dayBuckets.length / 7}, minmax(108px, 1fr))`
                  }}
                >
                  {dayBuckets.map((bucket) => {
                    const allItems = [...bucket.allDayEvents, ...bucket.timedEvents]
                    return (
                      <div
                        key={bucket.dayStart}
                        onDoubleClick={(e) => {
                          if (e.target === e.currentTarget) openCreateAtSlot(bucket.date, 10)
                        }}
                        className="flex min-h-0 flex-col border-r border-b p-1.5 transition-colors"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          background: bucket.isToday
                            ? 'color-mix(in srgb, var(--accent) 5%, var(--bg-main))'
                            : bucket.isCurrentMonth
                              ? 'var(--bg-main)'
                              : 'var(--bg-list)'
                        }}
                      >
                        <div className="mb-1 flex items-center justify-between px-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAnchor(startOfDay(bucket.date))
                              setMode('day')
                            }}
                            title="Open day view"
                            className="flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold tabular-nums transition hover:bg-[var(--bg-hover)]"
                            style={{
                              background: bucket.isToday ? 'var(--accent)' : 'transparent',
                              color: bucket.isToday
                                ? '#ffffff'
                                : bucket.isCurrentMonth
                                  ? 'var(--text-primary)'
                                  : 'var(--text-muted)',
                              opacity: bucket.isCurrentMonth || bucket.isToday ? 1 : 0.6
                            }}
                          >
                            {bucket.date.getDate()}
                          </button>
                          {allItems.length > 0 && (
                            <span
                              className="text-[10px] font-medium tabular-nums"
                              style={{ color: 'var(--text-muted)', opacity: 0.7 }}
                            >
                              {allItems.length}
                            </span>
                          )}
                        </div>

                        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
                          {allItems.map((item) => {
                            const ev = item.primary
                            const isSelected = selectedEvent?.primary.id === ev.id
                            const hasVideo = Boolean(extractMeetingUrl(ev))
                            const isCancelled = ev.status === 'cancelled'
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectEvent(item)
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenEventModal(item)
                                }}
                                onContextMenu={(e) => openEventContextMenu(e, item)}
                                className="cal-event-chip flex w-full items-center gap-1.5 rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px]"
                                style={{
                                  borderLeftColor: ev.accountColor,
                                  background: isSelected
                                    ? 'var(--bg-selected)'
                                    : ev.allDay
                                      ? `color-mix(in srgb, ${ev.accountColor} 15%, var(--bg-elevated))`
                                      : `color-mix(in srgb, ${ev.accountColor} 9%, var(--bg-elevated))`,
                                  boxShadow: isSelected ? 'inset 0 0 0 1.5px var(--accent)' : 'none',
                                  opacity: isCancelled ? 0.58 : bucket.isCurrentMonth ? 1 : 0.75
                                }}
                                title={
                                  ev.allDay
                                    ? `${ev.title} · All day`
                                    : `${formatTimeShort(ev.startAt)} ${ev.title}`
                                }
                              >
                                {!ev.allDay && (
                                  <span
                                    className="shrink-0 text-[10px] font-medium tabular-nums"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {formatTimeShort(ev.startAt).replace(':00', '')}
                                  </span>
                                )}
                                <span
                                  className={`min-w-0 flex-1 truncate font-medium ${
                                    isCancelled ? 'line-through' : ''
                                  }`}
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {ev.title}
                                </span>
                                {hasVideo && (
                                  <Video
                                    size={10}
                                    className="shrink-0"
                                    style={{ color: 'var(--accent-text)' }}
                                  />
                                )}
                                {item.occurrences.length > 1 && (
                                  <span className="flex shrink-0 items-center gap-0.5">
                                    {item.occurrences.map((o, idx) => (
                                      <span
                                        key={`${o.email}-${idx}`}
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{ background: o.color }}
                                      />
                                    ))}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* ===================== DAY & WEEK TIME GRID ===================== */
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Sticky Day Column Headers */}
                <div
                  className="flex shrink-0 border-b"
                  style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-list)' }}
                >
                  <div
                    className="flex w-[62px] shrink-0 items-end justify-end border-r pr-2.5 pb-2 text-[10px] font-medium tabular-nums"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                  >
                    {tzShort}
                  </div>
                  <div
                    className={`grid flex-1 ${mode === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}
                  >
                    {dayBuckets.map((bucket) => (
                      <div
                        key={bucket.dayStart}
                        className="flex items-center justify-between border-r px-3 py-2 last:border-r-0"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          background: bucket.isToday
                            ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-list))'
                            : 'transparent'
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[11px] font-semibold uppercase tracking-[0.05em]"
                            style={{
                              color: bucket.isToday ? 'var(--accent-text)' : 'var(--text-muted)'
                            }}
                          >
                            {bucket.date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (mode === 'week') {
                                setAnchor(startOfDay(bucket.date))
                                setMode('day')
                              }
                            }}
                            title={mode === 'week' ? 'Open day view' : undefined}
                            className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[13px] font-semibold tabular-nums transition ${
                              mode === 'week' ? 'hover:bg-[var(--bg-hover)]' : ''
                            }`}
                            style={{
                              background: bucket.isToday ? 'var(--accent)' : 'transparent',
                              color: bucket.isToday ? '#ffffff' : 'var(--text-primary)'
                            }}
                          >
                            {bucket.date.getDate()}
                          </button>
                        </div>
                        {bucket.timedEvents.length + bucket.allDayEvents.length > 0 && (
                          <span
                            className="text-[10.5px] font-medium tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {bucket.timedEvents.length + bucket.allDayEvents.length}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sticky All-Day Row */}
                {anyAllDay && (
                  <div
                    className="flex shrink-0 border-b"
                    style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-list)' }}
                  >
                    <div
                      className="flex w-[62px] shrink-0 items-center justify-end border-r pr-2.5 text-[10px] font-medium"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                    >
                      All day
                    </div>
                    <div
                      className={`grid flex-1 ${mode === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}
                    >
                      {dayBuckets.map((bucket) => (
                        <div
                          key={bucket.dayStart}
                          className="flex max-h-[84px] flex-col gap-1 overflow-y-auto border-r p-1.5 last:border-r-0"
                          style={{
                            borderColor: 'var(--border-subtle)',
                            background: bucket.isToday
                              ? 'color-mix(in srgb, var(--accent) 4%, var(--bg-list))'
                              : 'transparent'
                          }}
                        >
                          {bucket.allDayEvents.map((item) => {
                            const ev = item.primary
                            const isSelected = selectedEvent?.primary.id === ev.id
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => handleSelectEvent(item)}
                                onDoubleClick={() => handleOpenEventModal(item)}
                                onContextMenu={(e) => openEventContextMenu(e, item)}
                                className="cal-event-chip inline-flex w-full items-center gap-1.5 rounded-md border-l-[3px] px-2 py-1 text-left text-[11px] font-medium"
                                style={{
                                  borderLeftColor: ev.accountColor,
                                  background: isSelected
                                    ? 'var(--bg-selected)'
                                    : `color-mix(in srgb, ${ev.accountColor} 14%, var(--bg-elevated))`,
                                  boxShadow: isSelected ? 'inset 0 0 0 1.5px var(--accent)' : 'none',
                                  color: 'var(--text-primary)'
                                }}
                                title={
                                  item.occurrences.length > 1
                                    ? `${ev.title} · All day (${item.occurrences.map((o) => o.email).join(', ')})`
                                    : `${ev.title} · All day`
                                }
                              >
                                <span className="truncate">{ev.title}</span>
                                {item.occurrences.length > 1 && (
                                  <span className="ml-auto flex shrink-0 items-center gap-0.5">
                                    {item.occurrences.map((o, idx) => (
                                      <span
                                        key={`${o.email}-${idx}`}
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{ background: o.color }}
                                      />
                                    ))}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scrollable 24-Hour Time Grid */}
                <div ref={timeGridScrollRef} className="min-h-0 flex-1 overflow-y-auto">
                  <div
                    className="relative flex"
                    style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                  >
                    {/* Left Hour Gutter */}
                    <div
                      className="relative w-[62px] shrink-0 select-none border-r"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-list)' }}
                    >
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          className="absolute right-2.5 text-[10.5px] font-medium tabular-nums"
                          style={{
                            top: `${h * HOUR_HEIGHT - 7}px`,
                            color: 'var(--text-muted)',
                            opacity: h === 0 ? 0 : 0.85
                          }}
                        >
                          {formatHourLabel(h)}
                        </div>
                      ))}

                      {/* Current Time Pill in Gutter */}
                      {todayVisible && (
                        <div
                          className="pointer-events-none absolute right-1.5 z-20 -translate-y-1/2 rounded px-1 py-0.5 text-[9.5px] font-semibold tabular-nums text-white"
                          style={{
                            top: `${nowTopPx}px`,
                            background: 'var(--accent)'
                          }}
                        >
                          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')}
                        </div>
                      )}
                    </div>

                    {/* Day Columns */}
                    <div
                      className={`relative grid flex-1 ${mode === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}
                    >
                      {dayBuckets.map((bucket) => (
                        <div
                          key={bucket.dayStart}
                          className="relative border-r last:border-r-0"
                          style={{
                            borderColor: 'var(--border-subtle)',
                            background: bucket.isToday
                              ? 'color-mix(in srgb, var(--accent) 3%, var(--bg-main))'
                              : 'var(--bg-main)'
                          }}
                        >
                          {/* Hour & Half-Hour Gridlines (clickable to create event at that hour) */}
                          {HOURS.map((h) => (
                            <div
                              key={h}
                              onDoubleClick={() => openCreateAtSlot(bucket.date, h)}
                              className="group relative border-b"
                              style={{
                                height: `${HOUR_HEIGHT}px`,
                                borderColor: 'var(--border-subtle)'
                              }}
                              title={`Double-click to add event at ${formatHourLabel(h)}`}
                            >
                              <div
                                className="pointer-events-none absolute right-0 left-0 border-b border-dashed"
                                style={{
                                  top: `${HOUR_HEIGHT / 2}px`,
                                  borderColor: 'var(--border-subtle)',
                                  opacity: 0.45
                                }}
                              />
                            </div>
                          ))}

                          {/* Current-Time Needle on Today's Column */}
                          {bucket.isToday && (
                            <div
                              className="pointer-events-none absolute right-0 left-0 z-20 flex items-center"
                              style={{ top: `${nowTopPx}px` }}
                            >
                              <span
                                className="-ml-[4px] h-[8px] w-[8px] shrink-0 rounded-full"
                                style={{ background: 'var(--accent)' }}
                              />
                              <div
                                className="h-[1.5px] flex-1"
                                style={{ background: 'var(--accent)' }}
                              />
                            </div>
                          )}

                          {/* Positioned Event Cards */}
                          {bucket.positioned.map(({ item, topPx, heightPx, col, colCount }) => {
                            const ev = item.primary
                            const isSelected = selectedEvent?.primary.id === ev.id
                            const hasVideo = Boolean(extractMeetingUrl(ev))
                            const isCompact = heightPx < 42
                            const isTall = heightPx >= 72
                            const isCancelled = ev.status === 'cancelled'
                            const widthPct = 100 / colCount
                            const leftPct = col * widthPct

                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectEvent(item)
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenEventModal(item)
                                }}
                                onContextMenu={(e) => openEventContextMenu(e, item)}
                                className="cal-event-chip absolute z-10 overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left"
                                style={{
                                  top: `${topPx}px`,
                                  height: `${heightPx}px`,
                                  left: `calc(${leftPct}% + 2px)`,
                                  width: `calc(${widthPct}% - 5px)`,
                                  borderLeftColor: ev.accountColor,
                                  background: isSelected
                                    ? 'var(--bg-selected)'
                                    : `color-mix(in srgb, ${ev.accountColor} 12%, var(--bg-elevated))`,
                                  boxShadow: isSelected
                                    ? 'inset 0 0 0 1.5px var(--accent)'
                                    : 'inset 0 0 0 1px var(--border-subtle)',
                                  opacity: isCancelled ? 0.58 : 1
                                }}
                                title={
                                  item.occurrences.length > 1
                                    ? `${ev.title} · ${formatTimeShort(ev.startAt)} – ${formatTimeShort(ev.endAt)} (${item.occurrences.map((o) => o.email).join(', ')})`
                                    : `${ev.title} · ${formatTimeShort(ev.startAt)} – ${formatTimeShort(ev.endAt)}`
                                }
                              >
                                {isCompact ? (
                                  <div className="flex h-full items-center justify-between gap-1">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span
                                        className={`truncate text-[11.5px] font-semibold leading-none ${
                                          isCancelled ? 'line-through' : ''
                                        }`}
                                        style={{ color: 'var(--text-primary)' }}
                                      >
                                        {ev.title}
                                      </span>
                                      <span
                                        className="shrink-0 text-[10px] tabular-nums"
                                        style={{ color: 'var(--text-muted)' }}
                                      >
                                        {formatTimeShort(ev.startAt)}
                                      </span>
                                    </div>
                                    {hasVideo && (
                                      <Video
                                        size={10}
                                        className="shrink-0"
                                        style={{ color: 'var(--accent-text)' }}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex h-full flex-col">
                                    <div className="flex items-start justify-between gap-1">
                                      <span
                                        className={`truncate text-[12px] font-semibold leading-tight ${
                                          isCancelled ? 'line-through' : ''
                                        }`}
                                        style={{ color: 'var(--text-primary)' }}
                                      >
                                        {ev.title}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-1 pt-0.5">
                                        {hasVideo && (
                                          <Video size={11} style={{ color: 'var(--accent-text)' }} />
                                        )}
                                        {(ev.attachments?.length || 0) > 0 && (
                                          <Paperclip size={10} style={{ color: 'var(--text-muted)' }} />
                                        )}
                                        {item.occurrences.length > 1 && (
                                          <span className="flex items-center gap-0.5">
                                            {item.occurrences.map((o, idx) => (
                                              <span
                                                key={`${o.email}-${idx}`}
                                                className="h-1.5 w-1.5 rounded-full"
                                                style={{ background: o.color }}
                                              />
                                            ))}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    <div
                                      className="mt-0.5 truncate text-[10.5px] tabular-nums"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      {formatTimeShort(ev.startAt)} – {formatTimeShort(ev.endAt)}
                                    </div>
                                    {isTall && ev.location && (
                                      <div
                                        className="mt-0.5 truncate text-[10.5px]"
                                        style={{ color: 'var(--text-muted)' }}
                                      >
                                        {ev.location}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Single-Click Docked Bottom-Half Details Pane */}
          {selectedEvent && (
            <EventDetailPane
              item={selectedEvent}
              heightPercent={paneHeightPct}
              isResizing={isResizingPane}
              onStartResize={handleStartResizePane}
              onResetResize={() => setPaneHeightPct(DEFAULT_PANE_HEIGHT_PCT)}
              onExpandModal={() => setDetailModalOpen(true)}
              onDuplicate={openDuplicateEvent}
              onDelete={(item) => void handleDeleteEvent(item)}
              onClose={() => {
                setSelectedEvent(null)
                setDetailModalOpen(false)
              }}
              onCopy={(text, msg) => void handleCopy(text, msg)}
              onOpenExternal={handleOpenExternal}
            />
          )}
        </div>

        {/* Double-Click / Expand Full Event Details Modal */}
        {selectedEvent && detailModalOpen && (
          <EventDetailModal
            item={selectedEvent}
            onClose={() => setDetailModalOpen(false)}
            onDuplicate={openDuplicateEvent}
            onDelete={(item) => void handleDeleteEvent(item)}
            onCopy={(text, msg) => void handleCopy(text, msg)}
            onOpenExternal={handleOpenExternal}
          />
        )}

        {/* Import / Export Modal */}
        {importOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            onClick={() => setImportOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Import and Export Calendars"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg space-y-4 rounded-2xl border p-5 shadow-2xl"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15.5px] font-semibold tracking-[-0.01em]">
                    Import &amp; Export Calendars
                  </h3>
                  <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Bring in local Outlook calendars or standard .ics files, or export a backup.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Target Account Picker */}
              <div>
                <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Import events into account
                </label>
                <select
                  value={importAccountId}
                  onChange={(e) => setImportAccountId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-[12.5px] outline-none"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                >
                  {importTargetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {imapAccounts.length > 0
                    ? 'Showing IMAP / local accounts only — Gmail accounts sync Google Calendar automatically.'
                    : 'Imported events are stored locally on this PC.'}
                </p>
              </div>

              {importStatus && (
                <div
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
                  style={{
                    background: 'var(--bg-main)',
                    borderColor: 'var(--success)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <Check size={14} style={{ color: 'var(--success)' }} className="shrink-0" />
                  <span>{importStatus}</span>
                </div>
              )}

              {/* Classic Outlook Desktop (Windows) */}
              <div
                className="space-y-2.5 rounded-xl border p-3.5"
                style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold">Import from Classic Outlook (Windows)</div>
                    <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                      Reads local &ldquo;This computer only&rdquo; and Outlook Desktop calendars directly. Safe to re-run
                      without duplicates.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleScanOutlook()}
                    disabled={scanningOutlook}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    {scanningOutlook ? 'Scanning…' : outlookCalendars ? 'Rescan' : 'Scan Outlook'}
                  </button>
                </div>

                {outlookError && (
                  <div
                    className="rounded-lg border px-3 py-2 text-[11.5px]"
                    style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                  >
                    {outlookError}
                  </div>
                )}

                {outlookCalendars && outlookCalendars.length > 0 && (
                  <div className="max-h-44 space-y-1.5 overflow-y-auto pt-1">
                    {outlookCalendars.map((cal) => {
                      const done = importedFolders[cal.folderPath]
                      return (
                        <div
                          key={cal.folderPath}
                          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[12.5px] font-medium">{cal.folderName}</div>
                            <div className="truncate text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                              {cal.storeName} · {cal.itemCount} item{cal.itemCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          {done ? (
                            <button
                              type="button"
                              onClick={() => void handleImportOutlook(cal.folderPath)}
                              disabled={importingFolder !== null}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition hover:opacity-80 disabled:opacity-50"
                              style={{
                                borderColor: 'var(--success)',
                                color: 'var(--success)',
                                background: 'transparent'
                              }}
                              title={`Imported into ${done.targetName}. Click to re-import.`}
                            >
                              <Check size={12} />
                              {done.count === 0 ? 'Imported (0)' : `Imported (${done.count})`}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleImportOutlook(cal.folderPath)}
                              disabled={importingFolder !== null}
                              className="shrink-0 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                              style={{ borderColor: 'var(--border-strong)' }}
                            >
                              {importingFolder === cal.folderPath ? 'Importing…' : 'Import'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Universal .ics File Import & Export */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleImportIcs()}
                  disabled={importingIcs || !importAccountId}
                  className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                >
                  <Upload size={14} /> {importingIcs ? 'Importing…' : 'Import .ics File'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportIcs()}
                  disabled={exportingIcs}
                  className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                >
                  <Download size={14} /> {exportingIcs ? 'Exporting…' : 'Export .ics Backup'}
                </button>
              </div>

              <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-xl px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110"
                  style={{ background: 'var(--accent)' }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Event Modal */}
        {createOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            onClick={() => setCreateOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="New Calendar Event"
          >
            <form
              onSubmit={(e) => void handleCreate(e)}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md space-y-3.5 rounded-2xl border p-5 shadow-2xl"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[15.5px] font-semibold tracking-[-0.01em]">New Calendar Event</h3>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>

              <div>
                <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Title
                </label>
                <input
                  required
                  autoFocus
                  placeholder="Event title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Account / Calendar
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full rounded-lg border px-2.5 py-2 text-[12.5px] tabular-nums outline-none"
                    style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border px-2.5 py-2 text-[12.5px] tabular-nums outline-none"
                    style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    End
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border px-2.5 py-2 text-[12.5px] tabular-nums outline-none"
                    style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Location or meeting link
                </label>
                <input
                  placeholder="Optional"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Agenda or notes (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110"
                  style={{ background: 'var(--accent)' }}
                >
                  Save event
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  )
}
