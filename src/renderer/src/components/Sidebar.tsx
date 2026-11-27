import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Bell,
  BellOff,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  GripVertical,
  HelpCircle,
  Hourglass,
  Inbox,
  Layers,
  Mail,
  MailOpen,
  Newspaper,
  Palette,
  PanelRight,
  Pencil,
  PenSquare,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { usePaneZoom } from '../hooks/usePaneZoom'
import { modKeyPrefix } from '../utils/platform'
import {
  buildFolderTree,
  FOLDER_ICON_OPTIONS,
  getLeafFolderName,
  NORDIC_FOLDER_COLORS,
  renderFolderIcon,
  type FolderTreeNode
} from '../utils/folderTree'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'
import { CreateFolderModal, DeleteFolderModal, RenameFolderModal } from './FolderModals'
import { ACCOUNT_ICON_OPTIONS, AccountIcon } from './AccountIcon'
import appIcon from '../assets/icon.png'
import type { Account, AccountIconId, Folder, MailboxId, OutlookFocusedMode } from '../../../shared/types'

const THREAD_DND_MIME = 'application/x-everybox-threads'
const SPRING_LOAD_DELAY_MS = 550

const COLOR_SWATCHES = [
  '#3B82F6',
  '#2DD4BF',
  '#A78BFA',
  '#34C77B',
  '#F5B841',
  '#EC5C8A',
  '#E87A48',
  '#EF4444',
  '#818CF8',
  '#94A3B8'
]

