import React from 'react'
import { Archive, ExternalLink, Newspaper } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export const SubscriptionsView: React.FC = () => {
  const { subscriptions, archiveThreads, showToast } = useAppStore()

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      <div className="border-b px-8 py-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="text-[16px] font-semibold">Subscriptions</h2>
        <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
          Every newsletter in one place — unsubscribe in one click or archive all.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-[740px] space-y-2.5">
          {subscriptions.length === 0 ? (
            <div className="mt-16 text-center">
              <Newspaper size={32} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
              <p className="mt-3 text-[13.5px]" style={{ color: 'var(--text-secondary)' }}>
                No active newsletter subscriptions detected.
              </p>
            </div>
          ) : (
            subscriptions.map((sub) => (
              <div
                key={`${sub.accountId}-${sub.senderEmail}`}
                className="flex items-center justify-between rounded-xl border p-4"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{sub.senderName}</div>
                  <div className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {sub.senderEmail} · {sub.count} email{sub.count === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await archiveThreads(sub.threadIds)
                      showToast(`Archived ${sub.count} emails from ${sub.senderName}`)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-strong)' }}
                  >
                    <Archive size={13} /> Archive all
                  </button>
                  {sub.unsubscribeUrl && (
                    <button
                      onClick={() => {
                        void window.glassmail.openExternal(sub.unsubscribeUrl!)
                        showToast(`Opened unsubscribe page for ${sub.senderName}`)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      Unsubscribe <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
