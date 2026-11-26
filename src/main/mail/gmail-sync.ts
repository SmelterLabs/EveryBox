import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { google, type gmail_v1 } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { GlassmailDB } from '../db/database'
import type { Account, Attachment, EmailAddress, Folder, Message, SendEmailPayload } from '../../shared/types'
import { cleanSnippet, decodeHtmlEntities } from '../../shared/html-entities'
import {
  classifyCategory,
  detectScamWarning,
  extractSignInCode,
  parseIcsInvite,
  parseListUnsubscribe,
  stripTrackingPixels
} from './classifier'
import { isGmailNotFoundError } from './gmail-rate-limit'

const FETCH_CHUNK_SIZE = 3
const MAX_HISTORY_PAGES = 5
const LABELS_REFRESH_INTERVAL_MS = 15 * 60_000
const lastLabelsRefreshByAccount = new Map<string, number>()

const GMAIL_BUILTIN_LABELS = new Set([
  'INBOX',
  'SENT',
  'DRAFT',
  'SPAM',
  'TRASH',
  'UNREAD',
  'STARRED',
  'IMPORTANT',
  'CHAT',
  'CATEGORY_PERSONAL',
  'CATEGORY_SOCIAL',
  'CATEGORY_PROMOTIONS',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS'
])

function parseAddressString(raw?: string | null): EmailAddress {
  if (!raw) return { name: '', email: '' }
  const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/)
  if (match) {
    return { name: (match[1] || '').trim() || match[2].trim(), email: match[2].trim() }
  }
  const email = raw.trim()
  return { name: email.split('@')[0] || email, email }
}

function parseAddressList(raw?: string | null): EmailAddress[] {
  if (!raw) return []
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((s) => parseAddressString(s.trim()))
    .filter((a) => a.email)
}

function decodeBase64Url(data?: string | null): string {
  if (!data) return ''
  const norm = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(norm, 'base64').toString('utf8')
}

function extractBodyParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
  messageId: string
): { text: string; html: string; attachments: Attachment[]; icsRaw?: string } {
  let text = ''
  let html = ''
  let icsRaw: string | undefined
  const attachments: Attachment[] = []

  const walk = (part?: gmail_v1.Schema$MessagePart) => {
    if (!part) return
    const mime = (part.mimeType || '').toLowerCase()
    if (part.filename && part.filename.length > 0) {
      const contentIdHeader = part.headers?.find((h) => h.name?.toLowerCase() === 'content-id')?.value || undefined
      attachments.push({
        id: `${messageId}|${part.partId || attachments.length}`,
        messageId,
        filename: part.filename,
        mimeType: mime || 'application/octet-stream',
        size: Number(part.body?.size || 0),
        contentId: contentIdHeader?.replace(/[<>]/g, ''),
        isInline: Boolean(contentIdHeader),
        remoteAttachmentId: part.body?.attachmentId || undefined
      })
      if ((mime === 'text/calendar' || part.filename.toLowerCase().endsWith('.ics')) && part.body?.data) {
        icsRaw = decodeBase64Url(part.body.data)
      }
    } else if (mime === 'text/plain' && part.body?.data) {
      text += decodeBase64Url(part.body.data)
    } else if (mime === 'text/html' && part.body?.data) {
      html += decodeBase64Url(part.body.data)
    } else if (mime === 'text/calendar' && part.body?.data) {
      icsRaw = decodeBase64Url(part.body.data)
    }
    if (part.parts) {
      for (const child of part.parts) walk(child)
    }
  }

  walk(payload)
  if (!text && html) {
    text = decodeHtmlEntities(
      html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/\s+/g, ' ')
      .trim()
  }
  return { text, html, attachments, icsRaw }
}

function mapGmailLabelsToRole(labelIds: string[]): Folder['role'] {
  if (labelIds.includes('TRASH')) return 'trash'
  if (labelIds.includes('SPAM')) return 'junk'
  if (labelIds.includes('DRAFT')) return 'drafts'
  if (labelIds.includes('INBOX')) return 'inbox'
  if (labelIds.includes('SENT')) return 'sent'
  return 'archive'
}

function folderNameForRole(role: Folder['role']): string {
  if (role === 'inbox') return 'Inbox'
  if (role === 'junk') return 'Spam'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function buildLabelMapFromDb(db: GlassmailDB, accountId: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of db.listFolders([accountId])) {
    if (f.remoteId) map.set(f.remoteId, f.name)
  }
  return map
}

