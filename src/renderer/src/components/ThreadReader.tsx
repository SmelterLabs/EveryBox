import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Bell,
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Forward,
  Home,
  Inbox,
  Mail,
  MapPin,
  Paperclip,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
  Video,
  X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import { EmailHtmlBody, type EmailBodyContextMenuInfo } from './EmailHtmlBody'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'
import { AccountBadge } from './AccountIcon'
import { AIDraftCard } from './AIDraftCard'
import { AttachmentBar } from './AttachmentBar'
import { buildReplyComposerState } from '../utils/replyHelper'
import type { EmailAddress, Message, ThreadAISummary, ThreadPreDraft } from '../../../shared/types'

function formatImplicitEventTime(startIso: string, endIso?: string): string {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return startIso
  const datePart = start.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
  if (endIso) {
    const end = new Date(endIso)
    if (!Number.isNaN(end.getTime())) {
      const sameDay = start.toDateString() === end.toDateString()
      const endPart = sameDay
        ? end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : end.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      return `${datePart} – ${endPart}`
    }
  }
  return datePart
}

export const ThreadReader: React.FC<{ isPopout?: boolean }> = ({ isPopout = false }) => {
  const {
    settings,
    folders,
    selectedThread,
    preDrafts,
    threadAiMeta,
    voiceProfiles,
    pendingSummarizeThreadId,
    pendingDraftThreadId,
    selectThread,
    runSearch,
    archiveThreads,
    trashThreads,
    moveThreadsToFolder,
    openMoveToPopover,
    snoozeThreads,
    toggleStarThread,
    openComposer,
    queueSendWithUndo,
    askAssistantPrompt,
    clearPendingSummarize,
    clearPendingDraft,
    createReminder,
    openCalendarCreate,
    reclassifyThread,
    dismissPreDraft,
    createCalendarEventFromImplicit,
    saveSettings,
    showToast,
    refreshAll,
    refreshTodayEvents
  } = useAppStore()

  const readerWidthMode = settings?.readerWidth || 'comfortable'
  const readerMaxWidth =
    readerWidthMode === 'narrow' ? '640px' : readerWidthMode === 'wide' ? 'none' : '880px'
  const readerBodyScale =
    readerWidthMode === 'narrow' ? 1 : readerWidthMode === 'wide' ? 1.35 : 1.15
  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLDivElement>('reader')

  const [summary, setSummary] = useState<ThreadAISummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [addingImplicitEvent, setAddingImplicitEvent] = useState(false)
  const [addedImplicitThreadIds, setAddedImplicitThreadIds] = useState<Record<string, boolean>>({})
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [localPreDraft, setLocalPreDraft] = useState<ThreadPreDraft | null>(null)
  const [editablePreDraftBody, setEditablePreDraftBody] = useState('')
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined)
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [showRemindMenu, setShowRemindMenu] = useState(false)
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [moveFolderFilter, setMoveFolderFilter] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [expandedMsgIds, setExpandedMsgIds] = useState<Record<string, boolean>>({})

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const latestMsgRef = useRef<HTMLElement | null>(null)
  const initializedThreadIdRef = useRef<string | null>(null)

  const aiMeta = selectedThread ? threadAiMeta[selectedThread.id] : undefined
  const effectiveSummary = summary || aiMeta?.summary || null

  const activePreDraft =
    localPreDraft && localPreDraft.threadId === selectedThread?.id && localPreDraft.status !== 'dismissed'
      ? localPreDraft
      : preDrafts.find((p) => p.threadId === selectedThread?.id && p.status !== 'dismissed') || null

  useEffect(() => {
    setEditablePreDraftBody(activePreDraft?.body || '')
  }, [activePreDraft?.threadId, activePreDraft?.body])

  useEffect(() => {
    setSummary(null)
    setLoadingSummary(false)
    setReclassifying(false)
    setAddingImplicitEvent(false)
    setLoadingDraft(false)
    setLocalPreDraft(null)
    setShowSnoozeMenu(false)
    setShowRemindMenu(false)
    setShowMoveMenu(false)
    setMoveFolderFilter('')
    setContextMenu(null)
  }, [selectedThread?.id])

  const generateAIDraft = async (voiceProfileId?: string) => {
    if (!selectedThread) return
    setLoadingDraft(true)
    try {
      const res = await window.glassmail.generatePreDraft({
        threadId: selectedThread.id,
        accountId: selectedThread.accountId,
        voiceProfileId: voiceProfileId ?? selectedVoiceId
      })
      if (res.ok && res.preDraft) {
        setLocalPreDraft(res.preDraft)
        await refreshAll()
      } else {
        showToast(res.error || 'Could not generate AI draft', undefined, 4000)
      }
    } finally {
      setLoadingDraft(false)
    }
  }

  useEffect(() => {
    if (!selectedThread || pendingDraftThreadId !== selectedThread.id) return
    clearPendingDraft()
    void generateAIDraft()
  }, [selectedThread?.id, pendingDraftThreadId])

  // Collapse older read messages by default and scroll directly to the latest message on thread open
  useEffect(() => {
    if (!selectedThread) {
      initializedThreadIdRef.current = null
      return
    }
    if (initializedThreadIdRef.current === selectedThread.id) return
    initializedThreadIdRef.current = selectedThread.id

    const msgs = selectedThread.messages
    const nextExpanded: Record<string, boolean> = {}
    msgs.forEach((m, idx) => {
      const isLatest = idx === msgs.length - 1
      nextExpanded[m.id] = msgs.length <= 1 || isLatest || !m.isRead
    })
    setExpandedMsgIds(nextExpanded)

    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (msgs.length > 1 && latestMsgRef.current) {
          latestMsgRef.current.scrollIntoView({ block: 'start', behavior: 'auto' })
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0
        }
      })
    })
    return () => cancelAnimationFrame(raf1)
  }, [selectedThread])

  useEffect(() => {
    if (!selectedThread || pendingSummarizeThreadId !== selectedThread.id) return
    clearPendingSummarize()
    const cached = threadAiMeta[selectedThread.id]?.summary
    if (cached) {
      setSummary(cached)
      return
    }
    void (async () => {
      setLoadingSummary(true)
      try {
        const res = await window.glassmail.summarizeThread(selectedThread.id, false)
        setSummary(res)
      } finally {
        setLoadingSummary(false)
      }
    })()
  }, [selectedThread?.id, pendingSummarizeThreadId])

  if (!selectedThread) return null

  const latestMsg = selectedThread.messages[selectedThread.messages.length - 1]

  const handleSummarize = async (forceRefresh = false) => {
    if (!forceRefresh && aiMeta?.summary && !summary) {
      setSummary(aiMeta.summary)
      return
    }
    setLoadingSummary(true)
    try {
      const res = await window.glassmail.summarizeThread(selectedThread.id, forceRefresh)
      setSummary(res)
    } finally {
      setLoadingSummary(false)
    }
  }

  const handleReclassify = async () => {
    if (reclassifying) return
    setReclassifying(true)
    try {
      const updated = await reclassifyThread(selectedThread.id)
      if (updated) {
        showToast(`Re-classified as "${updated.bundle}"`, undefined, 2500)
      } else {
        showToast('Fast Sorter is unavailable or disabled', undefined, 3000)
      }
    } finally {
      setReclassifying(false)
    }
  }

  const handleReply = (mode: 'reply' | 'replyAll' | 'forward', targetMsg?: Message) => {
    openComposer(buildReplyComposerState(selectedThread, mode, targetMsg || latestMsg))
  }

  const allExpanded =
    selectedThread.messages.length > 1 && selectedThread.messages.every((m) => expandedMsgIds[m.id] !== false)

  const toggleExpandAll = () => {
    const next: Record<string, boolean> = {}
    selectedThread.messages.forEach((m, idx) => {
      next[m.id] = allExpanded ? idx === selectedThread.messages.length - 1 : true
    })
    setExpandedMsgIds(next)
  }

  const handleSnoozeOption = (hours: number, label: string) => {
    setShowSnoozeMenu(false)
    void snoozeThreads([selectedThread.id], Date.now() + hours * 3600_000, label)
  }

  const openAddressMenu = (e: React.MouseEvent, addr: EmailAddress) => {
    if (!addr.email) return
    e.preventDefault()
    e.stopPropagation()
    const display = addr.name || addr.email
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { type: 'header', label: display },
        {
          label: `Email ${display}`,
          icon: <Mail size={13} />,
          onClick: () =>
            openComposer({
              mode: 'new',
              accountId: selectedThread.accountId,
              to: addr.email
            })
        },
        {
          label: 'Copy email address',
          icon: <Copy size={13} />,
          onClick: async () => {
            await window.glassmail.copyText(addr.email, 'Copied email address')
            showToast(`Copied ${addr.email}`, undefined, 2500)
          }
        },
        {
          label: `Find all emails from ${display}`,
          icon: <Search size={13} />,
          onClick: () => void runSearch(`from:${addr.email}`)
        }
      ]
    })
  }

  const handleBodyContextMenu = (info: EmailBodyContextMenuInfo) => {
    const items: ContextMenuItem[] = []

    if (info.linkUrl) {
      const isMailto = /^mailto:/i.test(info.linkUrl)
      const mailtoAddr = isMailto ? info.linkUrl.replace(/^mailto:/i, '').split('?')[0] : ''
      items.push(
        isMailto
          ? {
              label: `Email ${mailtoAddr}`,
              icon: <Mail size={13} />,
              onClick: () => openComposer({ mode: 'new', accountId: selectedThread.accountId, to: mailtoAddr })
            }
          : {
              label: 'Open link in browser',
              icon: <ExternalLink size={13} />,
              onClick: () => void window.glassmail.openExternal(info.linkUrl!)
            },
        {
          label: isMailto ? 'Copy email address' : 'Copy link address',
          icon: <Copy size={13} />,
          onClick: async () => {
            const val = isMailto ? mailtoAddr : info.linkUrl!
            await window.glassmail.copyText(val, 'Copied link')
            showToast(isMailto ? `Copied ${val}` : 'Copied link address', undefined, 2500)
          }
        }
      )
    }

    if (info.selectedText) {
      if (items.length > 0) items.push({ type: 'separator' })
      const snippet = info.selectedText.length > 140 ? `${info.selectedText.slice(0, 140)}…` : info.selectedText
      items.push(
        {
          label: 'Copy',
          icon: <Copy size={13} />,
          shortcut: 'Ctrl+C',
          onClick: async () => {
            await window.glassmail.copyText(info.selectedText, 'Copied selection')
            showToast('Copied text', undefined, 2000)
          }
        },
        {
          label: 'Search in EveryBox',
          icon: <Search size={13} />,
          onClick: () => void runSearch(info.selectedText.slice(0, 120))
        },
        {
          label: 'Ask EveryBox AI about this…',
          icon: <Sparkles size={13} />,
          onClick: () =>
            askAssistantPrompt(`Regarding the email "${selectedThread.subject}": "${snippet}" — explain or summarize what I need to know.`)
        },
        {
          label: 'Create calendar event from selection',
          icon: <CalendarPlus size={13} />,
          onClick: () =>
            openCalendarCreate({
              accountId: selectedThread.accountId,
              title: selectedThread.subject || snippet.slice(0, 60),
              description: info.selectedText
            })
        }
      )
    }

    if (items.length === 0) {
      items.push(
        {
          label: 'Reply',
          icon: <Reply size={13} />,
          shortcut: 'R',
          onClick: () => handleReply('reply')
        },
        {
          label: 'Reply all',
          icon: <ReplyAll size={13} />,
          onClick: () => handleReply('replyAll')
        },
        {
          label: 'Forward',
          icon: <Forward size={13} />,
          onClick: () => handleReply('forward')
        },
        { type: 'separator' },
        {
          label: 'Summarize with AI',
          icon: <Sparkles size={13} />,
          onClick: () => void handleSummarize()
        },
        {
          label: 'Copy subject',
          icon: <Copy size={13} />,
          onClick: async () => {
            await window.glassmail.copyText(selectedThread.subject, 'Copied subject')
            showToast('Copied subject', undefined, 2500)
          }
        }
      )
    }

    setContextMenu({ x: info.x, y: info.y, items })
  }

  return (
    <div
      ref={zoomRef}
      data-reading-pane="true"
      className="relative flex h-full flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--bg-main)' }}
    >
      {zoomBadge}
      {/* Distilled Labeled Action Bar (16px icons, clean hierarchy, Remind included) */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2.5"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center gap-1">
          {!isPopout && (
            <>
              <button
                type="button"
                onClick={() => void selectThread(null)}
                className="inline-flex items-center justify-center rounded-lg p-2 transition hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-secondary)' }}
                title="Back to Inbox Home (Today Brief)"
                aria-label="Back to Inbox Home"
              >
                <Home size={16} />
              </button>
              <div className="mx-1 h-4 w-px" style={{ background: 'var(--border-subtle)' }} />
            </>
          )}

          <button
            type="button"
            onClick={() => void archiveThreads([selectedThread.id])}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-primary)' }}
            title="Archive (E)"
            aria-label="Archive"
          >
            <Archive size={15} style={{ color: 'var(--text-secondary)' }} />
            <span>Archive</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowMoveMenu((v) => !v)
                setMoveFolderFilter('')
                setShowRemindMenu(false)
                setShowSnoozeMenu(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{
                background: showMoveMenu ? 'var(--bg-hover)' : undefined,
                color: 'var(--text-primary)'
              }}
              title="Move to folder (V)"
              aria-label="Move to folder"
              aria-expanded={showMoveMenu}
            >
              <FolderInput size={15} style={{ color: 'var(--text-secondary)' }} />
              <span>Move</span>
            </button>
            {showMoveMenu && (() => {
              const customFolders = Array.from(
                new Set(
                  folders
                    .filter((f) => f.role === 'custom' && f.accountId === selectedThread.accountId)
                    .map((f) => f.name)
                )
              ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
              const q = moveFolderFilter.trim().toLowerCase()
              const standardItems: { label: string; icon: React.ReactNode; onClick: () => void }[] = [
                {
                  label: 'Inbox',
                  icon: <Inbox size={13} />,
                  onClick: () => void moveThreadsToFolder([selectedThread.id], 'inbox', 'Inbox')
                },
                {
                  label: 'Archive',
                  icon: <Archive size={13} />,
                  onClick: () => void archiveThreads([selectedThread.id])
                },
                {
                  label: 'Junk / Spam',
                  icon: <ShieldAlert size={13} />,
                  onClick: () => void moveThreadsToFolder([selectedThread.id], 'junk', 'Junk')
                },
                {
                  label: 'Trash',
                  icon: <Trash2 size={13} />,
                  onClick: () => void trashThreads([selectedThread.id])
                }
              ]
              const filteredStandard = q
                ? standardItems.filter((it) => it.label.toLowerCase().includes(q))
                : standardItems
              const filteredCustom = q
                ? customFolders.filter((name) => name.toLowerCase().includes(q))
                : customFolders

              return (
                <div
                  className="absolute left-0 top-10 z-30 flex max-h-[min(420px,calc(100vh-110px))] w-64 flex-col overflow-hidden rounded-xl border shadow-2xl"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setShowMoveMenu(false)
                    }
                  }}
                >
                  {customFolders.length > 0 && (
                    <div className="shrink-0 border-b p-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div
                        className="flex items-center gap-1.5 rounded-lg border px-2 py-1"
                        style={{ background: 'var(--bg-main)', borderColor: 'var(--border-subtle)' }}
                      >
                        <Search size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                        <input
                          autoFocus
                          value={moveFolderFilter}
                          onChange={(e) => setMoveFolderFilter(e.target.value)}
                          placeholder="Filter folders…"
                          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
                        />
                        {moveFolderFilter && (
                          <button
                            type="button"
                            onClick={() => setMoveFolderFilter('')}
                            className="rounded p-0.5 hover:bg-[var(--bg-hover)]"
                            style={{ color: 'var(--text-muted)' }}
                            aria-label="Clear folder filter"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="min-h-0 flex-1 overflow-y-auto p-1">
                    {filteredStandard.map((it) => (
                      <button
                        key={it.label}
                        type="button"
                        onClick={() => {
                          setShowMoveMenu(false)
                          it.onClick()
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                      >
                        <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>
                          {it.icon}
                        </span>
                        <span className="truncate">{it.label}</span>
                      </button>
                    ))}
                    {filteredStandard.length > 0 && filteredCustom.length > 0 && (
                      <div className="my-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                    )}
                    {filteredCustom.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setShowMoveMenu(false)
                          void moveThreadsToFolder([selectedThread.id], 'custom', name)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                      >
                        <FolderIcon size={13} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
                        <span className="truncate">{name}</span>
                      </button>
                    ))}
                    {filteredStandard.length === 0 && filteredCustom.length === 0 && (
                      <div className="px-2.5 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        No matching folders
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 border-t p-1" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoveMenu(false)
                        openMoveToPopover([selectedThread.id], selectedThread.accountId)
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium transition hover:bg-[var(--bg-hover)]"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      <span className="flex items-center gap-2">
                        <FolderPlus size={13} />
                        <span>Move to… / New folder</span>
                      </span>
                      <kbd
                        className="rounded border px-1 py-0.5 font-mono text-[10px]"
                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                      >
                        V
                      </kbd>
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>

          <button
            type="button"
            onClick={() => void trashThreads([selectedThread.id])}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
            style={{ color: 'var(--text-primary)' }}
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 size={15} style={{ color: 'var(--text-secondary)' }} />
            <span>Delete</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowRemindMenu((v) => !v)
                setShowSnoozeMenu(false)
                setShowMoveMenu(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{
                background: showRemindMenu ? 'var(--bg-hover)' : undefined,
                color: 'var(--text-primary)'
              }}
              title="Set Reminder"
              aria-label="Set Reminder"
              aria-expanded={showRemindMenu}
            >
              <Bell size={15} style={{ color: 'var(--text-secondary)' }} />
              <span>Remind</span>
            </button>
            {showRemindMenu && (
              <div
                className="absolute left-0 top-10 z-30 w-52 rounded-xl border p-1 shadow-xl"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
              >
                {[
                  { label: 'In 10 minutes', dueAt: Date.now() + 10 * 60_000, noReply: false },
                  { label: 'In 30 minutes', dueAt: Date.now() + 30 * 60_000, noReply: false },
                  { label: 'In 1 hour', dueAt: Date.now() + 60 * 60_000, noReply: false },
                  {
                    label: 'Tomorrow morning',
                    dueAt: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1, 9, 0, 0).getTime(),
                    noReply: false
                  },
                  {
                    label: 'Next week',
                    dueAt: new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      new Date().getDate() + ((1 - new Date().getDay() + 7) % 7 || 7),
                      9,
                      0,
                      0
                    ).getTime(),
                    noReply: false
                  },
                  { label: 'In 2 days if no reply', dueAt: Date.now() + 48 * 3600_000, noReply: true }
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setShowRemindMenu(false)
                      void createReminder({
                        accountId: selectedThread.accountId,
                        threadId: selectedThread.id,
                        threadSubject: selectedThread.subject,
                        threadSender: latestMsg?.from.name || latestMsg?.from.email,
                        title: opt.noReply ? `Follow up: ${selectedThread.subject}` : selectedThread.subject,
                        dueAt: opt.dueAt,
                        onlyIfNoReply: opt.noReply
                      })
                    }}
                    className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowSnoozeMenu((v) => !v)
                setShowRemindMenu(false)
                setShowMoveMenu(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{
                background: showSnoozeMenu ? 'var(--bg-hover)' : undefined,
                color: 'var(--text-primary)'
              }}
              title="Snooze (H)"
              aria-label="Snooze"
              aria-expanded={showSnoozeMenu}
            >
              <Clock size={15} style={{ color: 'var(--text-secondary)' }} />
              <span>Snooze</span>
            </button>
            {showSnoozeMenu && (
              <div
                className="absolute left-0 top-10 z-30 w-44 rounded-xl border p-1 shadow-xl"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
              >
                <button
                  type="button"
                  onClick={() => handleSnoozeOption(3, 'Later today')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  Later today (+3h)
                </button>
                <button
                  type="button"
                  onClick={() => handleSnoozeOption(24, 'Tomorrow')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  Tomorrow morning
                </button>
                <button
                  type="button"
                  onClick={() => handleSnoozeOption(24 * 3, 'In 3 days')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  In 3 days
                </button>
                <button
                  type="button"
                  onClick={() => handleSnoozeOption(24 * 7, 'Next week')}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                >
                  Next week
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void toggleStarThread(selectedThread.id, selectedThread.isStarred)}
            className="inline-flex items-center justify-center rounded-lg p-2 transition hover:bg-[var(--bg-hover)]"
            title={selectedThread.isStarred ? 'Unstar (S)' : 'Star (S)'}
            aria-label={selectedThread.isStarred ? 'Unstar conversation' : 'Star conversation'}
            aria-pressed={selectedThread.isStarred}
          >
            <Star
              size={15}
              fill={selectedThread.isStarred ? '#f5b841' : 'none'}
              style={{ color: selectedThread.isStarred ? '#f5b841' : 'var(--text-secondary)' }}
            />
          </button>
        </div>

        <div className="flex items-center gap-2.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {selectedThread.trackersBlocked > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5" style={{ background: 'var(--bg-elevated)' }}>
              <ShieldCheck size={13} style={{ color: 'var(--success)' }} />
              {selectedThread.trackersBlocked} tracker{selectedThread.trackersBlocked === 1 ? '' : 's'} blocked
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <AccountBadge icon={selectedThread.accountIcon} color={selectedThread.accountColor} size="xs" />
            {selectedThread.accountEmail}
          </span>
          {!isPopout && (
            <button
              type="button"
              onClick={() => void window.glassmail.openThreadWindow(selectedThread.id)}
              className="inline-flex items-center justify-center rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Open in new window"
              aria-label="Open in new window"
            >
              <ExternalLink size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Thread Content */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto py-6 ${readerWidthMode === 'wide' ? 'px-6' : 'px-8'}`}
      >
        <div className="mx-auto w-full" style={{ maxWidth: readerMaxWidth, zoom }}>
          {/* Subject + Summarize Pill */}
          <h1 className="text-[21px] font-semibold leading-snug tracking-tight">{selectedThread.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            <span>
              {selectedThread.participants
                .map((p) => p.name || p.email)
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 4)
                .join(', ')}
            </span>
            <span
              className="rounded-md px-2 py-0.5 text-[11px]"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {selectedThread.messageCount} message{selectedThread.messageCount === 1 ? '' : 's'}
            </span>
            {selectedThread.messages.length > 1 && (
              <button
                onClick={toggleExpandAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {allExpanded ? 'Collapse older' : `Expand all (${selectedThread.messages.length})`}
              </button>
            )}
            <button
              onClick={() => void handleSummarize(Boolean(effectiveSummary))}
              disabled={loadingSummary}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium transition hover:opacity-85"
              style={{ color: 'var(--accent-text)' }}
              title={effectiveSummary ? 'Refresh AI summary' : 'Summarize this thread'}
            >
              <Sparkles size={13} />
              {loadingSummary ? 'Summarizing…' : effectiveSummary ? 'Refresh Summary' : 'Summarize'}
            </button>
            <button
              type="button"
              onClick={() => void handleReclassify()}
              disabled={reclassifying}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
              style={{ color: 'var(--text-muted)' }}
              title="Re-classify thread with Fast Sorter"
              aria-label="Re-classify thread"
            >
              <RefreshCw size={11.5} className={reclassifying ? 'animate-spin' : ''} />
              <span>{reclassifying ? 'Classifying…' : 'Re-classify'}</span>
            </button>
            {!(loadingDraft || activePreDraft) && (
              <button
                onClick={() => void generateAIDraft()}
                disabled={loadingDraft}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium transition hover:opacity-85"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                <Sparkles size={13} />
                Draft Reply with AI
              </button>
            )}
          </div>

          {/* AI Draft Ready Card (from hover button or Background Pre-Drafts) */}
          {(loadingDraft || activePreDraft) && (
            <AIDraftCard
              thread={selectedThread}
              latestMsg={latestMsg}
              settings={settings}
              preDraft={activePreDraft}
              loading={loadingDraft}
              body={editablePreDraftBody}
              onBodyChange={setEditablePreDraftBody}
              voiceProfiles={voiceProfiles}
              selectedVoiceId={selectedVoiceId}
              onSelectVoice={(voiceId) => {
                setSelectedVoiceId(voiceId)
                void generateAIDraft(voiceId)
              }}
              onDismiss={async () => {
                setLocalPreDraft(null)
                await dismissPreDraft(selectedThread.id)
              }}
              onSend={async () => {
                if (!activePreDraft || !editablePreDraftBody.trim()) return
                const baseState = buildReplyComposerState(selectedThread, 'reply', latestMsg, {
                  outlookPrefixes: settings?.uiTheme === 'outlook-classic'
                })
                const toAddr = (baseState.to || latestMsg?.from.email || '').trim()
                if (!toAddr) {
                  openComposer({ ...baseState, body: editablePreDraftBody })
                  return
                }
                const escapeHtml = (text: string): string =>
                  text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;')
                const bodyText = editablePreDraftBody
                const bodyHtml = bodyText
                  .split('\n')
                  .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
                  .join('')
                setLocalPreDraft(null)
                await window.glassmail.deletePreDraft(selectedThread.id)
                await refreshAll()
                queueSendWithUndo(
                  {
                    accountId: selectedThread.accountId,
                    to: toAddr.split(',').map((s) => s.trim()).filter(Boolean),
                    cc: [],
                    bcc: [],
                    subject: baseState.subject || activePreDraft.subject,
                    bodyHtml,
                    bodyText,
                    replyToMessageId: latestMsg?.messageIdHeader,
                    threadId: selectedThread.id
                  },
                  {
                    ...baseState,
                    body: editablePreDraftBody
                  },
                  settings?.undoSendSeconds ?? 5
                )
              }}
              onOpenInComposer={async () => {
                if (!activePreDraft) return
                const baseState = buildReplyComposerState(selectedThread, 'reply', latestMsg, {
                  outlookPrefixes: settings?.uiTheme === 'outlook-classic'
                })
                openComposer({
                  ...baseState,
                  subject: baseState.subject || activePreDraft.subject,
                  body: editablePreDraftBody
                })
                setLocalPreDraft(null)
                await window.glassmail.deletePreDraft(selectedThread.id)
                await refreshAll()
              }}
              onRegenerate={() => void generateAIDraft()}
              onToggleAlwaysAutoDraft={async () => {
                if (!latestMsg?.from.email || !settings) return
                const sender = latestMsg.from.email.toLowerCase()
                const alwaysList = settings.autopilot?.preDraftAlwaysSenders || []
                const isAlways = alwaysList.some((s) => s.toLowerCase() === sender)
                const prevSettings = settings
                const nextAlways = isAlways
                  ? alwaysList.filter((s) => s.toLowerCase() !== sender)
                  : Array.from(new Set([...alwaysList, sender]))
                const nextExcluded = (settings.autopilot?.preDraftExcludedSenders || []).filter(
                  (s) => s.toLowerCase() !== sender
                )
                await saveSettings({
                  ...settings,
                  autopilot: {
                    ...settings.autopilot,
                    autoPreDraftPeople: Boolean(settings.autopilot?.autoPreDraftPeople),
                    preDraftDisabledAccountIds: settings.autopilot?.preDraftDisabledAccountIds || [],
                    preDraftAlwaysSenders: nextAlways,
                    preDraftExcludedSenders: isAlways
                      ? settings.autopilot?.preDraftExcludedSenders || []
                      : nextExcluded,
                    waitingDismissedThreadIds: settings.autopilot?.waitingDismissedThreadIds || [],
                    autoClean2FAHours: settings.autopilot?.autoClean2FAHours ?? null
                  }
                })
                await refreshAll()
                showToast(
                  isAlways
                    ? `Removed ${sender} from Always auto-draft`
                    : `Will always auto-draft replies for ${sender}`,
                  async () => {
                    await saveSettings(prevSettings)
                    await refreshAll()
                  }
                )
              }}
              onExcludeSender={async () => {
                if (!latestMsg?.from.email || !settings) return
                const sender = latestMsg.from.email.toLowerCase()
                const alwaysList = settings.autopilot?.preDraftAlwaysSenders || []
                const prevList = settings.autopilot?.preDraftExcludedSenders || []
                const nextList = Array.from(new Set([...prevList, sender]))
                const nextAlways = alwaysList.filter((s) => s.toLowerCase() !== sender)
                const prevSettings = settings
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
                setLocalPreDraft(null)
                await window.glassmail.deletePreDraft(selectedThread.id)
                const purged = await window.glassmail.deletePreDraftsBySender(sender)
                await refreshAll()
                const extra = purged.removed > 0 ? ` (cleared ${purged.removed + 1} drafts)` : ''
                showToast(`Won't pre-draft replies for ${sender}${extra}`, async () => {
                  await saveSettings(prevSettings)
                  await refreshAll()
                })
              }}
            />
          )}

          {/* Scam Warning Banner */}
          {selectedThread.scamWarning && (
            <div
              className="mt-4 flex items-start gap-2.5 rounded-xl border p-3 text-[12.5px]"
              style={{ background: 'rgba(229,83,75,0.12)', borderColor: 'var(--danger)', color: 'var(--text-primary)' }}
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <span>{selectedThread.scamWarning}</span>
            </div>
          )}

          {/* Implicit Calendar Event ("Meeting detected") Banner */}
          {aiMeta?.implicitEvent && (
            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  <CalendarPlus size={17} />
                </div>
                <div className="min-w-0">
                  <div
                    className="text-[10.5px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    Meeting detected
                  </div>
                  <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {aiMeta.implicitEvent.title}
                  </div>
                  <div className="truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {formatImplicitEventTime(aiMeta.implicitEvent.startIso, aiMeta.implicitEvent.endIso)}
                    {aiMeta.implicitEvent.location ? ` · ${aiMeta.implicitEvent.location}` : ''}
                  </div>
                </div>
              </div>
              {addedImplicitThreadIds[selectedThread.id] ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                  style={{ background: 'rgba(45, 212, 191, 0.14)', color: 'var(--success)' }}
                >
                  <Check size={13} /> Added to Calendar
                </span>
              ) : (
                <button
                  type="button"
                  disabled={addingImplicitEvent}
                  onClick={async () => {
                    if (!aiMeta.implicitEvent) return
                    setAddingImplicitEvent(true)
                    try {
                      const res = await createCalendarEventFromImplicit(
                        selectedThread.accountId,
                        aiMeta.implicitEvent,
                        selectedThread.id
                      )
                      if (res.ok) {
                        setAddedImplicitThreadIds((prev) => ({ ...prev, [selectedThread.id]: true }))
                      }
                    } finally {
                      setAddingImplicitEvent(false)
                    }
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  <CalendarPlus size={13} />
                  {addingImplicitEvent ? 'Adding…' : 'Add to Calendar'}
                </button>
              )}
            </div>
          )}

          {/* AI Thread Summary Card */}
          {effectiveSummary && (
            <div
              className="mt-4 rounded-xl border p-4"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="flex items-center justify-between gap-2 text-[11.5px] font-medium" style={{ color: 'var(--accent-text)' }}>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={13} /> Thread Summary
                </span>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--text-muted)' }}>{effectiveSummary.providerLabel}</span>
                  <button
                    type="button"
                    disabled={loadingSummary}
                    onClick={() => void handleSummarize(true)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Regenerate thread summary"
                    aria-label="Refresh thread summary"
                  >
                    <RefreshCw size={11} className={loadingSummary ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed">{effectiveSummary.gist}</p>
              {effectiveSummary.actionItems.length > 0 && (
                <ul className="mt-2.5 list-disc space-y-1 pl-5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  {effectiveSummary.actionItems.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
              {effectiveSummary.keyDates.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {effectiveSummary.keyDates.map((d, idx) => (
                    <span
                      key={idx}
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="mt-6 space-y-4">
            {selectedThread.messages.map((m, idx) => {
              const isLatest = idx === selectedThread.messages.length - 1
              const isMulti = selectedThread.messages.length > 1
              const isExpanded = expandedMsgIds[m.id] ?? (isLatest || !isMulti)

              if (!isExpanded) {
                return (
                  <article
                    key={m.id}
                    onClick={() => setExpandedMsgIds((prev) => ({ ...prev, [m.id]: true }))}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition hover:bg-[var(--bg-hover)]"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                    title="Click to expand message"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)' }}
                      >
                        {(m.from.name || m.from.email).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold">
                        {m.from.name || m.from.email}
                      </span>
                      {m.isDraft && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                          style={{ background: 'rgba(229, 83, 75, 0.14)', color: 'var(--danger)' }}
                        >
                          Draft
                        </span>
                      )}
                      <span className="truncate text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                        {m.snippet || m.bodyText.slice(0, 120)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                      {m.hasAttachments && <Paperclip size={12} />}
                      <span>
                        {new Date(m.date).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </article>
                )
              }

              return (
                <article
                  key={m.id}
                  ref={isLatest ? latestMsgRef : undefined}
                  className={`scroll-mt-4 ${
                    m.isDraft
                      ? 'rounded-2xl border border-dashed p-4'
                      : 'border-t pt-5 first:border-t-0 first:pt-0'
                  }`}
                  style={{
                    borderColor: m.isDraft ? 'rgba(229, 83, 75, 0.45)' : 'var(--border-subtle)',
                    background: m.isDraft ? 'rgba(229, 83, 75, 0.04)' : undefined
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {isMulti && !isLatest && (
                        <button
                          onClick={() => setExpandedMsgIds((prev) => ({ ...prev, [m.id]: false }))}
                          className="-ml-1 rounded-md p-1 transition hover:bg-[var(--bg-hover)]"
                          style={{ color: 'var(--text-muted)' }}
                          title="Collapse message"
                        >
                          <ChevronDown size={14} />
                        </button>
                      )}
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                      >
                        {(m.from.name || m.from.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div
                            onContextMenu={(e) => openAddressMenu(e, m.from)}
                            className="inline-block cursor-context-menu rounded px-1 -mx-1 text-[13.5px] font-semibold transition hover:bg-[var(--bg-hover)]"
                            title="Right-click for sender options"
                          >
                            {m.from.name}{' '}
                            <span className="font-normal text-[12px]" style={{ color: 'var(--text-muted)' }}>
                              {m.from.email}
                            </span>
                          </div>
                          {m.isDraft ? (
                            <>
                              <span
                                className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                style={{ background: 'rgba(229, 83, 75, 0.14)', color: 'var(--danger)' }}
                              >
                                Unsent Draft
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  openComposer({
                                    mode: 'reply',
                                    accountId: selectedThread.accountId,
                                    to: m.to.map((p) => p.email).filter(Boolean).join(', '),
                                    cc: m.cc.map((p) => p.email).filter(Boolean).join(', '),
                                    bcc: m.bcc.map((p) => p.email).filter(Boolean).join(', '),
                                    subject: m.subject || selectedThread.subject,
                                    body: m.bodyText || '',
                                    replyToThreadId: selectedThread.id,
                                    draftThreadId: selectedThread.messages.length === 1 ? selectedThread.id : undefined,
                                    draftRemoteId: m.remoteId,
                                    attachments: m.attachments
                                      .filter((a) => !a.isInline)
                                      .map((a) => ({
                                        id: a.id,
                                        filename: a.filename,
                                        mimeType: a.mimeType,
                                        size: a.size,
                                        localPath: a.localPath,
                                        remoteMessageId: m.remoteId,
                                        remoteAttachmentId: a.remoteAttachmentId
                                      }))
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold text-white transition hover:opacity-90"
                                style={{ background: 'var(--accent)' }}
                              >
                                Edit &amp; Send
                              </button>
                            </>
                          ) : (
                            isMulti &&
                            isLatest && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                              >
                                Latest
                              </span>
                            )
                          )}
                        </div>
                        <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                          <span className="font-medium">To</span>{' '}
                          {m.to.length > 0 ? (
                            m.to.map((r, rIdx) => (
                              <React.Fragment key={`${r.email}-${rIdx}`}>
                                {rIdx > 0 && ', '}
                                <span
                                  onContextMenu={(e) => openAddressMenu(e, r)}
                                  className="cursor-context-menu rounded px-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                  title={`${r.name ? `${r.name} <${r.email}>` : r.email} · Right-click for options`}
                                >
                                  {r.name || r.email}
                                </span>
                              </React.Fragment>
                            ))
                          ) : (
                            selectedThread.accountEmail
                          )}
                        </div>
                        {m.cc.length > 0 && (
                          <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                            <span className="font-medium">Cc</span>{' '}
                            {m.cc.map((r, rIdx) => (
                              <React.Fragment key={`${r.email}-${rIdx}`}>
                                {rIdx > 0 && ', '}
                                <span
                                  onContextMenu={(e) => openAddressMenu(e, r)}
                                  className="cursor-context-menu rounded px-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                  title={`${r.name ? `${r.name} <${r.email}>` : r.email} · Right-click for options`}
                                >
                                  {r.name || r.email}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        {m.bcc.length > 0 && (
                          <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                            <span className="font-medium">Bcc</span>{' '}
                            {m.bcc.map((r, rIdx) => (
                              <React.Fragment key={`${r.email}-${rIdx}`}>
                                {rIdx > 0 && ', '}
                                <span
                                  onContextMenu={(e) => openAddressMenu(e, r)}
                                  className="cursor-context-menu rounded px-0.5 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                  title={`${r.name ? `${r.name} <${r.email}>` : r.email} · Right-click for options`}
                                >
                                  {r.name || r.email}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <span className="mr-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(m.date).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReply('reply', m)}
                        className="rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Reply to this message (R)"
                        aria-label="Reply to this message"
                      >
                        <Reply size={22} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReply('replyAll', m)}
                        className="rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Reply all to this message (A)"
                        aria-label="Reply all to this message"
                      >
                        <ReplyAll size={22} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReply('forward', m)}
                        className="rounded-lg p-2 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Forward this message (F)"
                        aria-label="Forward this message"
                      >
                        <Forward size={22} />
                      </button>
                    </div>
                  </div>

                  {/* .ics Calendar Invite Card */}
                  {m.calendarInvite && (() => {
                    const inv = m.calendarInvite
                    const startDt = new Date(inv.startIso)
                    const endDt = new Date(inv.endIso)
                    const timeLabel = inv.allDay
                      ? `${startDt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · All day`
                      : formatImplicitEventTime(inv.startIso, inv.endIso)
                    const locIsUrl = Boolean(inv.location && /^https?:\/\//i.test(inv.location.trim()))
                    const organizerLabel = inv.organizerName || inv.organizerEmail
                    const attendeeCount = inv.attendees?.length || 0
                    const descPreview = inv.description?.trim()
                    const isCancelled = inv.status === 'CANCELLED' || inv.method === 'CANCEL'
                    return (
                      <div
                        className="mt-4 rounded-xl border p-3.5"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div
                              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                            >
                              <Calendar size={18} />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`text-[13px] font-semibold ${isCancelled ? 'line-through opacity-75' : ''}`}
                                >
                                  {inv.summary}
                                </span>
                                {isCancelled && (
                                  <span
                                    className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                    style={{ background: 'rgba(239,68,68,0.14)', color: 'var(--danger)' }}
                                  >
                                    Cancelled
                                  </span>
                                )}
                                {inv.calendarEventId && !isCancelled && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                                  >
                                    <Check size={10} /> On your calendar
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                                  {timeLabel}
                                </span>
                                {organizerLabel && (
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    Organizer: <span style={{ color: 'var(--text-secondary)' }}>{organizerLabel}</span>
                                  </span>
                                )}
                              </div>
                              {inv.location && (
                                <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                                  <MapPin size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                                  {locIsUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => void window.glassmail.openExternal(inv.location!.trim())}
                                      className="truncate underline hover:opacity-80"
                                      style={{ color: 'var(--accent-text)' }}
                                    >
                                      {inv.location}
                                    </button>
                                  ) : (
                                    <span className="truncate">{inv.location}</span>
                                  )}
                                </div>
                              )}
                              {attendeeCount > 0 && (
                                <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                                  <Users size={12} className="shrink-0" />
                                  <span className="truncate">
                                    {attendeeCount} {attendeeCount === 1 ? 'attendee' : 'attendees'}:{' '}
                                    {inv.attendees!
                                      .slice(0, 4)
                                      .map((a) => a.name || a.email)
                                      .join(', ')}
                                    {attendeeCount > 4 ? ` +${attendeeCount - 4} more` : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {inv.meetingUrl && !isCancelled && (
                              <button
                                type="button"
                                onClick={() => void window.glassmail.openExternal(inv.meetingUrl!)}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                                style={{ background: 'var(--accent)' }}
                              >
                                <Video size={13} /> Join Meeting
                              </button>
                            )}
                            {!isCancelled && !inv.calendarEventId && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await window.glassmail.createCalendarEvent({
                                    accountId: m.accountId,
                                    title: inv.summary,
                                    location: inv.location,
                                    description: inv.description,
                                    startAt: startDt.getTime(),
                                    endAt: endDt.getTime(),
                                    allDay: Boolean(inv.allDay),
                                    attendees: (inv.attendees || []).map((a) => a.email).filter(Boolean)
                                  })
                                  await refreshTodayEvents()
                                  showToast('Added invite to your combined calendar')
                                }}
                                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:opacity-90"
                                style={
                                  inv.meetingUrl
                                    ? {
                                        background: 'var(--bg-main)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-strong)'
                                      }
                                    : { background: 'var(--accent)', color: '#ffffff' }
                                }
                              >
                                Accept &amp; Add
                              </button>
                            )}
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => handleReply('reply', m)}
                                className="rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
                                style={{ borderColor: 'var(--border-strong)' }}
                              >
                                Decline
                              </button>
                            )}
                          </div>
                        </div>
                        {descPreview && (
                          <div
                            className="mt-2.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-[12px] leading-relaxed"
                            style={{
                              background: 'var(--bg-main)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            {descPreview.slice(0, 600).split(/(https?:\/\/[^\s<>"]+)/g).map((part, idx) =>
                              /^https?:\/\//i.test(part) ? (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => void window.glassmail.openExternal(part)}
                                  className="inline break-all underline hover:opacity-80"
                                  style={{ color: 'var(--accent-text)' }}
                                >
                                  {part}
                                </button>
                              ) : (
                                <React.Fragment key={idx}>{part}</React.Fragment>
                              )
                            )}
                            {descPreview.length > 600 ? '…' : ''}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Attachments (prominent, right above body like Outlook) */}
                  <AttachmentBar
                    attachments={m.attachments}
                    accountId={selectedThread.accountId}
                    remoteMessageId={m.remoteId}
                    folderRole={m.folderRole}
                    folderName={m.folderName}
                    onToast={showToast}
                    className="mb-4"
                  />

                  {/* Body (isolated in Shadow DOM so email <style> tags never leak into the app UI) */}
                  <EmailHtmlBody
                    html={m.bodyHtml || `<p>${m.bodyText.replace(/\n/g, '<br/>')}</p>`}
                    scale={readerBodyScale}
                    onBodyContextMenu={handleBodyContextMenu}
                  />
                </article>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom Quick Action Bar */}
      <div className={`border-t py-3 ${readerWidthMode === 'wide' ? 'px-6' : 'px-8'}`} style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="mx-auto flex w-full items-center gap-2" style={{ maxWidth: readerMaxWidth }}>
          <button
            onClick={() => handleReply('reply')}
            className="flex flex-1 items-center justify-between rounded-xl border px-4 py-2.5 text-[13px] transition hover:bg-[var(--bg-hover)]"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)'
            }}
          >
            <span className="flex items-center gap-2 truncate">
              <Reply size={14} className="shrink-0" />
              <span className="truncate">
                Reply to{' '}
                {(() => {
                  const selfEmail = (selectedThread.accountEmail || '').toLowerCase()
                  const latestExternal = [...selectedThread.messages]
                    .reverse()
                    .find((m) => !m.isSent && (m.from.email || '').toLowerCase() !== selfEmail)?.from
                  const nonSelfTo = latestMsg?.to.find((p) => p.email && p.email.toLowerCase() !== selfEmail)
                  const target = latestExternal || nonSelfTo || latestMsg?.from
                  return target?.name || target?.email || 'sender'
                })()}
                …
              </span>
            </span>
            <kbd
              className="ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[11px]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
            >
              R
            </kbd>
          </button>
          <button
            onClick={() => handleReply('replyAll')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[13px] transition hover:bg-[var(--bg-hover)]"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)'
            }}
            title="Reply All (A)"
          >
            <ReplyAll size={14} />
            <span>Reply all</span>
          </button>
          <button
            onClick={() => handleReply('forward')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[13px] transition hover:bg-[var(--bg-hover)]"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)'
            }}
            title="Forward (F)"
          >
            <Forward size={14} />
            <span>Forward</span>
          </button>
        </div>
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  )
}
