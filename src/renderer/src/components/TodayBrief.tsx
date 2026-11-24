import React from 'react'
import { Calendar, Copy, Inbox, Sparkles, Video } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export const TodayBrief: React.FC = () => {
  const {
    accounts,
    counts,
    threads,
    todayEvents,
    setActiveView,
    setActiveMailbox,
    selectThread,
    showToast
  } = useAppStore()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  const peopleUnread = threads.filter((t) => t.category === 'people' && !t.isRead).slice(0, 5)
  const signInThreads = threads.filter((t) => t.signInCode).slice(0, 2)
  const hasDemo = accounts.some((a) => a.isDemo)
  const firstAccountName = accounts.find((a) => !a.isDemo)?.name?.trim().split(/\s+/)[0]
  const headingGreeting = firstAccountName ? `${greeting}, ${firstAccountName}` : greeting

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto px-12 py-12">
      <div className="mx-auto w-full max-w-[600px]">
        <div className="text-[11px] font-semibold tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {dateLabel}
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
            onClick={() => setActiveView('assistant')}
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
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Waiting on you ({peopleUnread.length})
            </span>
          </div>
          <div className="space-y-1">
            {peopleUnread.map((t) => (
              <button
                key={t.id}
                onClick={() => void selectThread(t.id)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[var(--bg-hover)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: t.accountColor }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{t.latestFrom.name}</div>
                    <div className="truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      {t.subject}
                    </div>
                  </div>
                </div>
                <span className="ml-3 shrink-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {new Date(t.lastMessageAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
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
              Ctrl+K
            </kbd>{' '}
            Commands
          </span>
        </div>
      </div>
    </div>
  )
}