async function refreshGmailLabels(
  gmail: gmail_v1.Gmail,
  account: Account,
  db: GlassmailDB
): Promise<Map<string, string>> {
  const labelsRes = await gmail.users.labels.list({ userId: 'me' })
  const labelMap = new Map<string, string>()
  const gmailSystemFolders: Record<string, { name: string; role: Folder['role'] }> = {
    INBOX: { name: 'Inbox', role: 'inbox' },
    SENT: { name: 'Sent', role: 'sent' },
    DRAFT: { name: 'Drafts', role: 'drafts' },
    SPAM: { name: 'Spam', role: 'junk' },
    TRASH: { name: 'Trash', role: 'trash' }
  }
  for (const lbl of labelsRes.data.labels || []) {
    if (!lbl.id || !lbl.name) continue
    labelMap.set(lbl.id, lbl.name)
    const sys = gmailSystemFolders[lbl.id]
    if (sys) {
      db.upsertFolder({
        id: `${account.id}|${lbl.id}`,
        accountId: account.id,
        remoteId: lbl.id,
        name: sys.name,
        path: lbl.id,
        role: sys.role,
        unreadCount: Number(lbl.messagesUnread || 0),
        totalCount: Number(lbl.messagesTotal || 0)
      })
    } else if (lbl.type === 'user') {
      db.upsertFolder({
        id: `${account.id}|${lbl.id}`,
        accountId: account.id,
        remoteId: lbl.id,
        name: lbl.name,
        path: lbl.name,
        role: 'custom',
        unreadCount: Number(lbl.messagesUnread || 0),
        totalCount: Number(lbl.messagesTotal || 0)
      })
    }
  }
  lastLabelsRefreshByAccount.set(account.id, Date.now())
  return labelMap
}

function applyLabelIdsLocally(
  db: GlassmailDB,
  accountId: string,
  remoteId: string,
  labelIds: string[],
  labelMap: Map<string, string>
): boolean {
  const folderRole = mapGmailLabelsToRole(labelIds)
  return db.updateLocalMessageLabelsByRemoteId(accountId, remoteId, {
    isRead: !labelIds.includes('UNREAD'),
    isStarred: labelIds.includes('STARRED'),
    isDraft: labelIds.includes('DRAFT'),
    folderRole,
    folderName: folderNameForRole(folderRole),
    labels: labelIds.map((id) => labelMap.get(id) || id)
  })
}

