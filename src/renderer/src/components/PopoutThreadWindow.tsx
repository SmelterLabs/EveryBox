import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { ThreadReader } from './ThreadReader'
import { Composer } from './Composer'
import { ConfirmModal } from './ConfirmModal'
import { AccountBadge } from './AccountIcon'
import { getEffectiveShortcut, matchesCombo } from '../utils/shortcuts'
import { buildReplyComposerState } from '../utils/replyHelper'

export const PopoutThreadWindow: React.FC<{ threadId: string }> = ({ threadId }) => {
  const {
    settings,
    accounts,
    selectedThread,
    composer,
    confirmDialog,
    toast,
    selectThread,
    openComposer,
    archiveThreads,
    trashThreads,
    snoozeThreads,
    toggleStarThread,
    closeConfirm,
    clearToast
  } = useAppStore()

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true

    const loadPopoutState = async (isInitial: boolean) => {
      const [nextSettings, nextAccounts, nextFolders, nextSnippets, nextPreDrafts, nextVoices] =
        await Promise.all([
          window.glassmail.getSettings(),
          window.glassmail.listAccounts(),
          window.glassmail.listFolders(),
          window.glassmail.listSnippets(),
          window.glassmail.listPreDrafts(),
          window.glassmail.listVoiceProfiles()
        ])
      if (!active) return
      document.documentElement.setAttribute('data-theme', nextSettings.theme)
      document.documentElement.setAttribute('data-ui-theme', nextSettings.uiTheme || 'everybox')
      useAppStore.setState({
        settings: nextSettings,
        accounts: nextAccounts,
        folders: nextFolders,
        snippets: nextSnippets,
        preDrafts: nextPreDrafts,
        voiceProfiles: nextVoices
      })

      if (isInitial) {
        await selectThread(threadId)
        if (active) setLoaded(true)
      } else {
        const detail = await window.glassmail.getThread(threadId)
        if (!active) return
        useAppStore.setState({ selectedThreadId: detail ? threadId : null, selectedThread: detail })
      }
    }

    void loadPopoutState(true)
    const unsub = window.glassmail.onDataUpdated(() => {
      void loadPopoutState(false)
    })

    return () => {
      active = false
      unsub()
    }
  }, [threadId])

  useEffect(() => {
    document.title = selectedThread?.subject ? `${selectedThread.subject} — EveryBox` : 'EveryBox'
  }, [selectedThread?.subject])

  // Keyboard shortcuts inside pop-out window
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inInput =
        Boolean(target) &&
        (target!.tagName === 'INPUT' || target!.tagName === 'TEXTAREA' || target!.isContentEditable)

      if (e.key === 'Escape' && !composer.open && !confirmDialog && !inInput) {
        e.preventDefault()
        window.close()
        return
      }

      if (inInput || composer.open || confirmDialog) return

      const overrides = settings?.shortcuts
      const match = (id: Parameters<typeof getEffectiveShortcut>[0]) =>
        matchesCombo(e, getEffectiveShortcut(id, overrides))

      if (match('undo') && toast?.undo) {
        e.preventDefault()
        const fn = toast.undo
        clearToast()
        void fn()
        return
      }

      if (!selectedThread) return

      if (match('reply')) {
        e.preventDefault()
        openComposer(buildReplyComposerState(selectedThread, 'reply'))
        return
      }
      if (match('replyAll')) {
        e.preventDefault()
        openComposer(buildReplyComposerState(selectedThread, 'replyAll'))
        return
      }
      if (match('forward')) {
        e.preventDefault()
        openComposer(buildReplyComposerState(selectedThread, 'forward'))
        return
      }
      if (match('archive')) {
        e.preventDefault()
        void archiveThreads([selectedThread.id])
        return
      }
      if (match('delete')) {
        e.preventDefault()
        void trashThreads([selectedThread.id])
        return
      }
      if (match('snooze')) {
        e.preventDefault()
        void snoozeThreads([selectedThread.id], Date.now() + 24 * 3600_000, 'Tomorrow')
        return
      }
      if (match('star')) {
        e.preventDefault()
        void toggleStarThread(selectedThread.id, selectedThread.isStarred)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    settings,
    selectedThread,
    composer.open,
    confirmDialog,
    toast,
    openComposer,
    archiveThreads,
    trashThreads,
    snoozeThreads,
    toggleStarThread,
    clearToast
  ])

  const account = accounts.find((a) => a.id === selectedThread?.accountId)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Native draggable title bar with space on right for Windows caption buttons */}
      <header
        className="app-drag flex h-9 shrink-0 items-center gap-2 border-b pl-3.5 pr-36"
        style={{
          background: 'var(--bg-sidebar)',
          borderColor: 'var(--border-subtle)'
        }}
      >
        {account && <AccountBadge icon={account.icon} color={account.color} size="xs" />}
        <span
          className="min-w-0 flex-1 truncate text-[12.5px] font-medium"
          style={{ color: 'var(--text-primary)' }}
          title={selectedThread?.subject || 'EveryBox'}
        >
          {selectedThread?.subject || (loaded ? 'Email unavailable' : 'Loading email…')}
        </span>
        {account && (
          <span
            className="hidden shrink-0 text-[11px] sm:inline"
            style={{ color: 'var(--text-muted)' }}
          >
            {account.email}
          </span>
        )}
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {selectedThread ? (
          <ThreadReader isPopout />
        ) : loaded ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
              This conversation is no longer available.
            </p>
            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-lg px-4 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              Close Window
            </button>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Loading…
          </div>
        )}
      </main>

      <Composer />
      <ConfirmModal dialog={confirmDialog} onClose={closeConfirm} />
      {toast && (
        <div
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] shadow-2xl"
          style={{
            background: 'var(--bg-elevated)',
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
    </div>
  )
}
