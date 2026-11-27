import React, { useEffect, useState } from 'react'
import { CalendarPlus, Check, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { EmailHtmlBody } from './EmailHtmlBody'
import { AIDraftCard } from './AIDraftCard'
import { buildReplyComposerState } from '../utils/replyHelper'
import type { ThreadAIBundle, ThreadDetail, ThreadPreDraft } from '../../../shared/types'

const BUNDLE_LABELS: Record<ThreadAIBundle, string> = {
  action: 'Action',
  waiting: 'Waiting',
  fyi: 'FYI',
  finance: 'Finance',
  shipping: 'Shipping',
  newsletter: 'Newsletter',
  promo: 'Promo',
  cold_outreach: 'Outreach',
  security: 'Security'
}

function formatImplicitEventTime(startIso: string, endIso?: string): string {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return startIso
  const datePart = start.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
  if (endIso) {
    const end = new Date(endIso)
    if (!Number.isNaN(end.getTime())) {
      const sameDay = start.toDateString() === end.toDateString()
      const endPart = sameDay
        ? end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : end.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      return `${datePart} – ${endPart}`
    }
  }
  return datePart
}

export const TriageView: React.FC = () => {
  const {
    settings,
    threads,
    preDrafts,
    threadAiMeta,
    voiceProfiles,
    archiveThreads,
    trashThreads,
    snoozeThreads,
    openComposer,
    queueSendWithUndo,
    setActiveView,
    reclassifyThread,
    dismissPreDraft,
    createCalendarEventFromImplicit,
    saveSettings,
    showToast,
    refreshAll
  } = useAppStore()

  const [index, setIndex] = useState(0)
  const [detail, setDetail] = useState<ThreadDetail | null>(null)
  const [totalInitial] = useState(() => Math.max(1, threads.length))
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [localPreDraft, setLocalPreDraft] = useState<ThreadPreDraft | null>(null)
  const [editablePreDraftBody, setEditablePreDraftBody] = useState('')
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined)
  const [reclassifying, setReclassifying] = useState(false)
  const [addingImplicitEvent, setAddingImplicitEvent] = useState(false)
  const [addedImplicitThreadIds, setAddedImplicitThreadIds] = useState<Record<string, boolean>>({})

  const currentSummary = threads[index]
  const aiMeta = currentSummary ? threadAiMeta[currentSummary.id] : undefined

  const activePreDraft =
    localPreDraft && localPreDraft.threadId === detail?.id && localPreDraft.status !== 'dismissed'
      ? localPreDraft
      : preDrafts.find((p) => p.threadId === detail?.id && p.status !== 'dismissed') || null

  useEffect(() => {
    setEditablePreDraftBody(activePreDraft?.body || '')
  }, [activePreDraft?.threadId, activePreDraft?.body])

  useEffect(() => {
    setLocalPreDraft(null)
    setLoadingDraft(false)
    setReclassifying(false)
    setAddingImplicitEvent(false)
    if (!currentSummary) {
      setDetail(null)
      return
    }
    void window.glassmail.getThread(currentSummary.id).then(setDetail)
  }, [currentSummary?.id])

  const generateAIDraft = async (voiceProfileId?: string) => {
    if (!detail) return
    setLoadingDraft(true)
    try {
      const res = await window.glassmail.generatePreDraft({
        threadId: detail.id,
        accountId: detail.accountId,
        voiceProfileId: voiceProfileId ?? selectedVoiceId
      })
      if (res.ok && res.preDraft) {
        setLocalPreDraft(res.preDraft)
        await refreshAll()
      } else {
        showToast(res.error || 'Could not generate AI draft', undefined, 4000)
      }
    } finally {
      setLoadingDraft(false)
    }
  }

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
  }, [currentSummary, detail, threads.length])

  const left = Math.max(0, threads.length - index)
  const progressPct = Math.min(100, Math.round(((totalInitial - left) / totalInitial) * 100))
  const latestMsg = detail ? detail.messages[detail.messages.length - 1] : undefined

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
          <div className="mx-auto max-w-[740px]">
            <h1 className="text-[22px] font-semibold leading-snug tracking-tight">{detail.subject}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
              <span>{detail.latestFrom.name || detail.latestFrom.email}</span>
              <span>·</span>
              <span>
                {detail.messageCount} message{detail.messageCount === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>
                <Sparkles size={12} /> {detail.accountEmail}
              </span>
              {!(loadingDraft || activePreDraft) && (
                <button
                  type="button"
                  onClick={() => void generateAIDraft()}
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium transition hover:opacity-85"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  <Sparkles size={12} /> Draft reply
                </button>
              )}
            </div>

            {/* Persisted AI Triage Signals (Urgency, Bundle & Reason) */}
            {aiMeta && (
              <div
                className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {aiMeta.urgency >= 2 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background:
                          aiMeta.urgency >= 3
                            ? 'rgba(240, 96, 96, 0.14)'
                            : 'rgba(245, 184, 65, 0.16)',
                        color: aiMeta.urgency >= 3 ? 'var(--danger)' : '#d99a1e'
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: aiMeta.urgency >= 3 ? 'var(--danger)' : '#e5a424' }}
                      />
                      {aiMeta.urgency >= 3 ? 'Urgent' : 'Priority'}
                    </span>
                  )}
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)' }}
                  >
                    {BUNDLE_LABELS[aiMeta.bundle] || aiMeta.bundle}
                  </span>
                  {aiMeta.needsReply && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      Needs reply
                    </span>
                  )}
                  {aiMeta.aiReason && (
                    <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      {aiMeta.aiReason}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={reclassifying}
                  onClick={async () => {
                    setReclassifying(true)
                    try {
                      const updated = await reclassifyThread(detail.id)
                      if (updated) {
                        showToast(`Re-classified as "${updated.bundle}"`, undefined, 2500)
                      }
                    } finally {
                      setReclassifying(false)
                    }
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  style={{ color: 'var(--text-muted)' }}
                  title="Re-classify thread with Fast Sorter"
                >
                  <RefreshCw size={11} className={reclassifying ? 'animate-spin' : ''} />
                  <span>Re-classify</span>
                </button>
              </div>
            )}

            {/* Cached 1-Line Summary Gist */}
            {aiMeta?.summary?.gist && (
              <div
                className="mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px]"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <Sparkles size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-text)' }} />
                <span className="leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {aiMeta.summary.gist}
                </span>
              </div>
            )}

            {/* 1-Click Implicit Calendar Event Banner */}
            {aiMeta?.implicitEvent && (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                  >
                    <CalendarPlus size={17} />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-[10.5px] font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      Meeting detected
                    </div>
                    <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {aiMeta.implicitEvent.title}
                    </div>
                    <div className="truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      {formatImplicitEventTime(aiMeta.implicitEvent.startIso, aiMeta.implicitEvent.endIso)}
                      {aiMeta.implicitEvent.location ? ` · ${aiMeta.implicitEvent.location}` : ''}
                    </div>
                  </div>
                </div>
                {addedImplicitThreadIds[detail.id] ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: 'rgba(45, 212, 191, 0.14)', color: 'var(--success)' }}
                  >
                    <Check size={13} /> Added to Calendar
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={addingImplicitEvent}
                    onClick={async () => {
                      if (!aiMeta.implicitEvent) return
                      setAddingImplicitEvent(true)
                      try {
                        const res = await createCalendarEventFromImplicit(
                          detail.accountId,
                          aiMeta.implicitEvent,
                          detail.id
                        )
                        if (res.ok) {
                          setAddedImplicitThreadIds((prev) => ({ ...prev, [detail.id]: true }))
                        }
                      } finally {
                        setAddingImplicitEvent(false)
                      }
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    <CalendarPlus size={13} />
                    {addingImplicitEvent ? 'Adding…' : 'Add to Calendar'}
                  </button>
                )}
              </div>
            )}

            {/* Inline Ghost Draft (review / send / dismiss without leaving Triage) */}
            {(loadingDraft || activePreDraft) && (
              <AIDraftCard
                thread={detail}
                latestMsg={latestMsg}
                settings={settings}
                preDraft={activePreDraft}
                loading={loadingDraft}
                body={editablePreDraftBody}
                onBodyChange={setEditablePreDraftBody}
                voiceProfiles={voiceProfiles}
                selectedVoiceId={selectedVoiceId}
                onSelectVoice={(voiceId) => {
                  setSelectedVoiceId(voiceId)
                  void generateAIDraft(voiceId)
                }}
                onDismiss={async () => {
                  setLocalPreDraft(null)
                  await dismissPreDraft(detail.id)
                }}
                onSend={async () => {
                  if (!activePreDraft || !editablePreDraftBody.trim()) return
                  const baseState = buildReplyComposerState(detail, 'reply', latestMsg, {
                    outlookPrefixes: settings?.uiTheme === 'outlook-classic'
                  })
                  const toAddr = (baseState.to || latestMsg?.from.email || '').trim()
                  if (!toAddr) {
                    openComposer({ ...baseState, body: editablePreDraftBody })
                    return
                  }
                  const escapeHtml = (text: string): string =>
                    text
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#39;')
                  const bodyText = editablePreDraftBody
                  const bodyHtml = bodyText
                    .split('\n')
                    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
                    .join('')
                  setLocalPreDraft(null)
                  await window.glassmail.deletePreDraft(detail.id)
                  await refreshAll()
                  queueSendWithUndo(
                    {
                      accountId: detail.accountId,
                      to: toAddr.split(',').map((s) => s.trim()).filter(Boolean),
                      cc: [],
                      bcc: [],
                      subject: baseState.subject || activePreDraft.subject,
                      bodyHtml,
                      bodyText,
                      replyToMessageId: latestMsg?.messageIdHeader,
                      threadId: detail.id
                    },
                    {
                      ...baseState,
                      body: editablePreDraftBody
                    },
                    settings?.undoSendSeconds ?? 5
                  )
                }}
                onOpenInComposer={async () => {
                  if (!activePreDraft) return
                  const baseState = buildReplyComposerState(detail, 'reply', latestMsg, {
                    outlookPrefixes: settings?.uiTheme === 'outlook-classic'
                  })
                  openComposer({
                    ...baseState,
                    subject: baseState.subject || activePreDraft.subject,
                    body: editablePreDraftBody
                  })
                  setLocalPreDraft(null)
                  await window.glassmail.deletePreDraft(detail.id)
                  await refreshAll()
                }}
                onRegenerate={() => void generateAIDraft()}
                onToggleAlwaysAutoDraft={async () => {
                  if (!latestMsg?.from.email || !settings) return
                  const sender = latestMsg.from.email.toLowerCase()
                  const alwaysList = settings.autopilot?.preDraftAlwaysSenders || []
                  const isAlways = alwaysList.some((s) => s.toLowerCase() === sender)
                  const prevSettings = settings
                  const nextAlways = isAlways
                    ? alwaysList.filter((s) => s.toLowerCase() !== sender)
                    : Array.from(new Set([...alwaysList, sender]))
                  const nextExcluded = (settings.autopilot?.preDraftExcludedSenders || []).filter(
                    (s) => s.toLowerCase() !== sender
                  )
                  await saveSettings({
                    ...settings,
                    autopilot: {
                      ...settings.autopilot,
                      autoPreDraftPeople: Boolean(settings.autopilot?.autoPreDraftPeople),
                      preDraftDisabledAccountIds: settings.autopilot?.preDraftDisabledAccountIds || [],
                      preDraftAlwaysSenders: nextAlways,
                      preDraftExcludedSenders: isAlways
                        ? settings.autopilot?.preDraftExcludedSenders || []
                        : nextExcluded,
                      waitingDismissedThreadIds: settings.autopilot?.waitingDismissedThreadIds || [],
                      autoClean2FAHours: settings.autopilot?.autoClean2FAHours ?? null
                    }
                  })
                  await refreshAll()
                  showToast(
                    isAlways
                      ? `Removed ${sender} from Always auto-draft`
                      : `Will always auto-draft replies for ${sender}`,
                    async () => {
                      await saveSettings(prevSettings)
                      await refreshAll()
                    }
                  )
                }}
                onExcludeSender={async () => {
                  if (!latestMsg?.from.email || !settings) return
                  const sender = latestMsg.from.email.toLowerCase()
                  const alwaysList = settings.autopilot?.preDraftAlwaysSenders || []
                  const prevList = settings.autopilot?.preDraftExcludedSenders || []
                  const nextList = Array.from(new Set([...prevList, sender]))
                  const nextAlways = alwaysList.filter((s) => s.toLowerCase() !== sender)
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
                  setLocalPreDraft(null)
                  await dismissPreDraft(detail.id)
                  const purged = await window.glassmail.deletePreDraftsBySender(sender)
                  await refreshAll()
                  const extra = purged.removed > 0 ? ` (cleared ${purged.removed + 1} drafts)` : ''
                  showToast(`Won't pre-draft replies for ${sender}${extra}`, async () => {
                    await saveSettings(prevSettings)
                    await refreshAll()
                  })
                }}
              />
            )}

            <div className="mt-6 space-y-6">
              {detail.messages.map((m) => (
                <div key={m.id} className="border-t pt-5 first:border-t-0" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-semibold">{m.from.name || m.from.email}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(m.date).toLocaleString()}</span>
                  </div>
                  <EmailHtmlBody
                    html={m.bodyHtml || `<p>${m.bodyText.replace(/\n/g, '<br/>')}</p>`}
                    className="mt-3"
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
