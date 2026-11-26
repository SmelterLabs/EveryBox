import React, { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export interface ConfirmDialogState {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

interface ConfirmModalProps {
  dialog: ConfirmDialogState | null
  onClose: () => void
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ dialog, onClose }) => {
  const [busy, setBusy] = React.useState(false)

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, busy, onClose])

  if (!dialog) return null

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await dialog.onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[410px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-start gap-3.5 px-5 pt-5 pb-4">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: dialog.danger ? 'rgba(209, 52, 56, 0.14)' : 'var(--accent-soft)',
              color: dialog.danger ? 'var(--danger)' : 'var(--accent-text)'
            }}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="confirm-modal-title" className="text-[15px] font-semibold leading-snug">
              {dialog.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {dialog.description}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close confirmation dialog"
            className="rounded-lg p-1 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={15} />
          </button>
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-3.5"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border px-3.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
          >
            {dialog.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => void handleConfirm()}
            className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ background: dialog.danger ? 'var(--danger)' : 'var(--accent)' }}
          >
            {busy ? 'Working…' : dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
