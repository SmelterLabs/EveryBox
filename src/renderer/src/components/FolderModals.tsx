import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, FolderPlus, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import {
  getLeafFolderName,
  NORDIC_FOLDER_COLORS,
  renderFolderIcon
} from '../utils/folderTree'
import type {
  Account,
  Folder,
  FolderDeletePreview,
  FolderDeleteStrategy
} from '../../../shared/types'

export const CreateFolderModal: React.FC<{
  account: Account
  parentFolder?: Folder | null
  onClose: () => void
}> = ({ account, parentFolder, onClose }) => {
  const { createFolder, setAccountExpanded, setFolderExpanded } = useAppStore()
  const isGmail = account.provider === 'gmail'
  const noun = isGmail ? (parentFolder ? 'Sub-label' : 'Label') : parentFolder ? 'Subfolder' : 'Folder'

  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(`Enter a ${noun.toLowerCase()} name`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await createFolder({
        accountId: account.id,
        name: trimmed,
        parentPath: parentFolder ? parentFolder.path || parentFolder.name : null,
        color
      })
      if (res.ok) {
        setAccountExpanded(account.id, true)
        if (parentFolder) {
          setFolderExpanded(parentFolder.id, true)
        }
        onClose()
      } else {
        setError(res.error || `Could not create ${noun.toLowerCase()}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      onClick={() => !busy && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              <FolderPlus size={16} />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold leading-snug">New {noun}</h3>
              <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                {account.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 pb-4">
          {parentFolder && (
            <div
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px]"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <span style={{ color: 'var(--text-muted)' }}>Inside:</span>
              {renderFolderIcon(parentFolder.icon, isGmail, parentFolder.color, 12)}
              <span className="truncate font-medium">{parentFolder.path || parentFolder.name}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {noun} name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              placeholder={isGmail ? 'e.g. Receipts, Travel, Clients' : 'e.g. Projects, Receipts, Travel'}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: error ? 'var(--danger)' : 'var(--border-strong)' }}
            />
            {error && (
              <p className="mt-1 text-[11.5px]" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Icon color (optional)
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColor(null)}
                className="flex h-6 items-center justify-center rounded-full border px-2 text-[11px] transition hover:bg-[var(--bg-hover)]"
                style={{
                  borderColor: color === null ? 'var(--accent)' : 'var(--border-strong)',
                  background: color === null ? 'var(--accent-soft)' : 'transparent',
                  color: color === null ? 'var(--accent-text)' : 'var(--text-secondary)'
                }}
              >
                Default
              </button>
              {NORDIC_FOLDER_COLORS.map((swatch) => {
                const active = color?.toLowerCase() === swatch.hex.toLowerCase()
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => setColor(swatch.hex)}
                    title={swatch.label}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 transition hover:scale-105"
                    style={{
                      background: swatch.hex,
                      borderColor: active ? '#ffffff' : 'transparent',
                      boxShadow: active ? '0 0 0 1.5px var(--accent)' : undefined
                    }}
                  >
                    {active && <Check size={11} className="text-white" strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? 'Creating…' : `Create ${noun}`}
          </button>
        </div>
      </form>
    </div>
  )
}

export const RenameFolderModal: React.FC<{
  folder: Folder
  account: Account
  onClose: () => void
}> = ({ folder, account, onClose }) => {
  const { renameFolder } = useAppStore()
  const isGmail = account.provider === 'gmail'
  const noun = isGmail ? 'Label' : 'Folder'
  const initialLeaf = getLeafFolderName(folder)

  const [newName, setNewName] = useState(initialLeaf)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) {
      setError(`Enter a ${noun.toLowerCase()} name`)
      return
    }
    if (trimmed === initialLeaf) {
      onClose()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await renameFolder({ folderId: folder.id, newName: trimmed })
      if (res.ok) {
        onClose()
      } else {
        setError(res.error || `Could not rename ${noun.toLowerCase()}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      onClick={() => !busy && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              <Pencil size={15} />
            </span>
            <div>
              <h3 className="text-[15px] font-semibold leading-snug">Rename {noun}</h3>
              <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                {account.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-4">
          {folder.parentPath && (
            <div
              className="rounded-lg border px-2.5 py-1.5 text-[11.5px]"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
            >
              Parent: <span style={{ color: 'var(--text-secondary)' }}>{folder.parentPath}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
              New name
            </label>
            <input
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                if (error) setError(null)
              }}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: error ? 'var(--danger)' : 'var(--border-strong)' }}
            />
            {error && (
              <p className="mt-1 text-[11.5px]" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
          </div>
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </form>
    </div>
  )
}

type ImapDeleteOption = 'move-archive' | 'move-trash' | 'delete-permanent'

export const DeleteFolderModal: React.FC<{
  folder: Folder
  account: Account
  onClose: () => void
}> = ({ folder, account, onClose }) => {
  const { getFolderDeletePreview, deleteFolder } = useAppStore()
  const [preview, setPreview] = useState<FolderDeletePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [imapChoice, setImapChoice] = useState<ImapDeleteOption>('move-archive')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const provider = preview?.provider || account.provider
  const isGmail = provider === 'gmail'
  const isOutlook = provider === 'microsoft' || provider === 'outlook-local'
  const isImap = provider === 'imap'
  const displayName = getLeafFolderName(folder)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getFolderDeletePreview(folder.id)
      .then((res) => {
        if (!cancelled) {
          setPreview(res)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [folder.id, getFolderDeletePreview])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const handleDelete = async () => {
    setBusy(true)
    setError(null)
    try {
      let strategy: FolderDeleteStrategy = 'move-messages'
      let moveMessagesToRole: 'archive' | 'inbox' | 'trash' | undefined = 'archive'

      if (isGmail) {
        strategy = 'remove-label'
        moveMessagesToRole = undefined
      } else if (isOutlook) {
        strategy = 'move-messages'
        moveMessagesToRole = 'trash'
      } else if (isImap) {
        if (imapChoice === 'move-archive') {
          strategy = 'move-messages'
          moveMessagesToRole = 'archive'
        } else if (imapChoice === 'move-trash') {
          strategy = 'move-messages'
          moveMessagesToRole = 'trash'
        } else {
          strategy = 'delete-messages'
          moveMessagesToRole = undefined
        }
      }

      const res = await deleteFolder({
        folderId: folder.id,
        strategy,
        moveMessagesToRole,
        deleteChildren: true
      })
      if (res.ok) {
        onClose()
      } else {
        setError(res.error || 'Could not delete folder')
      }
    } finally {
      setBusy(false)
    }
  }

  const messageCount = preview?.messageCount ?? folder.totalCount ?? 0
  const childCount = preview?.childCount ?? 0
  const affectedRules = preview?.affectedRuleNames ?? []
  const isDangerAction = isImap && imapChoice === 'delete-permanent'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-start gap-3.5 px-5 pt-5 pb-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: isDangerAction ? 'rgba(209, 52, 56, 0.14)' : 'var(--accent-soft)',
              color: isDangerAction ? 'var(--danger)' : 'var(--accent-text)'
            }}
          >
            {isDangerAction ? <AlertTriangle size={18} /> : <Trash2 size={17} />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug">
              {isGmail ? `Remove label "${displayName}"?` : `Delete folder "${displayName}"?`}
            </h3>
            <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              {account.name} · {folder.path || folder.name}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-4">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={14} className="animate-spin" />
              <span>Checking folder contents…</span>
            </div>
          ) : (
            <>
              {/* Impact summary pill row */}
              <div
                className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-[12px]"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {messageCount === 0
                    ? 'No messages'
                    : `${messageCount} message${messageCount === 1 ? '' : 's'}`}
                </span>
                {childCount > 0 && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {childCount} {isGmail ? 'sub-label' : 'subfolder'}
                      {childCount === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>

              {/* Provider-specific guidance */}
              {isGmail && (
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Gmail labels are non-destructive. Removing this label
                  {childCount > 0 ? ` and its ${childCount} sub-label${childCount === 1 ? '' : 's'}` : ''} will not
                  delete any emails — your messages stay safely in All Mail and Inbox.
                </p>
              )}

              {isOutlook && (
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  This folder
                  {childCount > 0 ? ` and its ${childCount} subfolder${childCount === 1 ? '' : 's'}` : ''} will be
                  moved to <strong>Deleted Items</strong> so you can recover them if needed.
                </p>
              )}

              {isImap && (
                <div className="space-y-1.5">
                  <div className="text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    What should happen to emails in this folder?
                  </div>
                  {(
                    [
                      {
                        id: 'move-archive',
                        label: 'Move emails to Archive first',
                        desc: 'Safest option — preserves all messages in Archive before removing the folder.',
                        danger: false
                      },
                      {
                        id: 'move-trash',
                        label: 'Move emails to Trash',
                        desc: 'Moves messages to Trash before removing the folder.',
                        danger: false
                      },
                      {
                        id: 'delete-permanent',
                        label: 'Permanently delete folder & emails',
                        desc: 'Deletes the folder and its messages permanently. This cannot be undone.',
                        danger: true
                      }
                    ] as const
                  ).map((opt) => {
                    const active = imapChoice === opt.id
                    return (
                      <label
                        key={opt.id}
                        className="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition"
                        style={{
                          borderColor: active
                            ? opt.danger
                              ? 'var(--danger)'
                              : 'var(--accent)'
                            : 'var(--border-subtle)',
                          background: active
                            ? opt.danger
                              ? 'rgba(209, 52, 56, 0.08)'
                              : 'var(--accent-soft)'
                            : 'var(--bg-elevated)'
                        }}
                      >
                        <input
                          type="radio"
                          name="imap-delete-strategy"
                          checked={active}
                          onChange={() => setImapChoice(opt.id)}
                          className="mt-0.5 accent-[var(--accent)]"
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-[12.5px] font-medium"
                            style={{ color: opt.danger && active ? 'var(--danger)' : 'var(--text-primary)' }}
                          >
                            {opt.label}
                          </div>
                          <div className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                            {opt.desc}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              {/* Affected Autopilot rules warning */}
              {affectedRules.length > 0 && (
                <div
                  className="flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]"
                  style={{
                    borderColor: 'rgba(229, 164, 36, 0.45)',
                    background: 'rgba(229, 164, 36, 0.1)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#E5A424' }} />
                  <div>
                    <div className="font-medium">
                      {affectedRules.length} Autopilot rule{affectedRules.length === 1 ? '' : 's'} will be paused
                    </div>
                    <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {affectedRules.join(', ')}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-[12px]" style={{ color: 'var(--danger)' }}>
                  {error}
                </p>
              )}
            </>
          )}
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
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void handleDelete()}
            className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: isDangerAction ? 'var(--danger)' : 'var(--accent)' }}
          >
            {busy
              ? 'Deleting…'
              : isGmail
                ? 'Remove Label'
                : isOutlook
                  ? 'Move to Deleted Items'
                  : isDangerAction
                    ? 'Delete Permanently'
                    : 'Delete Folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
