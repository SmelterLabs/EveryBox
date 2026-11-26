import React, { useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'
import { modKeyPrefix } from '../utils/platform'

interface ShortcutHelpModalProps {
  open: boolean
  onClose: () => void
}

const GROUPS: { title: string; items: { keys: string; desc: string }[] }[] = [
  {
    title: 'Navigation & Search',
    items: [
      { keys: 'J / K', desc: 'Next / previous conversation' },
      { keys: '/', desc: 'Focus search bar' },
      { keys: `${modKeyPrefix}K`, desc: 'Open Command Palette' },
      { keys: `${modKeyPrefix}1–9`, desc: 'Switch account workspace' },
      { keys: 'Esc', desc: 'Clear selection / close overlay' },
      { keys: '?', desc: 'Show keyboard shortcuts' }
    ]
  },
  {
    title: 'Email Triage',
    items: [
      { keys: 'E', desc: 'Archive conversation' },
      { keys: 'Delete', desc: 'Move to Trash' },
      { keys: 'S', desc: 'Star / unstar' },
      { keys: 'H', desc: 'Snooze until tomorrow' },
      { keys: 'U', desc: 'Mark read / unread' },
      { keys: 'X / Shift+Click', desc: 'Select / range-select threads' }
    ]
  },
  {
    title: 'Composing & Replying',
    items: [
      { keys: 'C', desc: 'New message' },
      { keys: 'R / A / F', desc: 'Reply / Reply All / Forward' },
      { keys: `${modKeyPrefix}Enter`, desc: 'Send message' },
      { keys: `${modKeyPrefix}B / ${modKeyPrefix}I`, desc: 'Bold / Italic in composer' },
      { keys: `Alt+${modKeyPrefix}S`, desc: 'Insert snippet' },
      { keys: 'Z', desc: 'Undo last action / cancel send' }
    ]
  }
]

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[680px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3.5"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={16} style={{ color: 'var(--accent)' }} />
            <h3 id="shortcut-help-title" className="text-[14.5px] font-semibold">
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="rounded-lg p-1 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="space-y-2.5">
              <div className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                {g.title}
              </div>
              <div className="space-y-2">
                {g.items.map((it) => (
                  <div key={it.desc} className="flex items-center justify-between gap-2 text-[12px]">
                    <span style={{ color: 'var(--text-secondary)' }}>{it.desc}</span>
                    <kbd
                      className="shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
                      style={{
                        background: 'var(--bg-elevated)',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {it.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          className="flex items-center justify-between border-t px-5 py-2.5 text-[11.5px]"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
        >
          <span>Tip: Customize any shortcut in Settings › Shortcuts.</span>
          <span>Press Esc or ? to close</span>
        </div>
      </div>
    </div>
  )
}
