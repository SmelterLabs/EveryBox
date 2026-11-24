import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Calendar,
  Clock,
  Forward,
  Paperclip,
  Reply,
  ReplyAll,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import type { ThreadAISummary } from '../../../shared/types'

export const ThreadReader: React.FC = () => {
  const {
    settings,
    selectedThread,
    archiveThreads,
    trashThreads,
    snoozeThreads,
    toggleStarThread,
    openComposer,
    showToast,
    refreshTodayEvents
  } = useAppStore()

  const readerWidthMode = settings?.readerWidth || 'comfortable'
  const readerMaxWidth =
    readerWidthMode === 'narrow' ? '680px' : readerWidthMode === 'wide' ? 'none' : '860px'
  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLDivElement>('reader')

  const [summary, setSummary] = useState<ThreadAISummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)

  useEffect(() => {
    setSummary(null)
    setLoadingSummary(false)
    setShowSnoozeMenu(false)
  }, [selectedThread?.id])

  if (!selectedThread) return null

  const latestMsg = selectedThread.messages[selectedThread.messages.length - 1]

  const handleSummarize = async () => {
    setLoadingSummary(true)
    try {
      const res = await window.glassmail.summarizeThread(selectedThread.id)
      setSummary(res)
    } finally {
      setLoadingSummary(false)
    }
  }

  const handleReply = (mode: 'reply' | 'replyAll' | 'forward') => {
    const subj = selectedThread.subject.startsWith('Re:')
      ? selectedThread.subject
      : mode === 'forward'
        ? `Fwd: ${selectedThread.subject}`
        : `Re: ${selectedThread.subject}`

    openComposer({
      mode,
      accountId: selectedThread.accountId,
      to: mode === 'forward' ? '' : latestMsg.from.email,
      cc:
        mode === 'replyAll'
          ? [...latestMsg.to, ...latestMsg.cc]
              .map((p) => p.email)
              .filter((e) => e && e !== selectedThread.accountEmail)
              .join(', ')
          : '',
      subject: subj,
      body:
        mode === 'forward'
          ? `\n\n---------- Forwarded message ----------\nFrom: ${latestMsg.from.name} <${latestMsg.from.email}>\n\n${latestMsg.bodyText}`
          : '',
      replyToThreadId: selectedThread.id,
      replyToMessageId: latestMsg.messageIdHeader
    })
  }

  const handleSnoozeOption = (hours: number, label: string) => {
    setShowSnoozeMenu(false)
    void snoozeThreads([selectedThread.id], Date.now() + hours * 3600_000, label)
  }

  return (
    <div
      ref={zoomRef}
      className="relative flex h-full flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-main)' }}
    >
      {zoomBadge}
      {/* Action Bar */}
      <div
        className="flex items-center justify-between border-b px-6 py-2"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleReply('reply')}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            title="Reply (R)"
          >
            <Reply size={15} />
          </button>
          <button
            onClick={() => handleReply('replyAll')}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            title="Reply All (A)"
          >
            <ReplyAll size={15} />
          </button>
          <button
            onClick={() => handleReply('forward')}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            title="Forward (F)"
          >
            <Forward size={15} />
          </button>
          <div className="mx-1 h-4 w-px" style={{ background: 'var(--border-subtle)' }} />
          <button
            onClick={() => void archiveThreads([selectedThread.id])}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            title="Archive (E)"
          >
            <Archive size={15} />
          </button>
          <button
            onClick={() => void trashThreads([selectedThread.id])}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={() => void toggleStarThread(selectedThread.id, selectedThread.isStarred)}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            title="Star (S)"
          >
            <Star
              size={15}
              fill={selectedThread.isStarred ? '#f5b841' : 'none'}
              style={{ color: selectedThread.isStarred ? '#f5b841' : 'currentColor' }}
            />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSnoozeMenu((v) => !v)}
              className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
              title="Snooze (H)"
            >
              <Clock size={15} />
            </button>
            {showSnoozeMenu && (
              <div
                className="absolute left-0 top-9 z-30 w-44 rounded-xl border p-1 shadow-xl"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
              >
                <button
                  onClick={() => handleSnoozeOption(3, 'Later today')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  Later today (+3h)
                </button>
                <button
                  onClick={() => handleSnoozeOption(24, 'Tomorrow')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  Tomorrow morning
                </button>
                <button
                  onClick={() => handleSnoozeOption(24 * 3, 'In 3 days')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  In 3 days
                </button>
                <button
                  onClick={() => handleSnoozeOption(24 * 7, 'Next week')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  Next week
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          {selectedThread.trackersBlocked > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: 'var(--bg-elevated)' }}>
              <ShieldCheck size={12} style={{ color: 'var(--success)' }} />
              {selectedThread.trackersBlocked} tracker{selectedThread.trackersBlocked === 1 ? '' : 's'} blocked
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: selectedThread.accountColor }} />
            {selectedThread.accountEmail}
          </span>
        </div>
      </div>

      {/* Scrollable Thread Content */}
      <div className={`flex-1 overflow-y-auto py-6 ${readerWidthMode === 'wide' ? 'px-6' : 'px-8'}`}>
        <div className="mx-auto w-full" style={{ maxWidth: readerMaxWidth, zoom }}>
          {/* Subject + Summarize Pill */}
          <h1 className="text-[21px] font-semibold leading-snug tracking-tight">{selectedThread.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            <span>
              {selectedThread.participants
                .map((p) => p.name || p.email)
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 4)
                .join(', ')}
            </span>
            <span
              className="rounded-md px-2 py-0.5 text-[11px]"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {selectedThread.messageCount} message{selectedThread.messageCount === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => void handleSummarize()}
              disabled={loadingSummary}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium transition hover:opacity-85"
              style={{ color: 'var(--accent-text)' }}
            >
              <Sparkles size={13} />
              {loadingSummary ? 'Summarizing…' : 'Summarize'}
            </button>
          </div>

          {/* Scam Warning Banner */}
          {selectedThread.scamWarning && (
            <div
              className="mt-4 flex items-start gap-2.5 rounded-xl border p-3 text-[12.5px]"
              style={{ background: 'rgba(229,83,75,0.12)', borderColor: 'var(--danger)', color: 'var(--text-primary)' }}
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <span>{selectedThread.scamWarning}</span>
            </div>
          )}

          {/* AI Thread Summary Card */}
          {summary && (
            <div
              className="mt-4 rounded-xl border p-4"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="flex items-center justify-between text-[11.5px] font-medium" style={{ color: 'var(--accent-text)' }}>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={13} /> Thread Summary
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{summary.providerLabel}</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed">{summary.gist}</p>
              {summary.actionItems.length > 0 && (
                <ul className="mt-2.5 list-disc space-y-1 pl-5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  {summary.actionItems.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
              {summary.keyDates.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {summary.keyDates.map((d, idx) => (
                    <span
                      key={idx}
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="mt-6 space-y-6">
            {selectedThread.messages.map((m) => (
              <article
                key={m.id}
                className="border-t pt-5 first:border-t-0 first:pt-0"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[11.5px] font-semibold"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      {(m.from.name || m.from.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[13.5px] font-semibold">
                        {m.from.name}{' '}
                        <span className="font-normal text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          {m.from.email}
                        </span>
                      </div>
                      <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                        To {m.to.map((r) => r.name || r.email).join(', ') || selectedThread.accountEmail}
                      </div>
                    </div>
                  </div>
                  <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(m.date).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                {/* .ics Calendar Invite Card */}
                {m.calendarInvite && (
                  <div
                    className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                      >
                        <Calendar size={18} />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold">{m.calendarInvite.summary}</div>
                        <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(m.calendarInvite.startIso).toLocaleString()}
                          {m.calendarInvite.location ? ` · ${m.calendarInvite.location}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
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
                          showToast('Added invite to your combined calendar')
                        }}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                        style={{ background: 'var(--accent)' }}
                      >
                        Accept &amp; Add
                      </button>
                      <button
                        onClick={() => handleReply('reply')}
                        className="rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
                        style={{ borderColor: 'var(--border-strong)' }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div
                  className="email-prose mt-4 select-text"
                  dangerouslySetInnerHTML={{
                    __html: m.bodyHtml || `<p>${m.bodyText.replace(/\n/g, '<br/>')}</p>`
                  }}
                />

                {/* Attachments */}
                {m.attachments.filter((a) => !a.isInline).length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {m.attachments
                      .filter((a) => !a.isInline)
                      .map((att) => (
                        <div
                          key={att.id}
                          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]"
                          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                        >
                          <Paperclip size={13} style={{ color: 'var(--text-muted)' }} />
                          <div>
                            <div className="font-medium">{att.filename}</div>
                            <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                              {Math.max(1, Math.round(att.size / 1024))} KB
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Glassmail Quick Reply Bar */}
      <div className={`border-t py-3 ${readerWidthMode === 'wide' ? 'px-6' : 'px-8'}`} style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="mx-auto w-full" style={{ maxWidth: readerMaxWidth }}>
          <button
            onClick={() => handleReply('reply')}
            className="flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-[13px] transition hover:bg-[var(--bg-hover)]"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)'
            }}
          >
            <span className="flex items-center gap-2">
              <Reply size={14} />
              Reply to {latestMsg?.from.name || latestMsg?.from.email}…
            </span>
            <kbd
              className="rounded border px-1.5 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
            >
              R
            </kbd>
          </button>
        </div>
      </div>
    </div>
  )
}
