import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
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

function mapImapRole(specialUse?: string, name?: string): Folder['role'] {
  const su = (specialUse || '').toLowerCase()
  const n = (name || '').toLowerCase().trim()
  if (su === '\\inbox' || n === 'inbox') return 'inbox'
  if (
    su === '\\sent' ||
    n === 'sent' ||
    n === 'sent items' ||
    n === 'sent mail' ||
    n === 'sent messages' ||
    n.includes('sent')
  ) {
    return 'sent'
  }
  if (su === '\\drafts' || n === 'drafts' || n === 'draft' || n.includes('draft')) return 'drafts'
  if (
    su === '\\trash' ||
    n === 'trash' ||
    n === 'bin' ||
    n === 'deleted' ||
    n === 'deleted items' ||
    n === 'deleted messages' ||
    n.includes('trash') ||
    n.includes('deleted')
  ) {
    return 'trash'
  }
  if (
    su === '\\junk' ||
    n === 'junk' ||
    n === 'spam' ||
    n === 'bulk mail' ||
    n.includes('spam') ||
    n.includes('junk')
  ) {
    return 'junk'
  }
  if (su === '\\archive' || n === 'archive' || n === 'archived' || n.includes('archive')) return 'archive'
  return 'custom'
}

function createImapClient(opts: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}): ImapFlow {
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: { user: opts.user, pass: opts.pass },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000
  })
  // Always attach an error listener so server-side resets (ECONNRESET, ETIMEDOUT)
  // never become uncaught exceptions in Electron's main process.
  client.on('error', (err) => {
    console.error('[EveryBox IMAP error]', err instanceof Error ? err.message : String(err))
  })
  return client
}

async function closeImapClient(client: ImapFlow): Promise<void> {
  try {
    await client.logout()
  } catch {
    try {
      client.close()
    } catch {
      // ignore
    }
  }
}

