import React, { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Download, Layers, MapPin, Plus, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { CalendarEvent, OutlookCalendarInfo } from '../../../shared/types'

type CalMode = 'day' | 'week' | 'month'

interface MergedCalendarEvent {
  primary: CalendarEvent
  occurrences: { email: string; color: string; calendarName: string }[]
}

function mergeDuplicateEvents(list: CalendarEvent[]): MergedCalendarEvent[] {
  const map = new Map<string, MergedCalendarEvent>()
  for (const ev of list) {
    const key = `${ev.title.trim().toLowerCase()}|${ev.startAt}|${ev.endAt}|${ev.allDay ? '1' : '0'}`
    const existing = map.get(key)
    const occ = { email: ev.accountEmail, color: ev.accountColor, calendarName: ev.calendarName }
    if (!existing) {
      map.set(key, { primary: ev, occurrences: [occ] })
    } else {
      // Prefer writable event or one with a meeting link/description as primary
      const score = (e: CalendarEvent) =>
        (e.readOnly ? 0 : 4) + (e.meetingUrl ? 2 : 0) + (e.description ? 1 : 0)
      if (score(ev) > score(existing.primary)) {
        existing.primary = ev
      }
      if (!existing.occurrences.some((o) => o.email === occ.email && o.color === occ.color)) {
        existing.occurrences.push(occ)
      }
    }
  }
  return Array.from(map.values())
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export const CalendarView: React.FC = () => {
  const { accounts, activeAccountIds, selectAllAccounts, showToast, refreshTodayEvents } = useAppStore()
  const [mode, setMode] = useState<CalMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [syncing, setSyncing] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<MergedCalendarEvent | null>(null)
  const [mergeDuplicates, setMergeDuplicates] = useState(true)
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

  const imapAccounts = useMemo(() => accounts.filter((a) => a.provider === 'imap' && !a.isDemo), [accounts])
  const importTargetAccounts = imapAccounts.length > 0 ? imapAccounts : accounts

  // Create form state
  const [title, setTitle] = useState('')
  const [accountId, setAccountId] = useState('')
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:00')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(activeAccountIds[0] || accounts[0].id)
    }
    if (importTargetAccounts.length > 0 && !importTargetAccounts.some((a) => a.id === importAccountId)) {
      setImportAccountId(importTargetAccounts[0].id)
    }
  }, [accounts, activeAccountIds, accountId, importAccountId, importTargetAccounts])

  const getRange = (): { start: Date; end: Date; days: Date[] } => {
    if (mode === 'day') {
      const start = startOfDay(anchor)
      return { start, end: addDays(start, 1), days: [start] }
    }
    if (mode === 'week') {
      const dayOfWeek = anchor.getDay()
      const start = addDays(startOfDay(anchor), -dayOfWeek)
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
      return { start, end: addDays(start, 7), days }
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const start = addDays(first, -first.getDay())
    const days = Array.from({ length: 35 }, (_, i) => addDays(start, i))
    return { start, end: addDays(start, 35), days }
  }

  const { start, end, days } = getRange()

  const loadEvents = async () => {
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
    const list = await window.glassmail.listCalendarEvents(start.getTime(), end.getTime(), filterIds)
    setEvents(list)
  }

  useEffect(() => {
    void loadEvents()
  }, [mode, anchor.getTime(), activeAccountIds.join(',')])

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

  const todayStr = new Date().toDateString()

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Calendar Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-[16px] font-semibold">
            {anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => stepAnchor(-1)}
              className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]"
              title="Previous"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setAnchor(startOfDay(new Date()))}
              className="rounded-lg border px-2.5 py-1 text-[12px] font-medium hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-strong)' }}
            >
              Today
            </button>
            <button
              onClick={() => stepAnchor(1)}
              className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]"
              title="Next"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {activeAccountIds.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11.5px]">
              <span style={{ color: 'var(--text-muted)' }}>Filtered:</span>
              {activeAccountIds.map((id) => {
                const a = accounts.find((x) => x.id === id)
                if (!a) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                    {a.name}
                  </span>
                )
              })}
              <button
                onClick={() => void selectAllAccounts()}
                className="font-medium hover:underline"
                style={{ color: 'var(--accent-text)' }}
              >
                Show all
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-strong)' }}>
            {(['day', 'week', 'month'] as CalMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition"
                style={{
                  background: mode === m ? 'var(--bg-elevated)' : 'transparent',
                  color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={() => setMergeDuplicates((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{
              borderColor: mergeDuplicates ? 'var(--accent)' : 'var(--border-strong)',
              color: mergeDuplicates ? 'var(--accent-text)' : 'var(--text-secondary)',
              background: mergeDuplicates ? 'var(--accent-soft)' : 'transparent'
            }}
            title="Combine duplicate events that appear across multiple connected accounts"
          >
            <Layers size={13} /> {mergeDuplicates ? 'Merged' : 'Raw'}
          </button>

          <button
            onClick={() => void handleSync()}
            className="rounded-lg border p-1.5 hover:bg-[var(--bg-hover)]"
            style={{ borderColor: 'var(--border-strong)' }}
            title="Sync calendars"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{ borderColor: 'var(--border-strong)' }}
            title="Import from Outlook or .ics, or export calendar"
          >
            <Upload size={13} /> Import / Export
          </button>

          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={14} /> New event
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className={`grid h-full gap-2 ${
            mode === 'day' ? 'grid-cols-1' : 'grid-cols-7'
          }`}
        >
          {days.map((d) => {
            const isToday = d.toDateString() === todayStr
            const dayStart = startOfDay(d).getTime()
            const dayEnd = dayStart + 86400_000
            const rawDayEvents = events.filter((ev) => ev.endAt > dayStart && ev.startAt < dayEnd)
            const dayEvents: MergedCalendarEvent[] = mergeDuplicates
              ? mergeDuplicateEvents(rawDayEvents)
              : rawDayEvents.map((ev) => ({
                  primary: ev,
                  occurrences: [{ email: ev.accountEmail, color: ev.accountColor, calendarName: ev.calendarName }]
                }))

            return (
              <div
                key={dayStart}
                className="flex min-h-[130px] flex-col rounded-xl border p-2.5"
                style={{
                  background: isToday ? 'var(--bg-elevated)' : 'var(--bg-list)',
                  borderColor: isToday ? 'var(--accent)' : 'var(--border-subtle)'
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase" style={{ color: 'var(--text-muted)' }}>
                    {d.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold"
                    style={{
                      background: isToday ? 'var(--accent)' : 'transparent',
                      color: isToday ? '#fff' : 'var(--text-primary)'
                    }}
                  >
                    {d.getDate()}
                  </span>
                </div>

                <div className="flex-1 space-y-1.5 overflow-y-auto">
                  {dayEvents.map((item) => {
                    const ev = item.primary
                    return (
                      <button
                        key={ev.id}
                        onClick={() => setSelectedEvent(item)}
                        className="block w-full rounded-lg border-l-[3px] px-2 py-1.5 text-left transition hover:brightness-110"
                        style={{
                          background: 'var(--bg-main)',
                          borderLeftColor: ev.accountColor
                        }}
                        title={
                          item.occurrences.length > 1
                            ? `${ev.title} (${item.occurrences.map((o) => o.email).join(', ')})`
                            : ev.title
                        }
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="truncate text-[12px] font-semibold">{ev.title}</div>
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
                        </div>
                        <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                          {ev.allDay
                            ? 'All day'
                            : `${new Date(ev.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Event Popover */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border p-5 shadow-2xl"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: selectedEvent.primary.accountColor }} />
                <h3 className="text-[16px] font-semibold">{selectedEvent.primary.title}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="rounded p-1 hover:bg-[var(--bg-hover)]">
                <X size={15} />
              </button>
            </div>
            <div className="mt-3 space-y-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              <div>
                {selectedEvent.primary.allDay
                  ? new Date(selectedEvent.primary.startAt).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    }) + ' · All day'
                  : `${new Date(selectedEvent.primary.startAt).toLocaleString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })} – ${new Date(selectedEvent.primary.endAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit'
                    })}`}
              </div>
              <div className="space-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {selectedEvent.occurrences.map((occ, idx) => (
                  <div key={`${occ.email}-${idx}`} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: occ.color }} />
                    <span>
                      {occ.calendarName} ({occ.email})
                    </span>
                  </div>
                ))}
              </div>
              {selectedEvent.primary.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} /> {selectedEvent.primary.location}
                </div>
              )}
              {selectedEvent.primary.description && (
                <p className="max-h-40 overflow-y-auto pt-1 text-[12.5px] whitespace-pre-wrap">
                  {selectedEvent.primary.description}
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {selectedEvent.primary.meetingUrl ? (
                <button
                  onClick={() => void window.glassmail.openExternal(selectedEvent.primary.meetingUrl!)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  <Video size={14} /> Join meeting
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                {!selectedEvent.primary.readOnly && (
                  <button
                    onClick={async () => {
                      await window.glassmail.deleteCalendarEvent(selectedEvent.primary.id)
                      setSelectedEvent(null)
                      await loadEvents()
                      await refreshTodayEvents()
                      showToast('Deleted event')
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--bg-hover)]"
                  style={{ borderColor: 'var(--border-strong)' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import / Export Modal */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => setImportOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border p-5 shadow-2xl"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold">Import &amp; Export Calendars</h3>
                <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Bring in local Outlook calendars or standard .ics files, or export a backup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded p-1 hover:bg-[var(--bg-hover)]"
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

            {/* 1. Classic Outlook Desktop (Windows) */}
            <div
              className="space-y-2.5 rounded-xl border p-3.5"
              style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between gap-2">
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
                  className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {scanningOutlook ? 'Scanning…' : outlookCalendars ? 'Rescan' : 'Scan Outlook'}
                </button>
              </div>

              {outlookError && (
                <div className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}>
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
                          <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
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

            {/* 2. Universal .ics File Import & Export */}
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

            {/* Modal Footer */}
            <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <form
            onSubmit={(e) => void handleCreate(e)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3.5 rounded-2xl border p-5 shadow-2xl"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">New Calendar Event</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded p-1 hover:bg-[var(--bg-hover)]">
                <X size={15} />
              </button>
            </div>

            <input
              required
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: 'var(--border-strong)' }}
            />

            <div>
              <label className="mb-1 block text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
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
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="rounded-lg border bg-transparent px-2.5 py-2 text-[12.5px] outline-none"
                style={{ borderColor: 'var(--border-strong)' }}
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-lg border bg-transparent px-2.5 py-2 text-[12.5px] outline-none"
                style={{ borderColor: 'var(--border-strong)' }}
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-lg border bg-transparent px-2.5 py-2 text-[12.5px] outline-none"
                style={{ borderColor: 'var(--border-strong)' }}
              />
            </div>

            <input
              placeholder="Location or meeting link (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: 'var(--border-strong)' }}
            />

            <textarea
              rows={2}
              placeholder="Notes (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: 'var(--border-strong)' }}
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg px-3.5 py-1.5 text-[12.5px] hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white"
                style={{ background: 'var(--accent)' }}
              >
                Save event
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
