import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { Account, Attachment, EmailAddress, Folder, Message, SendEmailPayload } from '../../shared/types'
import {
  classifyCategory,
  detectScamWarning,
  extractSignInCode,
  parseIcsInvite,
  parseListUnsubscribe,
  stripTrackingPixels
} from './classifier'

function mapImapRole(specialUse?: string, name?: string): Folder['role'] {
  const su = (specialUse || '').toLowerCase()
  const n = (name || '').toLowerCase()
  if (su === '\\inbox' || n === 'inbox') return 'inbox'
  if (su === '\\sent' || n.includes('sent')) return 'sent'
  if (su === '\\drafts' || n.includes('draft')) return 'drafts'
  if (su === '\\trash' || n.includes('trash') || n.includes('deleted')) return 'trash'
  if (su === '\\junk' || n.includes('spam') || n.includes('junk')) return 'junk'
  if (su === '\\archive' || n.includes('archive')) return 'archive'
  return 'custom'
}

export async function testImapConnection(opts: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: { user: opts.user, pass: opts.pass },
    logger: false
  })
  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function syncImapAccount(
  account: Account,
  secrets: SecretStore,
  db: GlassmailDB,
  maxMessages = 50
): Promise<{ synced: number }> {
  const password = secrets.get(`imap_pass:${account.id}`)
  if (!password || !account.imapHost) {
    throw new Error('Missing IMAP credentials or host.')
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.imapSecure !== false,
    auth: { user: account.email, pass: password },
    logger: false
  })

  let synced = 0
  const privacy = db.getSettings().privacy

  await client.connect()
  try {
    // Sync folders
    const mailboxes = await client.list()
    for (const mb of mailboxes) {
      db.upsertFolder({
        id: `${account.id}|${mb.path}`,
        accountId: account.id,
        remoteId: mb.path,
        name: mb.name,
        path: mb.path,
        role: mapImapRole(mb.specialUse, mb.name),
        unreadCount: 0,
        totalCount: 0
      })
    }

    const lock = await client.getMailboxLock('INBOX')
    try {
      const total = client.mailbox ? Number(client.mailbox.exists || 0) : 0
      if (total > 0) {
        const startSeq = Math.max(1, total - maxMessages + 1)
        for await (const msg of client.fetch(`${startSeq}:${total}`, {
          uid: true,
          flags: true,
          envelope: true,
          source: true
        })) {
          try {
            if (!msg.source) continue
            const parsed = await simpleParser(msg.source)
            const fromObj = parsed.from?.value?.[0]
            const from: EmailAddress = {
              name: fromObj?.name || fromObj?.address?.split('@')[0] || 'Unknown',
              email: fromObj?.address || ''
            }
            const toAddr = (val?: typeof parsed.to): EmailAddress[] => {
              if (!val) return []
              const arr = Array.isArray(val) ? val : [val]
              return arr.flatMap((a) => a.value.map((v) => ({ name: v.name || v.address || '', email: v.address || '' })))
            }

            const subject = parsed.subject || '(No subject)'
            const text = parsed.text || ''
            const rawHtml = typeof parsed.html === 'string' ? parsed.html : ''
            const stripped = privacy.stripTrackingPixels ? stripTrackingPixels(rawHtml) : { html: rawHtml, trackersBlocked: 0 }

            const unsubHeader = parsed.headers.get('list-unsubscribe')
            const unsub = parseListUnsubscribe(typeof unsubHeader === 'string' ? unsubHeader : undefined)
            const autoSub = parsed.headers.get('auto-submitted')
            const isSent = from.email.toLowerCase() === account.email.toLowerCase()

            const category = classifyCategory({
              from,
              subject,
              hasListUnsubscribe: Boolean(unsub.url || unsub.mailto),
              isAutoSubmitted: Boolean(autoSub && String(autoSub).toLowerCase() !== 'no'),
              isSent
            })

            const msgId = `${account.id}|imap-${msg.uid}`
            const normalizedSubj = subject.replace(/^(re|fwd|fw):\s*/gi, '').trim().toLowerCase()
            const remoteThreadId = parsed.inReplyTo || normalizedSubj || String(msg.uid)
            const threadId = `${account.id}|${Buffer.from(remoteThreadId).toString('base64url').slice(0, 32)}`

            let icsRaw: string | undefined
            const attachments: Attachment[] = (parsed.attachments || []).map((a, idx) => {
              if (a.contentType === 'text/calendar' || (a.filename || '').toLowerCase().endsWith('.ics')) {
                icsRaw = a.content.toString('utf8')
              }
              return {
                id: `${msgId}|att-${idx}`,
                messageId: msgId,
                filename: a.filename || `attachment-${idx}`,
                mimeType: a.contentType || 'application/octet-stream',
                size: a.size || a.content.length,
                contentId: a.cid || undefined,
                isInline: a.contentDisposition === 'inline'
              }
            })

            const flags = msg.flags || new Set<string>()
            const message: Message = {
              id: msgId,
              accountId: account.id,
              threadId,
              remoteId: String(msg.uid),
              messageIdHeader: parsed.messageId || undefined,
              from,
              to: toAddr(parsed.to),
              cc: toAddr(parsed.cc),
              bcc: toAddr(parsed.bcc),
              subject,
              snippet: text.replace(/\s+/g, ' ').trim().slice(0, 140),
              bodyText: text,
              bodyHtml: stripped.html || `<pre style="white-space:pre-wrap;font-family:inherit;">${text}</pre>`,
              date: parsed.date ? parsed.date.getTime() : Date.now(),
              isRead: flags.has('\\Seen'),
              isStarred: flags.has('\\Flagged'),
              isDraft: flags.has('\\Draft'),
              isSent,
              folderRole: 'inbox',
              folderName: 'Inbox',
              labels: ['Inbox'],
              category,
              hasAttachments: attachments.some((a) => !a.isInline),
              attachments,
              signInCode: extractSignInCode(subject, text),
              trackersBlocked: stripped.trackersBlocked,
              scamWarning: detectScamWarning(from, subject),
              unsubscribeUrl: unsub.url,
              unsubscribeMailto: unsub.mailto,
              calendarInvite: icsRaw ? parseIcsInvite(icsRaw) : undefined
            }

            db.upsertMessageAndThread(message, remoteThreadId)
            synced += 1
          } catch {
            // Skip malformed single email so rest of folder still loads (Glassmail v1.1.7 resilience!)
          }
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }

  return { synced }
}

export async function sendImapSmtpMessage(
  account: Account,
  secrets: SecretStore,
  payload: SendEmailPayload
): Promise<void> {
  const pass = account.smtpSeparateAuth
    ? secrets.get(`smtp_pass:${account.id}`) || secrets.get(`imap_pass:${account.id}`)
    : secrets.get(`imap_pass:${account.id}`)
  if (!pass || !account.smtpHost) {
    throw new Error('Missing SMTP credentials or host.')
  }

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort || 465,
    secure: account.smtpSecure !== false,
    auth: {
      user: account.smtpSeparateAuth && account.smtpUsername ? account.smtpUsername : account.email,
      pass
    }
  })

  await transporter.sendMail({
    from: `"${account.name}" <${account.email}>`,
    to: payload.to.join(', '),
    cc: payload.cc?.length ? payload.cc.join(', ') : undefined,
    bcc: payload.bcc?.length ? payload.bcc.join(', ') : undefined,
    subject: payload.subject,
    text: payload.bodyText,
    html: payload.bodyHtml,
    inReplyTo: payload.replyToMessageId,
    references: payload.replyToMessageId
  })
}

