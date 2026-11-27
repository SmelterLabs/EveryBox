import React, { useState } from 'react'
import {
  Check,
  Mic,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  Zap
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type {
  AutopilotRule,
  SenderPreference,
  SenderProfile,
  VoiceProfile,
  VoiceProfileKind
} from '../../../shared/types'

const VOICE_PRESETS: { kind: VoiceProfileKind; name: string; description: string }[] = [
  {
    kind: 'personal',
    name: 'Personal',
    description: 'Relaxed, warm, everyday tone for friends & family'
  },
  {
    kind: 'business',
    name: 'Business (General)',
    description: 'Clear, polished default voice for everyday work'
  },
  {
    kind: 'customer',
    name: 'Business · Customer',
    description: 'Helpful, approachable, client-facing communication'
  },
  {
    kind: 'colleague',
    name: 'Business · Colleague',
    description: 'Direct, collaborative internal team style'
  },
  {
    kind: 'executive',
    name: 'Business · Executive',
    description: 'Crisp, concise, bottom-line-first leadership voice'
  }
]

const STARTER_PROMPTS = [
  'Archive 2FA sign-in codes after 24 hours',
  'Move emails with Invoice or Receipt in the subject to Receipts and mark read',
  'Pre-draft replies for emails from real people',
  'Star urgent emails and notify me'
]

function formatConditions(r: AutopilotRule): string[] {
  const pills: string[] = []
  const c = r.conditions
  if (c.fromContains) pills.push(`From contains "${c.fromContains}"`)
  if (c.subjectContains) pills.push(`Subject contains "${c.subjectContains}"`)
  if (c.bodyContains) pills.push(`Body contains "${c.bodyContains}"`)
  if (c.category) pills.push(`Category: ${c.category}`)
  if (c.hasSignInCode) pills.push('Has 2FA code')
  if (c.olderThanHours) pills.push(`Older than ${c.olderThanHours}h`)
  if (c.aiPrompt) pills.push(`AI check: "${c.aiPrompt}"`)
  return pills
}

function formatActionLabel(a: AutopilotRule['actions'][number]): string {
  if (a.type === 'archive') return 'Archive'
  if (a.type === 'trash') return 'Move to Trash'
  if (a.type === 'markRead') return 'Mark read'
  if (a.type === 'star') return 'Star'
  if (a.type === 'moveToFolder') return `Move to ${a.folderName || 'Folder'}`
  if (a.type === 'notify') return 'Desktop notify'
  if (a.type === 'preDraft') return 'Pre-draft reply'
  return a.type
}

function formatSenderStats(p: SenderProfile): string {
  const parts: string[] = []
  if (p.repliedCount > 0) parts.push(`${p.repliedCount} ${p.repliedCount === 1 ? 'reply' : 'replies'}`)
  if (p.draftDismissedCount > 0) {
    parts.push(`${p.draftDismissedCount} dismissed ${p.draftDismissedCount === 1 ? 'draft' : 'drafts'}`)
  }
  if (p.draftAcceptedCount > 0) {
    parts.push(`${p.draftAcceptedCount} accepted ${p.draftAcceptedCount === 1 ? 'draft' : 'drafts'}`)
  }
  if (p.archivedUnreadCount > 0) parts.push(`${p.archivedUnreadCount} archived unread`)
  if (p.trashedUnreadCount > 0) parts.push(`${p.trashedUnreadCount} trashed unread`)
  if (parts.length === 0 && p.totalSeen > 0) parts.push(`${p.totalSeen} seen`)
  return parts.slice(0, 2).join(' · ')
}

export const AutopilotView: React.FC = () => {
  const {
    settings,
    accounts,
    preDrafts,
    autopilotRules,
    autopilotLogs,
    habitSuggestions,
    senderProfiles,
    voiceProfiles,
    saveSettings,
    refreshAll,
    setActiveView,
    selectThread,
    acceptHabitSuggestion,
    dismissHabitSuggestion,
    setSenderPreference,
    undoAutopilotLog,
    showToast
  } = useAppStore()

  const [rulePrompt, setRulePrompt] = useState('')
  const [buildingRule, setBuildingRule] = useState(false)
  const [runningPass, setRunningPass] = useState(false)
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null)
  const [busyUndoLogId, setBusyUndoLogId] = useState<string | null>(null)

  // Voice Profiles state
  const [learningKind, setLearningKind] = useState<string | null>(null)
  const [voiceAccountScope, setVoiceAccountScope] = useState<Record<string, string[]>>({})
  const [voiceRecipientFilter, setVoiceRecipientFilter] = useState<Record<string, string>>({})
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null)
  const [editStyleSummary, setEditStyleSummary] = useState('')
  const [editGreeting, setEditGreeting] = useState('')
  const [editSignOff, setEditSignOff] = useState('')

  const autoPreDraftPeople = Boolean(settings?.autopilot?.autoPreDraftPeople)
  const preDraftDisabledAccountIds = settings?.autopilot?.preDraftDisabledAccountIds || []
  const preDraftAlwaysSenders = settings?.autopilot?.preDraftAlwaysSenders || []
  const preDraftExcludedSenders = settings?.autopilot?.preDraftExcludedSenders || []
  const autoClean2FAHours = settings?.autopilot?.autoClean2FAHours ?? null

  const updateAutopilotSettings = async (patch: {
    autoPreDraftPeople?: boolean
    preDraftDisabledAccountIds?: string[]
    preDraftAlwaysSenders?: string[]
    preDraftExcludedSenders?: string[]
    autoClean2FAHours?: number | null
  }) => {
    if (!settings) return
    await saveSettings({
      ...settings,
      autopilot: {
        ...settings.autopilot,
        autoPreDraftPeople: patch.autoPreDraftPeople ?? autoPreDraftPeople,
        preDraftDisabledAccountIds: patch.preDraftDisabledAccountIds ?? preDraftDisabledAccountIds,
        preDraftAlwaysSenders: patch.preDraftAlwaysSenders ?? preDraftAlwaysSenders,
        preDraftExcludedSenders: patch.preDraftExcludedSenders ?? preDraftExcludedSenders,
        waitingDismissedThreadIds: settings.autopilot?.waitingDismissedThreadIds || [],
        autoClean2FAHours: patch.autoClean2FAHours !== undefined ? patch.autoClean2FAHours : autoClean2FAHours
      }
    })
    showToast('Autopilot settings updated', undefined, 2200)
  }

  const togglePreDraftAccount = (accId: string) => {
    const isDisabled = preDraftDisabledAccountIds.includes(accId)
    const next = isDisabled
      ? preDraftDisabledAccountIds.filter((id) => id !== accId)
      : [...preDraftDisabledAccountIds, accId]
    void updateAutopilotSettings({ preDraftDisabledAccountIds: next })
  }

  const handleBuildRule = async (e?: React.FormEvent, customPrompt?: string) => {
    e?.preventDefault()
    const text = (customPrompt ?? rulePrompt).trim()
    if (!text || buildingRule) return
    setBuildingRule(true)
    try {
      const { rule, usedAI } = await window.glassmail.compileAutopilotRule(text)
      await window.glassmail.saveAutopilotRule({
        ...rule,
        id: '',
        runCount: 0,
        lastRunAt: null,
        createdAt: Date.now()
      })
      setRulePrompt('')
      await refreshAll()
      showToast(usedAI ? `AI created rule: ${rule.name}` : `Created rule: ${rule.name}`)
    } finally {
      setBuildingRule(false)
    }
  }

  const handleRunNow = async () => {
    if (runningPass) return
    setRunningPass(true)
    try {
      const res = await window.glassmail.runAutopilotNow()
      await refreshAll()
      showToast(
        res.actionsTaken > 0
          ? `Autopilot handled ${res.actionsTaken} item${res.actionsTaken === 1 ? '' : 's'}`
          : 'Autopilot checked inbox — nothing new to run'
      )
    } finally {
      setRunningPass(false)
    }
  }

  const toggleVoiceAccount = (presetKey: string, accId: string) => {
    setVoiceAccountScope((prev) => {
      const cur = prev[presetKey] || []
      const next = cur.includes(accId) ? cur.filter((id) => id !== accId) : [...cur, accId]
      return { ...prev, [presetKey]: next }
    })
  }

  const handleLearnVoice = async (
    preset: { kind: VoiceProfileKind; name: string; description: string },
    existing?: VoiceProfile
  ) => {
    const key = existing?.id || preset.kind
    setLearningKind(key)
    try {
      const scopedAccounts = voiceAccountScope[preset.kind] ?? existing?.accountIds ?? []
      const res = await window.glassmail.learnVoiceProfile({
        id: existing?.id,
        kind: preset.kind,
        name: preset.name,
        description: preset.description,
        accountIds: scopedAccounts,
        recipientFilter: voiceRecipientFilter[preset.kind]?.trim() || undefined
      })
      if (res.error) {
        showToast(res.error, undefined, 4500)
      } else if (res.profile) {
        await refreshAll()
        showToast(`Learned "${res.profile.name}" from ${res.profile.sampleCount} sent emails`)
      }
    } finally {
      setLearningKind(null)
    }
  }

  const startEditVoice = (vp: VoiceProfile) => {
    setEditingVoiceId(vp.id)
    setEditStyleSummary(vp.styleSummary)
    setEditGreeting(vp.greetingStyle || '')
    setEditSignOff(vp.signOffStyle || '')
  }

  const saveEditVoice = async (vp: VoiceProfile) => {
    await window.glassmail.saveVoiceProfile({
      ...vp,
      styleSummary: editStyleSummary.trim(),
      greetingStyle: editGreeting.trim() || undefined,
      signOffStyle: editSignOff.trim() || undefined
    })
    setEditingVoiceId(null)
    await refreshAll()
    showToast(`Saved "${vp.name}" voice`)
  }

  const visibleSenderProfiles = [
    ...senderProfiles.filter((p) => p.preference !== 'normal'),
    ...senderProfiles
      .filter((p) => p.preference === 'normal')
      .sort(
        (a, b) =>
          b.repliedCount +
          b.draftDismissedCount +
          b.draftAcceptedCount +
          b.archivedUnreadCount +
          b.trashedUnreadCount -
          (a.repliedCount +
            a.draftDismissedCount +
            a.draftAcceptedCount +
            a.archivedUnreadCount +
            a.trashedUnreadCount)
      )
  ].slice(0, 12)

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-8 py-5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">
            <Zap size={19} fill="#f5b841" style={{ color: '#e5a424' }} />
            <span>Autopilot</span>
          </h1>
          <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
            Plain-English AI rules, background pre-drafts, and learned writing voices powered by your private AI.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleRunNow()}
          disabled={runningPass}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {runningPass ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          {runningPass ? 'Running…' : 'Run Autopilot Now'}
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* 0. Learned Suggestions (shown when pending suggestions exist) */}
          {habitSuggestions.length > 0 && (
            <section
              className="rounded-2xl border p-5"
              style={{
                background: 'var(--bg-elevated)',
                borderColor: 'color-mix(in srgb, var(--accent) 35%, var(--border-subtle))'
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                    <Sparkles size={15} style={{ color: 'var(--accent)' }} />
                    <span>Learned Suggestions</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      {habitSuggestions.length}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Patterns noticed from your recent actions — nothing runs until you turn it on.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {habitSuggestions.map((suggestion) => {
                  const busy = busySuggestionId === suggestion.id
                  return (
                    <div
                      key={suggestion.id}
                      className="flex items-center justify-between gap-4 rounded-xl border p-3.5"
                      style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {suggestion.title}
                        </div>
                        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          {suggestion.reason}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusySuggestionId(suggestion.id)
                            try {
                              await acceptHabitSuggestion(suggestion.id)
                            } finally {
                              setBusySuggestionId(null)
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ background: 'var(--accent)' }}
                        >
                          <Check size={12} />
                          Turn On Rule
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setBusySuggestionId(suggestion.id)
                            try {
                              await dismissHabitSuggestion(suggestion.id)
                            } finally {
                              setBusySuggestionId(null)
                            }
                          }}
                          className="rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                          style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 1. Built-in AI Switches */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div
              className="flex flex-col justify-between gap-3 rounded-2xl border p-4"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <Sparkles size={14} fill="#f5b841" style={{ color: '#e5a424' }} />
                    <span>Background AI Pre-Drafts</span>
                  </div>
                  <p className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    Quietly pre-drafts voice-matched replies for unread emails from people — automatically skips newsletters, unsubscribe footers, order confirmations, and automated mail.
                  </p>
                  {preDrafts.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await window.glassmail.clearAllPreDrafts()
                        await refreshAll()
                        showToast(`Cleared ${preDrafts.length} pre-draft${preDrafts.length === 1 ? '' : 's'}`)
                      }}
                      className="mt-1.5 text-[11px] font-medium hover:underline"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Clear all {preDrafts.length} existing pre-draft{preDrafts.length === 1 ? '' : 's'}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void updateAutopilotSettings({ autoPreDraftPeople: !autoPreDraftPeople })}
                  className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition"
                  style={{ background: autoPreDraftPeople ? 'var(--accent)' : 'var(--border-strong)' }}
                  aria-pressed={autoPreDraftPeople}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                    style={{ left: autoPreDraftPeople ? '22px' : '2px' }}
                  />
                </button>
              </div>

              {(autoPreDraftPeople || preDraftAlwaysSenders.length > 0) && accounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Active accounts:
                  </span>
                  {accounts.map((acc) => {
                    const enabled = !preDraftDisabledAccountIds.includes(acc.id)
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => togglePreDraftAccount(acc.id)}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition"
                        style={{
                          borderColor: enabled ? acc.color : 'var(--border-subtle)',
                          background: enabled ? 'var(--bg-main)' : 'transparent',
                          color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
                          opacity: enabled ? 1 : 0.5
                        }}
                        title={enabled ? `Click to disable pre-drafts for ${acc.email}` : `Click to enable pre-drafts for ${acc.email}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: acc.color }} />
                        {acc.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {preDraftAlwaysSenders.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-medium" style={{ color: 'var(--accent-text)' }}>
                    <Sparkles size={10} fill="currentColor" />
                    Always auto-draft ({preDraftAlwaysSenders.length}):
                  </span>
                  {preDraftAlwaysSenders.map((sender) => (
                    <span
                      key={sender}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
                      style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      {sender}
                      <button
                        type="button"
                        onClick={() =>
                          void updateAutopilotSettings({
                            preDraftAlwaysSenders: preDraftAlwaysSenders.filter((s) => s !== sender)
                          })
                        }
                        className="ml-0.5 rounded-full hover:text-[var(--danger)]"
                        title={`Remove ${sender} from Always auto-draft`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {preDraftExcludedSenders.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    Muted senders ({preDraftExcludedSenders.length}):
                  </span>
                  {preDraftExcludedSenders.map((sender) => (
                    <span
                      key={sender}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-main)', color: 'var(--text-secondary)' }}
                    >
                      {sender}
                      <button
                        type="button"
                        onClick={() =>
                          void updateAutopilotSettings({
                            preDraftExcludedSenders: preDraftExcludedSenders.filter((s) => s !== sender)
                          })
                        }
                        className="ml-0.5 rounded-full hover:text-[var(--danger)]"
                        title={`Re-enable pre-drafts for ${sender}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div
              className="flex items-start justify-between gap-4 rounded-2xl border p-4"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <div className="text-[13.5px] font-semibold">Auto-Clean 2FA Sign-In Codes</div>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  Automatically archive expired verification codes after they're no longer needed.
                </p>
              </div>
              <select
                value={autoClean2FAHours === null ? 'off' : String(autoClean2FAHours)}
                onChange={(e) => {
                  const v = e.target.value
                  void updateAutopilotSettings({ autoClean2FAHours: v === 'off' ? null : Number(v) })
                }}
                className="shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] outline-none"
                style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
              >
                <option value="off">Off</option>
                <option value="12">After 12h</option>
                <option value="24">After 24h</option>
                <option value="72">After 3 days</option>
                <option value="168">After 7 days</option>
              </select>
            </div>
          </section>

          {/* 2. Plain-English AI Rules */}
          <section
            className="rounded-2xl border p-5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="mb-3">
              <h2 className="text-[15px] font-semibold">AI Rules</h2>
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Just describe what you want in plain English — EveryBox compiles it into an automated rule.
              </p>
            </div>

            <form onSubmit={(e) => void handleBuildRule(e)} className="flex gap-2">
              <input
                value={rulePrompt}
                onChange={(e) => setRulePrompt(e.target.value)}
                placeholder='e.g. "Move anything from Stripe or with Invoice in the subject to Receipts and mark read"'
                className="flex-1 rounded-xl border bg-transparent px-3.5 py-2.5 text-[13px] outline-none placeholder:text-[var(--text-muted)]"
                style={{ borderColor: 'var(--border-strong)' }}
              />
              <button
                type="submit"
                disabled={buildingRule || !rulePrompt.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-45"
                style={{ background: 'var(--accent)' }}
              >
                <Sparkles size={14} />
                {buildingRule ? 'Building…' : 'Create Rule'}
              </button>
            </form>

            {/* Starter Rule Ideas */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  disabled={buildingRule}
                  onClick={() => void handleBuildRule(undefined, sp)}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition hover:bg-[var(--bg-hover)]"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  <Plus size={10} /> {sp}
                </button>
              ))}
            </div>

            {/* Active Rules List */}
            {autopilotRules.length > 0 && (
              <div className="mt-4 space-y-2">
                {autopilotRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-start justify-between gap-3 rounded-xl border p-3.5"
                    style={{
                      background: 'var(--bg-main)',
                      borderColor: 'var(--border-subtle)',
                      opacity: rule.enabled ? 1 : 0.55
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold">{rule.name}</span>
                        {rule.source === 'learned' && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                          >
                            <Sparkles size={9} /> Learned
                          </span>
                        )}
                        {rule.runCount > 0 && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px]"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                          >
                            Ran {rule.runCount}×
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {formatConditions(rule).map((c, idx) => (
                          <span
                            key={idx}
                            className="rounded-md px-2 py-0.5"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                          >
                            {c}
                          </span>
                        ))}
                        <span style={{ color: 'var(--text-muted)' }}>→</span>
                        {rule.actions.map((a, idx) => (
                          <span
                            key={idx}
                            className="rounded-md px-2 py-0.5 font-medium"
                            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                          >
                            {formatActionLabel(a)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await window.glassmail.toggleAutopilotRule(rule.id, !rule.enabled)
                          await refreshAll()
                        }}
                        className="relative h-5 w-9 rounded-full transition"
                        style={{ background: rule.enabled ? 'var(--accent)' : 'var(--border-strong)' }}
                        title={rule.enabled ? 'Pause rule' : 'Enable rule'}
                      >
                        <span
                          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                          style={{ left: rule.enabled ? '18px' : '2px' }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await window.glassmail.deleteAutopilotRule(rule.id)
                          await refreshAll()
                          showToast('Deleted rule')
                        }}
                        className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
                        style={{ color: 'var(--danger)' }}
                        title="Delete rule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2b. Learned Sender Preferences */}
          <section
            className="rounded-2xl border p-5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="mb-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Users size={15} style={{ color: 'var(--accent)' }} />
                <span>Learned Sender Preferences</span>
              </h2>
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Senders EveryBox has observed from your replies and draft choices. Override any sender at any time.
              </p>
            </div>

            {visibleSenderProfiles.length === 0 ? (
              <div className="py-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
                No learned sender preferences yet. As you reply to people or dismiss drafts, they appear here.
              </div>
            ) : (
              <div className="space-y-1.5">
                {visibleSenderProfiles.map((profile) => {
                  const statsText = formatSenderStats(profile)
                  return (
                    <div
                      key={profile.senderEmail}
                      className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
                      style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {profile.displayName || profile.senderEmail}
                          </span>
                          {profile.displayName && profile.displayName !== profile.senderEmail && (
                            <span className="truncate text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                              {profile.senderEmail}
                            </span>
                          )}
                        </div>
                        {statsText && (
                          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {statsText}
                          </div>
                        )}
                      </div>
                      <select
                        value={profile.preference}
                        onChange={(e) =>
                          void setSenderPreference(profile.senderEmail, e.target.value as SenderPreference)
                        }
                        aria-label={`Preference for ${profile.senderEmail}`}
                        className="shrink-0 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium outline-none"
                        style={{
                          background:
                            profile.preference === 'normal' ? 'var(--bg-elevated)' : 'var(--accent-soft)',
                          borderColor:
                            profile.preference === 'normal' ? 'var(--border-strong)' : 'var(--accent)',
                          color: profile.preference === 'normal' ? 'var(--text-primary)' : 'var(--accent-text)'
                        }}
                      >
                        <option value="normal">Normal</option>
                        <option value="vip">VIP</option>
                        <option value="no_autodraft">No Auto-Draft</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 3. Voice Profiles ("Learn My Voice") */}
          <section
            className="rounded-2xl border p-5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Mic size={15} style={{ color: 'var(--accent)' }} />
                <span>Voice Profiles — Learn Your Writing Style</span>
              </h2>
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Let EveryBox scan your sent emails to build distinct voices for personal notes, customers, colleagues, or executives. Pick which accounts to learn from, or leave unselected for all accounts.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {VOICE_PRESETS.map((preset) => {
                const learned = voiceProfiles.find((v) => v.kind === preset.kind)
                const isLearning = learningKind === (learned?.id || preset.kind)
                const scoped = voiceAccountScope[preset.kind] ?? learned?.accountIds ?? []
                const isEditing = learned && editingVoiceId === learned.id

                return (
                  <div
                    key={preset.kind}
                    className="flex flex-col justify-between rounded-xl border p-4"
                    style={{ background: 'var(--bg-main)', borderColor: learned ? 'var(--accent)' : 'var(--border-subtle)' }}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                            <span>{preset.name}</span>
                            {learned && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                              >
                                <Check size={10} /> Learned ({learned.sampleCount})
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                            {preset.description}
                          </p>
                        </div>
                        {learned && !isEditing && (
                          <button
                            type="button"
                            onClick={() => startEditVoice(learned)}
                            className="shrink-0 text-[11px] hover:underline"
                            style={{ color: 'var(--accent-text)' }}
                          >
                            Edit
                          </button>
                        )}
                      </div>

                      {/* Account scope chips */}
                      {accounts.length > 1 && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1">
                          <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                            Learn from:
                          </span>
                          {accounts.map((acc) => {
                            const active = scoped.includes(acc.id)
                            return (
                              <button
                                key={acc.id}
                                type="button"
                                onClick={() => toggleVoiceAccount(preset.kind, acc.id)}
                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition"
                                style={{
                                  borderColor: active ? acc.color : 'var(--border-subtle)',
                                  background: active ? 'var(--bg-elevated)' : 'transparent',
                                  color: active ? 'var(--text-primary)' : 'var(--text-muted)'
                                }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: acc.color }} />
                                {acc.name}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Optional recipient / domain filter for targeting specific audiences */}
                      {(preset.kind === 'customer' || preset.kind === 'colleague' || preset.kind === 'executive') && (
                        <input
                          value={voiceRecipientFilter[preset.kind] || ''}
                          onChange={(e) =>
                            setVoiceRecipientFilter((prev) => ({ ...prev, [preset.kind]: e.target.value }))
                          }
                          placeholder={
                            preset.kind === 'colleague'
                              ? 'Optional: filter recipients (auto-uses internal company domain)'
                              : preset.kind === 'customer'
                                ? 'Optional: filter recipients (auto-uses external domains)'
                                : 'Optional: executive names/emails (e.g. ceo@, jane@)'
                          }
                          className="mt-2 w-full rounded-lg border bg-transparent px-2.5 py-1 text-[11px] outline-none placeholder:text-[var(--text-muted)]"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        />
                      )}

                      {/* Learned summary or edit form */}
                      {learned && !isEditing && (
                        <div
                          className="mt-3 rounded-lg p-2.5 text-[11.5px] leading-relaxed"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                        >
                          <div className="whitespace-pre-wrap">{learned.styleSummary}</div>
                          {(learned.greetingStyle || learned.signOffStyle) && (
                            <div className="mt-1.5 flex flex-wrap gap-2 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                              {learned.greetingStyle && <span>Greeting: {learned.greetingStyle}</span>}
                              {learned.signOffStyle && <span>Sign-off: {learned.signOffStyle}</span>}
                            </div>
                          )}
                        </div>
                      )}

                      {learned && isEditing && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            rows={4}
                            value={editStyleSummary}
                            onChange={(e) => setEditStyleSummary(e.target.value)}
                            className="w-full rounded-lg border bg-transparent p-2 text-[11.5px] outline-none"
                            style={{ borderColor: 'var(--border-strong)' }}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={editGreeting}
                              onChange={(e) => setEditGreeting(e.target.value)}
                              placeholder="Greeting style"
                              className="rounded-lg border bg-transparent px-2 py-1 text-[11.5px] outline-none"
                              style={{ borderColor: 'var(--border-strong)' }}
                            />
                            <input
                              value={editSignOff}
                              onChange={(e) => setEditSignOff(e.target.value)}
                              placeholder="Sign-off style"
                              className="rounded-lg border bg-transparent px-2 py-1 text-[11.5px] outline-none"
                              style={{ borderColor: 'var(--border-strong)' }}
                            />
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingVoiceId(null)}
                              className="rounded-lg px-2.5 py-1 text-[11.5px] hover:bg-[var(--bg-hover)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveEditVoice(learned)}
                              className="rounded-lg px-3 py-1 text-[11.5px] font-semibold text-white"
                              style={{ background: 'var(--accent)' }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        disabled={Boolean(learningKind)}
                        onClick={() => void handleLearnVoice(preset, learned)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:opacity-90 disabled:opacity-50"
                        style={{
                          background: learned ? 'var(--bg-elevated)' : 'var(--accent)',
                          color: learned ? 'var(--text-primary)' : '#fff'
                        }}
                      >
                        <Sparkles size={13} />
                        {isLearning ? 'Analyzing sent emails…' : learned ? 'Re-learn Voice' : 'Learn My Voice'}
                      </button>

                      {learned && (
                        <button
                          type="button"
                          onClick={async () => {
                            await window.glassmail.deleteVoiceProfile(learned.id)
                            await refreshAll()
                            showToast(`Removed ${learned.name} voice`)
                          }}
                          className="rounded p-1 text-[11px] hover:bg-[var(--bg-hover)]"
                          style={{ color: 'var(--text-muted)' }}
                          title="Delete voice profile"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 4. Activity Log with 1-Click Undo */}
          <section
            className="rounded-2xl border p-5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
          >
            <h2 className="text-[15px] font-semibold">Recent Activity</h2>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Every action Autopilot takes is logged here with 1-click undo.
            </p>

            {autopilotLogs.length === 0 ? (
              <div className="mt-4 py-6 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                No automated actions yet. Create a rule or turn on Background Pre-Drafts above.
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {autopilotLogs.slice(0, 20).map((log) => {
                  const isUndoable =
                    !log.undoneAt &&
                    (log.actionType === 'archive' ||
                      log.actionType === 'trash' ||
                      log.actionType === 'moveToFolder' ||
                      Boolean(log.undoAction && log.threadId))
                  const isUndoing = busyUndoLogId === log.id
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-[12.5px]"
                      style={{
                        background: 'var(--bg-main)',
                        borderColor: 'var(--border-subtle)',
                        opacity: log.undoneAt ? 0.72 : 1
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{log.ruleName}</span>
                          <span className="text-[11.5px]" style={{ color: 'var(--accent-text)' }}>
                            {log.actionSummary}
                          </span>
                        </div>
                        {log.threadSubject && (
                          <button
                            type="button"
                            onClick={() => {
                              if (log.threadId) {
                                setActiveView('mail')
                                void selectThread(log.threadId)
                              }
                            }}
                            className="mt-0.5 block max-w-full truncate text-left text-[11.5px] hover:underline"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {log.threadSubject}
                          </button>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {new Date(log.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        {log.undoneAt ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                          >
                            Undone
                          </span>
                        ) : (
                          isUndoable && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isUndoing}
                                onClick={async () => {
                                  setBusyUndoLogId(log.id)
                                  try {
                                    await undoAutopilotLog(log.id, false)
                                  } finally {
                                    setBusyUndoLogId(null)
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                                style={{ borderColor: 'var(--border-strong)' }}
                              >
                                <RotateCcw size={11} /> Undo
                              </button>
                              <button
                                type="button"
                                disabled={isUndoing}
                                onClick={async () => {
                                  setBusyUndoLogId(log.id)
                                  try {
                                    await undoAutopilotLog(log.id, true)
                                  } finally {
                                    setBusyUndoLogId(null)
                                  }
                                }}
                                className="text-[11px] font-medium transition hover:underline disabled:opacity-50"
                                style={{ color: 'var(--text-muted)' }}
                                title="Restore to Inbox and pause this rule"
                              >
                                Undo &amp; Pause
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
