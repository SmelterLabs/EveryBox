import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  FolderInput,
  FolderPlus,
  Inbox,
  Loader2,
  Pin,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getLeafFolderName, renderFolderIcon } from '../utils/folderTree'
import type { Folder, ThreadAIBundle, ThreadSummary } from '../../../shared/types'

interface MoveTargetItem {
  key: string
  section: 'suggested' | 'pinned_recent' | 'all' | 'results' | 'create'
  label: string
  pathDisplay?: string
  reason?: string
  role: Folder['role']
  folderName: string
  folderId?: string
  icon: React.ReactNode
  isCreate?: boolean
  createQuery?: string
}

const BUNDLE_KEYWORDS: Record<ThreadAIBundle, string[]> = {
  finance: ['finance', 'receipt', 'invoice', 'billing', 'bill', 'tax', 'bank', 'statement', 'payment'],
  shipping: ['shipping', 'order', 'deliver', 'package', 'track', 'purchase'],
  newsletter: ['newsletter', 'reading', 'digest', 'news', 'articles', 'subscriptions'],
  promo: ['promo', 'deals', 'shopping', 'marketing', 'offers'],
  security: ['security', '2fa', 'auth', 'alert', 'verify'],
  action: ['action', 'todo', 'tasks', 'follow', 'respond'],
  waiting: ['waiting', 'pending', 'follow'],
  fyi: ['fyi', 'reference', 'info', 'notes'],
  cold_outreach: ['outreach', 'sales', 'leads', 'prospects']
}

function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 1
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - (t.length - q.length)
  const subIdx = t.indexOf(q)
  if (subIdx !== -1) return 600 - subIdx * 2 - (t.length - q.length) * 0.2

  // Ordered subsequence match
  let qi = 0
  let score = 0
  let consecutive = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      consecutive++
      score += 10 + consecutive * 6
      if (ti === 0 || t[ti - 1] === '/' || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score += 12
      }
    } else {
      consecutive = 0
    }
  }
  return qi === q.length ? score : 0
}

function resolveThreadSenderEmail(thread: ThreadSummary | null): string {
  if (!thread) return ''
  const selfEmail = (thread.accountEmail || '').toLowerCase()
  const latestEmail = (thread.latestFrom?.email || '').toLowerCase()
  if (latestEmail && latestEmail !== selfEmail) return latestEmail
  if (thread.latestExternalFrom?.email) return thread.latestExternalFrom.email.toLowerCase()
  const ext = thread.participants.find((p) => p.email && p.email.toLowerCase() !== selfEmail)
  return (ext?.email || latestEmail || '').toLowerCase()
}

