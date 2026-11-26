import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Command, Layers, PanelLeft, Search, X } from 'lucide-react'
import { isMac, modKeyPrefix } from './utils/platform'
import { getEffectiveShortcut, matchesCombo } from './utils/shortcuts'
import { buildReplyComposerState } from './utils/replyHelper'
import { useAppStore } from './store/useAppStore'
import { Sidebar } from './components/Sidebar'
import { ThreadList } from './components/ThreadList'
import { ThreadReader } from './components/ThreadReader'
import { TodayBrief } from './components/TodayBrief'
import { AssistantView } from './components/AssistantView'
import { CalendarView } from './components/CalendarView'
import { TriageView } from './components/TriageView'
import { SubscriptionsView } from './components/SubscriptionsView'
import { AutopilotView } from './components/AutopilotView'
import { Composer } from './components/Composer'
import { CommandPalette } from './components/CommandPalette'
import { SettingsModal } from './components/SettingsModal'
import { ConfirmModal } from './components/ConfirmModal'
import { ShortcutHelpModal } from './components/ShortcutHelpModal'
import { AccountBadge } from './components/AccountIcon'
import { OutlookClassicShell } from './components/themes/OutlookClassicShell'
import { GmailShell } from './components/themes/GmailShell'

export const App: React.FC = () => {
  const {
    bootstrap,
    refreshAll,
    settings,
    settingsOpen,
    accounts,
    activeAccountIds,
    activeView,
    selectedThreadId,
    selectedThread,
    checkedThreadIds,
    threads,
    workspaces,
    sidebarVisible,
    assistantOpen,
    searchQuery,
    searchScopeAccountId,
    shortcutHelpOpen,
    confirmDialog,
    toast,
    setSidebarVisible,
    setActiveView,
    setCommandPaletteOpen,
    setShortcutHelpOpen,
    closeConfirm,
    openSettings,
    openComposer,
    selectThread,
    selectWorkspace,
    runSearch,
    clearSearch,
    setSearchScopeAccountId,
    archiveThreads,
    trashThreads,
    snoozeThreads,
    toggleStarThread,
    toggleReadThread,
    setStarredThreads,
    setReadThreads,
    toggleCheckThread,
    clearCheckedThreads,
    clearToast
  } = useAppStore()

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [showSearchScopeMenu, setShowSearchScopeMenu] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('everybox:sidebarWidth'))
    return Number.isFinite(saved) && saved >= 190 && saved <= 480 ? saved : 244
  })
  const [threadListWidth, setThreadListWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('everybox:threadListWidth'))
    return Number.isFinite(saved) && saved >= 250 && saved <= 960 ? saved : 340
  })
  const [assistantWidth, setAssistantWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('everybox:assistantWidth'))
    return Number.isFinite(saved) && saved >= 300 && saved <= 640 ? saved : 390
  })

  const startResizeLeft = (
    e: React.MouseEvent,
    startWidth: number,
    min: number,
    max: number,
    storageKey: string,
    setter: (w: number) => void
  ) => {
    e.preventDefault()
    const startX = e.clientX
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const dynamicMax = Math.min(max, Math.max(min, window.innerWidth - 420))
      const next = Math.min(dynamicMax, Math.max(min, startWidth - (ev.clientX - startX)))
      setter(next)
      localStorage.setItem(storageKey, String(next))
    }
    const onUp = () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResize = (
    e: React.MouseEvent,
    startWidth: number,
    min: number,
    max: number,
    storageKey: string,
    setter: (w: number) => void
  ) => {
    e.preventDefault()
    const startX = e.clientX
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const dynamicMax = Math.min(max, Math.max(min, window.innerWidth - 340))
      const next = Math.min(dynamicMax, Math.max(min, startWidth + (ev.clientX - startX)))
      setter(next)
      localStorage.setItem(storageKey, String(next))
    }
    const onUp = () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    void bootstrap()
    const unsubData = window.glassmail.onDataUpdated(() => {
      void refreshAll()
    })
    const unsubFocus = window.glassmail.onFocusThread((threadId) => {
      setActiveView('mail')
      void selectThread(threadId)
    })
    return () => {
      unsubData()
      unsubFocus()
    }
  }, [])

  // Global OS-aware & customizable keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not intercept keys while Settings modal is open (especially when recording shortcuts)
      if (settingsOpen) return

      const target = e.target as HTMLElement | null
      const inInput =
        Boolean(target) &&
        (target!.tagName === 'INPUT' || target!.tagName === 'TEXTAREA' || target!.isContentEditable)

      const overrides = settings?.shortcuts
      const match = (id: Parameters<typeof getEffectiveShortcut>[0]) =>
        matchesCombo(e, getEffectiveShortcut(id, overrides))

      // Always-available modifier shortcuts (even when focused in an input)
      if (match('commandPalette')) {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }
      if (match('settings')) {
        e.preventDefault()
        openSettings('accounts')
        return
      }
      if (match('search')) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }
      if (match('compose')) {
        e.preventDefault()
        openComposer({ mode: 'new' })
        return
      }

      // Ctrl/Cmd+1..9: Switch workspaces
      if ((isMac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key)
        const ws = workspaces.find((w) => w.shortcutIndex === idx)
        if (ws) {
          e.preventDefault()
          void selectWorkspace(ws)
        }
        return
      }

      if (inInput || activeView === 'triage') return

      const actionTargets = checkedThreadIds.length > 0 ? checkedThreadIds : selectedThreadId ? [selectedThreadId] : []

      if (match('undo') && toast?.undo) {
        e.preventDefault()
        const fn = toast.undo
        clearToast()
        void fn()
        return
      }

      if (match('delete') && actionTargets.length > 0) {
        e.preventDefault()
        void trashThreads(actionTargets)
        return
      }

      if (match('archive') && actionTargets.length > 0) {
        e.preventDefault()
        void archiveThreads(actionTargets)
        return
      }

      if (match('snooze') && actionTargets.length > 0) {
        e.preventDefault()
        void snoozeThreads(actionTargets, Date.now() + 24 * 3600_000, 'Tomorrow')
        return
      }

      if (match('star') && actionTargets.length > 0) {
        e.preventDefault()
        if (checkedThreadIds.length > 0) {
          const anyUnstarred = threads.some((t) => checkedThreadIds.includes(t.id) && !t.isStarred)
          void setStarredThreads(checkedThreadIds, anyUnstarred)
        } else if (selectedThread) {
          void toggleStarThread(selectedThread.id, selectedThread.isStarred)
        }
        return
      }

      if (match('toggleRead') && actionTargets.length > 0) {
        e.preventDefault()
        if (checkedThreadIds.length > 0) {
          const anyUnread = threads.some((t) => checkedThreadIds.includes(t.id) && !t.isRead)
          void setReadThreads(checkedThreadIds, anyUnread)
        } else if (selectedThread) {
          void toggleReadThread(selectedThread.id, selectedThread.isRead)
        }
        return
      }

      if ((match('reply') || match('replyAll') || match('forward')) && selectedThread) {
        e.preventDefault()
        const mode: 'reply' | 'replyAll' | 'forward' = match('replyAll')
          ? 'replyAll'
          : match('forward')
            ? 'forward'
            : 'reply'
        openComposer(
          buildReplyComposerState(selectedThread, mode, undefined, {
            outlookPrefixes: settings?.uiTheme === 'outlook-classic'
          })
        )
        return
      }

      if (match('inboxHome')) {
        e.preventDefault()
        void selectThread(null)
        return
      }

      if (match('nextThread') || (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'j')) {
        e.preventDefault()
        const curIdx = threads.findIndex((t) => t.id === selectedThreadId)
        const next = threads[curIdx + 1] || threads[0]
        if (next) void selectThread(next.id)
        return
      }

      if (match('prevThread') || (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        const curIdx = threads.findIndex((t) => t.id === selectedThreadId)
        const prev = threads[Math.max(0, curIdx - 1)]
        if (prev) void selectThread(prev.id)
        return
      }

      // Secondary convenience single-key shortcuts
      const k = e.key.toLowerCase()
      if (!e.ctrlKey && !e.metaKey && !e.altKey && k === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && k === 'c') {
        e.preventDefault()
        openComposer({ mode: 'new' })
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && k === 'x' && selectedThreadId) {
        toggleCheckThread(selectedThreadId)
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '?') {
        e.preventDefault()
        setShortcutHelpOpen(!shortcutHelpOpen)
      } else if (e.key === 'Escape') {
        if (showSearchScopeMenu) {
          setShowSearchScopeMenu(false)
        } else {
          clearCheckedThreads()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    settingsOpen,
    settings?.shortcuts,
    activeView,
    selectedThreadId,
    selectedThread,
    checkedThreadIds,
    threads,
    workspaces,
    toast,
    shortcutHelpOpen,
    showSearchScopeMenu
  ])

  const uiTheme = settings?.uiTheme || 'everybox'
  const scopedSearchAccount = searchScopeAccountId
    ? accounts.find((a) => a.id === searchScopeAccountId) || null
    : null

  const overlays = (
    <>
      {/* Overlays */}
      <Composer />
      <CommandPalette />
      <SettingsModal />
      <ConfirmModal dialog={confirmDialog} onClose={closeConfirm} />
      <ShortcutHelpModal open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />

      {/* Bottom-Left Translucent Undo / Notification Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-5 z-50 flex items-center gap-3.5 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium shadow-xl backdrop-blur-md"
          style={{
            background: 'color-mix(in srgb, var(--bg-elevated) 92%, transparent)',
            borderColor: 'var(--border-strong)'
          }}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              key={toast.id}
              onClick={async () => {
                const fn = toast.undo
                clearToast()
                if (fn) await fn()
              }}
              className="relative overflow-visible rounded-lg px-3.5 py-1 text-[13px] font-semibold transition hover:opacity-90"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <rect
                  x="1"
                  y="1"
                  width="calc(100% - 2px)"
                  height="calc(100% - 2px)"
                  rx="7"
                  ry="7"
                  fill="none"
                  stroke="var(--border-strong)"
                  strokeWidth="1.5"
                  opacity="0.25"
                />
                <rect
                  x="1"
                  y="1"
                  width="calc(100% - 2px)"
                  height="calc(100% - 2px)"
                  rx="7"
                  ry="7"
                  pathLength={100}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="undo-fuse-stroke"
                  style={{ animationDuration: `${toast.durationMs}ms` }}
                />
              </svg>
              <span className="relative z-10">Undo</span>
            </button>
          )}
        </div>
      )}
    </>
  )

  if (uiTheme === 'outlook-classic') {
    return (
      <>
        <OutlookClassicShell searchInputRef={searchInputRef} />
        {overlays}
      </>
    )
  }

  if (uiTheme === 'gmail') {
    return (
      <>
        <GmailShell searchInputRef={searchInputRef} />
        {overlays}
      </>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Top Bar (with space on right for native Windows caption buttons) */}
      <header
        className="app-drag flex h-12 shrink-0 items-center justify-between gap-3 border-b pl-3 pr-36"
        style={{
          background: 'var(--bg-sidebar)',
          borderColor: 'var(--border-subtle)'
        }}
      >
        <div className="app-no-drag flex shrink-0 items-center gap-2">
          <button
            onClick={() => setSidebarVisible(!sidebarVisible)}
            className="rounded-lg p-2 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Toggle Sidebar"
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>
          <span className="text-[13.5px] font-semibold tracking-tight" style={{ color: 'var(--text-secondary)' }}>
            EveryBox
          </span>
        </div>

        {/* Universal Search Bar with Account Scope Toggle + Separate Command Palette Button */}
        <div className="app-no-drag flex min-w-0 flex-1 items-center justify-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch(searchQuery)
            }}
            className="relative flex w-full max-w-[560px] items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 transition focus-within:border-[var(--accent)]"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
          >
            {/* Account Scope Selector Pill (All accounts by default, or pick any single account) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowSearchScopeMenu((v) => !v)}
                className="inline-flex max-w-[160px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition hover:bg-[var(--bg-hover)]"
                style={{
                  background: scopedSearchAccount ? 'var(--bg-main)' : 'transparent',
                  borderColor: scopedSearchAccount ? 'var(--border-strong)' : 'var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
                title="Choose whether search covers All Accounts or a single account"
                aria-label="Search account scope"
              >
                {scopedSearchAccount ? (
                  <AccountBadge icon={scopedSearchAccount.icon} color={scopedSearchAccount.color} size="xs" />
                ) : (
                  <Layers size={12} style={{ color: 'var(--accent)' }} className="shrink-0" />
                )}
                <span className="truncate">{scopedSearchAccount ? scopedSearchAccount.name : 'All accounts'}</span>
                <ChevronDown size={11} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
              </button>

              {showSearchScopeMenu && (
                <div
                  className="absolute left-0 top-9 z-40 w-64 rounded-xl border p-1.5 shadow-2xl"
                  style={{ background: 'var(--bg-main)', borderColor: 'var(--border-strong)' }}
                >
                  <div
                    className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Search scope
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSearchScopeMenu(false)
                      void setSearchScopeAccountId(null)
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Layers size={13} style={{ color: 'var(--accent)' }} />
                      All accounts
                    </span>
                    {!scopedSearchAccount && <Check size={13} style={{ color: 'var(--accent)' }} />}
                  </button>
                  {accounts.length > 0 && (
                    <div className="my-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                  )}
                  {accounts.map((acc) => {
                    const selected = searchScopeAccountId === acc.id
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setShowSearchScopeMenu(false)
                          void setSearchScopeAccountId(acc.id)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition hover:bg-[var(--bg-hover)]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <AccountBadge icon={acc.icon} color={acc.color} size="xs" />
                          <span className="truncate font-medium">{acc.name}</span>
                        </span>
                        {selected && <Check size={13} style={{ color: 'var(--accent)' }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <Search size={14} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => void runSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && searchQuery) {
                  e.preventDefault()
                  void clearSearch()
                }
              }}
              placeholder={
                scopedSearchAccount
                  ? `Search ${scopedSearchAccount.name}…`
                  : 'Search all accounts, e.g. "pdf from maya last week"'
              }
              aria-label="Search emails"
              className="min-w-0 flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-[var(--text-muted)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => void clearSearch()}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-muted)' }}
                title="Clear search (Esc)"
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </form>

          {/* Dedicated Command Palette Trigger (separated from Search input) */}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-[var(--bg-hover)]"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)'
            }}
            title={`Command Palette (${modKeyPrefix}K)`}
            aria-label="Open Command Palette"
          >
            {isMac ? <Command size={11} /> : null}
            <span>{isMac ? 'K' : 'Ctrl+K'}</span>
          </button>
        </div>

        <div className="w-8 shrink-0" />
      </header>

      {/* Main Content Area */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarVisible && activeView !== 'triage' && (
          <>
            <Sidebar width={sidebarWidth} />
            <div
              onMouseDown={(e) => startResize(e, sidebarWidth, 190, 480, 'everybox:sidebarWidth', setSidebarWidth)}
              onDoubleClick={() => {
                setSidebarWidth(244)
                localStorage.setItem('everybox:sidebarWidth', '244')
              }}
              className="group relative z-10 -ml-0.5 w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-[var(--accent)]/40"
              title="Drag to resize sidebar (double-click to reset)"
            />
          </>
        )}

        {activeView === 'calendar' && <CalendarView />}
        {activeView === 'triage' && <TriageView />}
        {activeView === 'subscriptions' && <SubscriptionsView />}
        {activeView === 'autopilot' && <AutopilotView />}
        {(activeView === 'mail' || activeView === 'assistant') && (
          <>
            <ThreadList width={threadListWidth} />
            <div
              onMouseDown={(e) =>
                startResize(e, threadListWidth, 250, 960, 'everybox:threadListWidth', setThreadListWidth)
              }
              onDoubleClick={() => {
                setThreadListWidth(340)
                localStorage.setItem('everybox:threadListWidth', '340')
              }}
              className="group relative z-10 -ml-0.5 w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-[var(--accent)]/40"
              title="Drag to resize message list (double-click to reset)"
            />
            {selectedThreadId ? <ThreadReader /> : <TodayBrief />}
          </>
        )}

        {assistantOpen && activeView !== 'triage' && (
          <>
            <div
              onMouseDown={(e) =>
                startResizeLeft(e, assistantWidth, 300, 640, 'everybox:assistantWidth', setAssistantWidth)
              }
              onDoubleClick={() => {
                setAssistantWidth(390)
                localStorage.setItem('everybox:assistantWidth', '390')
              }}
              className="group relative z-10 -mr-0.5 w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-[var(--accent)]/40"
              title="Drag to resize AI Assistant (double-click to reset)"
            />
            <AssistantView width={assistantWidth} />
          </>
        )}
      </main>

      {overlays}
    </div>
  )
}