async function syncGmailIncremental(
  account: Account,
  gmail: gmail_v1.Gmail,
  db: GlassmailDB,
  savedHistoryId: string,
  maxMessages: number
): Promise<{ synced: number; mode: 'incremental' } | null> {
  const records: gmail_v1.Schema$History[] = []
  let latestHistoryId = savedHistoryId
  let pageToken: string | undefined
  let pages = 0

  while (pages < MAX_HISTORY_PAGES) {
    let res: { data: gmail_v1.Schema$ListHistoryResponse }
    try {
      res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: savedHistoryId,
        maxResults: 100,
        pageToken,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']
      })
    } catch (err) {
      if (isGmailNotFoundError(err)) {
        // History ID expired (e.g. offline for weeks) -> fall back cleanly to bounded full sync
        db.clearGmailHistoryId(account.id)
        return null
      }
      throw err
    }

    if (res.data.historyId) latestHistoryId = String(res.data.historyId)
    if (res.data.history && res.data.history.length > 0) {
      records.push(...res.data.history)
    }
    pageToken = res.data.nextPageToken || undefined
    pages += 1
    if (!pageToken) break
  }

  // If too many history pages accumulated while offline, fall back to bounded full sync
  if (pageToken) {
    return null
  }

  let labelMap = buildLabelMapFromDb(db, account.id)
  const lastRefresh = lastLabelsRefreshByAccount.get(account.id) || 0
  const labelsStale = labelMap.size === 0 || Date.now() - lastRefresh >= LABELS_REFRESH_INTERVAL_MS

  if (records.length === 0) {
    if (labelsStale) {
      await refreshGmailLabels(gmail, account, db)
    }
    db.setGmailHistoryId(account.id, latestHistoryId)
    return { synced: 0, mode: 'incremental' }
  }

  const deletedIds = new Set<string>()
  const addedIds = new Set<string>()
  // Map of remoteId -> latest full labelIds array (or null if Gmail omitted message.labelIds)
  const touchedLabels = new Map<string, string[] | null>()
  const referencedLabelIds = new Set<string>()

  for (const h of records) {
    for (const item of h.messagesAdded || []) {
      const id = item.message?.id
      if (!id) continue
      deletedIds.delete(id)
      addedIds.add(id)
      if (item.message?.labelIds) {
        touchedLabels.set(id, item.message.labelIds)
        for (const lid of item.message.labelIds) referencedLabelIds.add(lid)
      }
    }
    for (const item of h.messagesDeleted || []) {
      const id = item.message?.id
      if (!id) continue
      deletedIds.add(id)
      addedIds.delete(id)
      touchedLabels.delete(id)
    }
    for (const item of h.labelsAdded || []) {
      const id = item.message?.id
      if (!id || deletedIds.has(id)) continue
      const lids = item.message?.labelIds ?? null
      touchedLabels.set(id, lids)
      for (const lid of lids || item.labelIds || []) referencedLabelIds.add(lid)
    }
    for (const item of h.labelsRemoved || []) {
      const id = item.message?.id
      if (!id || deletedIds.has(id)) continue
      const lids = item.message?.labelIds ?? null
      touchedLabels.set(id, lids)
      for (const lid of lids || item.labelIds || []) referencedLabelIds.add(lid)
    }
  }

  let hasUnknownLabel = false
  for (const lid of referencedLabelIds) {
    if (!GMAIL_BUILTIN_LABELS.has(lid) && !labelMap.has(lid)) {
      hasUnknownLabel = true
      break
    }
  }
  if (labelsStale || hasUnknownLabel) {
    labelMap = await refreshGmailLabels(gmail, account, db)
  }

  if (deletedIds.size > 0) {
    db.removeLocalMessagesByRemoteIds(account.id, Array.from(deletedIds))
  }

  const knownRemoteIds = db.getKnownRemoteIds(account.id)
  const idsToFetchFull: string[] = []
  const idsToFetchFullSet = new Set<string>()
  const knownIdsNeedingMinimal: string[] = []
  let synced = 0

  for (const id of addedIds) {
    if (!knownRemoteIds.has(id) && !idsToFetchFullSet.has(id)) {
      idsToFetchFullSet.add(id)
      idsToFetchFull.push(id)
    }
  }

  for (const [id, labelIds] of touchedLabels.entries()) {
    if (knownRemoteIds.has(id)) {
      if (labelIds) {
        if (applyLabelIdsLocally(db, account.id, id, labelIds, labelMap)) {
          synced += 1
        }
      } else {
        knownIdsNeedingMinimal.push(id)
      }
    } else if (
      !idsToFetchFullSet.has(id) &&
      labelIds &&
      (labelIds.includes('INBOX') || labelIds.includes('SENT') || labelIds.includes('DRAFT'))
    ) {
      // A previously uncached message was moved into Inbox/Sent/Drafts -> fetch it now
      idsToFetchFullSet.add(id)
      idsToFetchFull.push(id)
    }
  }

  // Lightweight minimal fetch (1 quota unit) only for cached messages whose history entry omitted labelIds
  for (let i = 0; i < knownIdsNeedingMinimal.length; i += FETCH_CHUNK_SIZE) {
    const chunk = knownIdsNeedingMinimal.slice(i, i + FETCH_CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (id) => {
        try {
          const minRes = await gmail.users.messages.get({ userId: 'me', id, format: 'minimal' })
          if (minRes.data.labelIds && applyLabelIdsLocally(db, account.id, id, minRes.data.labelIds, labelMap)) {
            synced += 1
          }
        } catch (err) {
          if (isGmailNotFoundError(err)) {
            db.removeLocalMessagesByRemoteIds(account.id, [id])
            return
          }
          throw err
        }
      })
    )
  }

  // Cap full fetches per pass (keep newest additions) so burst spikes never happen
  const cappedRefs = idsToFetchFull.slice(-maxMessages).map((id) => ({ id }))
  if (cappedRefs.length > 0) {
    synced += await fetchAndUpsertGmailMessages(gmail, account, db, cappedRefs, labelMap)
  }

  db.setGmailHistoryId(account.id, latestHistoryId)
  return { synced, mode: 'incremental' }
}

