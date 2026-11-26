import type { EmailAddress, Message, ThreadDetail } from '../../../shared/types'
import type { ComposerState, QuotedMessageContext } from '../store/useAppStore'

function formatAddress(addr: EmailAddress): string {
  if (!addr) return ''
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email
}

function formatAddressList(addrs: EmailAddress[]): string {
  return addrs.map(formatAddress).filter(Boolean).join(', ')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildQuotedMessageContext(msg: Message, fallbackSubject: string): QuotedMessageContext {
  return {
    fromName: msg.from.name || msg.from.email,
    fromEmail: msg.from.email,
    to: formatAddressList(msg.to),
    cc: msg.cc.length > 0 ? formatAddressList(msg.cc) : undefined,
    date: msg.date,
    subject: msg.subject || fallbackSubject,
    bodyHtml: msg.bodyHtml || `<p>${escapeHtml(msg.bodyText || '').replace(/\n/g, '<br/>')}</p>`,
    bodyText: msg.bodyText || ''
  }
}

export function buildReplyComposerState(
  thread: ThreadDetail,
  mode: 'reply' | 'replyAll' | 'forward',
  targetMsg?: Message,
  opts?: { outlookPrefixes?: boolean }
): Partial<ComposerState> {
  const msg = targetMsg || thread.messages[thread.messages.length - 1]
  if (!msg) return {}

  const rawSubject = (thread.subject || msg.subject || '').trim()
  const isAlreadyRe = /^re:/i.test(rawSubject)
  const isAlreadyFwd = /^(fwd|fw):/i.test(rawSubject)
  const rePrefix = opts?.outlookPrefixes ? 'RE: ' : 'Re: '
  const fwdPrefix = opts?.outlookPrefixes ? 'FW: ' : 'Fwd: '

  const subject =
    mode === 'forward'
      ? isAlreadyFwd
        ? rawSubject
        : `${fwdPrefix}${rawSubject}`
      : isAlreadyRe
        ? rawSubject
        : `${rePrefix}${rawSubject}`

  const selfEmail = (thread.accountEmail || '').toLowerCase()
  const fromEmailLower = (msg.from.email || '').toLowerCase()

  // If replying to a message sent by this account, target the original recipients instead of self
  let toList: string[] = []
  if (mode !== 'forward') {
    if (fromEmailLower && fromEmailLower !== selfEmail) {
      toList = [msg.from.email]
    } else {
      const nonSelfTo = msg.to.map((p) => p.email).filter((e) => e && e.toLowerCase() !== selfEmail)
      toList = nonSelfTo.length > 0 ? nonSelfTo : msg.from.email ? [msg.from.email] : []
    }
  }

  const toLowerSet = new Set(toList.map((e) => e.toLowerCase()))
  const ccList =
    mode === 'replyAll'
      ? Array.from(
          new Set(
            [...msg.to, ...msg.cc]
              .map((p) => p.email)
              .filter((email) => {
                const lower = (email || '').toLowerCase()
                return lower && lower !== selfEmail && !toLowerSet.has(lower)
              })
          )
        )
      : []

  const forwardHeader = opts?.outlookPrefixes
    ? `\n\n________________________________\nFrom: ${formatAddress(msg.from)}\nSent: ${new Date(msg.date).toLocaleString()}\nSubject: ${rawSubject}\n\n${msg.bodyText}`
    : `\n\n---------- Forwarded message ---------\nFrom: ${formatAddress(msg.from)}\nDate: ${new Date(msg.date).toLocaleString()}\nSubject: ${rawSubject}\n\n${msg.bodyText}`

  return {
    mode,
    accountId: thread.accountId,
    to: toList.join(', '),
    cc: ccList.join(', '),
    bcc: '',
    subject,
    body: mode === 'forward' ? forwardHeader : '',
    replyToThreadId: thread.id,
    replyToMessageId: msg.messageIdHeader,
    quotedMessage: mode === 'forward' ? undefined : buildQuotedMessageContext(msg, rawSubject)
  }
}

export function formatQuotedReplyHtml(q: QuotedMessageContext): string {
  const dateStr = new Date(q.date).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
  const senderLabel = q.fromName && q.fromName !== q.fromEmail
    ? `${escapeHtml(q.fromName)} &lt;${escapeHtml(q.fromEmail)}&gt;`
    : escapeHtml(q.fromEmail)

  return `
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #d0d7de;color:#57606a;font-size:13px;">
      <div style="margin-bottom:8px;">On ${escapeHtml(dateStr)}, ${senderLabel} wrote:</div>
      <blockquote style="margin:0 0 0 8px;padding-left:12px;border-left:2px solid #d0d7de;">
        ${q.bodyHtml}
      </blockquote>
    </div>
  `.trim()
}

export function formatQuotedReplyText(q: QuotedMessageContext): string {
  const dateStr = new Date(q.date).toLocaleString()
  const sender = q.fromName && q.fromName !== q.fromEmail ? `${q.fromName} <${q.fromEmail}>` : q.fromEmail
  const quotedLines = (q.bodyText || '')
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `\n\nOn ${dateStr}, ${sender} wrote:\n${quotedLines}`
}
