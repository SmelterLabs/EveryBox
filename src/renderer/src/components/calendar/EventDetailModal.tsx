import React, { useMemo } from 'react'
import { Copy, Plus, Trash2, Video, X } from 'lucide-react'
import { AccountBadge } from '../AccountIcon'
import { EventDetailContent } from './EventDetailContent'
import {
  extractMeetingUrl,
  getMeetingProviderLabel,
  type MergedCalendarEvent
} from './eventUtils'

interface EventDetailModalProps {
  item: MergedCalendarEvent
  onClose: () => void
  onDuplicate: (item: MergedCalendarEvent) => void
  onDelete: (item: MergedCalendarEvent) => void
  onCopy: (text: string, message: string) => void
  onOpenExternal: (url: string) => void
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  item,
  onClose,
  onDuplicate,
  onDelete,
  onCopy,
  onOpenExternal
}) => {
  const ev = item.primary
  const meetingUrl = useMemo(() => extractMeetingUrl(ev), [ev])

  const statusStyle =
    ev.status === 'cancelled'
      ? { color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 14%, transparent)' }
      : ev.status === 'tentative'
        ? { color: 'var(--accent-text)', bg: 'var(--accent-soft)' }
        : { color: 'var(--text-muted)', bg: 'var(--bg-main)' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ev.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[78vh] max-h-[86vh] w-[72vw] min-w-[600px] max-w-[980px] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
      >
        {/* Crisp 3px account-color top hairline */}
        <div className="h-[3px] w-full shrink-0" style={{ background: ev.accountColor }} />

        {/* Header */}
        <div
          className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <AccountBadge icon={ev.accountIcon} color={ev.accountColor} size="md" />
              <h3
                className="text-[18px] font-semibold leading-snug tracking-[-0.015em]"
                style={{ color: 'var(--text-primary)' }}
              >
                {ev.title}
              </h3>
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize"
                style={{ background: statusStyle.bg, color: statusStyle.color }}
              >
                {ev.status}
              </span>
              {ev.allDay && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  All day
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {meetingUrl && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenExternal(meetingUrl)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110"
                  style={{ background: 'var(--accent)' }}
                  title={meetingUrl}
                >
                  <Video size={14} />
                  {getMeetingProviderLabel(meetingUrl)}
                </button>
                <button
                  type="button"
                  onClick={() => onCopy(meetingUrl, 'Copied meeting link')}
                  className="rounded-lg border p-2 transition hover:bg-[var(--bg-hover)]"
                  style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                  title="Copy meeting link"
                >
                  <Copy size={13} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Shared Detail Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EventDetailContent
            item={item}
            variant="modal"
            onCopy={onCopy}
            onOpenExternal={onOpenExternal}
          />
        </div>

        {/* Footer */}
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t px-6 py-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            {!ev.readOnly ? (
              <button
                type="button"
                onClick={() => onDelete(item)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={14} /> Delete event
              </button>
            ) : (
              <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Read-only calendar event
              </span>
            )}
            <button
              type="button"
              onClick={() => onDuplicate(item)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
            >
              <Plus size={13} /> Duplicate
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110"
            style={{ background: 'var(--accent)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