export async function testImapConnection(opts: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}): Promise<{ ok: boolean; error?: string }> {
  const client = createImapClient(opts)
  try {
    await client.connect()
    await closeImapClient(client)
    return { ok: true }
  } catch (err) {
    client.close()
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function syncImapAccount(
  account: Account,
  secrets: SecretStore,
  db: GlassmailDB,
  maxMessages = 50,
  onlyFolder?: Folder
): Promise<{ synced: number }> {
  const password = secrets.get(`imap_pass:${account.id}`)
  if (!password || !account.imapHost) {
    throw new Error('Missing IMAP credentials or host.')
  }

  const client = createImapClient({
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.imapSecure !== false,
    user: account.email,
    pass: password
  })

  let synced = 0
  const privacy = db.getSettings().privacy

  await client.connect()
  try {
    const foldersToSync: { path: string; name: string; role: Folder['role']; limit: number }[] = []

    if (onlyFolder) {
      foldersToSync.push({
        path: onlyFolder.path || onlyFolder.remoteId,
        name: onlyFolder.name,
        role: onlyFolder.role,
        limit: maxMessages
      })
    } else {
      // Discover & store all server folders
      const mailboxes = await client.list()
      const selectableMailboxes = mailboxes.filter(
        (mb) => !mb.flags?.has('\\Noselect') && !mb.flags?.has('\\NonExistent')
      )

      for (const mb of selectableMailboxes) {
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

      // Pick the best mailbox for each standard role (preferring RFC 6154 \SpecialUse flags)
      const standardRoles: { role: Folder['role']; limit: number }[] = [
        { role: 'inbox', limit: maxMessages },
        { role: 'sent', limit: 35 },
        { role: 'drafts', limit: 20 },
        { role: 'junk', limit: 25 },
        { role: 'trash', limit: 25 },
        { role: 'archive', limit: 25 }
      ]

      const seenPaths = new Set<string>()

      for (const { role, limit } of standardRoles) {
        let match = selectableMailboxes.find(
          (mb) => mapImapRole(mb.specialUse, mb.name) === role && Boolean(mb.specialUse)
        )
        if (!match) {
          if (role === 'inbox') {
            match = selectableMailboxes.find((mb) => mb.path.toUpperCase() === 'INBOX')
          } else {
            match = selectableMailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === role)
          }
        }
        if (match && !seenPaths.has(match.path.toLowerCase())) {
          seenPaths.add(match.path.toLowerCase())
          foldersToSync.push({ path: match.path, name: match.name, role, limit })
        } else if (role === 'inbox' && !seenPaths.has('inbox')) {
          seenPaths.add('inbox')
          foldersToSync.push({ path: 'INBOX', name: 'Inbox', role: 'inbox', limit })
        }
      }
    }

    // Sync each standard folder sequentially over the single IMAP connection
    for (const target of foldersToSync) {
      try {
        const lock = await client.getMailboxLock(target.path)
        try {
          const total = client.mailbox ? Number(client.mailbox.exists || 0) : 0
          // Update folder counts
          let unreadCount = 0
          try {
            const st = await client.status(target.path, { unseen: true, messages: true })
            unreadCount = Number(st.unseen || 0)
          } catch {
            // Some servers don't support STATUS on selected mailbox; ignore
          }
          db.upsertFolder({
            id: `${account.id}|${target.path}`,
            accountId: account.id,
            remoteId: target.path,
            name: target.name,
            path: target.path,
            role: target.role,
            unreadCount,
            totalCount: total
          })

          if (total > 0) {
            const startSeq = Math.max(1, total - target.limit + 1)
            for await (const msg of client.fetch(`${startSeq}:${total}`, {
              uid: true,
              flags: true,
              envelope: true,
              internalDate: true,
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
                  return arr.flatMap((a) =>
                    a.value.map((v) => ({ name: v.name || v.address || '', email: v.address || '' }))
                  )
                }

                const subject = parsed.subject || '(No subject)'
                const rawHtml = typeof parsed.html === 'string' ? parsed.html : ''
                const text =
                  parsed.text ||
                  (rawHtml
                    ? decodeHtmlEntities(
                        rawHtml
                          .replace(/<style[\s\S]*?<\/style>/gi, '')
                          .replace(/<script[\s\S]*?<\/script>/gi, '')
                          .replace(/<[^>]+>/g, ' ')
                      )
                        .replace(/\s+/g, ' ')
                        .trim()
                    : '')
                const stripped = privacy.stripTrackingPixels
                  ? stripTrackingPixels(rawHtml)
                  : { html: rawHtml, trackersBlocked: 0 }

                const unsubHeader = parsed.headers.get('list-unsubscribe')
                const unsub = parseListUnsubscribe(typeof unsubHeader === 'string' ? unsubHeader : undefined)
                const autoSub = parsed.headers.get('auto-submitted')
                const isSent =
                  target.role === 'sent' || from.email.toLowerCase() === account.email.toLowerCase()

                const category = classifyCategory({
                  from,
                  subject,
                  hasListUnsubscribe: Boolean(unsub.url || unsub.mailto),
                  isAutoSubmitted: Boolean(autoSub && String(autoSub).toLowerCase() !== 'no'),
                  isSent
                })

                // Keep inbox msgId backwards-compatible; namespace non-inbox UIDs so UIDs across folders never collide
                const msgId =
                  target.role === 'inbox'
                    ? `${account.id}|imap-${msg.uid}`
                    : `${account.id}|imap-${target.role}-${msg.uid}`
                const normalizedSubj = subject.replace(/^(re|fwd|fw):\s*/gi, '').trim().toLowerCase()
                const remoteThreadId = parsed.inReplyTo || normalizedSubj || `${target.role}-${msg.uid}`
                const threadId = `${account.id}|${Buffer.from(remoteThreadId).toString('base64url').slice(0, 32)}`

                let icsRaw: string | undefined
                const attachments: Attachment[] = (parsed.attachments || []).map((a, idx) => {
                  const ct = (a.contentType || '').toLowerCase()
                  if (ct === 'text/calendar' || ct === 'application/ics' || (a.filename || '').toLowerCase().endsWith('.ics')) {
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
                const parsedDateMs = parsed.date?.getTime()
                const envDateMs = msg.envelope?.date ? new Date(msg.envelope.date).getTime() : NaN
                const internalDateMs = msg.internalDate ? new Date(msg.internalDate).getTime() : NaN
                const msgDate =
                  (parsedDateMs && Number.isFinite(parsedDateMs) ? parsedDateMs : 0) ||
                  (Number.isFinite(envDateMs) ? envDateMs : 0) ||
                  (Number.isFinite(internalDateMs) ? internalDateMs : 0) ||
                  Date.now()
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
                  snippet: cleanSnippet(text).slice(0, 140),
                  bodyText: text,
                  bodyHtml:
                    stripped.html || `<pre style="white-space:pre-wrap;font-family:inherit;">${text}</pre>`,
                  date: msgDate,
                  isRead: target.role === 'sent' ? true : flags.has('\\Seen'),
                  isStarred: flags.has('\\Flagged'),
                  isDraft: target.role === 'drafts' || flags.has('\\Draft'),
                  isSent,
                  folderRole: target.role,
                  folderName: target.name,
                  labels: [target.name],
                  category,
                  hasAttachments: attachments.some((a) => !a.isInline),
                  attachments,
                  signInCode: extractSignInCode(subject, text),
                  trackersBlocked: stripped.trackersBlocked,
                  scamWarning: detectScamWarning(from, subject),
                  unsubscribeUrl: unsub.url,
                  unsubscribeMailto: unsub.mailto,
                  calendarInvite: icsRaw ? parseIcsInvite(icsRaw, account.email) : undefined
                }

                db.upsertMessageAndThread(message, remoteThreadId)
                synced += 1
              } catch {
                // Skip malformed single email so rest of folder still loads
              }
            }
          }

          // Reconcile local folder against live server UIDs so emails deleted or moved in Outlook/webmail disappear here too
          try {
            const liveUids = total > 0 ? await client.search({ all: true }, { uid: true }) : []
            if (Array.isArray(liveUids) && target.role !== 'custom') {
              db.reconcileFolderMessages(
                account.id,
                target.role,
                liveUids.map((u) => String(u))
              )
            }
          } catch {
            // Non-fatal if server rejects UID SEARCH
          }
        } finally {
          lock.release()
        }
      } catch {
        // Non-fatal: continue syncing other folders if one folder fails to open
      }
    }
  } finally {
    await closeImapClient(client)
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

  const mailOpts = {
    from: `"${account.name}" <${account.email}>`,
    to: payload.to.join(', '),
    cc: payload.cc?.length ? payload.cc.join(', ') : undefined,
    bcc: payload.bcc?.length ? payload.bcc.join(', ') : undefined,
    subject: payload.subject,
    text: payload.bodyText,
    html: payload.bodyHtml,
    inReplyTo: payload.replyToMessageId,
    references: payload.replyToMessageId,
    attachments: (payload.attachments || [])
      .filter((a) => Boolean(a.localPath))
      .map((a) => ({
        filename: a.filename,
        path: a.localPath!,
        contentType: a.mimeType
      }))
  }

  await transporter.sendMail(mailOpts)

  // Best-effort append to IMAP Sent folder so sent items appear across devices
  const imapPass = secrets.get(`imap_pass:${account.id}`)
  if (imapPass && account.imapHost) {
    try {
      const rawMime = await new Promise<Buffer>((resolve, reject) => {
        const streamTransport = nodemailer.createTransport({ streamTransport: true, buffer: true })
        streamTransport.sendMail(mailOpts, (err, info) => {
          if (err) reject(err)
          else resolve(info.message as Buffer)
        })
      })
      const imapClient = createImapClient({
        host: account.imapHost,
        port: account.imapPort || 993,
        secure: account.imapSecure !== false,
        user: account.email,
        pass: imapPass
      })
      await imapClient.connect()
      try {
        const mailboxes = await imapClient.list()
        const sentMb =
          mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === 'sent' && Boolean(mb.specialUse)) ||
          mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === 'sent')
        if (sentMb) {
          await imapClient.append(sentMb.path, rawMime, ['\\Seen'])
        }
      } finally {
        await closeImapClient(imapClient)
      }
    } catch {
      // Non-fatal: some SMTP servers auto-save to Sent or reject APPEND
    }
  }
}

export async function mutateImapMessages(
  account: Account,
  secrets: SecretStore,
  opts: {
    uids: number[]
    sourceRole: Folder['role']
    sourceFolderName?: string
    action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'move' | 'delete'
    targetRole?: Folder['role']
    targetFolderName?: string
  }
): Promise<void> {
  if (opts.uids.length === 0) return
  const password = secrets.get(`imap_pass:${account.id}`)
  if (!password || !account.imapHost) return

  const client = createImapClient({
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.imapSecure !== false,
    user: account.email,
    pass: password
  })

  await client.connect()
  try {
    const mailboxes = await client.list()
    const findMailboxPath = (role: Folder['role'], folderName?: string): string | null => {
      if (role === 'custom' && folderName) {
        const exact = mailboxes.find(
          (mb) =>
            mb.path.toLowerCase() === folderName.toLowerCase() ||
            mb.name.toLowerCase() === folderName.toLowerCase()
        )
        return exact ? exact.path : null
      }
      if (role === 'inbox') return 'INBOX'
      const bySpecial = mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === role && Boolean(mb.specialUse))
      if (bySpecial) return bySpecial.path
      const byName = mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === role)
      return byName ? byName.path : null
    }

    const sourcePath = findMailboxPath(opts.sourceRole, opts.sourceFolderName) || 'INBOX'
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
        const targetPath = findMailboxPath(opts.targetRole, opts.targetFolderName)
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
    await closeImapClient(client)
  }
}

export async function fetchImapAttachment(
  account: Account,
  secrets: SecretStore,
  opts: {
    uid: number
    folderRole: Folder['role']
    folderName?: string
    filename: string
  }
): Promise<Buffer | null> {
  const password = secrets.get(`imap_pass:${account.id}`)
  if (!password || !account.imapHost || !Number.isFinite(opts.uid) || opts.uid <= 0) return null

  const client = createImapClient({
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.imapSecure !== false,
    user: account.email,
    pass: password
  })

  await client.connect()
  try {
    const mailboxes = await client.list()
    const findPath = (role: Folder['role'], folderName?: string): string | null => {
      if (role === 'custom' && folderName) {
        const exact = mailboxes.find(
          (mb) =>
            mb.path.toLowerCase() === folderName.toLowerCase() ||
            mb.name.toLowerCase() === folderName.toLowerCase()
        )
        return exact ? exact.path : null
      }
      if (role === 'inbox') return 'INBOX'
      const bySpecial = mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === role && Boolean(mb.specialUse))
      if (bySpecial) return bySpecial.path
      const byName = mailboxes.find((mb) => mapImapRole(mb.specialUse, mb.name) === role)
      return byName ? byName.path : null
    }

    const candidatePaths = Array.from(
      new Set(
        [
          findPath(opts.folderRole, opts.folderName),
          'INBOX',
          findPath('archive'),
          findPath('sent'),
          findPath('trash')
        ].filter((p): p is string => Boolean(p))
      )
    )

    const targetLower = (opts.filename || '').toLowerCase()
    for (const mbPath of candidatePaths) {
      let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null
      try {
        lock = await client.getMailboxLock(mbPath)
        const fetched = await client.fetchOne(String(opts.uid), { source: true }, { uid: true })
        if (!fetched || !fetched.source) continue
        const parsed = await simpleParser(fetched.source)
        const atts = parsed.attachments || []
        const exact = atts.find((a) => (a.filename || '').toLowerCase() === targetLower)
        const fallback = atts.find((a) => a.contentDisposition !== 'inline') || atts[0]
        const hit = exact || fallback
        if (hit && hit.content && hit.content.length > 0) {
          return hit.content
        }
      } catch {
        // try next candidate mailbox
      } finally {
        lock?.release()
      }
    }
    return null
  } finally {
    await closeImapClient(client)
  }
}
