import React, { useEffect, useState } from 'react'
import { Calendar, Inbox, Palette, PenSquare, RefreshCw, Search, Settings, Sparkles, Zap } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { ThemeId } from '../../../shared/types'

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    accounts,
    settings,
    setActiveView,
    setActiveMailbox,
    selectAllAccounts,
    soloAccount,
    openComposer,
    openSettings,
    triggerSync,
    saveSettings
  } = useAppStore()

  const [query, setQuery] = useState('')

  useEffect(() => {
    if (commandPaletteOpen) setQuery('')
  }, [commandPaletteOpen])

  if (!commandPaletteOpen) return null

  const commands: { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void }[] = [
    { id: 'compose', label: 'New Message', hint: 'C', icon: <PenSquare size={14} />, run: () => openComposer({ mode: 'new' }) },
    { id: 'triage', label: 'Start Triage Mode', icon: <Zap size={14} />, run: () => setActiveView('triage') },
    { id: 'assistant', label: 'Open AI Assistant', icon: <Sparkles size={14} />, run: () => setActiveView('assistant') },
    { id: 'calendar', label: 'Open Combined Calendar', icon: <Calendar size={14} />, run: () => setActiveView('calendar') },
    { id: 'inbox', label: 'Go to Inbox', icon: <Inbox size={14} />, run: () => void setActiveMailbox('inbox') },
    { id: 'all-acc', label: 'Show All Accounts', icon: <Inbox size={14} />, run: () => void selectAllAccounts() },
    ...accounts.map((a) => ({
      id: `solo-${a.id}`,
      label: `Focus Account: ${a.name} (${a.email})`,
      icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />,
      run: () => void soloAccount(a.id)
    })),
    { id: 'sync', label: 'Sync All Mail & Calendars', icon: <RefreshCw size={14} />, run: () => void triggerSync() },
    ...(['dark', 'black', 'graphite', 'light', 'paper'] as ThemeId[]).map((t) => ({
      id: `theme-${t}`,
      label: `Switch Theme: ${t.charAt(0).toUpperCase() + t.slice(1)}`,
      icon: <Palette size={14} />,
      run: () => settings && void saveSettings({ ...settings, theme: t })
    })),
    { id: 'settings', label: 'Open Settings', hint: 'Ctrl+,', icon: <Settings size={14} />, run: () => openSettings('accounts') }
  ]

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-center gap-2.5 border-b px-4 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <Search size={15} style={{ color: 'var(--text-muted)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCommandPaletteOpen(false)
              if (e.key === 'Enter' && filtered[0]) {
                filtered[0].run()
                setCommandPaletteOpen(false)
              }
            }}
            placeholder="Type a command, account focus, or theme…"
            className="flex-1 bg-transparent text-[13.5px] outline-none"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[10.5px]" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}>
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => {
                cmd.run()
                setCommandPaletteOpen(false)
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition hover:bg-[var(--bg-hover)]"
            >
              <span className="flex items-center gap-2.5">
                <span style={{ color: 'var(--text-secondary)' }}>{cmd.icon}</span>
                <span>{cmd.label}</span>
              </span>
              {cmd.hint && (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {cmd.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
