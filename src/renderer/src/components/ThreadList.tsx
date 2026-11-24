import React, { useMemo, useState } from 'react'
import { Archive, ArrowDown, ArrowUp, Check, Copy, Paperclip, Star, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { InboxCategory, ThreadSummary } from '../../../shared/types'

type SortField = 'date' | 'sender' | 'subject' | 'unread' | 'starred' | 'account'
type SortDir = 'desc' | 'asc'

function formatTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getTimeBucket(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yest = new Date(now.getTime() - 86400_000)
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return 'Earlier'
}

function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase() || '?'
}

export const ThreadList: React.FC<{ width?: number }> = ({ width = 340 }) => {
  const {
    accounts,
    activeAccountIds,
    activeMailbox,
    activeCategory,
    activeFolderName,
    counts,
    threads,
    selectedThreadId,
    checkedThreadIds,
    parsedSearch,
    scheduledEmails,
    setActiveCategory,
    selectThread,
    selectAllAccounts,
    clearSearch,
    toggleCheckThread,
    clearCheckedThreads,
    archiveThreads,
    trashThreads,
    toggleStarThread,
    showToast,
    refreshAll
  } = useAppStore()

  const mailboxTitle = activeFolderName || activeMailbox.charAt(0).toUpperCase() + activeMailbox.slice(1)

  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = localStorage.getItem('everybox:sortField') as SortField | null
    return saved && ['date', 'sender', 'subject', 'unread', 'starred', 'account'].includes(saved) ? saved : 'date'
  })
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    const saved = localStorage.getItem('everybox:sortDir') as SortDir | null
    return saved === 'asc' || saved === 'desc' ? saved : 'desc'
  })

  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      const nextDir: SortDir = sortDir === 'desc' ? 'asc' : 'desc'
      setSortDir(nextDir)
      localStorage.setItem('everybox:sortDir', nextDir)
    } else {
      setSortField(field)
      localStorage.setItem('everybox:sortField', field)
      const defaultDir: SortDir = field === 'sender' || field === 'subject' || field === 'account' ? 'asc' : 'desc'
      setSortDir(defaultDir)
      localStorage.setItem('everybox:sortDir', defaultDir)
    }
  }

  const sortedThreads = useMemo(() => {
    const copy = [...threads]
    const mult = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        cmp = a.lastMessageAt - b.lastMessageAt
      } else if (sortField === 'sender') {
        const sa = (a.latestFrom.name || a.latestFrom.email || '').toLowerCase()
        const sb = (b.latestFrom.name || b.latestFrom.email || '').toLowerCase()
        cmp = sa.localeCompare(sb)
      } else if (sortField === 'subject') {
        const sa = (a.subject || '').replace(/^(re|fwd|fw):\s*/gi, '').toLowerCase()
        const sb = (b.subject || '').replace(/^(re|fwd|fw):\s*/gi, '').toLowerCase()
        cmp = sa.localeCompare(sb)
      } else if (sortField === 'unread') {
        cmp = (a.isRead ? 0 : 1) - (b.isRead ? 0 : 1)
      } else if (sortField === 'starred') {
        cmp = (a.isStarred ? 1 : 0) - (b.isStarred ? 1 : 0)
      } else if (sortField === 'account') {
        cmp = a.accountEmail.toLowerCase().localeCompare(b.accountEmail.toLowerCase())
      }
      if (cmp !== 0) return cmp * mult
      return b.lastMessageAt - a.lastMessageAt
    })
    return copy
  }, [threads, sortField, sortDir])

  const grouped = useMemo(() => {
    if (sortField !== 'date') {
      const labels: Record<SortField, string> = {
        date: 'Date',
        sender: 'Sender',
        subject: 'Subject',
        unread: 'Unread',
        starred: 'Starred',
        account: 'Account'
      }
      const dirLabel =
        sortField === 'sender' || sortField === 'subject' || sortField === 'account'
          ? sortDir === 'asc'
            ? 'A–Z'
            : 'Z–A'
          : sortDir === 'desc'
            ? 'First'
            : 'Last'
      return { [`Sorted by ${labels[sortField]} (${dirLabel})`]: sortedThreads }
    }
    return sortedThreads.reduce<Record<string, ThreadSummary[]>>((acc, t) => {
      const b = getTimeBucket(t.lastMessageAt)
      if (!acc[b]) acc[b] = []
      acc[b].push(t)
      return acc
    }, {})
  }, [sortedThreads, sortField, sortDir])

  const categories: { id: InboxCategory; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'people', label: 'People', count: counts.people },
    { id: 'updates', label: 'Updates', count: counts.updates }
  ]

  const copyCode = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation()
    await window.glassmail.copyText(code.replace(/\s+/g, ''), `Copied sign-in code ${code}`)
    showToast(`Copied code ${code}`)
  }

  return (
    <section
      className="flex h-full shrink-0 flex-col border-r"
      style={{ width, background: 'var(--bg-list)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Header */}
      <div className="border-b px-3.5 pb-2.5 pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold leading-tight">{mailboxTitle}</h2>
            <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              {activeMailbox === 'inbox' ? `${counts.inbox || 0} unread` : `${threads.length} conversations`}
            </p>
          </div>
          {(activeMailbox === 'trash' || activeMailbox === 'junk') && threads.length > 0 && (
            <button
              onClick={async () => {
                await window.glassmail.emptyFolder(
                  activeMailbox,
                  activeAccountIds.length ? activeAccountIds : undefined
                )
                await refreshAll()
                showToast(`Emptied ${mailboxTitle}`)
              }}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition hover:opacity-80"
              style={{ background: 'var(--bg-elevated)', color: 'var(--danger)' }}
            >
              Empty {mailboxTitle}
            </button>
          )}
        </div>

        {/* Active Account Focus Strip */}
        {activeAccountIds.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {activeAccountIds.map((id) => {
              const a = accounts.find((x) => x.id === id)
              if (!a) return null
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </span>
              )
            })}
            <button
              onClick={() => void selectAllAccounts()}
              className="text-[10.5px] font-medium hover:underline"
              style={{ color: 'var(--accent-text)' }}
            >
              Show all
            </button>
          </div>
        )}

        {/* People / Updates / All Tabs + Right-Aligned Sort Tabs */}
        {activeMailbox !== 'scheduled' && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">
            {activeMailbox === 'inbox' && !parsedSearch ? (
              <div className="flex items-center gap-1">
                {categories.map((c) => {
                  const active = activeCategory === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => void setActiveCategory(c.id)}
                      className="rounded-md px-2.5 py-1 text-[12px] font-medium transition"
                      style={{
                        background: active ? 'var(--bg-elevated)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-muted)'
                      }}
                    >
                      {c.label}
                      {c.count ? <span className="ml-1 opacity-70">{c.count}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div />
            )}

            <div className="ml-auto flex items-center gap-0.5">
              {(
                [
                  { id: 'date', label: 'Date' },
                  { id: 'sender', label: 'Sender' },
                  { id: 'subject', label: 'Subject' }
                ] as { id: SortField; label: string }[]
              ).map((s) => {
                const active = sortField === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSortClick(s.id)}
                    className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium transition hover:bg-[var(--bg-hover)]"
                    style={{
                      background: active ? 'var(--bg-elevated)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}
                    title={
                      active
                        ? `Sorted by ${s.label} (${sortDir === 'desc' ? 'descending' : 'ascending'}) — click to flip`
                        : `Sort by ${s.label}`
                    }
                  >
                    <span>{s.label}</span>
                    {active && (sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Natural-Language Search Pills */}
        {parsedSearch && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {parsedSearch.pills.map((p) => (
              <span
                key={`${p.key}-${p.value}`}
                className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                {p.label}
              </span>
            ))}
            <button
              onClick={() => void clearSearch()}
              className="ml-auto inline-flex items-center gap-0.5 text-[11px] hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={11} /> Clear
            </button>
          </div>
        )}

        {/* Bulk Multi-Select Bar */}
        {checkedThreadIds.length > 0 && (
          <div
            className="mt-2 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12px]"
            style={{ background: 'var(--bg-selected)' }}
          >
            <span className="font-medium">{checkedThreadIds.length} selected</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void archiveThreads(checkedThreadIds)}
                className="rounded p-1 hover:bg-[var(--bg-hover)]"
                title="Archive selected (E)"
              >
                <Archive size={13} />
              </button>
              <button
                onClick={() => void trashThreads(checkedThreadIds)}
                className="rounded p-1 hover:bg-[var(--bg-hover)]"
                title="Delete selected"
              >
                <Trash2 size={13} />
              </button>
              <button onClick={clearCheckedThreads} className="rounded p-1 hover:bg-[var(--bg-hover)]" title="Clear (Esc)">
                <X size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scheduled Mailbox Special View */}
      {activeMailbox === 'scheduled' ? (
        <div className="flex-1 overflow-y-auto p-3">
          {scheduledEmails.length === 0 ? (
            <p className="mt-10 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              No scheduled messages waiting to send.
            </p>
          ) : (
            <div className="space-y-2">
              {scheduledEmails.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border p-3"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[13px] font-semibold">{s.subject || '(No subject)'}</span>
                    <button
                      onClick={async () => {
                        await window.glassmail.cancelScheduledEmail(s.id)
                        await refreshAll()
                      }}
                      className="text-[11px] font-medium hover:underline"
                      style={{ color: 'var(--danger)' }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mt-1 truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    To: {s.to.join(', ')}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: 'var(--accent-text)' }}>
                    Sends {new Date(s.sendAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Normal Thread List */
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {threads.length === 0 ? (
            <div className="mt-16 px-6 text-center">
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                All clear here
              </p>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                No conversations match the current filter.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([bucket, items]) => (
              <div key={bucket} className="mb-3">
                <div className="px-2 pb-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  {bucket}
                </div>
                <div className="space-y-0.5">
                  {items.map((t) => {
                    const isSelected = selectedThreadId === t.id
                    const isChecked = checkedThreadIds.includes(t.id)
                    return (
                      <div
                        key={t.id}
                        onClick={() => void selectThread(t.id)}
                        className="group relative flex cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2.5 transition"
                        style={{
                          background: isSelected
                            ? 'var(--bg-selected)'
                            : isChecked
                              ? 'var(--bg-elevated)'
                              : 'transparent'
                        }}
                      >
                        {/* Unread dot */}
                        <div className="mt-2.5 flex w-2 shrink-0 justify-center">
                          {!t.isRead && (
                            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                          )}
                        </div>

                        {/* Avatar + Account Color Dot + Hover Select Checkbox */}
                        <div className="relative mt-0.5 shrink-0">
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCheckThread(t.id)
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
                            style={{
                              background: isChecked ? 'var(--accent)' : 'var(--bg-elevated)',
                              color: isChecked ? '#fff' : 'var(--text-secondary)'
                            }}
                            title="Click to select (X)"
                          >
                            {isChecked ? <Check size={14} /> : initials(t.latestFrom.name || t.latestFrom.email)}
                          </div>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
                            style={{
                              background: t.accountColor,
                              borderColor: isSelected ? 'var(--bg-selected)' : 'var(--bg-list)'
                            }}
                            title={t.accountEmail}
                          />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="truncate text-[13px]"
                              style={{
                                fontWeight: !t.isRead ? 650 : 500,
                                color: 'var(--text-primary)'
                              }}
                            >
                              {t.latestFrom.name || t.latestFrom.email}
                              {t.messageCount > 1 && (
                                <span className="ml-1.5 text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
                                  {t.messageCount}
                                </span>
                              )}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              {t.hasAttachments && <Paperclip size={11} style={{ color: 'var(--text-muted)' }} />}
                              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {formatTime(t.lastMessageAt)}
                              </span>
                            </div>
                          </div>

                          <div
                            className="truncate text-[12.5px]"
                            style={{
                              fontWeight: !t.isRead ? 600 : 400,
                              color: !t.isRead ? 'var(--text-primary)' : 'var(--text-secondary)'
                            }}
                          >
                            {t.subject}
                          </div>

                          <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
                            {t.snippet}
                          </div>

                          {/* Inline 2FA Sign-In Code Copy Pill */}
                          {t.signInCode && (
                            <button
                              onClick={(e) => void copyCode(e, t.signInCode!)}
                              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11.5px] font-semibold transition hover:opacity-90"
                              style={{
                                background: 'var(--accent-soft)',
                                borderColor: 'var(--accent)',
                                color: 'var(--accent-text)'
                              }}
                              title="Click to copy sign-in code"
                            >
                              <span>{t.signInCode}</span>
                              <Copy size={11} />
                            </button>
                          )}
                        </div>

                        {/* Hover Actions */}
                        <div
                          className="absolute right-2 top-2 hidden items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-md group-hover:flex"
                          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void toggleStarThread(t.id, t.isStarred)
                            }}
                            className="rounded p-1 hover:bg-[var(--bg-hover)]"
                            title="Star"
                          >
                            <Star
                              size={12}
                              fill={t.isStarred ? '#f5b841' : 'none'}
                              style={{ color: t.isStarred ? '#f5b841' : 'var(--text-secondary)' }}
                            />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void archiveThreads([t.id])
                            }}
                            className="rounded p-1 hover:bg-[var(--bg-hover)]"
                            title="Archive (E)"
                          >
                            <Archive size={12} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void trashThreads([t.id])
                            }}
                            className="rounded p-1 hover:bg-[var(--bg-hover)]"
                            title="Delete"
                          >
                            <Trash2 size={12} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
