import { randomUUID } from 'crypto'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { Account, Folder, SendEmailPayload } from '../../shared/types'
import { getAuthorizedGoogleClient } from './gmail-oauth'
import { computeGenericErrorBackoffMs, formatRetryTime, parseGmailRateLimit } from './gmail-rate-limit'
import {
  deleteGmailDraftByMessageId,
  modifyGmailThread,
  sendGmailMessage,
  syncGmailAccount,
  syncGmailLabel,
  trashGmailThread
} from './gmail-sync'
import { mutateImapMessages, sendImapSmtpMessage, syncImapAccount } from './imap-sync'
import {
  mutateOutlookComMessages,
  sendOrSaveOutlookComMessage,
  syncOutlookComAccount
} from './outlook-com-sync'

export interface ThreadMutationSnapshot {
  threadId: string
  accountId: string
  folderRole: Folder['role']
  folderName?: string
  messageRemoteIds: string[]
  messageFolders?: { remoteId: string; folderRole: Folder['role']; folderName?: string }[]
}

export class SyncManager {
  private timer: NodeJS.Timeout | null = null
  private inFlight = new Set<string>()
  private pendingRemoteMutations = new Map<string, number>()
  private processingScheduled = false

  constructor(
    private db: GlassmailDB,
    private secrets: SecretStore,
    private onSyncUpdate: () => void,
    private onThreadsSynced?: (threadIds: string[]) => void
  ) {}

  setOnThreadsSynced(cb: (threadIds: string[]) => void): void {
    this.onThreadsSynced = cb
  }

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

  private isRateLimitBackoff(account: Account): boolean {
    return Boolean(
      account.provider === 'gmail' &&
        account.syncBackoffUntil &&
        Date.now() < account.syncBackoffUntil &&
        account.syncError?.startsWith('Gmail rate-limited')
    )
  }

  async syncAllAccounts(force = true): Promise<void> {
    const accounts = this.db.listAccounts().filter((a) => a.isEnabled && !a.isDemo)
    if (accounts.length === 0) return
    const now = Date.now()

    await Promise.all(
      accounts.map(async (account) => {
        if (this.inFlight.has(account.id)) return
        if (!force && (this.pendingRemoteMutations.get(account.id) || 0) > 0) return
        // Never bypass an active Gmail 429/rate-limit lockout (calling early resets Google's penalty timer)
        if (this.isRateLimitBackoff(account)) return
        if (!force && account.syncBackoffUntil && now < account.syncBackoffUntil) return
        if (!force && account.lastSyncAt && now - account.lastSyncAt < 60_000) return
        await this.syncAccount(account.id, { ignoreGenericBackoff: force })
      })
    )
  }

  async syncAccount(
    accountId: string,
    opts?: { ignoreGenericBackoff?: boolean; ignoreRateLimit?: boolean }
  ): Promise<{ ok: boolean; synced: number; error?: string }> {
    if (this.inFlight.has(accountId)) {
      return { ok: true, synced: 0 }
    }
    const account = this.db.getAccount(accountId)
    if (!account || account.isDemo) return { ok: true, synced: 0 }

    const now = Date.now()
    if (account.syncBackoffUntil && now < account.syncBackoffUntil) {
      const rateLimited = this.isRateLimitBackoff(account)
      if ((rateLimited && !opts?.ignoreRateLimit) || (!rateLimited && !opts?.ignoreGenericBackoff)) {
        return {
          ok: false,
          synced: 0,
          error: account.syncError || `Sync paused until ${formatRetryTime(account.syncBackoffUntil)}`
        }
      }
    }

    this.inFlight.add(accountId)
    this.db.beginSyncThreadCapture(accountId)
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
      } else if (account.provider === 'outlook-local') {
        const res = await syncOutlookComAccount(account, this.db)
        synced = res.synced
      } else {
        const res = await syncImapAccount(account, this.secrets, this.db)
        synced = res.synced
      }

