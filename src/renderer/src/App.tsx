import React, { useEffect, useRef } from 'react'
import { Command, PanelLeft, Search } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { Sidebar } from './components/Sidebar'
import { ThreadList } from './components/ThreadList'
import { ThreadReader } from './components/ThreadReader'
import { TodayBrief } from './components/TodayBrief'
import { AssistantView } from './components/AssistantView'
import { CalendarView } from './components/CalendarView'
import { TriageView } from './components/TriageView'
import { SubscriptionsView } from './components/SubscriptionsView'
import { Composer } from './components/Composer'
import { CommandPalette } from './components/CommandPalette'
import { SettingsModal } from './components/SettingsModal'

export const App: React.FC = () => {
  const {
    bootstrap,
    refreshAll,
    activeView,
    selectedThreadId,
    threads,
    workspaces,
    sidebarVisible,
    searchQuery,
    toast,
    setSidebarVisible,
    setCommandPaletteOpen,
    openSettings,
    openComposer,
    selectThread,
    selectWorkspace,
    runSearch,
    archiveThreads,
    snoozeThreads,
    toggleCheckThread,
    clearCheckedThreads,
    clearToast
  } = useAppStore()

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void bootstrap()
    const unsub = window.glassmail.onDataUpdated(() => {
      void refreshAll()
    })
    return unsub
  }, [])

  // Global Glassmail keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      // Ctrl+K: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }
      // Ctrl+, : Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        openSettings('accounts')
        return
      }
      // Ctrl+1..9: Switch workspaces
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key)
        const ws = workspaces.find((w) => w.shortcutIndex === idx)
        if (ws) {
          e.preventDefault()
          void selectWorkspace(ws)
        }
        return
      }

      if (inInput || activeView === 'triage') return

      const k = e.key.toLowerCase()
      if (k === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (k === 'c') {
        e.preventDefault()
        openComposer({ mode: 'new' })
      } else if (k === 'j') {
        const curIdx = threads.findIndex((t) => t.id === selectedThreadId)
        const next = threads[curIdx + 1] || threads[0]
        if (next) void selectThread(next.id)
      } else if (k === 'k') {
        const curIdx = threads.findIndex((t) => t.id === selectedThreadId)
        const prev = threads[Math.max(0, curIdx - 1)]
        if (prev) void selectThread(prev.id)
      } else if (k === 'e' && selectedThreadId) {
        void archiveThreads([selectedThreadId])
      } else if ((k === 'h' || k === 'b') && selectedThreadId) {
        void snoozeThreads([selectedThreadId], Date.now() + 24 * 3600_000, 'Tomorrow')
      } else if (k === 'x' && selectedThreadId) {
        toggleCheckThread(selectedThreadId)
      } else if (e.key === 'Escape') {
        clearCheckedThreads()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeView, selectedThreadId, threads, workspaces])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Top Bar (with space on right for native Windows caption buttons) */}
      <header
        className="app-drag flex h-10 shrink-0 items-center justify-between border-b pl-3 pr-36"
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="app-no-drag flex items-center gap-2">
          <button
            onClick={() => setSidebarVisible(!sidebarVisible)}
            className="rounded-lg p-1.5 transition hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-secondary)' }}
            title="Toggle Sidebar"
          >
            <PanelLeft size={15} />
          </button>
          <span className="text-[12.5px] font-semibold tracking-tight" style={{ color: 'var(--text-secondary)' }}>
            EveryBox
          </span>
        </div>

        {/* Natural-Language Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch(searchQuery)
          }}
          className="app-no-drag flex w-full max-w-[380px] items-center gap-2 rounded-full border px-3 py-1"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => void runSearch(e.target.value)}
            placeholder='Search, like "pdf from maya last week"'
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px]"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            title="Command Palette (Ctrl+K)"
          >
            <Command size={10} />K
          </button>
        </form>

        <div className="w-8" />
      </header>

      {/* Main Content Area */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarVisible && activeView !== 'triage' && <Sidebar />}

        {activeView === 'assistant' && <AssistantView />}
        {activeView === 'calendar' && <CalendarView />}
        {activeView === 'triage' && <TriageView />}
        {activeView === 'subscriptions' && <SubscriptionsView />}
        {activeView === 'mail' && (
          <>
            <ThreadList />
            {selectedThreadId ? <ThreadReader /> : <TodayBrief />}
          </>
        )}
      </main>

      {/* Overlays */}
      <Composer />
      <CommandPalette />
      <SettingsModal />

      {/* Undo / Notification Toast */}
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] shadow-2xl"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-strong)' }}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={async () => {
                const fn = toast.undo
                clearToast()
                if (fn) await fn()
              }}
              className="font-semibold hover:underline"
              style={{ color: 'var(--accent-text)' }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