async function syncGmailFull(
  account: Account,
  gmail: gmail_v1.Gmail,
  db: GlassmailDB,
  maxMessages: number
): Promise<{ synced: number; mode: 'full' }> {
  // Capture baseline historyId BEFORE listing so any message arriving mid-sync is caught on the next incremental poll
  const profileRes = await gmail.users.getProfile({ userId: 'me' })
  const baselineHistoryId = profileRes.data.historyId ? String(profileRes.data.historyId) : null

  const labelMap = await refreshGmailLabels(gmail, account, db)

  // Fetch recent messages across INBOX, SENT, SPAM, TRASH + real Drafts via q:'in:draft'
  // Never swallow errors into empty lists: a 429 or transient failure must throw so local cache is never wiped.
  const buckets: { labelId: string; maxResults: number; includeSpamTrash?: boolean }[] = [
    { labelId: 'INBOX', maxResults: Math.min(maxMessages, 50) },
    { labelId: 'SENT', maxResults: 30 },
    { labelId: 'SPAM', maxResults: 20, includeSpamTrash: true },
    { labelId: 'TRASH', maxResults: 20, includeSpamTrash: true }
  ]

  const [listResults, draftsRes] = await Promise.all([
    Promise.all(
      buckets.map((b) =>
        gmail.users.messages.list({
          userId: 'me',
          labelIds: [b.labelId],
          maxResults: b.maxResults,
          includeSpamTrash: b.includeSpamTrash ?? false
        })
      )
    ),
    gmail.users.messages.list({ userId: 'me', q: 'in:draft', maxResults: 25 })
  ])

  const inboxBucket = listResults[0]?.data.messages || []
  const inboxLiveIds = inboxBucket.map((m) => m.id).filter((id): id is string => Boolean(id))
  const inboxFetchCapped = inboxLiveIds.length >= Math.min(maxMessages, 50)
  let minSyncedInboxDate: number | undefined

  const draftRefs: gmail_v1.Schema$Message[] = draftsRes.data.messages || []
  const draftLiveIds = draftRefs.map((m) => m.id).filter((id): id is string => Boolean(id))
  const draftFetchCapped = draftLiveIds.length >= 25
  let minSyncedDraftDate: number | undefined

  const seenIds = new Set<string>()
  const messageRefs: gmail_v1.Schema$Message[] = []
  for (const res of listResults) {
    for (const ref of res.data.messages || []) {
      if (ref.id && !seenIds.has(ref.id)) {
        seenIds.add(ref.id)
        messageRefs.push(ref)
      }
    }
  }
  for (const ref of draftRefs) {
    if (ref.id && !seenIds.has(ref.id)) {
      seenIds.add(ref.id)
      messageRefs.push(ref)
    }
  }

  // Skip messages already cached in SQLite — never re-download full bodies for unchanged mail
  const knownRemoteIds = db.getKnownRemoteIds(account.id)
  const missingRefs = messageRefs.filter((ref) => ref.id && !knownRemoteIds.has(ref.id))

  const synced = await fetchAndUpsertGmailMessages(gmail, account, db, missingRefs, labelMap, (msg, internalDate) => {
    if (msg.folderRole === 'inbox' && internalDate > 0) {
      if (minSyncedInboxDate === undefined || internalDate < minSyncedInboxDate) {
        minSyncedInboxDate = internalDate
      }
    } else if (msg.folderRole === 'drafts' && internalDate > 0) {
      if (minSyncedDraftDate === undefined || internalDate < minSyncedDraftDate) {
        minSyncedDraftDate = internalDate
      }
    }
  })

  // Include cached message dates when computing the capped window floor so reconciliation never evicts older messages
  const cachedMinInboxDate = db.getMinMessageDateForRemoteIds(account.id, inboxLiveIds)
  if (cachedMinInboxDate !== undefined) {
    minSyncedInboxDate =
      minSyncedInboxDate === undefined ? cachedMinInboxDate : Math.min(minSyncedInboxDate, cachedMinInboxDate)
  }
  const cachedMinDraftDate = db.getMinMessageDateForRemoteIds(account.id, draftLiveIds)
  if (cachedMinDraftDate !== undefined) {
    minSyncedDraftDate =
      minSyncedDraftDate === undefined ? cachedMinDraftDate : Math.min(minSyncedDraftDate, cachedMinDraftDate)
  }

  // Reconcile Gmail INBOX and DRAFT so messages sent/archived/deleted in Gmail web/mobile disappear locally
  if (inboxLiveIds.length > 0 || !inboxFetchCapped) {
    db.reconcileFolderMessages(account.id, 'inbox', inboxLiveIds, inboxFetchCapped ? minSyncedInboxDate : undefined)
  }
  if (draftLiveIds.length > 0 || !draftFetchCapped) {
    db.reconcileFolderMessages(account.id, 'drafts', draftLiveIds, draftFetchCapped ? minSyncedDraftDate : undefined)
  }

  if (baselineHistoryId) {
    db.setGmailHistoryId(account.id, baselineHistoryId)
  }

  return { synced, mode: 'full' }
}

