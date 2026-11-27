import React, { useMemo } from 'react'
import { Copy, Maximize2, Plus, Trash2, Video, X } from 'lucide-react'
import { AccountBadge } from '../AccountIcon'
import { EventDetailContent } from './EventDetailContent'
import {
  extractMeetingUrl,
  getMeetingProviderLabel,
  type MergedCalendarEvent
} from './eventUtils'

interface EventDetailPaneProps {
  item: MergedCalendarEvent
  heightPercent: number
  isResizing: boolean
  onStartResize: (e: React.MouseEvent) => void
  onResetResize: () => void
  onExpandModal: () => void
  onDuplicate: (item: MergedCalendarEvent) => void
  onDelete: (item: MergedCalendarEvent) => void
  onClose: () => void
  onCopy: (text: string, message: string) => void
  onOpenExternal: (url: string) => void
}

function getStatusBadgeStyle(status: string): { color: string; bg: string } {
  if (status === 'cancelled') {
    return {
      color: 'var(--danger)',
      bg: 'color-mix(in srgb, var(--danger) 14%, transparent)'
    }
  }
  if (status === 'tentative') {
    return {
      color: 'var(--accent-text)',
      bg: 'var(--accent-soft)'
    }
  }
  return {
    color: 'var(--text-muted)',
    bg: 'var(--bg-main)'
  }
}

export const EventDetailPane: React.FC<EventDetailPaneProps> = ({
  item,
  heightPercent,
  isResizing,
  onStartResize,
  onResetResize,
  onExpandModal,
  onDuplicate,
  onDelete,
  onClose,
  onCopy,
  onOpenExternal
}) => {
  const ev = item.primary
  const meetingUrl = useMemo(() => extractMeetingUrl(ev), [ev])
  const statusStyle = getStatusBadgeStyle(ev.status)

  return (
    <section
      aria-label="Event details"
      className="relative flex shrink-0 flex-col border-t"
      style={{
        height: `${heightPercent}%`,
        minHeight: '190px',
        maxHeight: '72%',
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-strong)'
      }}
    >
      {/* Drag-to-resize top splitter handle */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize event details pane"
        onMouseDown={onStartResize}
        onDoubleClick={onResetResize}
        title="Drag to resize · Double-click to reset"
        className="cal-splitter group absolute -top-[4px] right-0 left-0 z-20 flex h-[8px] cursor-row-resize items-center justify-center"
        data-resizing={isResizing ? 'true' : 'false'}
      >
        <span className="cal-splitter-grip h-[3px] w-10 rounded-full transition-all" />
      </div>

      {/* Subtle account-color hairline along the top edge */}
      <div
        className="h-[2px] w-full shrink-0"
        style={{ background: ev.accountColor, opacity: 0.9 }}
      />

      {/* Compact Action Header */}
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-2.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <AccountBadge icon={ev.accountIcon} color={ev.accountColor} size="sm" />
          <h3
            className="truncate text-[15px] font-semibold tracking-[-0.01em]"
            style={{ color: 'var(--text-primary)' }}
            title={ev.title}
          >
            {ev.title}
          </h3>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium capitalize"
            style={{ background: statusStyle.bg, color: statusStyle.color }}
          >
            {ev.status}
          </span>
          {ev.allDay && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              All day
            </span>
          )}
          {ev.readOnly && (
            <span
              className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-block"
              style={{ background: 'var(--bg-main)', color: 'var(--text-muted)' }}
            >
              Read-only
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {meetingUrl && (
            <>
              <button
                type="button"
                onClick={() => onOpenExternal(meetingUrl)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110"
                style={{ background: 'var(--accent)' }}
                title={meetingUrl}
              >
                <Video size={13} />
                {getMeetingProviderLabel(meetingUrl)}
              </button>
              <button
                type="button"
                onClick={() => onCopy(meetingUrl, 'Copied meeting link')}
                className="rounded-lg border p-1.5 transition hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                title="Copy meeting link"
              >
                <Copy size={13} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onExpandModal}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
            title="Open in full window (or double-click event)"
          >
            <Maximize2 size={12} />
            <span className="hidden sm:inline">Expand</span>
          </button>

          <button
            type="button"
            onClick={() => onDuplicate(item)}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Duplicate event"
          >
            <Plus size={14} />
          </button>

          {!ev.readOnly && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--danger)' }}
              title="Delete event"
            >
              <Trash2 size={14} />
            </button>
          )}

          <div
            className="mx-0.5 h-4 w-px"
            style={{ background: 'var(--border-subtle)' }}
          />

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Close details pane (Esc)"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable Shared Detail Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EventDetailContent
          item={item}
          variant="pane"
          onCopy={onCopy}
          onOpenExternal={onOpenExternal}
        />
      </div>
    </section>
  )
}
