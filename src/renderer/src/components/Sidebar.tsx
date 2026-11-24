import React, { useState } from 'react'
import {
  Archive,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Folder as FolderIcon,
  Hourglass,
  Inbox,
  Mail,
  Newspaper,
  PenSquare,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { MailboxId } from '../../../shared/types'

export const Sidebar: React.FC = () => {
  const {
    accounts,
    workspaces,
    folders,
    counts,
    activeAccountIds,
    activeWorkspaceId,
    activeView,
    activeMailbox,
    activeFolderName,
    isSyncing,
    setActiveView,
    setActiveMailbox,
    setActiveFolder,
    selectAllAccounts,
    soloAccount,
    toggleAccountFilter,
    selectWorkspace,
    openComposer,
    openSettings,
    triggerSync
  } = useAppStore()

  const [showMore, setShowMore] = useState(false)
  const [showFolders, setShowFolders] = useState(true)
  const [showWorkspacesMenu, setShowWorkspacesMenu] = useState(false)

  const allSelected = activeAccountIds.length === 0
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
  const headerLabel = activeWs
    ? activeWs.name
    : activeAccountIds.length === 1
      ? accounts.find((a) => a.id === activeAccountIds[0])?.name || 'Focused'
      : `${activeAccountIds.length} Accounts`

  const primaryMailboxes: { id: MailboxId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={15} />, count: counts.inbox },
    { id: 'starred', label: 'Starred', icon: <Star size={15} />, count: counts.starred },
    { id: 'snoozed', label: 'Snoozed', icon: <Clock size={15} />, count: counts.snoozed },
    { id: 'waiting', label: 'Waiting', icon: <Hourglass size={15} />, count: counts.waiting },
    { id: 'drafts', label: 'Drafts', icon: <FileText size={15} />, count: counts.drafts },
    { id: 'sent', label: 'Sent', icon: <Send size={15} /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <Newspaper size={15} /> },
    { id: 'scheduled', label: 'Scheduled', icon: <Mail size={15} />, count: counts.scheduled }
  ]

  const moreMailboxes: { id: MailboxId; label: string; icon: React.ReactNode }[] = [
    { id: 'archive', label: 'Archive', icon: <Archive size={15} /> },
    { id: 'junk', label: 'Junk', icon: <ShieldAlert size={15} /> },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={15} /> }
  ]

  const customFolders = folders.filter((f) => f.role === 'custom')

  return (
    <aside
      className="flex h-full w-[228px] shrink-0 flex-col border-r"
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Top Drag + Compose Row */}
      <div className="app-drag flex h-10 items-center justify-between px-3 pt-1">
        <div className="app-no-drag relative">
          <button
            onClick={() => setShowWorkspacesMenu((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] font-semibold transition hover:bg-[var(--bg-hover)]"
            title="Switch workspace or show all accounts"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-white"
              style={{ background: activeWs?.color || 'var(--accent)' }}
            >
              E
            </span>
            <span className="max-w-[110px] truncate">{headerLabel}</span>
            <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          {showWorkspacesMenu && (
            <div
              className="absolute left-0 top-9 z-40 w-52 rounded-xl border p-1.5 shadow-2xl"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="px-2 py-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Workspaces
              </div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    void selectWorkspace(ws)
                    setShowWorkspacesMenu(false)
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: ws.color }} />
                    {ws.name}
                  </span>
                  {ws.shortcutIndex && (
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Ctrl+{ws.shortcutIndex}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => openComposer({ mode: 'new' })}
          className="app-no-drag flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
          title="New Message (C)"
        >
          <PenSquare size={15} />
        </button>
      </div>

      {/* Scrollable Nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-2">
        {/* Assistant & Combined Calendar */}
        <div className="space-y-0.5">
          <button
            onClick={() => setActiveView('assistant')}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition"
            style={{
              background: activeView === 'assistant' ? 'var(--bg-selected)' : 'transparent',
              color: activeView === 'assistant' ? 'var(--accent-text)' : 'var(--text-primary)'
            }}
          >
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
            <span>Assistant</span>
          </button>

          <button
            onClick={() => setActiveView('calendar')}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition"
            style={{
              background: activeView === 'calendar' ? 'var(--bg-selected)' : 'transparent',
              color: activeView === 'calendar' ? 'var(--accent-text)' : 'var(--text-primary)'
            }}
          >
            <Calendar size={15} style={{ color: activeView === 'calendar' ? 'var(--accent)' : 'var(--text-secondary)' }} />
            <span>Calendar</span>
          </button>
        </div>

        {/* Mailboxes */}
        <div className="mt-4">
          <div className="mb-1 px-2.5 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Mailboxes
          </div>
          <div className="space-y-0.5">
            {primaryMailboxes.map((mb) => {
              const isActive =
                (activeView === 'mail' || activeView === 'subscriptions') &&
                activeMailbox === mb.id &&
                !activeFolderName
              return (
                <button
                  key={mb.id}
                  onClick={() => void setActiveMailbox(mb.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition hover:bg-[var(--bg-hover)]"
                  style={{
                    background: isActive ? 'var(--bg-selected)' : undefined,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 400
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>{mb.icon}</span>
                    <span>{mb.label}</span>
                  </span>
                  {mb.count ? (
                    <span className="text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      {mb.count}
                    </span>
                  ) : null}
                </button>
              )
            })}

            <button
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-muted)' }}
            >
              {showMore ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span>More</span>
            </button>

            {showMore &&
              moreMailboxes.map((mb) => {
                const isActive = activeView === 'mail' && activeMailbox === mb.id && !activeFolderName
                return (
                  <button
                    key={mb.id}
                    onClick={() => void setActiveMailbox(mb.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition hover:bg-[var(--bg-hover)]"
                    style={{
                      background: isActive ? 'var(--bg-selected)' : undefined,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>{mb.icon}</span>
                    <span>{mb.label}</span>
                  </button>
                )
              })}
          </div>
        </div>

        {/* Accounts & Focus Toggles */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Accounts (Focus)
            </span>
            <div className="flex items-center gap-1">
              {!allSelected && (
                <button
                  onClick={() => void selectAllAccounts()}
                  className="rounded px-1.5 py-0.5 text-[10.5px] font-medium transition hover:opacity-80"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                  title="Show all accounts"
                >
                  All
                </button>
              )}
              <button
                onClick={() => openSettings('accounts')}
                className="rounded p-0.5 transition hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-muted)' }}
                title="Add Gmail or IMAP account"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div className="space-y-0.5">
            {accounts.map((acc) => {
              const isChecked = allSelected || activeAccountIds.includes(acc.id)
              const isSolo = activeAccountIds.length === 1 && activeAccountIds[0] === acc.id
              return (
                <div
                  key={acc.id}
                  className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                  style={{
                    background: isSolo ? 'var(--bg-selected)' : undefined,
                    opacity: isChecked ? 1 : 0.45
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {/* Multi-select focus toggle checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleAccountFilter(acc.id)
                      }}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition"
                      style={{
                        borderColor: isChecked ? acc.color : 'var(--border-strong)',
                        background: isChecked ? acc.color : 'transparent'
                      }}
                      title={isChecked ? `Hide ${acc.name} from mail & calendar` : `Include ${acc.name}`}
                    >
                      {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
                    </button>

                    {/* Click name to solo / un-solo */}
                    <button
                      onClick={() => void soloAccount(acc.id)}
                      className="flex min-w-0 flex-1 flex-col text-left"
                      title={`Click to solo ${acc.name} (${acc.email})`}
                    >
                      <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                        {acc.name}
                      </span>
                      <span className="truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                        {acc.provider === 'gmail' ? 'Gmail' : 'IMAP'}
                        {acc.isDemo ? ' · Demo' : ''}
                      </span>
                    </button>
                  </div>

                  {acc.unreadCount ? (
                    <span className="ml-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      {acc.unreadCount}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {/* Custom Folders */}
        {customFolders.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowFolders((v) => !v)}
              className="mb-1 flex w-full items-center gap-1.5 px-2.5 text-[11px] font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              {showFolders ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Folders</span>
            </button>
            {showFolders && (
              <div className="space-y-0.5">
                {customFolders.slice(0, 15).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => void setActiveFolder(f.name)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                    style={{
                      background: activeFolderName === f.name ? 'var(--bg-selected)' : undefined,
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FolderIcon size={13} style={{ color: 'var(--text-muted)' }} />
                      <span className="truncate">{f.name}</span>
                    </span>
                    {f.unreadCount > 0 && (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {f.unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Sync & Settings */}
      <div
        className="flex items-center justify-between border-t px-3 py-2.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          onClick={() => void triggerSync()}
          className="flex items-center gap-2 text-[12px] transition hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          title="Sync all accounts & calendars now"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: isSyncing ? 'var(--accent)' : 'var(--success)' }} />
          <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'Syncing…' : 'Up to date'}</span>
        </button>

        <button
          onClick={() => openSettings('accounts')}
          className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)' }}
          title="Settings (Ctrl+,)"
        >
          <Settings size={15} />
        </button>
      </div>
    </aside>
  )
}