export async function syncGmailAccountWithClient(
  account: Account,
  gmail: gmail_v1.Gmail,
  db: GlassmailDB,
  maxMessages = 60
): Promise<{ synced: number; mode: 'incremental' | 'full' }> {
  const savedHistoryId = db.getGmailHistoryId(account.id)
  if (savedHistoryId) {
    const inc = await syncGmailIncremental(account, gmail, db, savedHistoryId, maxMessages)
    if (inc) return inc
  }
  return syncGmailFull(account, gmail, db, maxMessages)
}

export async function syncGmailAccount(
  account: Account,
  auth: OAuth2Client,
  db: GlassmailDB,
  maxMessages = 60
): Promise<{ synced: number; mode: 'incremental' | 'full' }> {
  const gmail = google.gmail({ version: 'v1', auth })
  return syncGmailAccountWithClient(account, gmail, db, maxMessages)
}

export function resetGmailSyncRuntimeCache(accountId?: string): void {
  if (accountId) lastLabelsRefreshByAccount.delete(accountId)
  else lastLabelsRefreshByAccount.clear()
}

async function fetchAndUpsertGmailMessages(
  gmail: gmail_v1.Gmail,
  account: Account,
  db: GlassmailDB,
  messageRefs: gmail_v1.Schema$Message[],
  labelMap: Map<string, string>,
  onMessage?: (msg: Message, internalDate: number) => void
): Promise<number> {
  let synced = 0
  const privacy = db.getSettings().privacy

  // Batch fetch in small chunks of 3 to avoid per-second Gmail quota bursts
  for (let i = 0; i < messageRefs.length; i += FETCH_CHUNK_SIZE) {
    const chunk = messageRefs.slice(i, i + FETCH_CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (ref) => {
        if (!ref.id) return
        let full: { data: gmail_v1.Schema$Message }
        try {
          full = await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' })
        } catch (err) {
          if (isGmailNotFoundError(err)) return
          throw err
        }
        const data = full.data
        const headers = data.payload?.headers || []
        const h = (name: string) => headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || ''

        const from = parseAddressString(h('From'))
        const to = parseAddressList(h('To'))
        const cc = parseAddressList(h('Cc'))
        const bcc = parseAddressList(h('Bcc'))
        const subject = h('Subject') || '(No subject)'
        const labelIds = data.labelIds || []
        const isRead = !labelIds.includes('UNREAD')
        const isStarred = labelIds.includes('STARRED')
        const isDraft = labelIds.includes('DRAFT')
        const isFromSelf = from.email.toLowerCase() === account.email.toLowerCase()
        // A message in INBOX from a different sender can still carry Gmail's SENT label
        // (e.g. delegated/shared Workspace senders or SMTP relays); treat it as received, not sent.
        const isSent = isFromSelf || (labelIds.includes('SENT') && !labelIds.includes('INBOX'))
        const folderRole = mapGmailLabelsToRole(labelIds)
        const msgId = `${account.id}|${data.id}`
        const threadId = `${account.id}|${data.threadId || data.id}`

        const { text, html, attachments, icsRaw } = extractBodyParts(data.payload, msgId)
        const stripped = privacy.stripTrackingPixels ? stripTrackingPixels(html) : { html, trackersBlocked: 0 }
        const unsub = parseListUnsubscribe(h('List-Unsubscribe'))
        const isAutoSubmitted = Boolean(h('Auto-Submitted') && h('Auto-Submitted').toLowerCase() !== 'no')
        const category = classifyCategory({
          from,
          subject,
          hasListUnsubscribe: Boolean(unsub.url || unsub.mailto),
          isAutoSubmitted,
          isSent
        })
        const signInCode = extractSignInCode(subject, text)
        const scamWarning = detectScamWarning(from, subject)
        const calendarInvite = icsRaw ? parseIcsInvite(icsRaw) : undefined

        const msg: Message = {
          id: msgId,
          accountId: account.id,
          threadId,
          remoteId: data.id!,
          messageIdHeader: h('Message-ID') || undefined,
          from,
          to,
          cc,
          bcc,
          subject,
          snippet: cleanSnippet(data.snippet || text.slice(0, 140)),
          bodyText: text,
          bodyHtml: stripped.html || `<pre style="white-space:pre-wrap;font-family:inherit;">${text}</pre>`,
          date: Number(data.internalDate || Date.now()),
          isRead,
          isStarred,
          isDraft,
          isSent,
          folderRole,
          folderName:
            folderRole === 'inbox'
              ? 'Inbox'
              : folderRole === 'junk'
                ? 'Spam'
                : folderRole.charAt(0).toUpperCase() + folderRole.slice(1),
          labels: labelIds.map((id) => labelMap.get(id) || id),
          category,
          hasAttachments: attachments.some((a) => !a.isInline),
          attachments,
          signInCode,
          trackersBlocked: stripped.trackersBlocked,
          scamWarning,
          unsubscribeUrl: unsub.url,
          unsubscribeMailto: unsub.mailto,
          calendarInvite
        }

        onMessage?.(msg, Number(data.internalDate || 0))
        db.upsertMessageAndThread(msg, data.threadId || data.id!)
        synced += 1
      })
    )
  }

  return synced
}

