import React, { useEffect, useState } from 'react'
import { Archive, ArrowUp, Clock, Sparkles, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import type { AssistantResponse } from '../../../shared/types'

interface Turn {
  question: string
  response: AssistantResponse
}

function formatCardDate(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export const AssistantView: React.FC<{ width?: number }> = ({ width = 390 }) => {
  const {
    activeAccountIds,
    assistantDraftPrompt,
    clearAssistantDraftPrompt,
    selectThread,
    setActiveView,
    setAssistantOpen,
    archiveThreads,
    showToast
  } = useAppStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLDivElement>('assistant')

  const ask = async (q: string) => {
    const clean = q.trim()
    if (!clean || loading) return
    setInput('')
    setLoading(true)
    try {
      const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
      const response = await window.glassmail.askAssistant(clean, filterIds)
      setTurns((prev) => [...prev, { question: clean, response }])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!assistantDraftPrompt) return
    const prompt = assistantDraftPrompt
    clearAssistantDraftPrompt()
    void ask(prompt)
  }, [assistantDraftPrompt])

  const openThread = async (threadId: string) => {
    setActiveView('mail')
    await selectThread(threadId)
  }

  return (
    <aside
      ref={zoomRef}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l"
      style={{ width, background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
    >
      {zoomBadge}
      <div className="flex min-h-0 flex-1 flex-col" style={{ zoom }}>
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={15} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold leading-tight">AI Assistant</h2>
            <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {activeAccountIds.length > 0
                ? `Focused on ${activeAccountIds.length} selected account${activeAccountIds.length === 1 ? '' : 's'}`
                : 'Searching across all accounts & calendar'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {turns.length > 0 && (
            <button
              onClick={() => setTurns([])}
              className="rounded-lg px-2 py-1 text-[11.5px] transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              New chat
            </button>
          )}
          <button
            type="button"
            onClick={() => setAssistantOpen(false)}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Close AI Assistant"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Conversation Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-6">
          {turns.length === 0 && !loading && (
            <div className="pt-12 text-center">
              <div
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                style={{ background: 'var(--accent)' }}
              >
                <Sparkles size={20} />
              </div>
              <h1 className="mt-4 text-[22px] font-semibold">Ask anything about your mail</h1>
              <p className="mt-1 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
                Get prioritized action cards, find who hasn&apos;t replied, or check upcoming deadlines.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  'What needs me today?',
                  "Who hasn't replied to me?",
                  'What deadlines are coming up this week?',
                  'Which newsletters or updates can I archive?'
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void ask(prompt)}
                    className="rounded-full border px-4 py-2 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, idx) => {
            const { response } = turn
            const needsYou = response.cards.filter((c) => c.bucket === 'needs_you')
            const worthALook = response.cards.filter((c) => c.bucket === 'worth_a_look')
            const updates = response.cards.filter((c) => c.bucket === 'updates')

            return (
              <div key={idx} className="space-y-4">
                {/* User bubble */}
                <div className="flex justify-end">
                  <div
                    className="rounded-2xl px-4 py-2 text-[13.5px]"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                  >
                    {turn.question}
                  </div>
                </div>

                {/* Assistant response */}
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: 'var(--accent)' }}
                  >
                    <Sparkles size={14} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-4">
                    <p className="text-[14.5px] font-medium leading-relaxed">{response.summary}</p>

                    {/* Count Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        {response.counts.needsYou} need you
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {response.counts.worthALook} worth a look
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                        {response.counts.updates} updates
                      </span>
                      <span
                        className="rounded-full px-2.5 py-0.5"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                      >
                        {response.dateRange}
                      </span>
                    </div>

                    {/* Needs you cards */}
                    {needsYou.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                          Needs you · {needsYou.length}
                        </div>
                        {needsYou.map((c) => (
                          <div
                            key={c.threadId}
                            onClick={() => void openThread(c.threadId)}
                            className="cursor-pointer rounded-xl border border-l-2 p-3.5 transition hover:bg-[var(--bg-hover)]"
                            style={{
                              background: 'var(--bg-elevated)',
                              borderColor: 'var(--border-subtle)',
                              borderLeftColor: 'var(--accent)'
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold">{c.senderName}</span>
                                <span
                                  className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                                >
                                  {c.badge}
                                </span>
                              </div>
                              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {formatCardDate(c.date)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[13px] font-medium">{c.subject}</div>
                            <div className="mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              {c.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Worth a look cards */}
                    {worthALook.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                          Worth a look · {worthALook.length}
                        </div>
                        {worthALook.map((c) => (
                          <div
                            key={c.threadId}
                            onClick={() => void openThread(c.threadId)}
                            className="cursor-pointer rounded-xl border border-l-2 p-3.5 transition hover:bg-[var(--bg-hover)]"
                            style={{
                              background: 'var(--bg-elevated)',
                              borderColor: 'var(--border-subtle)',
                              borderLeftColor: 'var(--success)'
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-semibold">{c.senderName}</span>
                              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {formatCardDate(c.date)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[13px] font-medium">{c.subject}</div>
                            <div className="mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              {c.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Updates bundle with 1-click Archive All */}
                    {updates.length > 0 && (
                      <div
                        className="flex items-center justify-between rounded-xl border p-3.5"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                      >
                        <div>
                          <div className="text-[13px] font-semibold">
                            {updates.length} update{updates.length === 1 ? '' : 's'} &amp; newsletters
                          </div>
                          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                            {updates
                              .map((u) => u.senderName)
                              .slice(0, 4)
                              .join(', ')}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await archiveThreads(updates.map((u) => u.threadId))
                            showToast(`Archived ${updates.length} updates`)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
                          style={{ borderColor: 'var(--border-strong)' }}
                        >
                          <Archive size={13} /> Archive all {updates.length}
                        </button>
                      </div>
                    )}

                    {/* Follow-ups */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {response.followUps.map((f) => (
                        <button
                          key={f}
                          onClick={() => void ask(f)}
                          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition hover:bg-[var(--bg-hover)]"
                          style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                        >
                          <Clock size={11} /> {f}
                        </button>
                      ))}
                    </div>

                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {response.providerLabel}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="flex items-center gap-3 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              <Sparkles size={16} className="animate-pulse" style={{ color: 'var(--accent)' }} />
              Thinking through your inbox and calendar…
            </div>
          )}
        </div>
      </div>

      {/* Bottom Input */}
      <div className="border-t px-8 py-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void ask(input)
          }}
          className="mx-auto flex max-w-[700px] items-center gap-2 rounded-2xl border px-4 py-2.5"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your mail or schedule…"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white transition disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            <ArrowUp size={14} />
          </button>
        </form>
      </div>
      </div>
    </aside>
  )
}
