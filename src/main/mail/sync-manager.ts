import { randomUUID } from 'crypto'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { Account, Folder, SendEmailPayload } from '../../shared/types'
import { getAuthorizedGoogleClient } from './gmail-oauth'
import { modifyGmailThread, sendGmailMessage, syncGmailAccount, trashGmailThread } from './gmail-sync'
import { mutateImapMessages, sendImapSmtpMessage, syncImapAccount } from './imap-sync'

export interface ThreadMutationSnapshot {
  threadId: string
  accountId: string
  folderRole: Folder['role']
  messageRemoteIds: string[]
}

export class SyncManager {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private db: GlassmailDB,
    private secrets: SecretStore,
    private onSyncUpdate: () => void
  ) {}

  startBackgroundLoop(): void {
    if (this.timer) return
    // Every 45 seconds: process due scheduled emails, wake snoozed threads, and sync active real accounts
    this.timer = setInterval(() => {
      void this.processScheduledEmails()
      void this.syncAllAccounts(false)
    }, 45_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async syncAllAccounts(force = true): Promise<void> {
    const accounts = this.db.listAccounts().filter((a) => a.isEnabled && !a.isDemo)
    if (accounts.length === 0) return

    await Promise.all(
      accounts.map(async (account) => {
        if (!force && account.lastSyncAt && Date.now() - account.lastSyncAt < 60_000) return
        await this.syncAccount(account.id)
      })
    )
  }

  async syncAccount(accountId: string): Promise<{ ok: boolean; synced: number; error?: string }> {
    const account = this.db.getAccount(accountId)
    if (!account || account.isDemo) return { ok: true, synced: 0 }

    this.db.updateAccountSyncState(accountId, 'syncing')
    this.onSyncUpdate()

    try {
      let synced = 0
      if (account.provider === 'gmail') {
        const settings = this.db.getSettings()
        if (!settings.googleOAuthClientId || !settings.googleOAuthClientSecret) {
          throw new Error('Google OAuth Client ID/Secret not configured in Settings.')
        }
        const auth = getAuthorizedGoogleClient(
          account.id,
          settings.googleOAuthClientId,
          settings.googleOAuthClientSecret,
          this.secrets
        )
        if (!auth) throw new Error('Gmail authorization expired. Please reconnect account.')
        const res = await syncGmailAccount(account, auth, this.db)
        synced = res.synced
      } else {
        const res = await syncImapAccount(account, this.secrets, this.db)
        synced = res.synced
      }

      this.db.updateAccountSyncState(accountId, 'idle')
      this.onSyncUpdate()
      return { ok: true, synced }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.db.updateAccountSyncState(accountId, 'error', msg)
      this.onSyncUpdate()
      return { ok: false, synced: 0, error: msg }
    }
  }

  async sendEmail(payload: SendEmailPayload): Promise<{ ok: boolean; scheduledId?: string; error?: string }> {
    const account = this.db.getAccount(payload.accountId)
    if (!account) return { ok: false, error: 'Account not found.' }

    if (payload.scheduleAt && payload.scheduleAt > Date.now() + 10_000) {
      const id = randomUUID()
      this.db.insertScheduledEmail({
        id,
        accountId: payload.accountId,
        to: payload.to,
        cc: payload.cc || [],
        bcc: payload.bcc || [],
        subject: payload.subject,
        bodyHtml: payload.bodyHtml,
        bodyText: payload.bodyText,
        replyToThreadId: payload.threadId,
        sendAt: payload.scheduleAt,
        status: 'pending'
      })
      this.onSyncUpdate()
      return { ok: true, scheduledId: id }
    }

    if (account.isDemo) {
      // Save locally into Sent for demo testing
      const msgId = `demo-sent-${Date.now()}`
      const threadId = payload.threadId || `${account.id}|${msgId}`
      this.db.upsertMessageAndThread(
        {
          id: msgId,
          accountId: account.id,
          threadId,
          remoteId: msgId,
          from: { name: account.name, email: account.email },
          to: payload.to.map((e) => ({ name: e.split('@')[0], email: e })),
          cc: (payload.cc || []).map((e) => ({ name: e.split('@')[0], email: e })),
          bcc: [],
          subject: payload.subject,
          snippet: payload.bodyText.slice(0, 140),
          bodyText: payload.bodyText,
          bodyHtml: payload.bodyHtml,
          date: Date.now(),
          isRead: true,
          isStarred: false,
          isDraft: false,
          isSent: true,
          folderRole: 'sent',
          folderName: 'Sent',
          labels: ['Sent'],
          category: 'people',
          hasAttachments: false,
          attachments: [],
          trackersBlocked: 0
        },
        threadId.split('|')[1] || msgId
      )
      this.onSyncUpdate()
      return { ok: true }
    }

    try {
      if (account.provider === 'gmail') {
        const settings = this.db.getSettings()
        const auth = getAuthorizedGoogleClient(
          account.id,
          settings.googleOAuthClientId || '',
          settings.googleOAuthClientSecret || '',
          this.secrets
        )
        if (!auth) throw new Error('Gmail auth token missing.')
        const remoteThreadId = payload.threadId?.includes('|') ? payload.threadId.split('|')[1] : undefined
        await sendGmailMessage(account, auth, payload, remoteThreadId)
      } else {
        await sendImapSmtpMessage(account, this.secrets, payload)
      }
      this.onSyncUpdate()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async syncThreadMutationToRemote(
    threadIds: string[],
    action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'move' | 'delete',
    targetRole?: Folder['role'],
    snapshots?: ThreadMutationSnapshot[]
  ): Promise<void> {
    const settings = this.db.getSettings()
    const snapshotById = new Map((snapshots || []).map((s) => [s.threadId, s]))

    for (const tid of threadIds) {
      const snap = snapshotById.get(tid)
      const detail = snap ? null : this.db.getThreadDetail(tid)
      const accountId = snap?.accountId || detail?.accountId
      const sourceRole = snap?.folderRole || detail?.folderRole || 'inbox'
      const messageRemoteIds = snap?.messageRemoteIds || detail?.messages.map((m) => m.remoteId) || []

      if (!accountId) continue
      const account = this.db.getAccount(accountId)
      if (!account || account.isDemo) continue

      if (account.provider === 'gmail') {
        const auth = getAuthorizedGoogleClient(
          account.id,
          settings.googleOAuthClientId || '',
          settings.googleOAuthClientSecret || '',
          this.secrets
        )
        if (!auth) continue
        const remoteThreadId = tid.split('|')[1]
        if (!remoteThreadId) continue
        try {
          if (action === 'archive' || (action === 'move' && targetRole === 'archive')) {
            await modifyGmailThread(auth, remoteThreadId, [], ['INBOX'])
          } else if (action === 'trash' || action === 'delete' || (action === 'move' && targetRole === 'trash')) {
            await trashGmailThread(auth, remoteThreadId)
          } else if (action === 'read') {
            await modifyGmailThread(auth, remoteThreadId, [], ['UNREAD'])
          } else if (action === 'unread') {
            await modifyGmailThread(auth, remoteThreadId, ['UNREAD'], [])
          } else if (action === 'star') {
            await modifyGmailThread(auth, remoteThreadId, ['STARRED'], [])
          } else if (action === 'unstar') {
            await modifyGmailThread(auth, remoteThreadId, [], ['STARRED'])
          }
        } catch {
          // Keep local state optimistic; next sync reconciles
        }
      } else if (account.provider === 'imap') {
        const uids = messageRemoteIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0)
        if (uids.length === 0) continue
        try {
          await mutateImapMessages(account, this.secrets, {
            uids,
            sourceRole,
            action,
            targetRole
          })
        } catch {
          // Keep local state optimistic; next sync reconciles
        }
      }
    }
  }

  async processScheduledEmails(): Promise<void> {
    const due = this.db.listScheduledEmails().filter((s) => s.sendAt <= Date.now())
    for (const item of due) {
      const res = await this.sendEmail({
        accountId: item.accountId,
        to: item.to,
        cc: item.cc,
        bcc: item.bcc,
        subject: item.subject,
        bodyHtml: item.bodyHtml,
        bodyText: item.bodyText,
        threadId: item.replyToThreadId
      })
      if (res.ok) {
        this.db.updateScheduledStatus(item.id, 'sent')
      } else {
        this.db.updateScheduledStatus(item.id, 'failed', res.error)
      }
    }
  }
}
