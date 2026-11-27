import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Mail, Sparkles } from 'lucide-react'
import type { HabitActionType, HabitSuggestion, HabitSuggestionSample } from '../../../shared/types'

interface HabitSuggestionPreviewProps {
  suggestion: HabitSuggestion
  compact?: boolean
  onJumpToThread?: (threadId: string) => void
}

function formatRelativeDate(ts: number): string {
  if (!ts) return ''
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatActionBadge(
  action: HabitActionType | null | undefined,
  folderName: string | null | undefined,
  currentFolderName: string
): { label: string; tone: 'muted' | 'danger' | 'accent' } {
  if (action === 'trash') return { label: 'Trashed', tone: 'danger' }
  if (action === 'archive') return { label: 'Archived', tone: 'muted' }
  if (action === 'move_folder') {
    return { label: folderName ? `Moved → ${folderName}` : 'Moved', tone: 'accent' }
  }
  return { label: currentFolderName || 'Recent', tone: 'muted' }
}

export const HabitSuggestionPreview: React.FC<HabitSuggestionPreviewProps> = ({
  suggestion,
  compact = false,
  onJumpToThread
}) => {
  const [samples, setSamples] = useState<HabitSuggestionSample[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setExpandedThreadId(null)
    void window.glassmail
      .getHabitSuggestionSamples(suggestion.id, compact ? 4 : 5)
      .then((rows) => {
        if (!cancelled) {
          setSamples(rows)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSamples([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [suggestion.id, compact])

  const isBundle = suggestion.kind === 'bundle_archive' || suggestion.kind === 'bundle_move'

  return (
    <div
      className={compact ? 'space-y-1.5' : 'mt-3 border-t pt-3'}
      style={compact ? undefined : { borderColor: 'var(--border-subtle)' }}
    >
      {loading ? (
        <div className="space-y-1.5">
          {[0, 1].map((idx) => (
            <div
              key={idx}
              className="h-12 animate-pulse rounded-lg"
              style={{ background: 'var(--bg-elevated)' }}
            />
          ))}
        </div>
      ) : !samples || samples.length === 0 ? (
        <div
          className="rounded-lg border px-3 py-2.5 text-[11.5px]"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)'
          }}
        >
          No matching emails remain in your local mailbox (they may have been permanently deleted).
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>
              {samples.length === 1
                ? '1 example email behind this suggestion'
                : `${samples.length} recent emails behind this suggestion`}
            </span>
            <span>Click any email to peek</span>
          </div>

          <div className="space-y-1.5">
            {samples.map((sample) => {
              const isExpanded = expandedThreadId === sample.threadId
              const badge = formatActionBadge(
                sample.matchedAction,
                sample.matchedFolderName,
                sample.folderName
              )
              const senderDisplay = sample.fromName || sample.fromEmail || 'Unknown sender'
              const showEmailInline =
                Boolean(sample.fromEmail) &&
                (isBundle || (sample.fromName && sample.fromName.toLowerCase() !== sample.fromEmail.toLowerCase()))

              return (
                <div
                  key={sample.threadId}
                  className="overflow-hidden rounded-lg border transition"
                  style={{
                    background: isExpanded ? 'var(--bg-elevated)' : 'color-mix(in srgb, var(--bg-elevated) 55%, var(--bg-main))',
                    borderColor: isExpanded
                      ? 'color-mix(in srgb, var(--accent) 45%, var(--border-subtle))'
                      : 'var(--border-subtle)'
                  }}
                >
                  <div className="group flex items-start gap-2 px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => setExpandedThreadId(isExpanded ? null : sample.threadId)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span className="mt-1 shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: sample.accountColor || 'var(--accent)' }}
                            title={sample.accountEmail || undefined}
                          />
                          <span
                            className="truncate text-[11.5px] font-medium"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {senderDisplay}
                          </span>
                          {showEmailInline && !compact && (
                            <span
                              className="truncate font-mono text-[10.5px]"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {sample.fromEmail}
                            </span>
                          )}
                          <span
                            className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background:
                                badge.tone === 'danger'
                                  ? 'color-mix(in srgb, #ef4444 14%, transparent)'
                                  : badge.tone === 'accent'
                                    ? 'var(--accent-soft)'
                                    : 'var(--bg-hover)',
                              color:
                                badge.tone === 'danger'
                                  ? '#ef4444'
                                  : badge.tone === 'accent'
                                    ? 'var(--accent-text)'
                                    : 'var(--text-muted)'
                            }}
                          >
                            {badge.label}
                          </span>
                          <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {formatRelativeDate(sample.date)}
                          </span>
                        </div>

                        <div
                          className="mt-0.5 truncate text-[12.5px] font-semibold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {sample.subject || '(No subject)'}
                          {sample.messageCount > 1 && (
                            <span
                              className="ml-1.5 text-[10.5px] font-normal"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              ({sample.messageCount})
                            </span>
                          )}
                        </div>

                        {!isExpanded && sample.snippet && (
                          <p
                            className="mt-0.5 line-clamp-1 text-[11.5px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {sample.snippet}
                          </p>
                        )}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => void window.glassmail.openThreadWindow(sample.threadId)}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-60 transition hover:bg-[var(--bg-hover)] hover:opacity-100"
                      style={{ color: 'var(--text-secondary)' }}
                      title="Pop out full email in a window"
                      aria-label="Pop out full email"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div
                      className="border-t px-3 py-2.5"
                      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-main)' }}
                    >
                      <div
                        className="max-h-36 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {sample.bodyExcerpt || sample.snippet || 'No message preview available.'}
                      </div>

                      <div
                        className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px]"
                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                      >
                        <span className="truncate font-mono text-[10.5px]">
                          {sample.fromEmail || senderDisplay}
                          {sample.accountEmail ? ` → ${sample.accountEmail}` : ''}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void window.glassmail.openThreadWindow(sample.threadId)}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition hover:bg-[var(--bg-hover)]"
                            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
                          >
                            <ExternalLink size={11} />
                            Pop out
                          </button>
                          {onJumpToThread && (
                            <button
                              type="button"
                              onClick={() => onJumpToThread(sample.threadId)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition hover:bg-[var(--bg-hover)]"
                              style={{ color: 'var(--accent-text)' }}
                            >
                              <Mail size={11} />
                              Open in Mail
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!compact && (
        <div
          className="mt-2.5 flex items-center gap-1.5 px-0.5 text-[11px]"
          style={{ color: 'var(--text-muted)' }}
        >
          <Sparkles size={11} style={{ color: 'var(--accent)' }} />
          <span>
            Rule if enabled: <strong style={{ color: 'var(--text-secondary)' }}>{suggestion.rulePrompt}</strong>
          </span>
        </div>
      )}
    </div>
  )
}