      const touchedThreadIds = this.db.endSyncThreadCapture(accountId)
      this.db.updateAccountSyncState(accountId, 'idle')
      this.onSyncUpdate()
      if (touchedThreadIds.length > 0) {
        this.onThreadsSynced?.(touchedThreadIds)
      }
      return { ok: true, synced }
    } catch (err) {
      this.db.endSyncThreadCapture(accountId)
      const nextErrors = (account.syncConsecutiveErrors || 0) + 1
      const errNow = Date.now()
      if (account.provider === 'gmail') {
        const rl = parseGmailRateLimit(err, errNow, nextErrors)
        if (rl.isRateLimit && rl.retryAfterMs) {
          const msg = rl.formattedMessage || `Gmail rate-limited — paused until ${formatRetryTime(rl.retryAfterMs)}`
          console.warn('[EveryBox Gmail rate-limit]', account.email, msg)
          this.db.updateAccountSyncState(accountId, 'error', msg, rl.retryAfterMs, nextErrors)
          this.onSyncUpdate()
          return { ok: false, synced: 0, error: msg }
        }
      }
      const msg = err instanceof Error ? err.message : String(err)
      const backoffUntil = computeGenericErrorBackoffMs(nextErrors, errNow)
      this.db.updateAccountSyncState(accountId, 'error', msg, backoffUntil, nextErrors)
      this.onSyncUpdate()
      return { ok: false, synced: 0, error: msg }
    } finally {
      this.inFlight.delete(accountId)
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
      this.onThreadsSynced?.([threadId])
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
        if (payload.draftRemoteId) {
          await deleteGmailDraftByMessageId(auth, payload.draftRemoteId)
        }
      } else if (account.provider === 'outlook-local') {
        const res = await sendOrSaveOutlookComMessage(account, payload, 'send')
        if (!res.ok) throw new Error(res.error || 'Could not send via Classic Outlook.')
        if (payload.draftRemoteId) {
          await mutateOutlookComMessages(account, {
            entryIds: [payload.draftRemoteId],
            action: 'delete'
          }).catch(() => undefined)
        }
      } else {
        await sendImapSmtpMessage(account, this.secrets, payload)
        if (payload.draftRemoteId) {
          const uid = Number(payload.draftRemoteId)
          if (Number.isFinite(uid) && uid > 0) {
            await mutateImapMessages(account, this.secrets, {
              uids: [uid],
              sourceRole: 'drafts',
              action: 'delete'
            }).catch(() => undefined)
          }
        }
      }
      if (payload.draftThreadId) {
        this.db.deleteThreadsPermanently([payload.draftThreadId])
      } else if (payload.draftRemoteId) {
        this.db.removeLocalMessagesByRemoteIds(account.id, [payload.draftRemoteId])
      }
      if (payload.threadId) {
        this.db.deletePreDraft(payload.threadId)
      }
      this.onSyncUpdate()
      // Refresh this account in the background so the newly sent message appears in Sent promptly
      void this.syncAccount(account.id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async syncFolder(folderName: string, accountIds?: string[]): Promise<{ ok: boolean; synced: number }> {
    const accounts = this.db
      .listAccounts()
      .filter((a) => a.isEnabled && !a.isDemo && (!accountIds || accountIds.length === 0 || accountIds.includes(a.id)))
    let totalSynced = 0
    const settings = this.db.getSettings()

    await Promise.all(
      accounts.map(async (account) => {
        if (this.isRateLimitBackoff(account)) return
        const folder = this.db.getFolderByName(account.id, folderName)
        if (!folder) return
        let touched: string[] = []
        try {
          this.db.beginSyncThreadCapture(account.id)
          if (account.provider === 'gmail') {
            if (!settings.googleOAuthClientId || !settings.googleOAuthClientSecret) return
            const auth = getAuthorizedGoogleClient(
              account.id,
              settings.googleOAuthClientId,
              settings.googleOAuthClientSecret,
              this.secrets
            )
            if (!auth) return
            const res = await syncGmailLabel(account, auth, this.db, folder, 50)
            totalSynced += res.synced
          } else if (account.provider === 'outlook-local') {
            const res = await syncOutlookComAccount(account, this.db, folder)
            totalSynced += res.synced
          } else {
            const res = await syncImapAccount(account, this.secrets, this.db, 50, folder)
            totalSynced += res.synced
          }
        } catch (err) {
          if (account.provider === 'gmail') {
            const nextErrors = (account.syncConsecutiveErrors || 0) + 1
            const rl = parseGmailRateLimit(err, Date.now(), nextErrors)
            if (rl.isRateLimit && rl.retryAfterMs) {
              const msg = rl.formattedMessage || `Gmail rate-limited — paused until ${formatRetryTime(rl.retryAfterMs)}`
              console.warn('[EveryBox Gmail rate-limit]', account.email, msg)
              this.db.updateAccountSyncState(account.id, 'error', msg, rl.retryAfterMs, nextErrors)
              this.onSyncUpdate()
              return
            }
          }
          console.error('[EveryBox syncFolder error]', account.email, folderName, err)
        } finally {
          touched = this.db.endSyncThreadCapture(account.id)
          if (touched.length > 0) {
            this.onThreadsSynced?.(touched)
          }
        }
      })
    )

    if (totalSynced > 0) {
      this.onSyncUpdate()
    }
    return { ok: true, synced: totalSynced }
  }

  async syncThreadMutationToRemote(
    threadIds: string[],
    action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'move' | 'delete',
    targetRole?: Folder['role'],
    snapshots?: ThreadMutationSnapshot[],
    targetFolderName?: string
  ): Promise<void> {
    const settings = this.db.getSettings()
    const snapshotById = new Map((snapshots || []).map((s) => [s.threadId, s]))

    for (const tid of threadIds) {
      const snap = snapshotById.get(tid)
      const detail = snap ? null : this.db.getThreadDetail(tid)
      const accountId = snap?.accountId || detail?.accountId
      const sourceRole = snap?.folderRole || detail?.folderRole || 'inbox'
      const sourceFolderName = snap?.folderName || detail?.folderName
      const messageRemoteIds = snap?.messageRemoteIds || detail?.messages.map((m) => m.remoteId) || []
      const messageFolders =
        snap?.messageFolders ||
        detail?.messages.map((m) => ({
          remoteId: m.remoteId,
          folderRole: m.folderRole,
          folderName: m.folderName
        })) ||
        []

      if (!accountId) continue
      const account = this.db.getAccount(accountId)
      if (!account || account.isDemo) continue

      this.pendingRemoteMutations.set(accountId, (this.pendingRemoteMutations.get(accountId) || 0) + 1)
      try {
        if (account.provider === 'gmail') {
          if (this.isRateLimitBackoff(account)) continue
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
            } else if (action === 'move' && targetRole === 'custom' && targetFolderName) {
              const targetFolder = this.db.getFolderByName(account.id, targetFolderName)
              if (targetFolder?.remoteId) {
                await modifyGmailThread(auth, remoteThreadId, [targetFolder.remoteId], ['INBOX'])
              }
            } else if (action === 'move' && targetRole === 'inbox') {
              await modifyGmailThread(auth, remoteThreadId, ['INBOX'], ['TRASH', 'SPAM'])
            } else if (action === 'move' && targetRole === 'junk') {
              await modifyGmailThread(auth, remoteThreadId, ['SPAM'], ['INBOX'])
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
        } else if (account.provider === 'outlook-local') {
          const entryIds = messageRemoteIds.filter(Boolean)
          if (entryIds.length === 0) continue
          try {
            await mutateOutlookComMessages(account, {
              entryIds,
              action,
              targetRole,
              targetFolderName
            })
          } catch {
            // Keep local state optimistic; next sync reconciles
          }
        } else if (account.provider === 'imap') {
          // Group UIDs by their actual source IMAP folder so multi-folder threads (e.g. Inbox + Sent) move cleanly
          const groups = new Map<string, { role: Folder['role']; name?: string; uids: number[] }>()
          if (messageFolders.length > 0) {
            for (const mf of messageFolders) {
              const uid = Number(mf.remoteId)
              if (!Number.isFinite(uid) || uid <= 0) continue
              // When moving/trashing from Inbox, don't yank Sent copies out of Sent
              if ((action === 'trash' || action === 'archive' || action === 'move') && sourceRole === 'inbox' && mf.folderRole === 'sent') {
                continue
              }
              const key = `${mf.folderRole}|${mf.folderName || ''}`
              const g = groups.get(key) || { role: mf.folderRole, name: mf.folderName, uids: [] }
              g.uids.push(uid)
              groups.set(key, g)
            }
          } else {
            const uids = messageRemoteIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0)
            if (uids.length > 0) {
              groups.set(`${sourceRole}|${sourceFolderName || ''}`, { role: sourceRole, name: sourceFolderName, uids })
            }
          }
          for (const g of groups.values()) {
            try {
              await mutateImapMessages(account, this.secrets, {
                uids: g.uids,
                sourceRole: g.role,
                sourceFolderName: g.name,
                action,
                targetRole,
                targetFolderName
              })
            } catch {
              // Keep local state optimistic; next sync reconciles
            }
          }
        }
      } finally {
        const nextCount = (this.pendingRemoteMutations.get(accountId) || 1) - 1
        if (nextCount <= 0) this.pendingRemoteMutations.delete(accountId)
        else this.pendingRemoteMutations.set(accountId, nextCount)
      }
    }
  }

  async processScheduledEmails(): Promise<void> {
    if (this.processingScheduled) return
    this.processingScheduled = true
    try {
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
    } finally {
      this.processingScheduled = false
    }
  }
}
