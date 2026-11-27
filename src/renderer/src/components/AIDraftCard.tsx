import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  Check,
  ChevronDown,
  RefreshCw,
  Reply,
  Send,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react'
import { AccountBadge } from './AccountIcon'
import { buildReplyComposerState } from '../utils/replyHelper'
import type {
  AppSettings,
  Message,
  ThreadDetail,
  ThreadPreDraft,
  VoiceProfile
} from '../../../shared/types'

export interface AIDraftCardProps {
  thread: ThreadDetail
  latestMsg?: Message
  settings: AppSettings | null
  preDraft: ThreadPreDraft | null
  loading: boolean
  body: string
  onBodyChange: (nextBody: string) => void
  voiceProfiles: VoiceProfile[]
  selectedVoiceId?: string
  onSelectVoice: (voiceId: string) => void
  onSend: () => Promise<void> | void
  onOpenInComposer: () => Promise<void> | void
  onRegenerate: () => Promise<void> | void
  onDismiss: () => Promise<void> | void
  onToggleAlwaysAutoDraft: () => Promise<void> | void
  onExcludeSender: () => Promise<void> | void
}

export const AIDraftCard: React.FC<AIDraftCardProps> = ({
  thread,
  latestMsg,
  settings,
  preDraft,
  loading,
  body,
  onBodyChange,
  voiceProfiles,
  selectedVoiceId,
  onSelectVoice,
  onSend,
  onOpenInComposer,
  onRegenerate,
  onDismiss,
  onToggleAlwaysAutoDraft,
  onExcludeSender
}) => {
  const [isFocusedWithin, setIsFocusedWithin] = useState(false)
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false)
  const [rulesMenuOpen, setRulesMenuOpen] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const voiceMenuRef = useRef<HTMLDivElement | null>(null)
  const voiceTriggerRef = useRef<HTMLButtonElement | null>(null)
  const rulesMenuRef = useRef<HTMLDivElement | null>(null)
  const rulesTriggerRef = useRef<HTMLButtonElement | null>(null)

  const senderEmail = latestMsg?.from.email ? latestMsg.from.email.toLowerCase() : ''
  const alwaysList = settings?.autopilot?.preDraftAlwaysSenders || []
  const isAlways = Boolean(
    senderEmail && alwaysList.some((s) => s.toLowerCase() === senderEmail)
  )

  const replyMeta = useMemo(() => {
    const baseState = buildReplyComposerState(thread, 'reply', latestMsg, {
      outlookPrefixes: settings?.uiTheme === 'outlook-classic'
    })
    const toAddr = (baseState.to || latestMsg?.from.email || '').trim()
    const recipientDisplay =
      latestMsg?.from.email &&
      latestMsg.from.email.toLowerCase() === toAddr.toLowerCase() &&
      latestMsg.from.name
        ? `${latestMsg.from.name} <${latestMsg.from.email}>`
        : toAddr || 'No recipient'
    const replySubject = baseState.subject || preDraft?.subject || thread.subject || '(No subject)'
    return { recipientDisplay, replySubject }
  }, [thread, latestMsg, settings?.uiTheme, preDraft?.subject])

  const activeVoice = useMemo(
    () => voiceProfiles.find((vp) => vp.id === selectedVoiceId) || null,
    [voiceProfiles, selectedVoiceId]
  )

  const resolvedTheme =
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') || settings?.theme || 'dark'
      : settings?.theme || 'dark'
  const isGmailDark =
    settings?.uiTheme === 'gmail' &&
    (resolvedTheme === 'dark' || resolvedTheme === 'black' || resolvedTheme === 'graphite')

  const canSend = body.trim().length > 0
  const undoSeconds = settings?.undoSendSeconds ?? 5

  // Auto-grow textarea cleanly without manual resize handles
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el || loading) return
    el.style.height = 'auto'
    const nextHeight = Math.min(320, Math.max(96, el.scrollHeight))
    el.style.height = `${nextHeight}px`
  }, [body, loading])

  // Close popovers on thread change or when loading starts
  useEffect(() => {
    setVoiceMenuOpen(false)
    setRulesMenuOpen(false)
  }, [thread.id, loading])

  // Outside click and Escape key handling for popovers
  useEffect(() => {
    if (!voiceMenuOpen && !rulesMenuOpen) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (voiceMenuOpen && voiceMenuRef.current && !voiceMenuRef.current.contains(target)) {
        setVoiceMenuOpen(false)
      }
      if (rulesMenuOpen && rulesMenuRef.current && !rulesMenuRef.current.contains(target)) {
        setRulesMenuOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (voiceMenuOpen) {
        e.preventDefault()
        setVoiceMenuOpen(false)
        voiceTriggerRef.current?.focus()
      } else if (rulesMenuOpen) {
        e.preventDefault()
        setRulesMenuOpen(false)
        rulesTriggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [voiceMenuOpen, rulesMenuOpen])

  if (!loading && !preDraft) return null

  return (
    <section
      role="region"
      aria-label="AI Reply Draft"
      aria-busy={loading}
      onFocus={() => setIsFocusedWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsFocusedWithin(false)
        }
      }}
      className="mt-4 rounded-xl border transition-colors duration-150"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: isFocusedWithin
          ? 'color-mix(in srgb, var(--accent) 45%, var(--border-strong))'
          : 'var(--border-strong)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)'
      }}
    >
      {/* Band A — Calm Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b px-4 py-2.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Sparkles
            size={13}
            className="shrink-0"
            style={{ color: 'var(--accent-text)' }}
            aria-hidden="true"
          />
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {loading ? 'Drafting reply…' : 'AI Draft'}
          </span>
          {preDraft && !loading && (
            <span className="text-[11.5px] font-normal" style={{ color: 'var(--text-secondary)' }}>
              · {preDraft.providerLabel}
            </span>
          )}
          {isAlways && (
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-medium"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              Auto-draft on
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {voiceProfiles.length > 0 && (
            <div className="relative" ref={voiceMenuRef}>
              <button
                ref={voiceTriggerRef}
                type="button"
                disabled={loading}
                aria-haspopup="menu"
                aria-expanded={voiceMenuOpen}
                onClick={() => {
                  setRulesMenuOpen(false)
                  setVoiceMenuOpen((v) => !v)
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                title="Choose writing voice profile"
              >
                <span className="max-w-[140px] truncate">{activeVoice?.name || 'Default voice'}</span>
                <ChevronDown size={12} aria-hidden="true" />
              </button>

              {voiceMenuOpen && !loading && (
                <div
                  role="menu"
                  aria-label="Writing voice profiles"
                  className="absolute right-0 top-full z-30 mt-1.5 min-w-[180px] rounded-xl border py-1 shadow-lg"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-strong)'
                  }}
                >
                  {voiceProfiles.map((vp) => {
                    const isSelected = selectedVoiceId === vp.id
                    return (
                      <button
                        key={vp.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setVoiceMenuOpen(false)
                          onSelectVoice(vp.id)
                          voiceTriggerRef.current?.focus()
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                        style={{ color: 'var(--text-primary)' }}
                        title={`Regenerate using "${vp.name}" voice`}
                      >
                        <span className="truncate">{vp.name}</span>
                        {isSelected && (
                          <Check
                            size={13}
                            className="shrink-0"
                            style={{ color: 'var(--accent-text)' }}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {preDraft && !loading && (
            <button
              type="button"
              onClick={() => void onDismiss()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              aria-label="Dismiss AI draft"
              title="Dismiss ghost draft (does not touch remote Drafts)"
            >
              <X size={13} aria-hidden="true" />
              <span>Dismiss</span>
            </button>
          )}
        </div>
      </div>

      {/* Band B — Recipient Trust Strip */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-[12px]"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="inline-flex min-w-0 items-center gap-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>To</span>
          <span
            className="max-w-[260px] truncate font-medium"
            style={{ color: 'var(--text-primary)' }}
            title={replyMeta.recipientDisplay}
          >
            {replyMeta.recipientDisplay}
          </span>
        </div>

        <div className="inline-flex min-w-0 items-center gap-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>From</span>
          <AccountBadge icon={thread.accountIcon} color={thread.accountColor} size="xs" />
          <span
            className="max-w-[220px] truncate"
            style={{ color: 'var(--text-secondary)' }}
            title={thread.accountEmail}
          >
            {thread.accountEmail}
          </span>
        </div>

        <div className="inline-flex min-w-0 items-center gap-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>Subject</span>
          <span
            className="max-w-[260px] truncate"
            style={{ color: 'var(--text-secondary)' }}
            title={replyMeta.replySubject}
          >
            {replyMeta.replySubject}
          </span>
        </div>
      </div>

      {/* Band C — Body Surface */}
      {loading ? (
        <div className="px-4 py-4" style={{ minHeight: '112px' }}>
          <div className="space-y-2.5" aria-hidden="true">
            <div className="h-3 w-[92%] animate-pulse rounded-md bg-[var(--bg-hover)] motion-reduce:animate-none" />
            <div className="h-3 w-[84%] animate-pulse rounded-md bg-[var(--bg-hover)] motion-reduce:animate-none" />
            <div className="h-3 w-[56%] animate-pulse rounded-md bg-[var(--bg-hover)] motion-reduce:animate-none" />
          </div>
          <p className="mt-4 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Matching your writing style and checking context…
          </p>
        </div>
      ) : preDraft ? (
        <>
          <div className="px-4 pt-3.5 pb-1">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSend) {
                  e.preventDefault()
                  void onSend()
                }
              }}
              aria-label="Edit AI reply draft"
              placeholder="Write or refine your reply…"
              className="block min-h-[96px] max-h-[320px] w-full resize-none overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[var(--text-primary)] transition-colors duration-150 placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </div>

          {/* Band D — Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-xl px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void onSend()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
                style={{
                  background: 'var(--accent)',
                  color: isGmailDark ? '#0b1c36' : '#ffffff'
                }}
                title={`Send reply (${undoSeconds}s undo window) · Ctrl+Enter`}
              >
                <Send size={13} aria-hidden="true" />
                <span>Send</span>
                <span className="hidden text-[10.5px] font-medium opacity-80 sm:inline">Ctrl+↵</span>
              </button>

              <button
                type="button"
                onClick={() => void onOpenInComposer()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-main)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--bg-hover)]"
              >
                <Reply size={13} aria-hidden="true" />
                <span>Open in Composer</span>
              </button>

              <button
                type="button"
                onClick={() => void onRegenerate()}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw size={12.5} aria-hidden="true" />
                <span>Regenerate</span>
              </button>
            </div>

            {senderEmail && settings && (
              <div className="relative" ref={rulesMenuRef}>
                <button
                  ref={rulesTriggerRef}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={rulesMenuOpen}
                  onClick={() => {
                    setVoiceMenuOpen(false)
                    setRulesMenuOpen((v) => !v)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  title={`Autopilot rules for ${senderEmail}`}
                >
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  <span>Sender rules</span>
                </button>

                {rulesMenuOpen && (
                  <div
                    role="menu"
                    aria-label={`Autopilot rules for ${senderEmail}`}
                    className="absolute right-0 bottom-full z-30 mb-1.5 min-w-[240px] max-w-[290px] rounded-xl border p-1.5 shadow-lg"
                    style={{
                      background: 'var(--bg-elevated)',
                      borderColor: 'var(--border-strong)'
                    }}
                  >
                    <div
                      className="truncate px-2.5 py-1 text-[11px] font-medium"
                      style={{ color: 'var(--text-secondary)' }}
                      title={senderEmail}
                    >
                      Autopilot for {senderEmail}
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRulesMenuOpen(false)
                        void onToggleAlwaysAutoDraft()
                        rulesTriggerRef.current?.focus()
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--text-primary)' }}
                      title={
                        isAlways
                          ? `Always auto-drafting replies for ${senderEmail} — click to turn off`
                          : `Always auto-draft replies for ${senderEmail} (prioritized first, even if general auto-drafting is off)`
                      }
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Sparkles
                          size={13}
                          fill={isAlways ? 'currentColor' : 'none'}
                          className="shrink-0"
                          style={{ color: isAlways ? 'var(--accent-text)' : 'var(--text-secondary)' }}
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {isAlways ? 'Turn off always auto-draft' : 'Always auto-draft'}
                        </span>
                      </span>
                      {isAlways && (
                        <Check
                          size={13}
                          className="shrink-0"
                          style={{ color: 'var(--accent-text)' }}
                          aria-hidden="true"
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRulesMenuOpen(false)
                        void onExcludeSender()
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--danger)' }}
                      title="Never auto-draft replies for this sender"
                    >
                      <Ban size={13} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">Don&apos;t pre-draft for this sender</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}