export const Sidebar: React.FC<{ width?: number }> = ({ width = 244 }) => {
  const {
    settings,
    accounts,
    workspaces,
    folders,
    counts,
    reminders,
    autopilotRules,
    habitSuggestions,
    activeAccountIds,
    activeWorkspaceId,
    activeView,
    assistantOpen,
    activeMailbox,
    activeFolderName,
    expandedAccountIds,
    expandedFolderIds,
    showHiddenFoldersByAccount,
    isSyncing,
    setActiveView,
    toggleAssistant,
    setActiveMailbox,
    selectThread,
    selectAllAccounts,
    soloAccount,
    selectAccountMailbox,
    toggleAccountFilter,
    selectWorkspace,
    toggleAccountExpanded,
    setAccountExpanded,
    toggleFolderExpanded,
    setFolderExpanded,
    toggleShowHiddenFolders,
    moveThreadsToFolder,
    moveFolder,
    reorderFolders,
    updateFolderPrefs,
    syncSingleFolder,
    openAutopilotWithPrompt,
    openComposer,
    openSettings,
    openConfirm,
    setShortcutHelpOpen,
    triggerSync,
    markFolderRead,
    createReminder,
    completeReminder,
    deleteReminder,
    refreshAll,
    showToast
  } = useAppStore()

  const [showMore, setShowMore] = useState(false)
  useEffect(() => {
    if (['snoozed', 'waiting', 'subscriptions', 'scheduled'].includes(activeMailbox)) {
      setShowMore(true)
    }
  }, [activeMailbox])
  const { ref: zoomRef, zoom, zoomBadge } = usePaneZoom<HTMLElement>('sidebar')
  const [addingReminder, setAddingReminder] = useState(false)
  const [newReminderTitle, setNewReminderTitle] = useState('')
  const [newReminderPreset, setNewReminderPreset] = useState<'10m' | '30m' | '1h' | 'tomorrow' | 'nextweek'>('1h')
  const [blinkingReminderIds, setBlinkingReminderIds] = useState<Record<string, boolean>>({})
  const [createFolderModal, setCreateFolderModal] = useState<{
    account: Account
    parentFolder?: Folder | null
  } | null>(null)
  const [renameFolderModal, setRenameFolderModal] = useState<{
    account: Account
    folder: Folder
  } | null>(null)
  const [deleteFolderModal, setDeleteFolderModal] = useState<{
    account: Account
    folder: Folder
  } | null>(null)

  useEffect(() => {
    const unsub = window.glassmail.onReminderDue((reminderId) => {
      setBlinkingReminderIds((prev) => ({ ...prev, [reminderId]: true }))
      window.setTimeout(() => {
        setBlinkingReminderIds((prev) => {
          const next = { ...prev }
          delete next[reminderId]
          return next
        })
      }, 5000)
    })
    return unsub
  }, [])
  const [showWorkspacesMenu, setShowWorkspacesMenu] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [addingWorkspace, setAddingWorkspace] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#3B82F6')
  const [editIcon, setEditIcon] = useState<AccountIconId>('none')
  const [editFocusedMode, setEditFocusedMode] = useState<OutlookFocusedMode>('all')
  const [savingAccount, setSavingAccount] = useState(false)
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null)
  const [dragOverAccountId, setDragOverAccountId] = useState<string | null>(null)
  const [draggedFolder, setDraggedFolder] = useState<Folder | null>(null)
  const [folderDropTarget, setFolderDropTarget] = useState<{
    key: string
    zone: 'before' | 'inside' | 'after'
  } | null>(null)
  const [folderRootDropAccountId, setFolderRootDropAccountId] = useState<string | null>(null)
  const [threadDropTargetKey, setThreadDropTargetKey] = useState<string | null>(null)
  const springLoadTimerRef = useRef<number | null>(null)
  const springLoadTargetRef = useRef<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const FOLDER_DND_MIME = 'application/x-everybox-folder'

  const clearSpringLoad = () => {
    if (springLoadTimerRef.current !== null) {
      window.clearTimeout(springLoadTimerRef.current)
      springLoadTimerRef.current = null
    }
    springLoadTargetRef.current = null
  }

  useEffect(() => () => clearSpringLoad(), [])

  const isThreadDragEvent = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types || []).includes(THREAD_DND_MIME)

  const isFolderDragEvent = (e: React.DragEvent): boolean =>
    Boolean(draggedFolder) || Array.from(e.dataTransfer.types || []).includes(FOLDER_DND_MIME)

  const isFolderDescendant = (ancestor: Folder, candidate: Folder): boolean => {
    const delim = (ancestor.delimiter || '/').toLowerCase()
    const ancPath = (ancestor.path || '').toLowerCase()
    const candPath = (candidate.path || '').toLowerCase()
    const candParent = (candidate.parentPath || '').toLowerCase()
    if (!ancPath) return false
    return candPath.startsWith(`${ancPath}${delim}`) || candParent === ancPath || candParent.startsWith(`${ancPath}${delim}`)
  }

  const handleFolderDropOnNode = async (
    source: Folder,
    targetNode: FolderTreeNode,
    siblings: FolderTreeNode[],
    parentFolderId: string | null,
    zone: 'before' | 'inside' | 'after'
  ) => {
    const targetFolder = targetNode.folder
    if (!targetFolder || source.accountId !== targetFolder.accountId || source.id === targetFolder.id) return
    if (isFolderDescendant(source, targetFolder)) return

    if (zone === 'inside') {
      const res = await moveFolder({ folderId: source.id, targetParentFolderId: targetFolder.id })
      if (res.ok) {
        setFolderExpanded(targetNode.key, true)
      }
      return
    }

    const siblingIds = siblings.map((n) => n.folder?.id).filter((id): id is string => Boolean(id))
    const isSameParent = siblingIds.includes(source.id)

    if (isSameParent) {
      const withoutSource = siblingIds.filter((id) => id !== source.id)
      const targetIdx = withoutSource.indexOf(targetFolder.id)
      if (targetIdx === -1) return
      const insertAt = zone === 'before' ? targetIdx : targetIdx + 1
      withoutSource.splice(insertAt, 0, source.id)
      await reorderFolders(source.accountId, withoutSource)
      return
    }

    // Dragged from a different parent level onto a before/after slot: move to this parent, then sort
    const res = await moveFolder({ folderId: source.id, targetParentFolderId: parentFolderId })
    if (res.ok && res.folder) {
      const nextIds = siblingIds.filter((id) => id !== res.folder!.id && id !== source.id)
      const targetIdx = nextIds.indexOf(targetFolder.id)
      if (targetIdx !== -1) {
        nextIds.splice(zone === 'before' ? targetIdx : targetIdx + 1, 0, res.folder.id)
        await reorderFolders(source.accountId, nextIds)
      }
    }
  }

  const scheduleSpringLoad = (targetKey: string, action: () => void) => {
    if (springLoadTargetRef.current === targetKey) return
    clearSpringLoad()
    springLoadTargetRef.current = targetKey
    springLoadTimerRef.current = window.setTimeout(() => {
      springLoadTimerRef.current = null
      springLoadTargetRef.current = null
      action()
    }, SPRING_LOAD_DELAY_MS)
  }

  const handleThreadDropOnFolder = (
    e: React.DragEvent,
    target: {
      accountId: string
      role: Folder['role']
      folderName?: string
      folderId?: string
    }
  ) => {
    e.preventDefault()
    e.stopPropagation()
    clearSpringLoad()
    setThreadDropTargetKey(null)
    const raw = e.dataTransfer.getData(THREAD_DND_MIME)
    if (!raw) return
    let payload: { threadIds?: string[]; accountId?: string } | null = null
    try {
      payload = JSON.parse(raw) as { threadIds?: string[]; accountId?: string }
    } catch {
      return
    }
    if (!payload?.threadIds?.length) return
    if (payload.accountId && payload.accountId !== target.accountId) {
      showToast('Cannot move threads across different accounts', undefined, 3500)
      return
    }
    void moveThreadsToFolder(payload.threadIds, target.role, target.folderName, target.folderId)
  }

  const openAccountMenu = (e: React.MouseEvent, acc: Account) => {
    e.preventDefault()
    e.stopPropagation()
    const isGmail = acc.provider === 'gmail'
    const items: ContextMenuItem[] = [
      {
        label: `New email from ${acc.name}`,
        icon: <PenSquare size={13} />,
        onClick: () => openComposer({ mode: 'new', accountId: acc.id })
      },
      {
        label: isGmail ? 'New Label…' : 'New Folder…',
        icon: <FolderPlus size={13} />,
        onClick: () => setCreateFolderModal({ account: acc, parentFolder: null })
      },
      {
        label: 'Sync now',
        icon: <RefreshCw size={13} />,
        onClick: () => void triggerSync()
      },
      { type: 'separator' },
      {
        label: 'Edit name & color…',
        icon: <Pencil size={13} />,
        onClick: () => openEditAccount(acc)
      },
      {
        label: 'Account settings…',
        icon: <Settings size={13} />,
        onClick: () => openSettings('accounts')
      }
    ]
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const openFolderMenu = (
    e: React.MouseEvent,
    opts: {
      mailbox: MailboxId
      label: string
      accountIds?: string[]
      folderName?: string
      account?: Account
      folder?: Folder
    }
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const { account, folder } = opts
    const items: ContextMenuItem[] = []

    const pushEmptyTrashOrJunk = () => {
      if ((opts.mailbox === 'trash' || opts.mailbox === 'junk') && !opts.folderName) {
        const role = opts.mailbox
        items.push(
          { type: 'separator' },
          {
            label: `Empty ${opts.label}`,
            icon: <Trash2 size={13} />,
            danger: true,
            onClick: () => {
              const count = role === 'trash' ? counts.trash : counts.junk
              openConfirm({
                title: `Empty ${opts.label}?`,
                description: count
                  ? `This will permanently delete ${count} conversation${count === 1 ? '' : 's'} in ${opts.label}. This action cannot be undone.`
                  : `This will permanently delete all messages in ${opts.label}. This action cannot be undone.`,
                confirmLabel: `Empty ${opts.label}`,
                danger: true,
                onConfirm: async () => {
                  await window.glassmail.emptyFolder(
                    role,
                    opts.accountIds && opts.accountIds.length > 0 ? opts.accountIds : undefined
                  )
                  await refreshAll()
                  showToast(`Emptied ${opts.label}`)
                }
              })
            }
          }
        )
      }
    }

    if (account && folder && folder.role === 'custom') {
      const isGmail = account.provider === 'gmail'
      const colorIconChildren: ContextMenuItem[] = [
        { type: 'header', label: 'Color' },
        ...NORDIC_FOLDER_COLORS.map((swatch) => {
          const isCurrent = folder.color?.toLowerCase() === swatch.hex.toLowerCase()
          return {
            key: `color-${swatch.id}`,
            label: swatch.label,
            icon: (
              <span
                className="flex h-3 w-3 items-center justify-center rounded-full"
                style={{ background: swatch.hex }}
              >
                {isCurrent && <Check size={8} className="text-white" strokeWidth={3} />}
              </span>
            ),
            onClick: () => void updateFolderPrefs({ folderId: folder.id, color: swatch.hex })
          }
        }),
        {
          key: 'color-reset',
          label: 'Reset color',
          icon: <RotateCcw size={12} />,
          disabled: !folder.color,
          onClick: () => void updateFolderPrefs({ folderId: folder.id, color: null })
        },
        { type: 'separator' },
        { type: 'header', label: 'Icon' },
        ...FOLDER_ICON_OPTIONS.map((opt) => {
          const isCurrent = folder.icon === opt.id
          return {
            key: `icon-${opt.id}`,
            label: isCurrent ? `${opt.label} ✓` : opt.label,
            icon: renderFolderIcon(opt.id, isGmail, folder.color, 13),
            onClick: () => void updateFolderPrefs({ folderId: folder.id, icon: opt.id })
          }
        }),
        {
          key: 'icon-reset',
          label: 'Reset icon',
          icon: <RotateCcw size={12} />,
          disabled: !folder.icon,
          onClick: () => void updateFolderPrefs({ folderId: folder.id, icon: null })
        }
      ]

      items.push(
        {
          label: isGmail ? 'New Sub-label…' : 'New Subfolder…',
          icon: <FolderPlus size={13} />,
          onClick: () => setCreateFolderModal({ account, parentFolder: folder })
        },
        {
          label: 'Rename…',
          icon: <Pencil size={13} />,
          onClick: () => setRenameFolderModal({ account, folder })
        },
        {
          label: 'Color & Icon',
          icon: <Palette size={13} />,
          disableFilter: true,
          children: colorIconChildren
        },
        {
          label: folder.isPinned ? 'Unpin from Favorites' : 'Pin to Favorites',
          icon: folder.isPinned ? <PinOff size={13} /> : <Pin size={13} />,
          onClick: () => void updateFolderPrefs({ folderId: folder.id, isPinned: !folder.isPinned })
        },
        { type: 'separator' },
        {
          label: 'Mark All as Read',
          icon: <MailOpen size={13} />,
          onClick: () =>
            void markFolderRead({
              mailbox: opts.mailbox,
              accountIds: opts.accountIds,
              folderName: opts.folderName,
              label: opts.label
            })
        },
        {
          label: 'Sync This Folder',
          icon: <RefreshCw size={13} />,
          onClick: () => void syncSingleFolder(account.id, folder.path || folder.name)
        },
        {
          label: folder.muteBadge ? 'Show Unread Badge' : 'Mute Unread Badge',
          icon: folder.muteBadge ? <Bell size={13} /> : <BellOff size={13} />,
          onClick: () => void updateFolderPrefs({ folderId: folder.id, muteBadge: !folder.muteBadge })
        },
        {
          label: 'Create Autopilot Rule for Folder…',
          icon: <Zap size={13} />,
          onClick: () =>
            openAutopilotWithPrompt(`Move matching emails to "${folder.path || folder.name}"`)
        },
        {
          label: folder.isHidden ? 'Show Folder' : 'Hide Folder',
          icon: folder.isHidden ? <Eye size={13} /> : <EyeOff size={13} />,
          onClick: () => void updateFolderPrefs({ folderId: folder.id, isHidden: !folder.isHidden })
        },
        { type: 'separator' },
        {
          label: isGmail ? 'Delete Label…' : 'Delete Folder…',
          icon: <Trash2 size={13} />,
          danger: true,
          onClick: () => setDeleteFolderModal({ account, folder })
        }
      )
    } else if (account && folder) {
      // System folder inside an account: hide impossible actions (Rename, Delete, Color & Icon, Hide)
      const canCreateSubfolder =
        account.provider !== 'gmail' &&
        (folder.role === 'inbox' || folder.role === 'sent' || folder.role === 'archive')

      items.push({
        label: folder.isPinned ? 'Unpin from Favorites' : 'Pin to Favorites',
        icon: folder.isPinned ? <PinOff size={13} /> : <Pin size={13} />,
        onClick: () => void updateFolderPrefs({ folderId: folder.id, isPinned: !folder.isPinned })
      })

      if (canCreateSubfolder) {
        items.push({
          label: 'New Subfolder…',
          icon: <FolderPlus size={13} />,
          onClick: () => setCreateFolderModal({ account, parentFolder: folder })
        })
      }

      items.push(
        { type: 'separator' },
        {
          label: 'Mark All as Read',
          icon: <MailOpen size={13} />,
          onClick: () =>
            void markFolderRead({
              mailbox: opts.mailbox,
              accountIds: opts.accountIds,
              folderName: opts.folderName,
              label: opts.label
            })
        },
        {
          label: 'Sync This Folder',
          icon: <RefreshCw size={13} />,
          onClick: () => void syncSingleFolder(account.id, folder.path || folder.name)
        },
        {
          label: folder.muteBadge ? 'Show Unread Badge' : 'Mute Unread Badge',
          icon: folder.muteBadge ? <Bell size={13} /> : <BellOff size={13} />,
          onClick: () => void updateFolderPrefs({ folderId: folder.id, muteBadge: !folder.muteBadge })
        }
      )
      pushEmptyTrashOrJunk()
    } else {
      // Unified top-level mailbox or system folder without a persisted Folder row
      items.push({
        label: 'Mark All as Read',
        icon: <MailOpen size={13} />,
        onClick: () =>
          void markFolderRead({
            mailbox: opts.mailbox,
            accountIds: opts.accountIds,
            folderName: opts.folderName,
            label: opts.label
          })
      })
      pushEmptyTrashOrJunk()
    }

    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const handleDropAccount = async (targetId: string) => {
    if (!draggedAccountId || draggedAccountId === targetId) {
      setDraggedAccountId(null)
      setDragOverAccountId(null)
      return
    }
    const ids = accounts.map((a) => a.id)
    const fromIdx = ids.indexOf(draggedAccountId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedAccountId(null)
      setDragOverAccountId(null)
      return
    }
    const next = [...ids]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setDraggedAccountId(null)
    setDragOverAccountId(null)
    await window.glassmail.reorderAccounts(next)
    await refreshAll()
  }

  const openEditAccount = (acc: Account) => {
    setEditingAccount(acc)
    setEditName(acc.name)
    setEditColor(acc.color)
    setEditIcon(acc.icon || 'none')
    setEditFocusedMode(acc.outlookFocusedMode || 'all')
  }

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAccount) return
    setSavingAccount(true)
    try {
      await window.glassmail.updateAccount({
        ...editingAccount,
        name: editName.trim() || editingAccount.email.split('@')[0],
        color: editColor,
        icon: editIcon,
        outlookFocusedMode: editingAccount.provider === 'outlook-local' ? editFocusedMode : editingAccount.outlookFocusedMode
      })
      setEditingAccount(null)
      await refreshAll()
      showToast(
        editingAccount.provider === 'outlook-local' && editFocusedMode !== (editingAccount.outlookFocusedMode || 'all')
          ? 'Account updated — refreshing Focused Inbox…'
          : 'Account updated'
      )
    } finally {
      setSavingAccount(false)
    }
  }

  const allSelected = activeAccountIds.length === 0
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
  const headerLabel = activeWs
    ? activeWs.name
    : activeAccountIds.length === 1
      ? accounts.find((a) => a.id === activeAccountIds[0])?.name || 'Focused'
      : `${activeAccountIds.length} Accounts`

  const primaryMailboxes: {
    id: MailboxId
    label: string
    icon: React.ReactNode
    total?: number
    unread?: number
  }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={15} />, total: counts.inboxTotal, unread: counts.inbox },
    { id: 'starred', label: 'Starred', icon: <Star size={15} />, total: counts.starred, unread: counts.starredUnread },
    { id: 'sent', label: 'Sent', icon: <Send size={15} />, total: counts.sent, unread: counts.sentUnread },
    { id: 'drafts', label: 'Drafts', icon: <FileText size={15} />, total: counts.drafts, unread: counts.draftsUnread },
    { id: 'archive', label: 'Archive', icon: <Archive size={15} />, total: counts.archive, unread: counts.archiveUnread },
    { id: 'junk', label: 'Junk', icon: <ShieldAlert size={15} />, total: counts.junk, unread: counts.junkUnread },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={15} />, total: counts.trash, unread: counts.trashUnread }
  ]

  const moreMailboxes: {
    id: MailboxId
    label: string
    icon: React.ReactNode
    total?: number
    unread?: number
  }[] = [
    { id: 'snoozed', label: 'Snoozed', icon: <Clock size={15} />, total: counts.snoozed, unread: counts.snoozedUnread },
    { id: 'waiting', label: 'Waiting', icon: <Hourglass size={15} />, total: counts.waiting, unread: counts.waitingUnread },
    { id: 'subscriptions', label: 'Subscriptions', icon: <Newspaper size={15} /> },
    { id: 'scheduled', label: 'Scheduled', icon: <Mail size={15} />, total: counts.scheduled }
  ]

  const renderCounts = (total?: number, unread?: number) => {
    const hasTotal = Boolean(total && total > 0)
    const hasUnread = Boolean(unread && unread > 0)
    if (!hasTotal && !hasUnread) return null
    return (
      <span className="ml-1.5 inline-flex shrink-0 items-baseline gap-1.5 tabular-nums">
        {hasUnread && (
          <span className="text-[11.5px] font-bold" style={{ color: 'var(--text-primary)' }} title={`${unread} unread`}>
            {unread}
          </span>
        )}
        {hasTotal && (
          <span className="text-[11px] font-normal" style={{ color: 'var(--text-muted)' }} title={`${total} total`}>
            {total}
          </span>
        )}
      </span>
    )
  }

  const accountById = useMemo(() => {
    const map = new Map<string, Account>()
    for (const acc of accounts) map.set(acc.id, acc)
    return map
  }, [accounts])

  const pinnedFolders = useMemo(
    () =>
      folders
        .filter((f) => f.isPinned && !f.isHidden && accountById.has(f.accountId))
        .sort((a, b) => {
          const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER
          const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER
          if (orderA !== orderB) return orderA - orderB
          return getLeafFolderName(a).localeCompare(getLeafFolderName(b), undefined, { sensitivity: 'base' })
        }),
    [folders, accountById]
  )

  const renderSystemRoleIcon = (role: Folder['role'], size = 13): React.ReactNode => {
    switch (role) {
      case 'inbox':
        return <Inbox size={size} />
      case 'drafts':
        return <FileText size={size} />
      case 'sent':
        return <Send size={size} />
      case 'archive':
        return <Archive size={size} />
      case 'junk':
        return <ShieldAlert size={size} />
      case 'trash':
        return <Trash2 size={size} />
      default:
        return renderFolderIcon(null, false, null, size)
    }
  }

  const getAccountSystemFolders = (acc: Account) => {
    const accFolders = folders.filter((f) => f.accountId === acc.id)
    const findByRole = (role: 'inbox' | 'drafts' | 'sent' | 'archive' | 'junk' | 'trash') =>
      accFolders.find((f) => f.role === role)

    const standardDefs: {
      role: 'inbox' | 'drafts' | 'sent' | 'archive' | 'junk' | 'trash'
      defaultLabel: string
      icon: React.ReactNode
    }[] = [
      { role: 'inbox', defaultLabel: 'Inbox', icon: <Inbox size={13} /> },
      { role: 'drafts', defaultLabel: 'Drafts', icon: <FileText size={13} /> },
      { role: 'sent', defaultLabel: 'Sent', icon: <Send size={13} /> },
      { role: 'archive', defaultLabel: 'Archive', icon: <Archive size={13} /> },
      { role: 'junk', defaultLabel: acc.provider === 'gmail' ? 'Spam' : 'Junk', icon: <ShieldAlert size={13} /> },
      { role: 'trash', defaultLabel: 'Trash', icon: <Trash2 size={13} /> }
    ]

    return standardDefs.map((def) => {
      const matched = findByRole(def.role)
      const rawUnread = def.role === 'inbox' ? acc.unreadCount || matched?.unreadCount || 0 : matched?.unreadCount || 0
      return {
        key: `${acc.id}:${def.role}`,
        label: matched?.name || def.defaultLabel,
        mailbox: def.role as MailboxId,
        icon: def.icon,
        folder: matched,
        unreadCount: matched?.muteBadge ? 0 : rawUnread
      }
    })
  }

  const renderCustomFolderNode = (
    node: FolderTreeNode,
    acc: Account,
    isSoloed: boolean,
    mutedOpacity = false,
    siblings: FolderTreeNode[] = [],
    parentFolderId: string | null = null
  ): React.ReactNode => {
    const isGmail = acc.provider === 'gmail'
    const folder = node.folder
    const isExpanded = Boolean(expandedFolderIds[node.key])
    const isItemActive = Boolean(
      folder &&
        isSoloed &&
        activeView === 'mail' &&
        activeFolderName &&
        (activeFolderName === folder.name || activeFolderName === folder.path)
    )
    const canIndentChildren = node.depth < 4
    const showCollapsedRollup = node.hasChildren && !isExpanded && node.rolledUpUnread > 0
    const showDirectUnread = (!node.hasChildren || isExpanded) && node.unreadCount > 0
    const dropKey = `folder:${node.key}`
    const isThreadDropOver = threadDropTargetKey === dropKey
    const isBeingDragged = Boolean(folder && draggedFolder?.id === folder.id)
    const activeFolderDropZone = folderDropTarget?.key === node.key ? folderDropTarget.zone : null

    const rowBoxShadow =
      isThreadDropOver || activeFolderDropZone === 'inside'
        ? 'inset 0 0 0 1px var(--accent)'
        : activeFolderDropZone === 'before'
          ? 'inset 0 2px 0 0 var(--accent)'
          : activeFolderDropZone === 'after'
            ? 'inset 0 -2px 0 0 var(--accent)'
            : undefined

    return (
      <div key={node.key}>
        <div
          draggable={Boolean(folder)}
          onDragStart={(e) => {
            if (!folder) return
            e.stopPropagation()
            e.dataTransfer.setData(
              FOLDER_DND_MIME,
              JSON.stringify({ folderId: folder.id, accountId: acc.id })
            )
            e.dataTransfer.effectAllowed = 'move'
            setDraggedFolder(folder)
          }}
          onDragEnd={() => {
            clearSpringLoad()
            setDraggedFolder(null)
            setFolderDropTarget(null)
            setFolderRootDropAccountId(null)
          }}
          className="group flex items-center rounded-md pl-0.5 pr-1.5 transition hover:bg-[var(--bg-hover)]"
          style={{
            background:
              isThreadDropOver || activeFolderDropZone === 'inside'
                ? 'var(--accent-soft)'
                : isItemActive
                  ? 'var(--bg-selected)'
                  : undefined,
            boxShadow: rowBoxShadow,
            opacity: isBeingDragged ? 0.45 : mutedOpacity ? 0.65 : 1
          }}
          title={
            folder
              ? `${node.fullPath} · Drag to reorder or drop onto another folder to nest`
              : node.fullPath
          }
          onDragOver={(e) => {
            if (isThreadDragEvent(e)) {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              if (node.hasChildren && !isExpanded) {
                scheduleSpringLoad(dropKey, () => setFolderExpanded(node.key, true))
              }
              if (folder && threadDropTargetKey !== dropKey) {
                setThreadDropTargetKey(dropKey)
              }
              return
            }
            if (
              isFolderDragEvent(e) &&
              draggedFolder &&
              folder &&
              draggedFolder.accountId === acc.id &&
              draggedFolder.id !== folder.id &&
              !isFolderDescendant(draggedFolder, folder)
            ) {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              const rect = e.currentTarget.getBoundingClientRect()
              const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
              const zone: 'before' | 'inside' | 'after' =
                ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside'
              if (zone === 'inside' && node.hasChildren && !isExpanded) {
                scheduleSpringLoad(dropKey, () => setFolderExpanded(node.key, true))
              } else if (springLoadTargetRef.current === dropKey) {
                clearSpringLoad()
              }
              if (folderDropTarget?.key !== node.key || folderDropTarget?.zone !== zone) {
                setFolderDropTarget({ key: node.key, zone })
              }
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            if (springLoadTargetRef.current === dropKey) clearSpringLoad()
            if (threadDropTargetKey === dropKey) setThreadDropTargetKey(null)
            if (folderDropTarget?.key === node.key) setFolderDropTarget(null)
          }}
          onDrop={(e) => {
            if (isThreadDragEvent(e)) {
              if (folder) {
                handleThreadDropOnFolder(e, {
                  accountId: acc.id,
                  role: 'custom',
                  folderName: folder.path || folder.name,
                  folderId: folder.id
                })
              } else {
                e.preventDefault()
                e.stopPropagation()
                clearSpringLoad()
                setThreadDropTargetKey(null)
              }
              return
            }
            if (isFolderDragEvent(e) && draggedFolder && folder) {
              e.preventDefault()
              e.stopPropagation()
              const zone =
                folderDropTarget?.key === node.key ? folderDropTarget.zone : 'inside'
              const source = draggedFolder
              clearSpringLoad()
              setDraggedFolder(null)
              setFolderDropTarget(null)
              setFolderRootDropAccountId(null)
              void handleFolderDropOnNode(source, node, siblings, parentFolderId, zone)
            }
          }}
          onContextMenu={(e) => {
            if (!folder) return
            openFolderMenu(e, {
              mailbox: 'inbox',
              label: `${acc.name} · ${node.name}`,
              accountIds: [acc.id],
              folderName: folder.name,
              account: acc,
              folder
            })
          }}
        >
          {/* Fixed 16px chevron slot so leaf and parent icons align vertically */}
          {node.hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleFolderExpanded(node.key)
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded transition hover:bg-[var(--bg-elevated)]"
              style={{ color: 'var(--text-muted)' }}
              aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            >
              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}

          <button
            type="button"
            onClick={() => {
              if (folder) {
                void selectAccountMailbox(acc.id, 'inbox', folder.name)
              } else if (node.hasChildren) {
                toggleFolderExpanded(node.key)
              }
            }}
            className="flex min-w-0 flex-1 items-center justify-between gap-1.5 py-1 pl-1 text-left text-[12px]"
            style={{
              color: isItemActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: isItemActive || node.unreadCount > 0 ? 600 : 400
            }}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="flex shrink-0 items-center"
                style={{
                  color: folder?.color || (isItemActive ? acc.color : 'var(--text-muted)')
                }}
              >
                {renderFolderIcon(folder?.icon, isGmail, folder?.color, 13)}
              </span>
              <span className="truncate">{node.name}</span>
            </span>

            {showDirectUnread && (
              <span
                className="shrink-0 text-[11px] font-bold tabular-nums"
                style={{ color: 'var(--text-primary)' }}
                title={`${node.unreadCount} unread`}
              >
                {node.unreadCount}
              </span>
            )}

            {showCollapsedRollup && (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium tabular-nums"
                style={{ color: node.unreadCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}
                title={`${node.rolledUpUnread} unread in folder & subfolders`}
              >
                {node.unreadCount === 0 && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
                )}
                {node.rolledUpUnread}
              </span>
            )}
          </button>
        </div>

        {node.hasChildren && isExpanded && (
          <div
            className="relative"
            style={
              canIndentChildren
                ? {
                    marginLeft: '9px',
                    paddingLeft: '3px',
                    borderLeft: '1px solid var(--border-subtle)'
                  }
                : undefined
            }
          >
            {node.children.map((child) =>
              renderCustomFolderNode(child, acc, isSoloed, mutedOpacity, node.children, folder?.id ?? null)
            )}
          </div>
        )}
      </div>
    )
  }

  const computeReminderDueAt = (preset: '10m' | '30m' | '1h' | 'tomorrow' | 'nextweek'): number => {
    const now = new Date()
    if (preset === '10m') return Date.now() + 10 * 60_000
    if (preset === '30m') return Date.now() + 30 * 60_000
    if (preset === '1h') return Date.now() + 60 * 60_000
    if (preset === 'tomorrow') return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0).getTime()
    const daysToMon = (1 - now.getDay() + 7) % 7 || 7
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMon, 9, 0, 0).getTime()
  }

  const formatReminderDue = (dueAt: number): { text: string; overdue: boolean } => {
    const diffMs = dueAt - Date.now()
    if (diffMs <= 0) return { text: 'Due now', overdue: true }
    const mins = Math.round(diffMs / 60_000)
    if (mins < 60) return { text: `in ${mins}m`, overdue: false }
    const hours = Math.round(mins / 60)
    if (hours < 24) return { text: `in ${hours}h`, overdue: false }
    const d = new Date(dueAt)
    return { text: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), overdue: false }
  }

  const activeAutopilotCount = autopilotRules.filter((r) => r.enabled).length

  return (
    <aside
      ref={zoomRef}
      className="relative flex h-full shrink-0 flex-col border-r"
      style={{ width, background: 'var(--bg-sidebar)', borderColor: 'var(--border-subtle)' }}
    >
      {zoomBadge}
      {/* Top Drag + Compose Row */}
      <div className="app-drag flex h-10 items-center justify-between px-3 pt-1">
        <div className="app-no-drag relative">
          <button
            onClick={() => setShowWorkspacesMenu((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] font-semibold transition hover:bg-[var(--bg-hover)]"
            title="Switch workspace or show all accounts"
          >
            <img
              src={appIcon}
              alt="EveryBox"
              className="h-7 w-7 shrink-0 object-contain"
            />
            {activeWs && activeWs.id !== 'ws-all' && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: activeWs.color }}
              />
            )}
            <span className="max-w-[110px] truncate">{headerLabel}</span>
            <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
          </button>

          {showWorkspacesMenu && (
            <div
              className="absolute left-0 top-9 z-40 w-60 rounded-xl border p-1.5 shadow-2xl"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <div className="px-2 py-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Workspaces (Account Groups)
              </div>
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                >
                  <button
                    onClick={() => {
                      void selectWorkspace(ws)
                      setShowWorkspacesMenu(false)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ws.color }} />
                    <span className="truncate">{ws.name}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {ws.shortcutIndex && (
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {modKeyPrefix}{ws.shortcutIndex}
                      </span>
                    )}
                    {ws.id !== 'ws-all' && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          await window.glassmail.deleteWorkspace(ws.id)
                          await refreshAll()
                          showToast(`Deleted workspace "${ws.name}"`)
                        }}
                        className="hidden rounded p-0.5 hover:bg-[var(--bg-selected)] group-hover:flex"
                        style={{ color: 'var(--danger)' }}
                        title={`Delete ${ws.name}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="mt-1 border-t pt-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                {!addingWorkspace ? (
                  <button
                    type="button"
                    disabled={activeAccountIds.length === 0}
                    onClick={() => setAddingWorkspace(true)}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ color: 'var(--accent-text)' }}
                    title={
                      activeAccountIds.length === 0
                        ? 'Select 1 or more accounts (Ctrl+Click) first to save them as a Workspace'
                        : 'Save currently selected accounts as a Workspace'
                    }
                  >
                    <Plus size={12} />
                    <span>
                      {activeAccountIds.length > 0
                        ? `Save ${activeAccountIds.length} selected as Workspace…`
                        : 'Select accounts first to save group'}
                    </span>
                  </button>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const name = newWorkspaceName.trim()
                      if (!name || activeAccountIds.length === 0) return
                      const usedShortcuts = new Set(workspaces.map((w) => w.shortcutIndex).filter(Boolean))
                      let nextShortcut: number | undefined
                      for (let i = 2; i <= 9; i++) {
                        if (!usedShortcuts.has(i)) {
                          nextShortcut = i
                          break
                        }
                      }
                      const color = COLOR_SWATCHES[workspaces.length % COLOR_SWATCHES.length]
                      await window.glassmail.saveWorkspace({
                        id: `ws-${Date.now()}`,
                        name,
                        accountIds: [...activeAccountIds],
                        color,
                        shortcutIndex: nextShortcut
                      })
                      setNewWorkspaceName('')
                      setAddingWorkspace(false)
                      setShowWorkspacesMenu(false)
                      await refreshAll()
                      showToast(`Saved workspace "${name}"`)
                    }}
                    className="space-y-1.5 px-1 py-0.5"
                  >
                    <input
                      autoFocus
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="Workspace name (e.g. Work)"
                      className="w-full rounded-md border bg-transparent px-2 py-1 text-[12px] outline-none"
                      style={{ borderColor: 'var(--border-strong)' }}
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingWorkspace(false)
                          setNewWorkspaceName('')
                        }}
                        className="rounded px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded px-2.5 py-0.5 text-[11px] font-semibold text-white"
                        style={{ background: 'var(--accent)' }}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prominent Primary New Message CTA */}
      <div className="shrink-0 px-3 pb-1.5 pt-2.5">
        <button
          type="button"
          onClick={() => openComposer({ mode: 'new' })}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
          style={{ background: 'var(--accent)' }}
          title="Compose a new email (C)"
        >
          <span className="flex items-center gap-2">
            <PenSquare size={15} />
            <span>New message</span>
          </span>
          <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/90">
            C
          </kbd>
        </button>
      </div>

      {/* Scrollable Nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1.5" style={{ zoom }}>
        {/* Primary Views: Email, Calendar, Autopilot + Distinct Side-Panel Assistant Toggle */}
        <div className="space-y-0.5">
          <button
            onClick={() => {
              if (activeView === 'mail' && (activeMailbox !== 'inbox' || Boolean(activeFolderName))) {
                void setActiveMailbox('inbox')
              } else {
                setActiveView('mail')
              }
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{
              background: activeView === 'mail' ? 'var(--bg-selected)' : 'transparent',
              color: activeView === 'mail' ? 'var(--accent-text)' : 'var(--text-primary)'
            }}
          >
            <Mail size={15} style={{ color: activeView === 'mail' ? 'var(--accent)' : 'var(--text-secondary)' }} />
            <span>Email</span>
          </button>

          <button
            onClick={() => setActiveView('calendar')}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{
              background: activeView === 'calendar' ? 'var(--bg-selected)' : 'transparent',
              color: activeView === 'calendar' ? 'var(--accent-text)' : 'var(--text-primary)'
            }}
          >
            <Calendar size={15} style={{ color: activeView === 'calendar' ? 'var(--accent)' : 'var(--text-secondary)' }} />
            <span>Calendar</span>
          </button>

          <button
            onClick={() => setActiveView('autopilot')}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{
              background: activeView === 'autopilot' ? 'var(--bg-selected)' : 'transparent',
              color: activeView === 'autopilot' ? 'var(--accent-text)' : 'var(--text-primary)'
            }}
            title={
              habitSuggestions.length > 0
                ? `Autopilot · ${habitSuggestions.length} learned suggestion${habitSuggestions.length === 1 ? '' : 's'}`
                : activeAutopilotCount > 0
                  ? `Autopilot · ${activeAutopilotCount} active rule${activeAutopilotCount === 1 ? '' : 's'}`
                  : 'AI Rules, Pre-Drafts, and Voice Profiles'
            }
          >
            <span className="flex items-center gap-2.5">
              <Zap size={15} fill="#f5b841" style={{ color: '#e5a424' }} />
              <span>Autopilot</span>
            </span>
            {habitSuggestions.length > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                {habitSuggestions.length}
              </span>
            )}
          </button>

          {/* Side-Panel Toggle (visually distinct from full-view tabs) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleAssistant()}
              aria-pressed={assistantOpen}
              className="flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{
                borderColor: assistantOpen ? 'var(--accent)' : 'var(--border-subtle)',
                background: assistantOpen ? 'var(--accent-soft)' : 'transparent',
                color: assistantOpen ? 'var(--accent-text)' : 'var(--text-secondary)'
              }}
              title={assistantOpen ? 'Close AI Assistant side panel' : 'Open AI Assistant side panel'}
            >
              <span className="flex items-center gap-2">
                <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                <span>AI Assistant</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium" style={{ color: assistantOpen ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                <PanelRight size={11} />
                {assistantOpen ? 'Open' : 'Panel'}
              </span>
            </button>
          </div>
        </div>

        {/* Mailboxes */}
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between px-2.5">
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Mailboxes
            </span>
            <span className="inline-flex items-baseline gap-1.5 text-[9.5px]">
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                Unread
              </span>
              <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
                Total
              </span>
            </span>
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
                  onContextMenu={(e) =>
                    openFolderMenu(e, {
                      mailbox: mb.id,
                      label: mb.label,
                      accountIds: activeAccountIds.length > 0 ? activeAccountIds : undefined
                    })
                  }
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
                  {renderCounts(mb.total, mb.unread)}
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
                    {renderCounts(mb.total, mb.unread)}
                  </button>
                )
              })}
          </div>
        </div>

        {/* Pinned / Favorites Section (only rendered when at least one visible folder is pinned) */}
        {pinnedFolders.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-1.5 px-2.5">
              <Pin size={11} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Favorites
              </span>
            </div>
            <div className="space-y-0.5">
              {pinnedFolders.map((folder) => {
                const acc = accountById.get(folder.accountId)
                if (!acc) return null
                const isCustom = folder.role === 'custom'
                const isGmail = acc.provider === 'gmail'
                const leafLabel = isCustom ? getLeafFolderName(folder) : folder.name
                const isSoloed = activeAccountIds.length === 1 && activeAccountIds[0] === acc.id
                const isFavActive =
                  isSoloed &&
                  activeView === 'mail' &&
                  (isCustom
                    ? activeFolderName === folder.name || activeFolderName === folder.path
                    : !activeFolderName && activeMailbox === folder.role)
                const unread = folder.muteBadge
                  ? 0
                  : folder.role === 'inbox'
                    ? acc.unreadCount || folder.unreadCount || 0
                    : folder.unreadCount || 0
                const canDropFav =
                  isCustom ||
                  folder.role === 'inbox' ||
                  folder.role === 'archive' ||
                  folder.role === 'trash' ||
                  folder.role === 'junk'
                const favDropKey = `fav:${folder.id}`
                const isFavDropOver = threadDropTargetKey === favDropKey

                return (
                  <button
                    key={`fav-${folder.id}`}
                    type="button"
                    onClick={() =>
                      void selectAccountMailbox(
                        acc.id,
                        isCustom ? 'inbox' : (folder.role as MailboxId),
                        isCustom ? folder.name : null
                      )
                    }
                    onDragOver={(e) => {
                      if (!canDropFav || !isThreadDragEvent(e)) return
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = 'move'
                      if (threadDropTargetKey !== favDropKey) setThreadDropTargetKey(favDropKey)
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                      if (threadDropTargetKey === favDropKey) setThreadDropTargetKey(null)
                    }}
                    onDrop={(e) => {
                      if (!canDropFav || !isThreadDragEvent(e)) return
                      handleThreadDropOnFolder(e, {
                        accountId: acc.id,
                        role: folder.role,
                        folderName: isCustom ? folder.path || folder.name : folder.name,
                        folderId: folder.id
                      })
                    }}
                    onContextMenu={(e) =>
                      openFolderMenu(e, {
                        mailbox: isCustom ? 'inbox' : (folder.role as MailboxId),
                        label: `${acc.name} · ${leafLabel}`,
                        accountIds: [acc.id],
                        folderName: isCustom ? folder.name : undefined,
                        account: acc,
                        folder
                      })
                    }
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                    style={{
                      background: isFavDropOver
                        ? 'var(--accent-soft)'
                        : isFavActive
                          ? 'var(--bg-selected)'
                          : undefined,
                      boxShadow: isFavDropOver ? 'inset 0 0 0 1px var(--accent)' : undefined,
                      color: isFavActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isFavActive || unread > 0 ? 600 : 400
                    }}
                    title={`${acc.name} · ${folder.path || folder.name}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex shrink-0 items-center"
                        style={{
                          color: isCustom
                            ? folder.color || (isFavActive ? acc.color : 'var(--text-muted)')
                            : isFavActive
                              ? acc.color
                              : 'var(--text-muted)'
                        }}
                      >
                        {isCustom
                          ? renderFolderIcon(folder.icon, isGmail, folder.color, 13)
                          : renderSystemRoleIcon(folder.role, 13)}
                      </span>
                      <span className="truncate">{leafLabel}</span>
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: acc.color }}
                        title={acc.name}
                      />
                    </span>
                    {unread > 0 && (
                      <span
                        className="shrink-0 text-[11px] font-bold tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                        title={`${unread} unread`}
                      >
                        {unread}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Accounts & Focus Toggles */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <span className="text-[12.5px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Accounts
            </span>
            <button
              onClick={() => openSettings('accounts')}
              className="rounded p-1 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="Add Gmail or IMAP account"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-0.5">
            {/* Full-width clickable All Accounts row */}
            <button
              onClick={() => void selectAllAccounts()}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition hover:bg-[var(--bg-hover)]"
              style={{
                background: allSelected ? 'var(--bg-selected)' : undefined,
                color: allSelected ? 'var(--accent-text)' : 'var(--text-secondary)'
              }}
              title="Show all connected accounts in Mail & Calendar"
            >
              <span className="flex items-center gap-2">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={{
                    borderColor: allSelected ? 'var(--accent)' : 'var(--border-strong)',
                    background: allSelected ? 'var(--accent)' : 'transparent'
                  }}
                >
                  {allSelected ? (
                    <Check size={10} className="text-white" strokeWidth={3} />
                  ) : (
                    <Layers size={10} style={{ color: 'var(--text-muted)' }} />
                  )}
                </span>
                <span>All Accounts</span>
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {accounts.length}
              </span>
            </button>

            {accounts.map((acc) => {
              const isChecked = allSelected || activeAccountIds.includes(acc.id)
              const isSoloed = activeAccountIds.length === 1 && activeAccountIds[0] === acc.id
              const isExpanded = Boolean(expandedAccountIds[acc.id])
              const isDragging = draggedAccountId === acc.id
              const isDragOver = dragOverAccountId === acc.id && draggedAccountId !== acc.id
              const systemFolders = isExpanded ? getAccountSystemFolders(acc) : []
              const accCustomFolders = isExpanded
                ? folders.filter((f) => f.accountId === acc.id && f.role === 'custom')
                : []
              const visibleCustomTree = isExpanded
                ? buildFolderTree(accCustomFolders.filter((f) => !f.isHidden))
                : []
              const hiddenCustomFolders = isExpanded ? accCustomFolders.filter((f) => f.isHidden) : []
              const hiddenCustomTree =
                isExpanded && showHiddenFoldersByAccount[acc.id] && hiddenCustomFolders.length > 0
                  ? buildFolderTree(hiddenCustomFolders)
                  : []
              const hasAnyCustom = visibleCustomTree.length > 0 || hiddenCustomFolders.length > 0
              const rowStyle = settings?.accountRowStyle || 'gradient'
              const hasWash = isChecked && rowStyle === 'gradient'
              const hasBar = isChecked && (rowStyle === 'gradient' || rowStyle === 'bar')
              const isFocused = !allSelected && isChecked
              const accBg = isFocused
                ? hasWash
                  ? `linear-gradient(90deg, color-mix(in srgb, ${acc.color} 18%, var(--bg-selected)) 0%, var(--bg-selected) 68%)`
                  : 'var(--bg-selected)'
                : hasWash
                  ? `linear-gradient(90deg, color-mix(in srgb, ${acc.color} 13%, transparent) 0%, color-mix(in srgb, ${acc.color} 4%, transparent) 45%, transparent 82%)`
                  : undefined
              return (
                <div key={acc.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggedAccountId(acc.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', acc.id)
                    }}
                    onDragOver={(e) => {
                      if (isThreadDragEvent(e)) {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        const accDropKey = `acc:${acc.id}`
                        if (!isExpanded) {
                          scheduleSpringLoad(accDropKey, () => setAccountExpanded(acc.id, true))
                        }
                        if (threadDropTargetKey !== accDropKey) setThreadDropTargetKey(accDropKey)
                        return
                      }
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverAccountId !== acc.id) setDragOverAccountId(acc.id)
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        const accDropKey = `acc:${acc.id}`
                        if (springLoadTargetRef.current === accDropKey) clearSpringLoad()
                        if (threadDropTargetKey === accDropKey) setThreadDropTargetKey(null)
                      }
                      if (dragOverAccountId === acc.id) setDragOverAccountId(null)
                    }}
                    onDrop={(e) => {
                      if (isThreadDragEvent(e)) {
                        e.preventDefault()
                        clearSpringLoad()
                        setThreadDropTargetKey(null)
                        return
                      }
                      e.preventDefault()
                      void handleDropAccount(acc.id)
                    }}
                    onDragEnd={() => {
                      setDraggedAccountId(null)
                      setDragOverAccountId(null)
                    }}
                    onContextMenu={(e) => openAccountMenu(e, acc)}
                    className="group relative flex items-center justify-between overflow-hidden rounded-lg py-1.5 pl-2 pr-1.5 text-[12.5px] transition hover:brightness-105"
                    style={{
                      background: threadDropTargetKey === `acc:${acc.id}` ? 'var(--accent-soft)' : accBg,
                      opacity: isDragging ? 0.35 : 1,
                      boxShadow:
                        threadDropTargetKey === `acc:${acc.id}`
                          ? 'inset 0 0 0 1px var(--accent)'
                          : isDragOver
                            ? 'inset 0 2px 0 0 var(--accent)'
                            : undefined
                    }}
                  >
                    {hasBar && (
                      <span
                        className="pointer-events-none absolute bottom-1 left-0.5 top-1 w-[3px] rounded-full"
                        style={{ background: acc.color, opacity: isFocused ? 1 : 0.85 }}
                      />
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleAccountExpanded(acc.id)
                        }}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded transition hover:bg-[var(--bg-elevated)]"
                        style={{ color: 'var(--text-muted)' }}
                        title={isExpanded ? `Hide ${acc.name} folders` : `Show ${acc.name} folders (Inbox, Sent, Junk, Trash…)`}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </button>
                      {/* Multi-select focus toggle checkbox (shows account symbol when set) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggleAccountFilter(acc.id)
                        }}
                        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition"
                        style={{
                          borderColor: isChecked ? acc.color : 'var(--border-strong)',
                          background: isChecked ? acc.color : 'transparent'
                        }}
                        title={isChecked ? `Hide ${acc.name} from mail & calendar` : `Include ${acc.name}`}
                      >
                        {isChecked ? (
                          acc.icon && acc.icon !== 'none' ? (
                            <AccountIcon icon={acc.icon} size={11} color="#ffffff" />
                          ) : (
                            <Check size={10} className="text-white" strokeWidth={3} />
                          )
                        ) : acc.icon && acc.icon !== 'none' ? (
                          <AccountIcon icon={acc.icon} size={10} color={acc.color} />
                        ) : null}
                      </button>

                      {/* Click name to solo; Ctrl+click to add/remove from multi-account view */}
                      <button
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) {
                            void toggleAccountFilter(acc.id)
                          } else {
                            void soloAccount(acc.id)
                          }
                        }}
                        className="flex min-w-0 flex-1 flex-col pl-0.5 text-left"
                        title={`Click to focus ${acc.name} · Ctrl+click to add/remove from view · Right-click for options`}
                      >
                        <span
                          className="truncate font-medium"
                          style={{ color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                        >
                          {acc.name}
                        </span>
                        <span className="truncate text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                          {acc.email}
                          {acc.isDemo ? ' · Demo' : ''}
                        </span>
                      </button>
                    </div>

                    <div className="ml-1 flex shrink-0 items-center gap-0.5">
                      <span
                        className="cursor-grab opacity-0 transition group-hover:opacity-60 active:cursor-grabbing"
                        style={{ color: 'var(--text-muted)' }}
                        title="Drag to reorder account"
                      >
                        <GripVertical size={11} />
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditAccount(acc)
                        }}
                        className="hidden rounded p-1 transition hover:bg-[var(--bg-elevated)] group-hover:flex"
                        style={{ color: 'var(--text-muted)' }}
                        title="Rename or change account color"
                      >
                        <Pencil size={11} />
                      </button>
                      {renderCounts(acc.totalCount, acc.unreadCount)}
                    </div>
                  </div>

                  {/* Per-account folder tree: System folders first, 1px divider, nested custom folders, hidden toggle */}
                  {isExpanded && (
                    <div
                      className="ml-4 mt-0.5 space-y-0.5 border-l pl-2"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {systemFolders.map((item) => {
                        const isItemActive =
                          isSoloed &&
                          activeView === 'mail' &&
                          !activeFolderName &&
                          activeMailbox === item.mailbox
                        const isDroppableSys =
                          item.mailbox === 'inbox' ||
                          item.mailbox === 'archive' ||
                          item.mailbox === 'trash' ||
                          item.mailbox === 'junk'
                        const sysDropKey = `sys:${item.key}`
                        const isSysDropOver = threadDropTargetKey === sysDropKey
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => void selectAccountMailbox(acc.id, item.mailbox, null)}
                            onDragOver={(e) => {
                              if (!isDroppableSys || !isThreadDragEvent(e)) return
                              e.preventDefault()
                              e.stopPropagation()
                              e.dataTransfer.dropEffect = 'move'
                              if (threadDropTargetKey !== sysDropKey) setThreadDropTargetKey(sysDropKey)
                            }}
                            onDragLeave={(e) => {
                              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                              if (threadDropTargetKey === sysDropKey) setThreadDropTargetKey(null)
                            }}
                            onDrop={(e) => {
                              if (!isDroppableSys || !isThreadDragEvent(e)) return
                              handleThreadDropOnFolder(e, {
                                accountId: acc.id,
                                role: item.mailbox as Folder['role'],
                                folderName: item.label,
                                folderId: item.folder?.id
                              })
                            }}
                            onContextMenu={(e) =>
                              openFolderMenu(e, {
                                mailbox: item.mailbox,
                                label: `${acc.name} · ${item.label}`,
                                accountIds: [acc.id],
                                account: acc,
                                folder: item.folder
                              })
                            }
                            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[12px] transition hover:bg-[var(--bg-hover)]"
                            style={{
                              background: isSysDropOver
                                ? 'var(--accent-soft)'
                                : isItemActive
                                  ? 'var(--bg-selected)'
                                  : undefined,
                              boxShadow: isSysDropOver ? 'inset 0 0 0 1px var(--accent)' : undefined,
                              color: isItemActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontWeight: isItemActive || item.unreadCount > 0 ? 600 : 400
                            }}
                          >
                            <span className="flex min-w-0 items-center gap-2 truncate">
                              <span style={{ color: isItemActive ? acc.color : 'var(--text-muted)' }}>
                                {item.icon}
                              </span>
                              <span className="truncate">{item.label}</span>
                            </span>
                            {item.unreadCount > 0 && (
                              <span
                                className="ml-1.5 shrink-0 text-[11px] font-bold tabular-nums"
                                style={{ color: 'var(--text-primary)' }}
                                title={`${item.unreadCount} unread`}
                              >
                                {item.unreadCount}
                              </span>
                            )}
                          </button>
                        )
                      })}

                      {hasAnyCustom && (
                        draggedFolder &&
                        draggedFolder.accountId === acc.id &&
                        Boolean(draggedFolder.parentPath) &&
                        draggedFolder.parentPath?.toLowerCase() !== 'inbox' ? (
                          <div
                            onDragOver={(e) => {
                              if (!isFolderDragEvent(e) || !draggedFolder || draggedFolder.accountId !== acc.id) return
                              e.preventDefault()
                              e.stopPropagation()
                              e.dataTransfer.dropEffect = 'move'
                              if (folderRootDropAccountId !== acc.id) setFolderRootDropAccountId(acc.id)
                            }}
                            onDragLeave={(e) => {
                              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                              if (folderRootDropAccountId === acc.id) setFolderRootDropAccountId(null)
                            }}
                            onDrop={(e) => {
                              if (!isFolderDragEvent(e) || !draggedFolder || draggedFolder.accountId !== acc.id) return
                              e.preventDefault()
                              e.stopPropagation()
                              const source = draggedFolder
                              clearSpringLoad()
                              setDraggedFolder(null)
                              setFolderDropTarget(null)
                              setFolderRootDropAccountId(null)
                              void moveFolder({ folderId: source.id, targetParentFolderId: null })
                            }}
                            className="my-1 rounded-md border border-dashed px-2 py-1 text-center text-[10.5px] font-medium transition"
                            style={{
                              borderColor:
                                folderRootDropAccountId === acc.id ? 'var(--accent)' : 'var(--border-strong)',
                              background:
                                folderRootDropAccountId === acc.id ? 'var(--accent-soft)' : 'transparent',
                              color:
                                folderRootDropAccountId === acc.id ? 'var(--accent-text)' : 'var(--text-muted)'
                            }}
                          >
                            Drop here to move to top level
                          </div>
                        ) : (
                          <div className="my-1.5 h-px" style={{ background: 'var(--border-subtle)' }} />
                        )
                      )}

                      {visibleCustomTree.map((node) =>
                        renderCustomFolderNode(node, acc, isSoloed, false, visibleCustomTree, null)
                      )}

                      {hiddenCustomFolders.length > 0 && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleShowHiddenFolders(acc.id)}
                            className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition hover:bg-[var(--bg-hover)]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {showHiddenFoldersByAccount[acc.id] ? (
                              <ChevronDown size={11} />
                            ) : (
                              <ChevronRight size={11} />
                            )}
                            <span>Hidden folders ({hiddenCustomFolders.length})</span>
                          </button>
                          {showHiddenFoldersByAccount[acc.id] && (
                            <div className="mt-0.5 space-y-0.5">
                              {hiddenCustomTree.map((node) => renderCustomFolderNode(node, acc, isSoloed, true))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Reminders (replaces redundant bottom Folders list) */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              <Bell size={12.5} style={{ color: 'var(--accent)' }} />
              <span>Reminders</span>
              {reminders.length > 0 && (
                <span className="text-[11px] font-normal tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {reminders.length}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setAddingReminder((v) => !v)}
              className="rounded p-1 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="Add a reminder"
            >
              <Plus size={14} />
            </button>
          </div>

          {addingReminder && (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newReminderTitle.trim()) return
                await createReminder({
                  title: newReminderTitle.trim(),
                  accountId: activeAccountIds.length === 1 ? activeAccountIds[0] : undefined,
                  dueAt: computeReminderDueAt(newReminderPreset)
                })
                setNewReminderTitle('')
                setAddingReminder(false)
              }}
              className="mx-1 mb-2 space-y-2 rounded-xl border p-2"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
            >
              <input
                autoFocus
                value={newReminderTitle}
                onChange={(e) => setNewReminderTitle(e.target.value)}
                placeholder="Remind me to…"
                className="w-full rounded-md border bg-transparent px-2 py-1 text-[12px] outline-none"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: '10m', label: '10m' },
                    { id: '30m', label: '30m' },
                    { id: '1h', label: '1h' },
                    { id: 'tomorrow', label: 'Tomorrow' },
                    { id: 'nextweek', label: 'Next wk' }
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setNewReminderPreset(p.id)}
                    className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition"
                    style={{
                      background: newReminderPreset === p.id ? 'var(--accent)' : 'var(--bg-hover)',
                      color: newReminderPreset === p.id ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAddingReminder(false)
                    setNewReminderTitle('')
                  }}
                  className="rounded px-2 py-0.5 text-[11px] hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded px-2.5 py-0.5 text-[11px] font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  Save
                </button>
              </div>
            </form>
          )}

          {reminders.length === 0 ? (
            !addingReminder && (
              <div className="px-2.5 py-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                No active reminders
              </div>
            )
          ) : (
            <div className="space-y-0.5">
              {reminders.slice(0, 6).map((r) => {
                const due = formatReminderDue(r.dueAt)
                const isBlinking = Boolean(blinkingReminderIds[r.id])
                return (
                  <div
                    key={r.id}
                    className={`group flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] transition hover:bg-[var(--bg-hover)] ${
                      isBlinking ? 'animate-pulse ring-2 ring-[var(--accent)]' : ''
                    }`}
                    style={{
                      background: isBlinking ? 'var(--accent-soft)' : undefined
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void completeReminder(r.id)}
                      className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      style={{ borderColor: due.overdue ? 'var(--danger)' : 'var(--border-strong)' }}
                      title="Mark reminder done"
                    >
                      <Check size={9} className="opacity-0 transition-opacity group-hover:opacity-70" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (r.threadId) {
                          setActiveView('mail')
                          void selectThread(r.threadId)
                        }
                      }}
                      className="min-w-0 flex-1 text-left"
                      title={r.note || r.threadSubject || r.title}
                    >
                      <div className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                        {r.title}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10.5px]">
                        <span style={{ color: due.overdue ? 'var(--danger)' : 'var(--accent-text)', fontWeight: due.overdue ? 600 : 400 }}>
                          {due.text}
                        </span>
                        {r.onlyIfNoReply && (
                          <span style={{ color: 'var(--text-muted)' }}>· if no reply</span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteReminder(r.id)}
                      className="hidden shrink-0 rounded p-0.5 hover:bg-[var(--bg-selected)] group-hover:flex"
                      style={{ color: 'var(--text-muted)' }}
                      title="Dismiss reminder"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
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

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShortcutHelpOpen(true)}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <HelpCircle size={15} />
          </button>
          <button
            onClick={() => openSettings('accounts')}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title={`Settings (${modKeyPrefix},)`}
            aria-label="Open Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
      {/* Edit Account Modal (Rename & Color) */}
      {editingAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => setEditingAccount(null)}
        >
          <form
            onSubmit={(e) => void handleSaveAccount(e)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-2xl border p-5 shadow-2xl"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold">Edit Account</h3>
                <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {editingAccount.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="rounded p-1 hover:bg-[var(--bg-hover)]"
              >
                <X size={15} />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Display Name
              </label>
              <input
                autoFocus
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Work, Personal, Client Inbox"
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-[13px] outline-none"
                style={{ borderColor: 'var(--border-strong)' }}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Account Color
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition hover:scale-105"
                    style={{
                      background: c,
                      borderColor: editColor.toLowerCase() === c.toLowerCase() ? '#ffffff' : 'transparent'
                    }}
                    title={c}
                  >
                    {editColor.toLowerCase() === c.toLowerCase() && (
                      <Check size={13} className="text-white" strokeWidth={3} />
                    )}
                  </button>
                ))}
                <label
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-[11px]"
                  style={{ borderColor: 'var(--border-strong)', color: 'var(--text-secondary)' }}
                  title="Pick a custom color"
                >
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                  />
                  Custom
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                Account Symbol
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {ACCOUNT_ICON_OPTIONS.map((opt) => {
                  const active = editIcon === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEditIcon(opt.id)}
                      className="flex h-8 w-full items-center justify-center rounded-lg border transition hover:scale-105"
                      style={{
                        borderColor: active ? editColor : 'var(--border-subtle)',
                        background: active ? editColor : 'var(--bg-main)',
                        color: active ? '#ffffff' : 'var(--text-secondary)'
                      }}
                      title={opt.label}
                    >
                      {opt.id === 'none' ? (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: active ? '#ffffff' : editColor }}
                        />
                      ) : (
                        <AccountIcon icon={opt.id} size={14} color={active ? '#ffffff' : undefined} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {editingAccount.provider === 'outlook-local' && (
              <div>
                <label className="mb-1.5 block text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Outlook Focused Inbox Filter
                </label>
                <div className="space-y-1.5">
                  {(
                    [
                      {
                        id: 'focused-only',
                        label: 'Focused only (hide "Other")',
                        desc: 'Only show Focused emails in EveryBox — keeps "Other" safely in Exchange'
                      },
                      {
                        id: 'other-to-updates',
                        label: 'Send "Other" to Updates tab',
                        desc: 'Keep Focused in People and route Other into Updates'
                      },
                      {
                        id: 'all',
                        label: 'Show all (Focused + Other)',
                        desc: 'Sync every Inbox message normally'
                      }
                    ] as { id: OutlookFocusedMode; label: string; desc: string }[]
                  ).map((opt) => {
                    const active = editFocusedMode === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEditFocusedMode(opt.id)}
                        className="flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left transition"
                        style={{
                          borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                          background: active ? 'var(--accent-soft)' : 'var(--bg-main)'
                        }}
                      >
                        <div>
                          <div className="text-[12px] font-semibold">{opt.label}</div>
                          <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                            {opt.desc}
                          </div>
                        </div>
                        {active && <Check size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="rounded-lg border px-3.5 py-1.5 text-[12.5px] hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAccount}
                className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {savingAccount ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
      {createFolderModal && (
        <CreateFolderModal
          account={createFolderModal.account}
          parentFolder={createFolderModal.parentFolder}
          onClose={() => setCreateFolderModal(null)}
        />
      )}
      {renameFolderModal && (
        <RenameFolderModal
          account={renameFolderModal.account}
          folder={renameFolderModal.folder}
          onClose={() => setRenameFolderModal(null)}
        />
      )}
      {deleteFolderModal && (
        <DeleteFolderModal
          account={deleteFolderModal.account}
          folder={deleteFolderModal.folder}
          onClose={() => setDeleteFolderModal(null)}
        />
      )}
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </aside>
  )
}