export async function syncGmailLabelWithClient(
  account: Account,
  gmail: gmail_v1.Gmail,
  db: GlassmailDB,
  folder: Folder,
  maxMessages = 50
): Promise<{ synced: number }> {
  const labelMap = buildLabelMapFromDb(db, account.id)
  const needsLabels = labelMap.size === 0 || Date.now() - (lastLabelsRefreshByAccount.get(account.id) || 0) >= LABELS_REFRESH_INTERVAL_MS

  const [resolvedLabelMap, labelInfoRes, listRes] = await Promise.all([
    needsLabels ? refreshGmailLabels(gmail, account, db) : Promise.resolve(labelMap),
    gmail.users.labels.get({ userId: 'me', id: folder.remoteId }).catch((err) => {
      if (isGmailNotFoundError(err)) return null
      throw err
    }),
    gmail.users.messages.list({
      userId: 'me',
      labelIds: [folder.remoteId],
      maxResults: maxMessages
    })
  ])

  if (labelInfoRes?.data) {
    db.upsertFolder({
      ...folder,
      unreadCount: Number(labelInfoRes.data.threadsUnread ?? labelInfoRes.data.messagesUnread ?? folder.unreadCount),
      totalCount: Number(labelInfoRes.data.threadsTotal ?? labelInfoRes.data.messagesTotal ?? folder.totalCount)
    })
  }

  const knownRemoteIds = db.getKnownRemoteIds(account.id)
  const missingRefs = (listRes.data.messages || []).filter((ref) => ref.id && !knownRemoteIds.has(ref.id))
  const synced = await fetchAndUpsertGmailMessages(gmail, account, db, missingRefs, resolvedLabelMap)
  return { synced }
}

export async function syncGmailLabel(
  account: Account,
  auth: OAuth2Client,
  db: GlassmailDB,
  folder: Folder,
  maxMessages = 50
): Promise<{ synced: number }> {
  const gmail = google.gmail({ version: 'v1', auth })
  return syncGmailLabelWithClient(account, gmail, db, folder, maxMessages)
}

export async function modifyGmailThread(
  auth: OAuth2Client,
  remoteThreadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth })
  await gmail.users.threads.modify({
    userId: 'me',
    id: remoteThreadId,
    requestBody: { addLabelIds, removeLabelIds }
  })
}

export async function trashGmailThread(auth: OAuth2Client, remoteThreadId: string): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth })
  await gmail.users.threads.trash({ userId: 'me', id: remoteThreadId })
}

export async function deleteGmailDraftByMessageId(auth: OAuth2Client, remoteMessageId: string): Promise<void> {
  if (!remoteMessageId) return
  const gmail = google.gmail({ version: 'v1', auth })
  try {
    const list = await gmail.users.drafts.list({ userId: 'me', maxResults: 50 })
    const match = (list.data.drafts || []).find((d) => d.message?.id === remoteMessageId)
    if (match?.id) {
      await gmail.users.drafts.delete({ userId: 'me', id: match.id })
      return
    }
  } catch {
    // Fall through to trash message fallback
  }
  try {
    await gmail.users.messages.trash({ userId: 'me', id: remoteMessageId })
  } catch {
    // Already deleted or sent
  }
}

