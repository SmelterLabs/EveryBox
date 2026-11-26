import React, { useEffect, useState } from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { buildReplyComposerState } from '../utils/replyHelper'
import type { ThreadDetail } from '../../../shared/types'

export const TriageView: React.FC = () => {
  const { threads, archiveThreads, trashThreads, snoozeThreads, openComposer, setActiveView } = useAppStore()
  const [index, setIndex] = useState(0)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [totalInitial] = useState(() => Math.max(1, threads.length))

  const currentSummary = threads[index]

  useEffect(() => {
    if (!currentSummary) {
      setDetail(null)
      return
    }
    void window.glassmail.getThread(currentSummary.id).then(setDetail)
  }, [currentSummary?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setActiveView('mail')
        return
      }
      if (!currentSummary) return
      const k = e.key.toLowerCase()
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        void trashThreads([currentSummary.id])
      } else if (k === 'e') {
        void archiveThreads([currentSummary.id])
      } else if (k === 'h' || k === 'b') {
        void snoozeThreads([currentSummary.id], Date.now() + 24 * 3600_000, 'Tomorrow')
      } else if (k === 'j') {
        setIndex((i) => Math.min(threads.length - 1, i + 1))
      } else if (k === 'k') {
        setIndex((i) => Math.max(0, i - 1))
      } else if (k === 'r') {
        if (detail) {
          openComposer(buildReplyComposerState(detail, 'reply'))
        } else {
          openComposer({
            mode: 'reply',
            accountId: currentSummary.accountId,
            to: currentSummary.latestFrom.email,
            subject: /^re:/i.test(currentSummary.subject) ? currentSummary.subject : `Re: ${currentSummary.subject}`,
            replyToThreadId: currentSummary.id
          })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentSummary, threads.length])

  const left = Math.max(0, threads.length - index)
  const progressPct = Math.min(100, Math.round(((totalInitial - left) / totalInitial) * 100))

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Top Triage Header */}
      <div
        className="flex items-center justify-between border-b px-6 py-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <div className="text-[13.5px] font-semibold">Triage</div>
          <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
            {left} left
          </div>
        </div>
        <button
          onClick={() => setActiveView('mail')}
          className="rounded-lg px-3 py-1 text-[12px] font-medium hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          Exit triage
        </button>
      </div>

      {/* Focused Single Conversation */}
      <div className="flex-1 overflow-y-auto px-8 pb-24 pt-8">
        {!detail ? (
          <div className="mx-auto mt-20 max-w-md text-center">
            <CheckCircle2 size={42} className="mx-auto" style={{ color: 'var(--success)' }} />
            <h2 className="mt-4 text-[22px] font-semibold">Inbox zero!</h2>
            <p className="mt-1 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
              You triaged every conversation in view.
            </p>
            <button
              onClick={() => setActiveView('mail')}
              className="mt-5 rounded-full px-5 py-2 text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Back to Inbox
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-[700px]">
            <h1 className="text-[22px] font-semibold">{detail.subject}</h1>
            <div className="mt-1.5 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span>{detail.latestFrom.name}</span>
              <span>·</span>
              <span>{detail.messageCount} messages</span>
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>
                <Sparkles size={12} /> {detail.accountEmail}
              </span>
            </div>

            <div className="mt-6 space-y-6">
              {detail.messages.map((m) => (
                <div key={m.id} className="border-t pt-5 first:border-t-0" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold">{m.from.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(m.date).toLocaleString()}</span>
                  </div>
                  <div
                    className="email-prose mt-3 select-text"
                    dangerouslySetInnerHTML={{
                      __html: m.bodyHtml || `<p>${m.bodyText.replace(/\n/g, '<br/>')}</p>`
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Glassmail Triage Pill Bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <div
          className="pointer-events-auto flex items-center gap-4 rounded-2xl border px-4 py-2.5 shadow-2xl"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
            </div>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {left} left
            </span>
          </div>

          <div className="h-4 w-px" style={{ background: 'var(--border-strong)' }} />

          <div className="flex items-center gap-3 text-[12.5px]">
            <button
              onClick={() => currentSummary && void archiveThreads([currentSummary.id])}
              className="flex items-center gap-1.5 hover:opacity-80"
            >
              <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
                E
              </kbd>
              Archive
            </button>
            <button
              onClick={() => currentSummary && void trashThreads([currentSummary.id])}
              className="flex items-center gap-1.5 hover:opacity-80"
            >
              <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
                Del
              </kbd>
              Delete
            </button>
            <button
              onClick={() =>
                currentSummary && void snoozeThreads([currentSummary.id], Date.now() + 24 * 3600_000, 'Tomorrow')
              }
              className="flex items-center gap-1.5 hover:opacity-80"
            >
              <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
                H
              </kbd>
              Tomorrow
            </button>
            <button
              onClick={() => {
                if (detail) {
                  openComposer(buildReplyComposerState(detail, 'reply'))
                } else if (currentSummary) {
                  openComposer({
                    mode: 'reply',
                    accountId: currentSummary.accountId,
                    to: currentSummary.latestFrom.email,
                    subject: /^re:/i.test(currentSummary.subject)
                      ? currentSummary.subject
                      : `Re: ${currentSummary.subject}`,
                    replyToThreadId: currentSummary.id
                  })
                }
              }}
              className="flex items-center gap-1.5 hover:opacity-80"
            >
              <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
                R
              </kbd>
              Reply
            </button>
            <button
              onClick={() => setIndex((i) => Math.min(threads.length - 1, i + 1))}
              className="flex items-center gap-1.5 hover:opacity-80"
            >
              <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
                J
              </kbd>
              Skip
            </button>
          </div>

          <button
            onClick={() => setActiveView('mail')}
            className="ml-2 rounded-lg px-3 py-1 text-[12px] font-semibold"
            style={{ background: 'var(--bg-hover)' }}
          >
            Done <span className="ml-1 opacity-60">esc</span>
          </button>
        </div>
      </div>
    </div>
  )
}
