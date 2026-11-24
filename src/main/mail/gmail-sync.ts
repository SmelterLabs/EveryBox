import { google, type gmail_v1 } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { GlassmailDB } from '../db/database'
import type { Account, Attachment, EmailAddress, Folder, Message, SendEmailPayload } from '../../shared/types'
import {
  classifyCategory,
  detectScamWarning,
  extractSignInCode,
  parseIcsInvite,
  parseListUnsubscribe,
  stripTrackingPixels
} from './classifier'

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
    text = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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

export async function syncGmailAccount(
  account: Account,
  auth: OAuth2Client,
  db: GlassmailDB,
  maxMessages = 60
): Promise<{ synced: number }> {
  const gmail = google.gmail({ version: 'v1', auth })

  // Sync labels as folders
  const labelsRes = await gmail.users.labels.list({ userId: 'me' })
  const labelMap = new Map<string, string>()
  for (const lbl of labelsRes.data.labels || []) {
    if (!lbl.id || !lbl.name) continue
    labelMap.set(lbl.id, lbl.name)
    if (lbl.type === 'user') {
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

  // Fetch recent messages from INBOX + SENT
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: maxMessages,
    q: 'in:inbox OR in:sent OR in:drafts'
  })

  const messageRefs = listRes.data.messages || []
  let synced = 0
  const privacy = db.getSettings().privacy

  // Batch fetch in chunks of 8
  for (let i = 0; i < messageRefs.length; i += 8) {
    const chunk = messageRefs.slice(i, i + 8)
    await Promise.all(
      chunk.map(async (ref) => {
        if (!ref.id) return
        const full = await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' })
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
        const isSent = labelIds.includes('SENT') || from.email.toLowerCase() === account.email.toLowerCase()
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
          snippet: data.snippet || text.slice(0, 140),
          bodyText: text,
          bodyHtml: stripped.html || `<pre style="white-space:pre-wrap;font-family:inherit;">${text}</pre>`,
          date: Number(data.internalDate || Date.now()),
          isRead,
          isStarred,
          isDraft,
          isSent,
          folderRole,
          folderName: folderRole === 'inbox' ? 'Inbox' : folderRole.charAt(0).toUpperCase() + folderRole.slice(1),
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

        db.upsertMessageAndThread(msg, data.threadId || data.id!)
        synced += 1
      })
    )
  }

  return { synced }
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

export async function sendGmailMessage(
  account: Account,
  auth: OAuth2Client,
  payload: SendEmailPayload,
  remoteThreadId?: string
): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth })
  const lines = [
    `From: "${account.name}" <${account.email}>`,
    `To: ${payload.to.join(', ')}`,
    ...(payload.cc?.length ? [`Cc: ${payload.cc.join(', ')}`] : []),
    ...(payload.bcc?.length ? [`Bcc: ${payload.bcc.join(', ')}`] : []),
    `Subject: ${payload.subject}`,
    ...(payload.replyToMessageId ? [`In-Reply-To: ${payload.replyToMessageId}`, `References: ${payload.replyToMessageId}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    payload.bodyHtml || payload.bodyText
  ]
  const raw = Buffer.from(lines.join('\r\n'), 'utf8')
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
