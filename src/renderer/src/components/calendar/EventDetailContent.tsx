import React, { useMemo } from 'react'
import {
  Calendar as CalendarIcon,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  MapPin,
  Paperclip,
  UserCheck,
  Users
} from 'lucide-react'
import { AccountBadge } from '../AccountIcon'
import {
  formatEventSchedule,
  getOrganizerInfo,
  parseRichDescription,
  type MergedCalendarEvent,
  type RichTextSegment
} from './eventUtils'

interface EventDetailContentProps {
  item: MergedCalendarEvent
  variant: 'pane' | 'modal'
  onCopy: (text: string, message: string) => void
  onOpenExternal: (url: string) => void
}

function renderSegments(
  segments: RichTextSegment[],
  onOpenExternal: (url: string) => void
): React.ReactNode {
  return segments.map((seg, idx) =>
    seg.type === 'link' ? (
      <button
        key={idx}
        type="button"
        onClick={() => onOpenExternal(seg.url)}
        title={seg.url}
        className="inline cursor-pointer break-all text-left underline decoration-1 underline-offset-2 transition hover:opacity-80"
        style={{ color: 'var(--accent-text)' }}
      >
        {seg.label}
      </button>
    ) : (
      <React.Fragment key={idx}>{seg.text}</React.Fragment>
    )
  )
}

function getRsvpStyle(status?: string): { label: string; color: string; bg: string } | null {
  switch (status) {
    case 'accepted':
      return {
        label: 'Accepted',
        color: 'var(--success)',
        bg: 'color-mix(in srgb, var(--success) 13%, transparent)'
      }
    case 'declined':
      return {
        label: 'Declined',
        color: 'var(--danger)',
        bg: 'color-mix(in srgb, var(--danger) 13%, transparent)'
      }
    case 'tentative':
      return {
        label: 'Maybe',
        color: 'var(--accent-text)',
        bg: 'var(--accent-soft)'
      }
    case 'needsAction':
    case 'needs-action':
      return {
        label: 'Awaiting',
        color: 'var(--text-muted)',
        bg: 'var(--bg-hover)'
      }
    default:
      return null
  }
}