export const MoveToFolderModal: React.FC = () => {
  const {
    moveToPopover,
    closeMoveToPopover,
    accounts,
    activeAccountIds,
    folders,
    threads,
    selectedThread,
    senderProfiles,
    threadAiMeta,
    recentMovedFolderIds,
    createFolder,
    moveThreadsToFolder,
    setAccountExpanded,
    setFolderExpanded
  } = useAppStore()

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const isOpen = Boolean(moveToPopover?.open && moveToPopover.threadIds.length > 0)
  const threadIds = moveToPopover?.threadIds || []

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIndex(0)
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen, moveToPopover?.threadIds.join(',')])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Resolve primary thread and target account
  const primaryThread: ThreadSummary | null = useMemo(() => {
    if (!threadIds.length) return null
    const firstId = threadIds[0]
    const fromList = threads.find((t) => t.id === firstId)
    if (fromList) return fromList
    if (selectedThread && selectedThread.id === firstId) return selectedThread
    return null
  }, [threadIds, threads, selectedThread])

  const targetAccountId =
    moveToPopover?.accountId ||
    primaryThread?.accountId ||
    (activeAccountIds.length === 1 ? activeAccountIds[0] : accounts[0]?.id) ||
    ''

  const targetAccount = useMemo(
    () => accounts.find((a) => a.id === targetAccountId) || null,
    [accounts, targetAccountId]
  )
  const isGmail = targetAccount?.provider === 'gmail'

  const accountFolders = useMemo(
    () => folders.filter((f) => f.accountId === targetAccountId),
    [folders, targetAccountId]
  )

  const visibleCustomFolders = useMemo(
    () =>
      accountFolders
        .filter((f) => f.role === 'custom' && !f.isHidden)
        .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name, undefined, { sensitivity: 'base' })),
    [accountFolders]
  )

  const systemFolderItems = useMemo(() => {
    const findRole = (role: Folder['role']) => accountFolders.find((f) => f.role === role)
    const defs: { role: Folder['role']; defaultLabel: string; icon: React.ReactNode }[] = [
      { role: 'inbox', defaultLabel: 'Inbox', icon: <Inbox size={14} /> },
      { role: 'archive', defaultLabel: 'Archive', icon: <Archive size={14} /> },
      { role: 'junk', defaultLabel: isGmail ? 'Spam' : 'Junk', icon: <ShieldAlert size={14} /> },
      { role: 'trash', defaultLabel: 'Trash', icon: <Trash2 size={14} /> }
    ]
    return defs.map((d) => {
      const matched = findRole(d.role)
      return {
        role: d.role,
        label: matched?.name || d.defaultLabel,
        folder: matched,
        icon: d.icon
      }
    })
  }, [accountFolders, isGmail])

  const buildCustomItem = (
    folder: Folder,
    section: MoveTargetItem['section'],
    reason?: string
  ): MoveTargetItem => {
    const fullPath = folder.path || folder.name
    const leaf = getLeafFolderName(folder)
    return {
      key: `folder:${folder.id}`,
      section,
      label: fullPath,
      pathDisplay: fullPath !== leaf ? fullPath : undefined,
      reason,
      role: 'custom',
      folderName: fullPath,
      folderId: folder.id,
      icon: renderFolderIcon(folder.icon, isGmail, folder.color, 14)
    }
  }

  const buildSystemItem = (
    sys: { role: Folder['role']; label: string; folder?: Folder; icon: React.ReactNode },
    section: MoveTargetItem['section'],
    reason?: string
  ): MoveTargetItem => ({
    key: sys.folder ? `folder:${sys.folder.id}` : `role:${sys.role}`,
    section,
    label: sys.label,
    reason,
    role: sys.role,
    folderName: sys.label,
    folderId: sys.folder?.id,
    icon: sys.icon
  })

  const items: MoveTargetItem[] = useMemo(() => {
    if (!isOpen) return []
    const trimmed = query.trim()

    if (!trimmed) {
      const seenKeys = new Set<string>()
      const suggested: MoveTargetItem[] = []

      // 1. Suggested (Top 3): Sender habit movedFolders + AI bundle match
      const senderEmail = resolveThreadSenderEmail(primaryThread)
      if (senderEmail) {
        const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : ''
        const profile =
          senderProfiles.find((p) => p.senderEmail.toLowerCase() === senderEmail) ||
          (senderDomain ? senderProfiles.find((p) => p.senderDomain.toLowerCase() === senderDomain) : undefined)

        if (profile?.movedFolders) {
          const entries = Object.entries(profile.movedFolders)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])

          for (const [folderKey, count] of entries) {
            if (suggested.length >= 3) break
            const lowerKey = folderKey.toLowerCase()
            const matchedCustom = visibleCustomFolders.find(
              (f) =>
                f.path.toLowerCase() === lowerKey ||
                f.name.toLowerCase() === lowerKey ||
                getLeafFolderName(f).toLowerCase() === lowerKey
            )
            if (matchedCustom) {
              const item = buildCustomItem(matchedCustom, 'suggested', `Filed ${count}× here`)
              if (!seenKeys.has(item.key)) {
                seenKeys.add(item.key)
                suggested.push(item)
              }
              continue
            }
            const matchedSys = systemFolderItems.find(
              (s) => s.role === lowerKey || s.label.toLowerCase() === lowerKey
            )
            if (matchedSys) {
              const item = buildSystemItem(matchedSys, 'suggested', `Filed ${count}× here`)
              if (!seenKeys.has(item.key)) {
                seenKeys.add(item.key)
                suggested.push(item)
              }
            }
          }
        }
      }

      if (suggested.length < 3 && primaryThread) {
        const aiMeta = threadAiMeta[primaryThread.id]
        if (aiMeta?.bundle) {
          const keywords = [aiMeta.bundle.replace(/_/g, ' '), ...(BUNDLE_KEYWORDS[aiMeta.bundle] || [])]
          for (const folder of visibleCustomFolders) {
            if (suggested.length >= 3) break
            const key = `folder:${folder.id}`
            if (seenKeys.has(key)) continue
            const hay = `${folder.path} ${folder.name}`.toLowerCase()
            if (keywords.some((kw) => hay.includes(kw))) {
              seenKeys.add(key)
              suggested.push(buildCustomItem(folder, 'suggested', `Matches ${aiMeta.bundle.replace(/_/g, ' ')}`))
            }
          }
        }
      }

      // 2. Pinned & Recent
      const pinnedRecent: MoveTargetItem[] = []
      const pinnedFolders = accountFolders
        .filter((f) => f.isPinned && !f.isHidden)
        .sort((a, b) => {
          const oa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
          const ob = b.sortOrder ?? Number.MAX_SAFE_INTEGER
          if (oa !== ob) return oa - ob
          return (a.path || a.name).localeCompare(b.path || b.name, undefined, { sensitivity: 'base' })
        })

      for (const f of pinnedFolders) {
        const key = `folder:${f.id}`
        if (seenKeys.has(key)) continue
        if (f.role === 'custom') {
          seenKeys.add(key)
          pinnedRecent.push(buildCustomItem(f, 'pinned_recent', 'Pinned'))
        } else {
          const sys = systemFolderItems.find((s) => s.role === f.role)
          if (sys) {
            seenKeys.add(key)
            pinnedRecent.push(buildSystemItem(sys, 'pinned_recent', 'Pinned'))
          }
        }
      }

      for (const recentId of recentMovedFolderIds) {
        const f = accountFolders.find((x) => x.id === recentId && !x.isHidden)
        if (!f) continue
        const key = `folder:${f.id}`
        if (seenKeys.has(key)) continue
        if (f.role === 'custom') {
          seenKeys.add(key)
          pinnedRecent.push(buildCustomItem(f, 'pinned_recent', 'Recent'))
        } else {
          const sys = systemFolderItems.find((s) => s.role === f.role)
          if (sys) {
            seenKeys.add(key)
            pinnedRecent.push(buildSystemItem(sys, 'pinned_recent', 'Recent'))
          }
        }
      }

      // 3. All Folders (visible custom folders + Inbox/Archive/Trash/Junk)
      const all: MoveTargetItem[] = []
      for (const sys of systemFolderItems) {
        const item = buildSystemItem(sys, 'all')
        if (!seenKeys.has(item.key)) {
          seenKeys.add(item.key)
          all.push(item)
        }
      }
      for (const f of visibleCustomFolders) {
        const item = buildCustomItem(f, 'all')
        if (!seenKeys.has(item.key)) {
          seenKeys.add(item.key)
          all.push(item)
        }
      }

      return [...suggested, ...pinnedRecent, ...all]
    }

    // Search mode: fuzzy-filter across full folder paths & system folders
    const scored: { item: MoveTargetItem; score: number }[] = []
    let hasExactMatch = false
    const lowerQuery = trimmed.toLowerCase()

    for (const sys of systemFolderItems) {
      const s = fuzzyScore(trimmed, sys.label)
      if (sys.label.toLowerCase() === lowerQuery) hasExactMatch = true
      if (s > 0) {
        scored.push({ item: buildSystemItem(sys, 'results'), score: s })
      }
    }

    for (const f of visibleCustomFolders) {
      const fullPath = f.path || f.name
      const leaf = getLeafFolderName(f)
      if (fullPath.toLowerCase() === lowerQuery || f.name.toLowerCase() === lowerQuery) {
        hasExactMatch = true
      }
      const s = Math.max(fuzzyScore(trimmed, fullPath), fuzzyScore(trimmed, leaf))
      if (s > 0) {
        scored.push({ item: buildCustomItem(f, 'results'), score: s })
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.item.label.localeCompare(b.item.label, undefined, { sensitivity: 'base' })
    })

    const out = scored.map((x) => x.item)

    if (!hasExactMatch && targetAccountId) {
      out.push({
        key: `create:${trimmed}`,
        section: 'create',
        label: `Create ${isGmail ? 'label' : 'folder'} "${trimmed}" and move here`,
        role: 'custom',
        folderName: trimmed,
        icon: <FolderPlus size={14} style={{ color: 'var(--accent)' }} />,
        isCreate: true,
        createQuery: trimmed
      })
    }

    return out
  }, [
    isOpen,
    query,
    primaryThread,
    senderProfiles,
    threadAiMeta,
    accountFolders,
    visibleCustomFolders,
    systemFolderItems,
    recentMovedFolderIds,
    targetAccountId,
    isGmail
  ])

  const clampedIndex = items.length > 0 ? Math.min(activeIndex, items.length - 1) : 0

  useEffect(() => {
    if (!isOpen) return
    itemRefs.current[clampedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [clampedIndex, isOpen])

  if (!isOpen) return null

  const executeItem = async (item: MoveTargetItem) => {
    if (busy) return
    setBusy(true)
    try {
      if (item.isCreate && item.createQuery && targetAccountId) {
        const raw = item.createQuery.trim()
        const slashIdx = raw.lastIndexOf('/')
        let nameToCreate = raw
        let parentPath: string | null = null
        let matchedParent: Folder | undefined

        if (slashIdx > 0 && slashIdx < raw.length - 1) {
          const parentPart = raw.slice(0, slashIdx).trim()
          const childPart = raw.slice(slashIdx + 1).trim()
          if (parentPart && childPart) {
            matchedParent = accountFolders.find(
              (f) =>
                f.path.toLowerCase() === parentPart.toLowerCase() ||
                f.name.toLowerCase() === parentPart.toLowerCase()
            )
            if (matchedParent) {
              parentPath = matchedParent.path || matchedParent.name
              nameToCreate = childPart
            }
          }
        }

        const res = await createFolder({
          accountId: targetAccountId,
          name: nameToCreate,
          parentPath
        })
        if (!res.ok) {
          setBusy(false)
          return
        }
        setAccountExpanded(targetAccountId, true)
        if (matchedParent) {
          setFolderExpanded(matchedParent.id, true)
        }
        const createdFolder = res.folder
        await moveThreadsToFolder(
          threadIds,
          'custom',
          createdFolder?.path || createdFolder?.name || raw,
          createdFolder?.id
        )
        closeMoveToPopover()
        return
      }

      await moveThreadsToFolder(threadIds, item.role, item.folderName, item.folderId)
      closeMoveToPopover()
    } finally {
      setBusy(false)
    }
  }

  const sectionHeaders: Record<MoveTargetItem['section'], string | null> = {
    suggested: 'Suggested',
    pinned_recent: 'Pinned & Recent',
    all: 'All Folders',
    results: null,
    create: null
  }

  let lastSection: MoveTargetItem['section'] | null = null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-24"
      onClick={() => !busy && closeMoveToPopover()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Move to folder"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
      >
        {/* Header / Search Input */}
        <div
          className="flex items-center gap-2.5 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <FolderInput size={15} style={{ color: 'var(--accent)' }} className="shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            disabled={busy}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                if (!busy) closeMoveToPopover()
              } else if (e.key === 'ArrowDown' && items.length > 0) {
                e.preventDefault()
                setActiveIndex((prev) => (prev + 1) % items.length)
              } else if (e.key === 'ArrowUp' && items.length > 0) {
                e.preventDefault()
                setActiveIndex((prev) => (prev - 1 + items.length) % items.length)
              } else if (e.key === 'Enter' && items[clampedIndex]) {
                e.preventDefault()
                void executeItem(items[clampedIndex])
              }
            }}
            placeholder={
              threadIds.length > 1
                ? `Move ${threadIds.length} conversations to…`
                : `Move to ${isGmail ? 'label' : 'folder'} or type to create…`
            }
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-muted)]"
          />
          {query && !busy && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-0.5 transition hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
          {busy ? (
            <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
          ) : (
            <kbd
              className="rounded border px-1.5 py-0.5 text-[10.5px]"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
            >
              Esc
            </kbd>
          )}
        </div>

        {/* Account / Selection Context Bar */}
        {targetAccount && (
          <div
            className="flex items-center justify-between border-b px-4 py-1.5 text-[11px]"
            style={{
              background: 'var(--bg-main)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)'
            }}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: targetAccount.color }}
              />
              <span className="truncate font-medium" style={{ color: 'var(--text-secondary)' }}>
                {targetAccount.name}
              </span>
              <span className="truncate opacity-75">({targetAccount.email})</span>
            </span>
            <span className="shrink-0">
              {threadIds.length === 1 ? '1 conversation' : `${threadIds.length} conversations`}
            </span>
          </div>
        )}

        {/* Folder List */}
        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              <Search size={16} className="mx-auto mb-1.5 opacity-50" />
              No folders available
            </div>
          ) : (
            items.map((item, idx) => {
              const isActive = idx === clampedIndex
              const showSectionHeader =
                item.section !== lastSection && sectionHeaders[item.section] !== null
              const showCreateDivider = item.isCreate && idx > 0
              lastSection = item.section

              return (
                <React.Fragment key={item.key}>
                  {showSectionHeader && (
                    <div
                      className={`px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider ${
                        idx === 0 ? 'pt-1' : 'pt-2.5'
                      }`}
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {sectionHeaders[item.section]}
                    </div>
                  )}
                  {showCreateDivider && (
                    <div className="my-1.5 h-px" style={{ background: 'var(--border-subtle)' }} />
                  )}
                  <button
                    ref={(el) => {
                      itemRefs.current[idx] = el
                    }}
                    type="button"
                    disabled={busy}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => void executeItem(item)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition disabled:opacity-60"
                    style={{
                      background: isActive ? 'var(--bg-selected)' : 'transparent',
                      color: item.isCreate
                        ? 'var(--accent-text)'
                        : isActive
                          ? 'var(--text-primary)'
                          : 'var(--text-secondary)'
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex shrink-0 items-center"
                        style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                      >
                        {item.icon}
                      </span>
                      <span className={`truncate ${isActive || item.isCreate ? 'font-medium' : ''}`}>
                        {item.label}
                      </span>
                    </span>
                    {item.reason && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                        style={{
                          background:
                            item.section === 'suggested' ? 'var(--accent-soft)' : 'var(--bg-main)',
                          color:
                            item.section === 'suggested' ? 'var(--accent-text)' : 'var(--text-muted)'
                        }}
                      >
                        {item.section === 'suggested' && <Sparkles size={10} />}
                        {item.reason === 'Pinned' && <Pin size={10} />}
                        <span>{item.reason}</span>
                      </span>
                    )}
                  </button>
                </React.Fragment>
              )
            })
          )}
        </div>

        {/* Footer Hints */}
        <div
          className="flex items-center justify-between border-t px-4 py-1.5 text-[11px]"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          <span>↑↓ Navigate · ↵ Move</span>
          <span>Type a new name to create · Esc Close</span>
        </div>
      </div>
    </div>
  )
}
