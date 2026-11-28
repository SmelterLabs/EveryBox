import React, { useEffect, useState } from 'react'
import { Archive, ArrowUp, Check, Clock, FolderInput, MailOpen, Sparkles, Star, Trash2, X, Zap } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import type { AssistantProposedAction, AssistantResponse, AutopilotAction, AutopilotCondition } from '../../../shared/types'

function formatRuleConditionPills(c: AutopilotCondition): string[] {
  const pills: string[] = []
  if (c.fromContains) pills.push(`From contains "${c.fromContains}"`)
  if (c.subjectContains) pills.push(`Subject contains "${c.subjectContains}"`)
  if (c.bodyContains) pills.push(`Body contains "${c.bodyContains}"`)
  if (c.category) pills.push(`Category: ${c.category}`)
  if (c.hasSignInCode) pills.push('Has 2FA code')
  if (c.olderThanHours) pills.push(`Older than ${c.olderThanHours}h`)
  if (c.aiPrompt) pills.push(`AI check: "${c.aiPrompt}"`)
  return pills
}

function formatRuleActionLabel(a: AutopilotAction): string {
  if (a.type === 'trash') return 'Move to Trash'
  if (a.type === 'archive') return 'Archive'
  if (a.type === 'markRead') return 'Mark read'
  if (a.type === 'star') return 'Star'
  if (a.type === 'moveToFolder') return `Move to ${a.folderName || 'Folder'}`
  if (a.type === 'notify') return 'Notify'
  if (a.type === 'preDraft') return 'Pre-draft reply'
  return a.type
}

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
    trashThreads,
    moveThreadsToFolder,
    setReadThreads,
    setStarredThreads,
    refreshAll,
    showToast
  } = useAppStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [completedActions, setCompletedActions] = useState<Record<string, string>>({})
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLDivElement>('assistant')

  const executeProposedAction = async (
    action: AssistantProposedAction,
    opts?: { alsoApplyExisting?: boolean }
  ) => {
    if (busyActionId) return
    setBusyActionId(action.id)
    try {
      if (action.type === 'create_rule') {
        await window.glassmail.saveAutopilotRule({
          ...action.rule,
          id: '',
          runCount: 0,
          lastRunAt: null,
          createdAt: Date.now()
        })
        const applyIds = opts?.alsoApplyExisting ? action.alsoApplyThreadIds || [] : []
        if (applyIds.length > 0) {
          const primaryAct = action.rule.actions[0]
          if (primaryAct?.type === 'trash') {
            await trashThreads(applyIds)
          } else if (primaryAct?.type === 'archive') {
            await archiveThreads(applyIds)
          } else if (primaryAct?.type === 'moveToFolder' && primaryAct.folderName) {
            await moveThreadsToFolder(applyIds, 'custom', primaryAct.folderName)
          } else if (primaryAct?.type === 'markRead') {
            await setReadThreads(applyIds, true)
          } else if (primaryAct?.type === 'star') {
            await setStarredThreads(applyIds, true)
          }
        }
        await refreshAll()
        const statusText =
          applyIds.length > 0
            ? `Rule enabled & applied to ${applyIds.length} email${applyIds.length === 1 ? '' : 's'}`
            : 'Rule enabled in Autopilot'
        setCompletedActions((prev) => ({ ...prev, [action.id]: statusText }))
        if (applyIds.length === 0) {
          showToast(`Enabled rule: ${action.rule.name}`, undefined, 3500)
        }
      } else if (action.type === 'trash_threads') {
        await trashThreads(action.threadIds)
        setCompletedActions((prev) => ({
          ...prev,
          [action.id]: `Moved ${action.threadIds.length} to Trash`
        }))
      } else if (action.type === 'archive_threads') {
        await archiveThreads(action.threadIds)
        setCompletedActions((prev) => ({
          ...prev,
          [action.id]: `Archived ${action.threadIds.length}`
        }))
      } else if (action.type === 'move_threads') {
        await moveThreadsToFolder(action.threadIds, 'custom', action.folderName)
        setCompletedActions((prev) => ({
          ...prev,
          [action.id]: `Moved ${action.threadIds.length} to ${action.folderName}`
        }))
      } else if (action.type === 'mark_read') {
        await setReadThreads(action.threadIds, true)
        setCompletedActions((prev) => ({
          ...prev,
          [action.id]: `Marked ${action.threadIds.length} as read`
        }))
      } else if (action.type === 'mark_unread') {
        await setReadThreads(action.threadIds, false)
        setCompletedActions((prev) => ({
          ...prev,
          [action.id]: `Marked ${action.threadIds.length} as unread`
        }))
      } else if (action.type === 'star_threads') {
        await setStarredThreads(action.threadIds, true)
        setCompletedActions((prev) => ({
          ...prev,
          [action.id]: `Starred ${action.threadIds.length}`
        }))
      }
    } finally {
      setBusyActionId(null)
    }
  }

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
                Ask about your mail, create Autopilot rules, or clean up your inbox in one click.
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

                    {/* Proposed 1-click Autopilot Rule & Mail Action Cards */}
                    {response.actions && response.actions.length > 0 && (
                      <div className="space-y-2.5">
                        {response.actions.map((action) => {
                          const doneText = completedActions[action.id]
                          const isBusy = busyActionId === action.id

                          if (action.type === 'create_rule') {
                            const condPills = formatRuleConditionPills(action.rule.conditions)
                            const actPills = action.rule.actions.map(formatRuleActionLabel)
                            const existingCount = action.alsoApplyThreadIds?.length || 0
                            const primaryVerb =
                              action.rule.actions[0]?.type === 'trash'
                                ? 'Trash'
                                : action.rule.actions[0]?.type === 'archive'
                                  ? 'Archive'
                                  : action.rule.actions[0]?.type === 'moveToFolder'
                                    ? 'Move'
                                    : 'Apply to'

                            return (
                              <div
                                key={action.id}
                                className="rounded-xl border p-3.5"
                                style={{
                                  background: 'var(--bg-elevated)',
                                  borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--border-subtle))'
                                }}
                              >
                                <div className="flex items-start gap-2">
                                  <Zap
                                    size={14}
                                    fill="#f5b841"
                                    className="mt-0.5 shrink-0"
                                    style={{ color: '#e5a424' }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                      {action.rule.name}
                                    </div>
                                    {action.description && (
                                      <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                                        {action.description}
                                      </p>
                                    )}
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                                      {condPills.map((p) => (
                                        <span
                                          key={p}
                                          className="rounded-md px-2 py-0.5 font-medium"
                                          style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)' }}
                                        >
                                          {p}
                                        </span>
                                      ))}
                                      <span style={{ color: 'var(--text-muted)' }}>→</span>
                                      {actPills.map((p) => (
                                        <span
                                          key={p}
                                          className="rounded-md px-2 py-0.5 font-semibold"
                                          style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                                        >
                                          {p}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  {doneText ? (
                                    <>
                                      <span
                                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                                        style={{
                                          background: 'color-mix(in srgb, var(--success) 16%, transparent)',
                                          color: 'var(--success)'
                                        }}
                                      >
                                        <Check size={13} />
                                        {doneText}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setActiveView('autopilot')}
                                        className="text-[11.5px] font-medium hover:underline"
                                        style={{ color: 'var(--accent-text)' }}
                                      >
                                        View in Autopilot
                                      </button>
                                    </>
                                  ) : existingCount > 0 ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          void executeProposedAction(action, { alsoApplyExisting: true })
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                                        style={{ background: 'var(--accent)' }}
                                      >
                                        <Check size={13} />
                                        Enable Rule &amp; {primaryVerb} {existingCount} Now
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          void executeProposedAction(action, { alsoApplyExisting: false })
                                        }
                                        className="rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                                        style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                                      >
                                        Enable Rule Only
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => void executeProposedAction(action)}
                                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                                      style={{ background: 'var(--accent)' }}
                                    >
                                      <Check size={13} />
                                      Enable Autopilot Rule
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          }

                          const ActionIcon =
                            action.type === 'trash_threads'
                              ? Trash2
                              : action.type === 'archive_threads'
                                ? Archive
                                : action.type === 'move_threads'
                                  ? FolderInput
                                  : action.type === 'star_threads'
                                    ? Star
                                    : MailOpen
                          const isDanger = action.type === 'trash_threads'

                          return (
                            <div
                              key={action.id}
                              className="flex items-center justify-between gap-3 rounded-xl border p-3"
                              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                  {action.label}
                                </div>
                                {action.description && (
                                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                                    {action.description}
                                  </div>
                                )}
                              </div>
                              {doneText ? (
                                <span
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold"
                                  style={{
                                    background: 'color-mix(in srgb, var(--success) 16%, transparent)',
                                    color: 'var(--success)'
                                  }}
                                >
                                  <Check size={12} />
                                  {doneText}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void executeProposedAction(action)}
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:opacity-90 disabled:opacity-50"
                                  style={{
                                    background: isDanger ? 'var(--danger)' : 'var(--accent)',
                                    color: '#fff'
                                  }}
                                >
                                  <ActionIcon size={12} />
                                  Run
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

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
