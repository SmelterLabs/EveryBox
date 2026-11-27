import { randomUUID } from 'crypto'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type {
  Account,
  Folder,
  FolderCreateInput,
  FolderDeleteInput,
  FolderDeletePreview,
  FolderMutationResult,
  FolderPrefsInput,
  FolderRenameInput,
  SendEmailPayload
} from '../../shared/types'
import { getAuthorizedGoogleClient } from './gmail-oauth'
import { computeGenericErrorBackoffMs, formatRetryTime, parseGmailRateLimit } from './gmail-rate-limit'
import {
  createGmailLabel,
  deleteGmailDraftByMessageId,
  deleteGmailLabel,
  modifyGmailThread,
  renameGmailLabel,
  sendGmailMessage,
  syncGmailAccount,
  syncGmailLabel,
  trashGmailThread,
  updateGmailLabelColor
} from './gmail-sync'
import {
  createImapFolder,
  deleteImapFolder,
  mutateImapMessages,
  renameImapFolder,
  sendImapSmtpMessage,
  syncImapAccount
} from './imap-sync'
import {
  createOutlookFolder,
  deleteOutlookFolder,
  mutateOutlookComMessages,
  renameOutlookFolder,
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
  private backfillStartupTimer: NodeJS.Timeout | null = null
  private backfillTimer: NodeJS.Timeout | null = null
  private backfillRunning = false
  private inFlight = new Set<string>()
  private inFlightFolders = new Set<string>()
  private pendingRemoteMutations = new Map<string, number>()
  private recentFolderMutations = new Map<
    string,
    { accountId: string; remoteId: string; action: 'create' | 'rename-old' | 'delete'; expiresAt: number }
  >()
  private processingScheduled = false

  private recordFolderMutation(
    accountId: string,
    remoteId: string,
    action: 'create' | 'rename-old' | 'delete',
    ttlMs = 90_000
  ): void {
    const key = `${accountId}|${remoteId.toLowerCase()}`
    this.recentFolderMutations.set(key, {
      accountId,
      remoteId,
      action,
      expiresAt: Date.now() + ttlMs
    })
    this.db.recordFolderGuard(accountId, remoteId, action, ttlMs)
  }

  isFolderMutationActive(accountId: string, remoteId: string): boolean {
    const key = `${accountId}|${remoteId.toLowerCase()}`
    const entry = this.recentFolderMutations.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.recentFolderMutations.delete(key)
      return false
    }
    return true
  }

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

    // Gentle background custom-folder backfill so all folders are indexed for local search
    this.backfillStartupTimer = setTimeout(() => {
      this.backfillStartupTimer = null
      void this.runCustomFolderBackfillPass()
    }, 12_000)
    this.backfillTimer = setInterval(() => {
      void this.runCustomFolderBackfillPass()
    }, 30_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.backfillStartupTimer) {
      clearTimeout(this.backfillStartupTimer)
      this.backfillStartupTimer = null
    }
    if (this.backfillTimer) {
      clearInterval(this.backfillTimer)
      this.backfillTimer = null
    }
  }

  /**
   * Gently backfills custom folders in the background so older filed emails appear in local search
   * without waiting for the user to manually click each folder.
   */
  async runCustomFolderBackfillPass(): Promise<void> {
    if (this.backfillRunning) return
    this.backfillRunning = true
    try {
      const accounts = this.db.listAccounts().filter((a) => a.isEnabled && !a.isDemo)
      if (accounts.length === 0) return

      const now = Date.now()
      const staleBeforeMs = now - 12 * 3600_000 // Re-check already-backfilled folders every 12h
      const settings = this.db.getSettings()
      let totalSynced = 0

      for (const account of accounts) {
        if (this.inFlight.has(account.id)) continue
        if (this.isRateLimitBackoff(account)) continue
        if (account.syncBackoffUntil && now < account.syncBackoffUntil) continue

        const batchLimit = account.provider === 'imap' ? 4 : account.provider === 'outlook-local' ? 2 : 1
        const dueFolders = this.db.listFoldersDueForBackfill(account.id, staleBeforeMs, batchLimit)
        if (dueFolders.length === 0) continue

        if (account.provider === 'imap') {
          const unlocked = dueFolders.filter((f) => {
            const key = `${account.id}|${(f.path || f.remoteId || f.name).toLowerCase()}`
            return !this.inFlightFolders.has(key)
          })
          if (unlocked.length === 0) continue
          const lockKeys = unlocked.map((f) => `${account.id}|${(f.path || f.remoteId || f.name).toLowerCase()}`)
          for (const k of lockKeys) this.inFlightFolders.add(k)
          try {
            const res = await syncImapAccount(account, this.secrets, this.db, 100, unlocked)
            totalSynced += res.synced
            for (const f of unlocked) this.db.markFolderSynced(f.id)
          } catch (err) {
            console.warn('[EveryBox backfill IMAP]', account.email, err instanceof Error ? err.message : err)
          } finally {
            for (const k of lockKeys) this.inFlightFolders.delete(k)
          }
        } else if (account.provider === 'outlook-local') {
          for (const folder of dueFolders) {
            if (this.inFlight.has(account.id)) break
            const key = `${account.id}|${(folder.path || folder.remoteId || folder.name).toLowerCase()}`
            if (this.inFlightFolders.has(key)) continue
            this.inFlightFolders.add(key)
            try {
              const res = await syncOutlookComAccount(account, this.db, folder)
              totalSynced += res.synced
              this.db.markFolderSynced(folder.id)
            } catch (err) {
              console.warn('[EveryBox backfill Outlook]', account.email, folder.name, err instanceof Error ? err.message : err)
            } finally {
              this.inFlightFolders.delete(key)
            }
          }
        } else if (account.provider === 'gmail') {
          if (!settings.googleOAuthClientId || !settings.googleOAuthClientSecret) continue
          const auth = getAuthorizedGoogleClient(
            account.id,
            settings.googleOAuthClientId,
            settings.googleOAuthClientSecret,
            this.secrets
          )
          if (!auth) continue
          const folder = dueFolders[0]
          const key = `${account.id}|${(folder.path || folder.remoteId || folder.name).toLowerCase()}`
          if (this.inFlightFolders.has(key)) continue
          this.inFlightFolders.add(key)
          try {
            const res = await syncGmailLabel(account, auth, this.db, folder, 40)
            totalSynced += res.synced
            this.db.markFolderSynced(folder.id)
          } catch (err) {
            const nextErrors = (account.syncConsecutiveErrors || 0) + 1
            const rl = parseGmailRateLimit(err, Date.now(), nextErrors)
            if (rl.isRateLimit && rl.retryAfterMs) {
              const msg = rl.formattedMessage || `Gmail rate-limited — paused until ${formatRetryTime(rl.retryAfterMs)}`
              this.db.updateAccountSyncState(account.id, 'error', msg, rl.retryAfterMs, nextErrors)
              this.onSyncUpdate()
            } else {
              console.warn('[EveryBox backfill Gmail]', account.email, folder.name, err instanceof Error ? err.message : err)
            }
          } finally {
            this.inFlightFolders.delete(key)
          }
        }
      }

      if (totalSynced > 0) {
        this.onSyncUpdate()
      }
    } finally {
      this.backfillRunning = false
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
        const folderLockKey = `${account.id}|${(folder.path || folder.remoteId || folder.name).toLowerCase()}`
        if (this.inFlightFolders.has(folderLockKey)) return
        this.inFlightFolders.add(folderLockKey)
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
            this.db.markFolderSynced(folder.id)
          } else if (account.provider === 'outlook-local') {
            const res = await syncOutlookComAccount(account, this.db, folder)
            totalSynced += res.synced
            this.db.markFolderSynced(folder.id)
          } else {
            const res = await syncImapAccount(account, this.secrets, this.db, 50, folder)
            totalSynced += res.synced
            this.db.markFolderSynced(folder.id)
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
          this.inFlightFolders.delete(folderLockKey)
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
                const removeIds = ['INBOX']
                if (
                  sourceRole === 'custom' &&
                  sourceFolderName &&
                  sourceFolderName.toLowerCase() !== targetFolderName.toLowerCase()
                ) {
                  const sourceFolder = this.db.getFolderByName(account.id, sourceFolderName)
                  if (sourceFolder?.remoteId && sourceFolder.remoteId !== targetFolder.remoteId) {
                    removeIds.push(sourceFolder.remoteId)
                  }
                }
                await modifyGmailThread(auth, remoteThreadId, [targetFolder.remoteId], removeIds)
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

  // ---- Unified Cross-Provider Folder CRUD ----

  getFolderDeletePreview(folderId: string): FolderDeletePreview | null {
    return this.db.getFolderDeletePreview(folderId)
  }

  async createFolder(input: FolderCreateInput): Promise<FolderMutationResult> {
    const cleanName = (input.name || '').trim()
    if (!cleanName) return { ok: false, error: 'Folder name cannot be empty.' }
    const account = this.db.getAccount(input.accountId)
    if (!account) return { ok: false, error: 'Account not found.' }

    if (account.isDemo) {
      const fullPath = input.parentPath ? `${input.parentPath}/${cleanName}` : cleanName
      const folder: Folder = {
        id: `${account.id}|${fullPath}`,
        accountId: account.id,
        remoteId: fullPath,
        name: fullPath,
        path: fullPath,
        parentPath: input.parentPath ?? null,
        delimiter: '/',
        color: input.color ?? null,
        icon: input.icon ?? null,
        role: 'custom',
        unreadCount: 0,
        totalCount: 0,
        isSelectable: true,
        syncEnabled: true
      }
      this.db.upsertFolder(folder)
      this.onSyncUpdate()
      return { ok: true, folder: this.db.getFolderById(folder.id) || folder }
    }

    this.pendingRemoteMutations.set(account.id, (this.pendingRemoteMutations.get(account.id) || 0) + 1)
    try {
      if (account.provider === 'gmail') {
        const settings = this.db.getSettings()
        const auth = getAuthorizedGoogleClient(
          account.id,
          settings.googleOAuthClientId || '',
          settings.googleOAuthClientSecret || '',
          this.secrets
        )
        if (!auth) return { ok: false, error: 'Gmail authorization expired. Please reconnect account.' }
        const fullLabelName = input.parentPath ? `${input.parentPath}/${cleanName}` : cleanName
        const created = await createGmailLabel(auth, fullLabelName, input.color)
        const folder: Folder = {
          id: `${account.id}|${created.id}`,
          accountId: account.id,
          remoteId: created.id,
          name: created.name,
          path: created.name,
          parentPath: input.parentPath ?? null,
          delimiter: '/',
          color: input.color ?? created.color ?? null,
          icon: input.icon ?? null,
          role: 'custom',
          unreadCount: 0,
          totalCount: 0,
          isSelectable: true,
          syncEnabled: true
        }
        this.recordFolderMutation(account.id, created.id, 'create')
        this.db.upsertFolder(folder)
        if (input.color !== undefined || input.icon !== undefined) {
          this.db.updateFolderPrefs(folder.id, { color: input.color, icon: input.icon })
        }
        this.onSyncUpdate()
        return { ok: true, folder: this.db.getFolderById(folder.id) || folder }
      } else if (account.provider === 'outlook-local') {
        const res = await createOutlookFolder(account, cleanName, input.parentPath)
        if (!res.ok || !res.path) {
          return { ok: false, error: res.error || 'Could not create Outlook folder.' }
        }
        const parentFolder = input.parentPath ? this.db.getFolderByName(account.id, input.parentPath) : null
        const displayName = parentFolder ? `${parentFolder.name}/${res.name || cleanName}` : res.name || cleanName
        const folder: Folder = {
          id: `${account.id}|${res.path}`,
          accountId: account.id,
          remoteId: res.path,
          name: displayName,
          path: res.path,
          parentPath: res.parentPath ?? null,
          delimiter: '\\',
          color: input.color ?? null,
          icon: input.icon ?? null,
          role: 'custom',
          unreadCount: 0,
          totalCount: 0,
          isSelectable: true,
          syncEnabled: true
        }
        this.recordFolderMutation(account.id, res.path, 'create')
        this.db.upsertFolder(folder)
        if (input.color !== undefined || input.icon !== undefined) {
          this.db.updateFolderPrefs(folder.id, { color: input.color, icon: input.icon })
        }
        this.onSyncUpdate()
        return { ok: true, folder: this.db.getFolderById(folder.id) || folder }
      } else {
        // IMAP
        const parentFolder = input.parentPath ? this.db.getFolderByName(account.id, input.parentPath) : null
        const delim = parentFolder?.delimiter || '/'
        const segments = input.parentPath ? [...input.parentPath.split(delim).filter(Boolean), cleanName] : [cleanName]
        const created = await createImapFolder(account, this.secrets, segments)
        const folder: Folder = {
          id: `${account.id}|${created.path}`,
          accountId: account.id,
          remoteId: created.path,
          name: created.name,
          path: created.path,
          parentPath: created.parentPath,
          delimiter: created.delimiter,
          color: input.color ?? null,
          icon: input.icon ?? null,
          role: 'custom',
          unreadCount: 0,
          totalCount: 0,
          isSelectable: true,
          syncEnabled: true
        }
        this.recordFolderMutation(account.id, created.path, 'create')
        this.db.upsertFolder(folder)
        if (input.color !== undefined || input.icon !== undefined) {
          this.db.updateFolderPrefs(folder.id, { color: input.color, icon: input.icon })
        }
        this.onSyncUpdate()
        return { ok: true, folder: this.db.getFolderById(folder.id) || folder }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      const nextCount = (this.pendingRemoteMutations.get(account.id) || 1) - 1
      if (nextCount <= 0) this.pendingRemoteMutations.delete(account.id)
      else this.pendingRemoteMutations.set(account.id, nextCount)
    }
  }

  async renameFolder(input: FolderRenameInput): Promise<FolderMutationResult> {
    const cleanLeaf = (input.newName || '').trim()
    if (!cleanLeaf) return { ok: false, error: 'New folder name cannot be empty.' }
    const folder = this.db.getFolderById(input.folderId)
    if (!folder) return { ok: false, error: 'Folder not found.' }
    if (folder.role !== 'custom') return { ok: false, error: 'Cannot rename a system folder.' }
    const account = this.db.getAccount(folder.accountId)
    if (!account) return { ok: false, error: 'Account not found.' }

    const delim = folder.delimiter || '/'
    const descendants = this.db.findDescendantFolders(folder)

    if (account.isDemo) {
      const nextPath = folder.parentPath ? `${folder.parentPath}${delim}${cleanLeaf}` : cleanLeaf
      const updated = this.db.renameFolderCascade(folder.id, nextPath, nextPath, nextPath)
      this.onSyncUpdate()
      return { ok: true, folder: updated || undefined }
    }

    this.pendingRemoteMutations.set(account.id, (this.pendingRemoteMutations.get(account.id) || 0) + 1)
    try {
      if (account.provider === 'gmail') {
        const settings = this.db.getSettings()
        const auth = getAuthorizedGoogleClient(
          account.id,
          settings.googleOAuthClientId || '',
          settings.googleOAuthClientSecret || '',
          this.secrets
        )
        if (!auth) return { ok: false, error: 'Gmail authorization expired. Please reconnect account.' }
        const nextFullName = folder.parentPath ? `${folder.parentPath}/${cleanLeaf}` : cleanLeaf
        const res = await renameGmailLabel(auth, folder.remoteId, folder.path, nextFullName)
        const childRenames = res.childRenames.map((cr) => {
          const match = descendants.find((d) => d.remoteId === cr.remoteId)
          return {
            folderId: match ? match.id : `${account.id}|${cr.remoteId}`,
            newName: cr.newPath,
            newPath: cr.newPath,
            newRemoteId: cr.remoteId
          }
        })
        this.recordFolderMutation(account.id, folder.remoteId, 'create')
        const updated = this.db.renameFolderCascade(folder.id, res.name, res.name, folder.remoteId, childRenames)
        this.onSyncUpdate()
        return { ok: true, folder: updated || undefined }
      } else if (account.provider === 'outlook-local') {
        const res = await renameOutlookFolder(account, folder.path, cleanLeaf)
        if (!res.ok || !res.path) {
          return { ok: false, error: res.error || 'Could not rename Outlook folder.' }
        }
        const oldNamePrefix = folder.name.includes('/') ? folder.name.slice(0, folder.name.lastIndexOf('/')) : ''
        const nextDisplayName = oldNamePrefix ? `${oldNamePrefix}/${res.name || cleanLeaf}` : res.name || cleanLeaf

        this.recordFolderMutation(account.id, folder.remoteId, 'rename-old')
        this.recordFolderMutation(account.id, res.path, 'create')
        for (const d of descendants) {
          this.recordFolderMutation(account.id, d.remoteId, 'rename-old')
        }

        const childRenames = (res.childRenames || [])
          .map((cr) => {
            const match = descendants.find((d) => d.path.toLowerCase() === cr.oldPath.toLowerCase())
            if (!match) return null
            this.recordFolderMutation(account.id, cr.newPath, 'create')
            const cNewName = match.name.toLowerCase().startsWith(`${folder.name.toLowerCase()}/`)
              ? `${nextDisplayName}${match.name.slice(folder.name.length)}`
              : match.name
            return {
              folderId: match.id,
              newName: cNewName,
              newPath: cr.newPath,
              newRemoteId: cr.newPath
            }
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x))

        const updated = this.db.renameFolderCascade(folder.id, nextDisplayName, res.path, res.path, childRenames)
        this.onSyncUpdate()
        return { ok: true, folder: updated || undefined }
      } else {
        // IMAP
        const nextPath = folder.parentPath ? `${folder.parentPath}${delim}${cleanLeaf}` : cleanLeaf
        const res = await renameImapFolder(account, this.secrets, folder.path, nextPath)

        this.recordFolderMutation(account.id, folder.remoteId, 'rename-old')
        this.recordFolderMutation(account.id, res.newPath, 'create')
        for (const d of descendants) {
          this.recordFolderMutation(account.id, d.remoteId, 'rename-old')
        }

        const childRenames = res.childRenames
          .map((cr) => {
            const match = descendants.find((d) => d.path.toLowerCase() === cr.oldPath.toLowerCase())
            if (!match) return null
            this.recordFolderMutation(account.id, cr.newPath, 'create')
            const parts = cr.newPath.split(res.delimiter)
            return {
              folderId: match.id,
              newName: parts[parts.length - 1] || match.name,
              newPath: cr.newPath,
              newRemoteId: cr.newPath
            }
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x))

        const updated = this.db.renameFolderCascade(folder.id, cleanLeaf, res.newPath, res.newPath, childRenames)
        this.onSyncUpdate()
        return { ok: true, folder: updated || undefined }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      const nextCount = (this.pendingRemoteMutations.get(account.id) || 1) - 1
      if (nextCount <= 0) this.pendingRemoteMutations.delete(account.id)
      else this.pendingRemoteMutations.set(account.id, nextCount)
    }
  }

  async deleteFolder(input: FolderDeleteInput): Promise<FolderMutationResult> {
    const folder = this.db.getFolderById(input.folderId)
    if (!folder) return { ok: false, error: 'Folder not found.' }
    if (folder.role !== 'custom') return { ok: false, error: 'Cannot delete a system folder.' }
    const account = this.db.getAccount(folder.accountId)
    if (!account) return { ok: false, error: 'Account not found.' }

    const deleteChildren = input.deleteChildren !== false
    const strategy =
      input.strategy || (account.provider === 'gmail' ? 'remove-label' : 'move-messages')
    const moveMessagesToRole =
      strategy === 'move-messages' ? input.moveMessagesToRole || 'archive' : undefined

    const descendants = deleteChildren ? this.db.findDescendantFolders(folder) : []
    // Arm 90s TTL guard before remote call so an in-flight sync cannot resurrect the folder
    this.recordFolderMutation(account.id, folder.remoteId, 'delete')
    for (const d of descendants) {
      this.recordFolderMutation(account.id, d.remoteId, 'delete')
    }

    if (account.isDemo) {
      const { disabledRuleNames } = this.db.deleteFolderCascade(folder.id, {
        strategy,
        moveMessagesToRole,
        deleteChildren
      })
      this.onSyncUpdate()
      return { ok: true, disabledRuleNames }
    }

    this.pendingRemoteMutations.set(account.id, (this.pendingRemoteMutations.get(account.id) || 0) + 1)
    try {
      if (account.provider === 'gmail') {
        const settings = this.db.getSettings()
        const auth = getAuthorizedGoogleClient(
          account.id,
          settings.googleOAuthClientId || '',
          settings.googleOAuthClientSecret || '',
          this.secrets
        )
        if (!auth) return { ok: false, error: 'Gmail authorization expired. Please reconnect account.' }
        await deleteGmailLabel(auth, folder.remoteId, {
          deleteChildren,
          oldPath: folder.path
        })
      } else if (account.provider === 'outlook-local') {
        const res = await deleteOutlookFolder(account, folder.path, { moveMessagesToRole })
        if (!res.ok) return { ok: false, error: res.error || 'Could not delete Outlook folder.' }
      } else {
        await deleteImapFolder(account, this.secrets, folder.path, {
          moveMessagesToRole,
          deleteChildren
        })
      }

      const { disabledRuleNames } = this.db.deleteFolderCascade(folder.id, {
        strategy,
        moveMessagesToRole,
        deleteChildren
      })
      this.onSyncUpdate()
      return { ok: true, disabledRuleNames }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      const nextCount = (this.pendingRemoteMutations.get(account.id) || 1) - 1
      if (nextCount <= 0) this.pendingRemoteMutations.delete(account.id)
      else this.pendingRemoteMutations.set(account.id, nextCount)
    }
  }

  async updateFolderPrefs(input: FolderPrefsInput): Promise<FolderMutationResult> {
    const existing = this.db.getFolderById(input.folderId)
    if (!existing) return { ok: false, error: 'Folder not found.' }

    const { folderId, ...prefs } = input
    const updated = this.db.updateFolderPrefs(folderId, prefs)
    if (!updated) return { ok: false, error: 'Could not update folder preferences.' }

    // Best-effort sync color to Gmail when changing color on a custom Gmail label
    if (prefs.color !== undefined && existing.role === 'custom') {
      const account = this.db.getAccount(existing.accountId)
      if (account && !account.isDemo && account.provider === 'gmail' && !this.isRateLimitBackoff(account)) {
        try {
          const settings = this.db.getSettings()
          const auth = getAuthorizedGoogleClient(
            account.id,
            settings.googleOAuthClientId || '',
            settings.googleOAuthClientSecret || '',
            this.secrets
          )
          if (auth) {
            await updateGmailLabelColor(auth, existing.remoteId, prefs.color)
          }
        } catch {
          // Local color pref is already saved; don't fail the user's pref edit on remote error
        }
      }
    }

    this.onSyncUpdate()
    return { ok: true, folder: updated }
  }
}