function decodeBase64UrlBuffer(data?: string | null): Buffer {
  if (!data) return Buffer.alloc(0)
  const norm = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(norm, 'base64')
}

export async function fetchGmailAttachment(
  auth: OAuth2Client,
  remoteMessageId: string,
  remoteAttachmentId: string
): Promise<Buffer> {
  const gmail = google.gmail({ version: 'v1', auth })
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: remoteMessageId,
    id: remoteAttachmentId
  })
  return decodeBase64UrlBuffer(res.data.data)
}

function encodeMimeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ')
  if (!/[^\x20-\x7E]/.test(clean)) return clean
  const words: string[] = []
  let chunk = ''
  for (const ch of clean) {
    const next = chunk + ch
    if (Buffer.byteLength(next, 'utf8') > 45 && chunk) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`)
      chunk = ch
    } else {
      chunk = next
    }
  }
  if (chunk) {
    words.push(`=?UTF-8?B?${Buffer.from(chunk, 'utf8').toString('base64')}?=`)
  }
  return words.join('\r\n ')
}

function formatMimeFrom(name: string, email: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return email
  if (/[^\x20-\x7E]/.test(trimmed)) {
    return `${encodeMimeHeader(trimmed)} <${email}>`
  }
  const safe = trimmed.replace(/["\\]/g, '\\$&')
  return `"${safe}" <${email}>`
}

export async function sendGmailMessage(
  account: Account,
  auth: OAuth2Client,
  payload: SendEmailPayload,
  remoteThreadId?: string
): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth })

  // Resolve any attached files (local disk files OR existing remote Gmail draft attachments)
  const resolvedAttachments: { filename: string; mimeType: string; data: Buffer }[] = []
  for (const att of payload.attachments || []) {
    try {
      if (att.localPath) {
        resolvedAttachments.push({
          filename: att.filename,
          mimeType: att.mimeType || 'application/octet-stream',
          data: readFileSync(att.localPath)
        })
      } else if (att.remoteMessageId && att.remoteAttachmentId) {
        const res = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: att.remoteMessageId,
          id: att.remoteAttachmentId
        })
        const buf = decodeBase64UrlBuffer(res.data.data)
        if (buf.length > 0) {
          resolvedAttachments.push({
            filename: att.filename,
            mimeType: att.mimeType || 'application/octet-stream',
            data: buf
          })
        }
      }
    } catch {
      // Skip unreadable attachment rather than crashing the entire send
    }
  }

  const baseHeaders = [
    `From: ${formatMimeFrom(account.name, account.email)}`,
    `To: ${payload.to.join(', ')}`,
    ...(payload.cc?.length ? [`Cc: ${payload.cc.join(', ')}`] : []),
    ...(payload.bcc?.length ? [`Bcc: ${payload.bcc.join(', ')}`] : []),
    `Subject: ${encodeMimeHeader(payload.subject || '')}`,
    ...(payload.replyToMessageId ? [`In-Reply-To: ${payload.replyToMessageId}`, `References: ${payload.replyToMessageId}`] : []),
    'MIME-Version: 1.0'
  ]

  const htmlBodyB64 = Buffer.from(payload.bodyHtml || payload.bodyText || '', 'utf8')
    .toString('base64')
    .replace(/.{1,76}/g, '$&\r\n')
    .trimEnd()

  let rawMime: string
  if (resolvedAttachments.length === 0) {
    rawMime = [
      ...baseHeaders,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBodyB64
    ].join('\r\n')
  } else {
    const boundary = `----=_EveryBox_${randomUUID().replace(/-/g, '')}`
    const parts: string[] = [
      ...baseHeaders,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBodyB64
    ]
    for (const att of resolvedAttachments) {
      const safeName = att.filename.replace(/["\r\n]/g, '_')
      const b64 = att.data.toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd()
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${safeName}"`,
        `Content-Disposition: attachment; filename="${safeName}"`,
        'Content-Transfer-Encoding: base64',
        '',
        b64
      )
    }
    parts.push(`--${boundary}--`)
    rawMime = parts.join('\r\n')
  }

  const raw = Buffer.from(rawMime, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: remoteThreadId
    }
  })
}
