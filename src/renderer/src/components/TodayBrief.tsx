import React, { useEffect, useState } from 'react'
import { Archive, Ban, Calendar, Copy, Inbox, MailOpen, RefreshCw, Sparkles, Video, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import { modKeyPrefix } from '../utils/platform'
import { ContextMenu, type ContextMenuState } from './ContextMenu'
import { AccountBadge } from './AccountIcon'
import type { WaitingOnYouItem } from '../../../shared/types'

export const TodayBrief: React.FC = () => {
  const {
    settings,
    accounts,
    activeAccountIds,
    counts,
    threads,
    todayEvents,
    setActiveView,
    setAssistantOpen,
    setActiveMailbox,
    selectThread,
    requestDraftReply,
    archiveThreads,
    setReadThreads,
    saveSettings,
    refreshAll,
    showToast
  } = useAppStore()

  const readerWidthMode = settings?.readerWidth || 'comfortable'
  const briefMaxWidth =
    readerWidthMode === 'narrow' ? '600px' : readerWidthMode === 'wide' ? 'none' : '820px'
  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLDivElement>('reader')

  const [waitingItems, setWaitingItems] = useState<WaitingOnYouItem[]>([])
  const [aiCheckingWaiting, setAiCheckingWaiting] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  // Tier 1 instant load + Tier 2 cached AI verification
  useEffect(() => {
    let cancelled = false
    const filterIds = activeAccountIds.length > 0 ? activeAccountIds : undefined
    void (async () => {
      const fast = await window.glassmail.getWaitingOnYou(filterIds, false)
      if (!cancelled) setWaitingItems(fast)
      if (fast.length > 0 && fast.some((x) => !x.aiVerified)) {
        if (!cancelled) setAiCheckingWaiting(true)
        try {
          const verified = await window.glassmail.getWaitingOnYou(filterIds, true)
          if (!cancelled) setWaitingItems(verified)
        } finally {
          if (!cancelled) setAiCheckingWaiting(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    activeAccountIds.join(','),
    threads.length,
    counts.inbox,
    settings?.autopilot?.preDraftExcludedSenders?.length,
    settings?.autopilot?.waitingDismissedThreadIds?.length
  ])

  const dismissWaitingThread = async (threadId: string) => {
    if (!settings) return
    const prevSettings = settings
    const prevIds = settings.autopilot?.waitingDismissedThreadIds || []
    const nextIds = Array.from(new Set([...prevIds, threadId])).slice(-200)
    setWaitingItems((prev) => prev.filter((x) => x.thread.id !== threadId))
    await saveSettings({
      ...settings,
      autopilot: {
        ...settings.autopilot,
        autoPreDraftPeople: Boolean(settings.autopilot?.autoPreDraftPeople),
        preDraftDisabledAccountIds: settings.autopilot?.preDraftDisabledAccountIds || [],
        preDraftAlwaysSenders: settings.autopilot?.preDraftAlwaysSenders || [],
        preDraftExcludedSenders: settings.autopilot?.preDraftExcludedSenders || [],
        waitingDismissedThreadIds: nextIds,
        autoClean2FAHours: settings.autopilot?.autoClean2FAHours ?? null
      }
    })
    showToast('Removed from "Waiting on you"', async () => {
      await saveSettings(prevSettings)
      await refreshAll()
    })
  }

  const muteWaitingSender = async (email: string) => {
    if (!settings || !email) return
    const lower = email.toLowerCase()
    const prevSettings = settings
    const prevList = settings.autopilot?.preDraftExcludedSenders || []
    const nextList = Array.from(new Set([...prevList, lower]))
    const nextAlways = (settings.autopilot?.preDraftAlwaysSenders || []).filter((s) => s.toLowerCase() !== lower)
    setWaitingItems((prev) => prev.filter((x) => (x.thread.latestFrom.email || '').toLowerCase() !== lower))
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
    showToast(`Won't show ${email} in "Waiting on you" or pre-drafts`, async () => {
      await saveSettings(prevSettings)
      await refreshAll()
    })
  }

  const signInThreads = threads.filter((t) => t.signInCode).slice(0, 2)
  const hasDemo = accounts.some((a) => a.isDemo)
  const firstAccountName = accounts.find((a) => !a.isDemo)?.name?.trim().split(/\s+/)[0]
  const headingGreeting = firstAccountName ? `${greeting}, ${firstAccountName}` : greeting

  const focusedAccounts =
    activeAccountIds.length > 0 ? accounts.filter((a) => activeAccountIds.includes(a.id)) : []

  return (
    <div
      ref={zoomRef}
      className={`relative flex h-full flex-1 flex-col overflow-y-auto py-10 ${readerWidthMode === 'wide' ? 'px-8' : 'px-12'}`}
    >
      {zoomBadge}
      <div className="mx-auto w-full" style={{ maxWidth: briefMaxWidth, zoom }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {dateLabel}
          </div>
          {focusedAccounts.map((acc) => (
            <span
              key={acc.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: acc.color }} />
              {acc.name}
            </span>
          ))}
        </div>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight">{headingGreeting}</h1>
        <p className="mt-1.5 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
          {counts.people || 0} conversation{counts.people === 1 ? '' : 's'} from people need you, and{' '}
          {counts.updates || 0} update{counts.updates === 1 ? '' : 's'} are unread.
        </p>

        {/* Primary Action Buttons (Exact Glassmail brief-dark layout) */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setActiveView('triage')}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            <Inbox size={14} />
            Start triage
          </button>
          <button
            onClick={() => setAssistantOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            <Sparkles size={14} style={{ color: 'var(--accent)' }} />
            Ask about my mail
          </button>
          <button
            onClick={() => setActiveView('calendar')}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            <Calendar size={14} />
            Combined calendar
          </button>
        </div>

        {/* Recent Sign-In Codes */}
        {signInThreads.length > 0 && (
          <div className="mt-7">
            <div className="mb-2 text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Recent sign-in codes
            </div>
            <div className="flex flex-wrap gap-2">
              {signInThreads.map((t) => (
                <button
                  key={t.id}
                  onClick={async () => {
                    await window.glassmail.copyText(t.signInCode!.replace(/\s+/g, ''), `Copied ${t.signInCode}`)
                    showToast(`Copied ${t.signInCode}`)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{t.latestFrom.name}</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--accent-text)' }}>
                    {t.signInCode}
                  </span>
                  <Copy size={12} style={{ color: 'var(--text-muted)' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Today's Combined Calendar Schedule */}
        <div className="mt-8">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Today & upcoming schedule ({todayEvents.length})
            </span>
            <button
              onClick={() => setActiveView('calendar')}
              className="text-[12px] font-medium hover:underline"
              style={{ color: 'var(--accent-text)' }}
            >
              Open calendar
            </button>
          </div>
          {todayEvents.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Your schedule is clear for the next 48 hours.
            </p>
          ) : (
            <div className="space-y-1.5">
              {todayEvents.slice(0, 5).map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => setActiveView('calendar')}
                  className="flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 transition hover:bg-[var(--bg-hover)]"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: ev.accountColor }} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{ev.title}</div>
                      <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(ev.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} –{' '}
                        {new Date(ev.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </div>
                    </div>
                  </div>
                  {ev.meetingUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void window.glassmail.openExternal(ev.meetingUrl!)
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      <Video size={11} /> Join
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Waiting on you */}
        <div className="mt-8">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
              <span>Waiting on you ({waitingItems.length})</span>
              {aiCheckingWaiting && (
                <RefreshCw size={11} className="animate-spin" style={{ color: 'var(--accent)' }} />
              )}
            </span>
          </div>
          {waitingItems.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Nobody is waiting on a reply right now.
            </p>
          ) : (
            <div className="space-y-1">
              {waitingItems.map(({ thread: t, reason, aiVerified }) => (
                <div
                  key={t.id}
                  onClick={() => void selectThread(t.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const senderEmail = t.latestFrom.email
                    const senderName = t.latestFrom.name || senderEmail
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      items: [
                        {
                          label: 'Not waiting on me',
                          icon: <X size={13} />,
                          onClick: () => void dismissWaitingThread(t.id)
                        },
                        ...(senderEmail
                          ? [
                              {
                                label: `Never show ${senderName} here`,
                                icon: <Ban size={13} />,
                                onClick: () => void muteWaitingSender(senderEmail)
                              }
                            ]
                          : []),
                        { type: 'separator' as const },
                        {
                          label: 'Draft reply with AI',
                          icon: <Sparkles size={13} />,
                          onClick: () => void requestDraftReply(t.id)
                        },
                        {
                          label: 'Mark as read',
                          icon: <MailOpen size={13} />,
                          onClick: () => void setReadThreads([t.id], true)
                        },
                        {
                          label: 'Archive',
                          icon: <Archive size={13} />,
                          onClick: () => void archiveThreads([t.id])
                        }
                      ]
                    })
                  }}
                  className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--bg-hover)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AccountBadge icon={t.accountIcon} color={t.accountColor} size="xs" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">
                          {t.latestFrom.name || t.latestFrom.email}
                        </span>
                        {reason && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                            style={{
                              background: aiVerified ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                              color: aiVerified ? 'var(--accent-text)' : 'var(--text-muted)'
                            }}
                          >
                            {aiVerified && <Sparkles size={9} />}
                            {reason}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                        {t.subject}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11.5px] group-hover:hidden" style={{ color: 'var(--text-muted)' }}>
                      {new Date(t.lastMessageAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void dismissWaitingThread(t.id)
                      }}
                      className="hidden rounded-lg p-1.5 transition hover:bg-[var(--bg-selected)] group-hover:inline-flex"
                      style={{ color: 'var(--text-muted)' }}
                      title="Not waiting on me (dismiss)"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Waiting on others */}
        {counts.waiting ? (
          <div className="mt-7 flex items-center justify-between">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
              You&apos;re waiting on {counts.waiting} thread{counts.waiting === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => void setActiveMailbox('waiting')}
              className="text-[12px] font-medium hover:underline"
              style={{ color: 'var(--accent-text)' }}
            >
              See all
            </button>
          </div>
        ) : null}

        {hasDemo && (
          <div
            className="mt-8 rounded-xl border p-3.5 text-[12px]"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            You&apos;re viewing sample Gmail &amp; IMAP accounts so you can try account toggles, combined calendar, triage, and AI right away. Connect your real accounts in{' '}
            <button
              onClick={() => useAppStore.getState().openSettings('accounts')}
              className="font-semibold underline"
              style={{ color: 'var(--accent-text)' }}
            >
              Settings › Accounts
            </button>
            .
          </div>
        )}

        <div className="mt-10 flex items-center gap-4 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          <span>
            <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
              J
            </kbd>{' '}
            <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
              K
            </kbd>{' '}
            Move
          </span>
          <span>
            <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
              C
            </kbd>{' '}
            Compose
          </span>
          <span>
            <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)' }}>
              {modKeyPrefix}K
            </kbd>{' '}
            Commands
          </span>
        </div>
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  )
}
