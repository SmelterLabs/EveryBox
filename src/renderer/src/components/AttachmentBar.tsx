import React, { useState } from 'react'
import {
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderDown,
  FolderOpen,
  Paperclip
} from 'lucide-react'
import { ContextMenu, type ContextMenuState } from './ContextMenu'
import type { Attachment, Folder } from '../../../shared/types'

interface AttachmentBarProps {
  attachments: Attachment[]
  accountId: string
  remoteMessageId?: string
  folderRole?: Folder['role']
  folderName?: string
  onToast?: (msg: string, undo?: () => Promise<void>, durationMs?: number) => void
  className?: string
}

function getFileVisual(filename: string): {
  label: string
  bg: string
  color: string
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
} {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') {
    return { label: 'PDF', bg: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', Icon: FileText }
  }
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(ext)) {
    return { label: ext.toUpperCase(), bg: 'rgba(16, 185, 129, 0.14)', color: '#10b981', Icon: FileSpreadsheet }
  }
  if (['doc', 'docx', 'rtf', 'odt', 'txt'].includes(ext)) {
    return { label: ext.toUpperCase(), bg: 'rgba(59, 130, 246, 0.14)', color: '#3b82f6', Icon: FileText }
  }
  if (['ppt', 'pptx', 'key'].includes(ext)) {
    return { label: ext.toUpperCase(), bg: 'rgba(249, 115, 22, 0.14)', color: '#f97316', Icon: FileText }
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic'].includes(ext)) {
    return { label: ext.toUpperCase(), bg: 'rgba(168, 85, 247, 0.14)', color: '#a855f7', Icon: FileImage }
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { label: ext.toUpperCase(), bg: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', Icon: FileArchive }
  }
  return {
    label: ext ? ext.toUpperCase() : 'FILE',
    bg: 'var(--accent-soft)',
    color: 'var(--accent)',
    Icon: Paperclip
  }
}

function formatBytes(size: number): string {
  if (!size || size <= 0) return ''
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

export const AttachmentBar: React.FC<AttachmentBarProps> = ({
  attachments,
  accountId,
  remoteMessageId,
  folderRole,
  folderName,
  onToast,
  className = ''
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const visible = attachments.filter((a) => !a.isInline)
  if (visible.length === 0) return null

  const buildPayload = (att: Attachment) => ({
    accountId,
    filename: att.filename,
    localPath: att.localPath,
    remoteMessageId,
    remoteAttachmentId: att.remoteAttachmentId,
    folderRole,
    folderName
  })

  const handleOpen = async (att: Attachment) => {
    onToast?.(`Opening ${att.filename}…`, undefined, 2500)
    const res = await window.glassmail.openAttachment(buildPayload(att))
    if (!res.ok) {
      onToast?.(res.error || `Could not open ${att.filename}`, undefined, 4000)
    }
  }

  const handleDownload = async (att: Attachment, revealInFolder = false) => {
    onToast?.(`Downloading ${att.filename}…`, undefined, 2500)
    const res = await window.glassmail.downloadAttachment({
      ...buildPayload(att),
      revealInFolder
    })
    if (res.ok) {
      onToast?.(
        revealInFolder
          ? `Saved ${res.filename || att.filename} to Downloads`
          : `Downloaded ${res.filename || att.filename} to Downloads`,
        undefined,
        3500
      )
    } else {
      onToast?.(res.error || `Could not download ${att.filename}`, undefined, 4000)
    }
  }

  const handleSaveAs = async (att: Attachment) => {
    const res = await window.glassmail.saveAttachmentAs(buildPayload(att))
    if (res.cancelled) return
    if (res.ok) {
      onToast?.(`Saved ${att.filename}`, undefined, 3000)
    } else {
      onToast?.(res.error || `Could not save ${att.filename}`, undefined, 4000)
    }
  }

  const handleSaveAll = async () => {
    const res = await window.glassmail.saveAllAttachments(visible.map(buildPayload))
    if (res.cancelled) return
    if (res.ok) {
      onToast?.(
        `Saved ${res.savedCount || visible.length} attachment${(res.savedCount || visible.length) === 1 ? '' : 's'}`,
        undefined,
        3500
      )
    } else {
      onToast?.(res.error || 'Could not save attachments', undefined, 4000)
    }
  }

  const openCardMenu = (e: React.MouseEvent, att: Attachment) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { type: 'header', label: att.filename },
        {
          label: 'Open',
          icon: <ExternalLink size={13} />,
          onClick: () => void handleOpen(att)
        },
        {
          label: 'Download to Downloads',
          icon: <Download size={13} />,
          onClick: () => void handleDownload(att, false)
        },
        {
          label: 'Save As…',
          icon: <FolderDown size={13} />,
          onClick: () => void handleSaveAs(att)
        },
        {
          label: 'Download & Show in Folder',
          icon: <FolderOpen size={13} />,
          onClick: () => void handleDownload(att, true)
        },
        { type: 'separator' },
        {
          label: 'Copy filename',
          icon: <Copy size={13} />,
          onClick: async () => {
            await window.glassmail.copyText(att.filename, 'Copied filename')
            onToast?.(`Copied "${att.filename}"`, undefined, 2500)
          }
        }
      ]
    })
  }

  return (
    <div
      className={`rounded-xl border p-3.5 ${className}`}
      style={{
        background: 'color-mix(in srgb, var(--bg-elevated) 72%, var(--bg-main))',
        borderColor: 'var(--border-subtle)'
      }}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Paperclip size={14} style={{ color: 'var(--accent)' }} />
          <span>
            {visible.length} {visible.length === 1 ? 'Attachment' : 'Attachments'}
          </span>
        </div>
        {visible.length > 1 && (
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
            style={{
              background: 'var(--bg-main)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-primary)'
            }}
            title="Save all attachments to a folder"
          >
            <FolderDown size={13} style={{ color: 'var(--accent)' }} />
            <span>Save all…</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {visible.map((att) => {
          const { label, bg, color, Icon } = getFileVisual(att.filename)
          const sizeStr = formatBytes(att.size)
          return (
            <div
              key={att.id}
              onContextMenu={(e) => openCardMenu(e, att)}
              className="group flex min-w-[270px] max-w-[420px] items-center overflow-hidden rounded-xl border transition hover:border-[var(--accent)] hover:shadow-sm"
              style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
            >
              {/* Primary click area: Open file */}
              <button
                type="button"
                onClick={() => void handleOpen(att)}
                className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3 text-left transition hover:bg-[var(--bg-hover)]"
                title={`Click to open ${att.filename} (right-click for more options)`}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: bg }}
                >
                  <Icon size={22} style={{ color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[14px] font-semibold leading-snug"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {att.filename}
                  </div>
                  <div className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {label}
                    {sizeStr ? ` · ${sizeStr}` : ''}
                  </div>
                </div>
              </button>

              {/* Dedicated Download & Save As buttons */}
              <div
                className="flex shrink-0 items-center gap-0.5 self-stretch border-l px-1.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDownload(att, false)
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Download to Downloads folder"
                  aria-label={`Download ${att.filename}`}
                >
                  <Download size={16} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleSaveAs(att)
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-secondary)' }}
                  title="Save As…"
                  aria-label={`Save ${att.filename} as`}
                >
                  <FolderDown size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {contextMenu && <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
    </div>
  )
}