export async function mutateImapMessages(
  account: Account,
  secrets: SecretStore,
  opts: {
    uids: number[]
    sourceRole: Folder['role']
    action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'move' | 'delete'
    targetRole?: Folder['role']
  }
): Promise<void> {
  if (opts.uids.length === 0) return
  const password = secrets.get(`imap_pass:${account.id}`)
  if (!password || !account.imapHost) return

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.imapSecure !== false,
    auth: { user: account.email, pass: password },
    logger: false
  })

  await client.connect()
  try {
    const mailboxes = await client.list()
    const findMailboxPath = (role: Folder['role']): string | null => {
      if (role === 'inbox') return 'INBOX'
      const bySpecial = mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === role && Boolean(mb.specialUse))
      if (bySpecial) return bySpecial.path
      const byName = mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === role)
      return byName ? byName.path : null
    }

    const sourcePath = findMailboxPath(opts.sourceRole) || 'INBOX'
    const uidRange = opts.uids.join(',')

    const lock = await client.getMailboxLock(sourcePath)
    try {
      if (opts.action === 'delete') {
        await client.messageDelete(uidRange, { uid: true })
      } else if (opts.action === 'trash' || (opts.action === 'move' && opts.targetRole === 'trash')) {
        const trashPath = findMailboxPath('trash')
        if (trashPath && trashPath.toLowerCase() !== sourcePath.toLowerCase()) {
          await client.messageMove(uidRange, trashPath, { uid: true })
        } else {
          await client.messageDelete(uidRange, { uid: true })
        }
      } else if (opts.action === 'archive' || (opts.action === 'move' && opts.targetRole === 'archive')) {
        const archivePath = findMailboxPath('archive')
        if (archivePath && archivePath.toLowerCase() !== sourcePath.toLowerCase()) {
          await client.messageMove(uidRange, archivePath, { uid: true })
        }
      } else if (opts.action === 'move' && opts.targetRole) {
        const targetPath = findMailboxPath(opts.targetRole)
        if (targetPath && targetPath.toLowerCase() !== sourcePath.toLowerCase()) {
          await client.messageMove(uidRange, targetPath, { uid: true })
        }
      } else if (opts.action === 'read') {
        await client.messageFlagsAdd(uidRange, ['\\Seen'], { uid: true })
      } else if (opts.action === 'unread') {
        await client.messageFlagsRemove(uidRange, ['\\Seen'], { uid: true })
      } else if (opts.action === 'star') {
        await client.messageFlagsAdd(uidRange, ['\\Flagged'], { uid: true })
      } else if (opts.action === 'unstar') {
        await client.messageFlagsRemove(uidRange, ['\\Flagged'], { uid: true })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}