export const EventDetailContent: React.FC<EventDetailContentProps> = ({
  item,
  variant,
  onCopy,
  onOpenExternal
}) => {
  const ev = item.primary
  const schedule = useMemo(() => formatEventSchedule(ev), [ev])
  const organizer = useMemo(() => getOrganizerInfo(ev), [ev])
  const attachments = ev.attachments || []

  const descriptionSource = ev.descriptionHtml || ev.description || ''
  const richLines = useMemo(() => parseRichDescription(descriptionSource), [descriptionSource])

  const locationLines = useMemo(() => {
    if (!ev.location || !ev.location.trim()) return []
    return parseRichDescription(ev.location.trim())
  }, [ev.location])

  const rsvpCounts = useMemo(() => {
    let accepted = 0
    let tentative = 0
    let declined = 0
    for (const att of ev.attendees) {
      if (att.status === 'accepted') accepted++
      else if (att.status === 'tentative') tentative++
      else if (att.status === 'declined') declined++
    }
    return { accepted, tentative, declined }
  }, [ev.attendees])

  const isPane = variant === 'pane'

  return (
    <div
      className={
        isPane
          ? 'grid grid-cols-1 gap-4 px-5 py-3.5 lg:grid-cols-[minmax(0,1.45fr)_minmax(270px,1fr)] lg:gap-5'
          : 'grid grid-cols-1 gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]'
      }
    >
      {/* Left column: Schedule, Meeting link, Location, Agenda & Notes, Attachments */}
      <div className={isPane ? 'min-w-0 space-y-3.5' : 'min-w-0 space-y-4'}>
        {/* Schedule row */}
        <div
          className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2.5"
          style={{
            background: 'var(--bg-main)',
            borderColor: 'var(--border-subtle)'
          }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Clock size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            <div className="min-w-0 text-[12.5px] leading-snug">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {schedule.dateLabel}
              </span>
              <span className="mx-1.5" style={{ color: 'var(--text-muted)' }}>
                ·
              </span>
              <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {schedule.timeLabel}
              </span>
              {!ev.allDay && (
                <span
                  className="ml-2 inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  {schedule.durationLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        {ev.location && ev.location.trim() && (
          <div
            className="flex items-start justify-between gap-2.5 rounded-xl border px-3.5 py-2.5"
            style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
              <div className="min-w-0 text-[12.5px] leading-snug" style={{ color: 'var(--text-primary)' }}>
                {locationLines.map((line, i) => (
                  <div key={i} className="break-words">
                    {renderSegments(line.segments, onOpenExternal)}
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCopy(ev.location!.trim(), 'Copied location')}
              className="shrink-0 rounded-md p-1 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="Copy location"
            >
              <Copy size={12} />
            </button>
          </div>
        )}

        {/* Agenda & Notes */}
        <div
          className="rounded-xl border px-3.5 py-3"
          style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
            style={{ color: 'var(--text-muted)' }}
          >
            <FileText size={12} />
            Agenda &amp; Notes
          </div>
          {richLines.length > 0 ? (
            <div
              className="max-w-[72ch] space-y-1 text-[13px] leading-[1.58] break-words"
              style={{ color: 'var(--text-secondary)' }}
            >
              {richLines.map((line, idx) => {
                const isBlank =
                  !line.isBullet &&
                  line.segments.every((s) => s.type === 'text' && s.text.trim().length === 0)
                if (isBlank) return <div key={idx} className="h-2" />
                if (line.isBullet) {
                  return (
                    <div key={idx} className="flex items-start gap-2 pl-1">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--text-muted)' }} />
                      <span className="min-w-0 flex-1">{renderSegments(line.segments, onOpenExternal)}</span>
                    </div>
                  )
                }
                return (
                  <div key={idx}>{renderSegments(line.segments, onOpenExternal)}</div>
                )
              })}
            </div>
          ) : (
            <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              No agenda or notes included.
            </div>
          )}
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div
            className="rounded-xl border px-3.5 py-3"
            style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
          >
            <div
              className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{ color: 'var(--text-muted)' }}
            >
              <Paperclip size={12} />
              Attachments ({attachments.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <button
                  key={`${att.fileUrl}-${idx}`}
                  type="button"
                  onClick={() => onOpenExternal(att.fileUrl)}
                  title={att.fileUrl}
                  className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-strong)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <Paperclip size={12} style={{ color: 'var(--accent)' }} />
                  <span className="max-w-[240px] truncate">{att.title || 'Attachment'}</span>
                  <ExternalLink size={11} style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right column: Calendars, Organizer, Attendees, External link */}
      <div className={isPane ? 'min-w-0 space-y-3.5' : 'min-w-0 space-y-4'}>
        {/* Calendars & Accounts */}
        <div
          className="rounded-xl border px-3.5 py-3"
          style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{ color: 'var(--text-muted)' }}
            >
              <CalendarIcon size={12} />
              Calendar{item.occurrences.length > 1 ? 's' : ''}
            </span>
            {ev.htmlLink && (
              <button
                type="button"
                onClick={() => onOpenExternal(ev.htmlLink!)}
                className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                style={{ color: 'var(--accent-text)' }}
              >
                Open in provider <ExternalLink size={10} />
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {item.occurrences.map((occ, idx) => (
              <div key={`${occ.email}-${idx}`} className="flex items-center gap-2 text-[12.5px]">
                <AccountBadge icon={occ.icon} color={occ.color} size="xs" />
                <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                  {occ.calendarName}
                </span>
                <span className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {occ.email}
                </span>
              </div>
            ))}
          </div>

          {organizer && (
            <div
              className="mt-2.5 flex items-center gap-2 border-t pt-2.5 text-[12px]"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <UserCheck size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Organizer:</span>
              <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                {organizer.name || organizer.email}
              </span>
              {organizer.name && organizer.email && (
                <span className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  ({organizer.email})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Attendees */}
        <div
          className="rounded-xl border px-3.5 py-3"
          style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
              style={{ color: 'var(--text-muted)' }}
            >
              <Users size={12} />
              Attendees ({ev.attendees.length})
            </span>
            {ev.attendees.length > 0 && (
              <div className="flex items-center gap-2 text-[10.5px] font-medium tabular-nums">
                {rsvpCounts.accepted > 0 && (
                  <span style={{ color: 'var(--success)' }}>{rsvpCounts.accepted} yes</span>
                )}
                {rsvpCounts.tentative > 0 && (
                  <span style={{ color: 'var(--accent-text)' }}>{rsvpCounts.tentative} maybe</span>
                )}
                {rsvpCounts.declined > 0 && (
                  <span style={{ color: 'var(--danger)' }}>{rsvpCounts.declined} no</span>
                )}
              </div>
            )}
          </div>

          {ev.attendees.length > 0 ? (
            <div className={`space-y-1.5 overflow-y-auto pr-0.5 ${isPane ? 'max-h-[180px]' : 'max-h-[280px]'}`}>
              {ev.attendees.map((att, idx) => {
                const label = att.name || att.email
                const rsvp = getRsvpStyle(att.status)
                return (
                  <div
                    key={`${att.email}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[12px]"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                          {label}
                        </span>
                        {att.organizer && (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                          >
                            Organizer
                          </span>
                        )}
                        {att.optional && !att.organizer && (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-medium"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                          >
                            Optional
                          </span>
                        )}
                      </div>
                      {att.name && att.email && (
                        <div className="truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                          {att.email}
                        </div>
                      )}
                    </div>
                    {rsvp && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: rsvp.color, background: rsvp.bg }}
                      >
                        {rsvp.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              No other attendees listed.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
