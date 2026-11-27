import ICAL from 'ical.js'
import type { CalendarInvite, EmailAddress } from '../../shared/types'
import { extractIcsVEventDetails } from '../calendar/calendar-utils'

const AUTOMATED_LOCAL_PARTS = [
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'notifications',
  'notification',
  'updates',
  'newsletter',
  'news',
  'digest',
  'billing',
  'receipts',
  'invoice',
  'invoices',
  'support',
  'alerts',
  'alert',
  'security',
  'automated',
  'mailer-daemon',
  'hello@',
  'team@',
  'marketing',
  'promo',
  'deals'
]

const TRUSTED_BRAND_DOMAINS: Record<string, string[]> = {
  paypal: ['paypal.com'],
  chase: ['chase.com', 'jpmorgan.com'],
  'bank of america': ['bankofamerica.com'],
  apple: ['apple.com', 'icloud.com'],
  google: ['google.com', 'accounts.google.com'],
  microsoft: ['microsoft.com', 'outlook.com', 'live.com'],
  amazon: ['amazon.com'],
  stripe: ['stripe.com'],
  coinbase: ['coinbase.com'],
  schwab: ['schwab.com'],
  fidelity: ['fidelity.com']
}

const KNOWN_TRACKER_DOMAINS = [
  'trk.',
  'track.',
  'click.',
  'open.',
  'pixel.',
  'mailtrack',
  'sendgrid.net/wf/open',
  'mandrillapp.com/track/open',
  'list-manage.com/track/open',
  'hubspotemail.net',
  'customeriomail.com',
  'postmarkapp.com',
  'klaviyomail.com',
  'awstrack.me',
  'mixmax.com',
  'superhuman.com/r/',
  'sparkpostmail.com',
  'sg-links',
  'google-analytics.com/collect'
]

export function classifyCategory(opts: {
  from: EmailAddress
  subject: string
  hasListUnsubscribe: boolean
  isAutoSubmitted: boolean
  isSent: boolean
}): 'people' | 'updates' {
  if (opts.isSent) return 'people'
  if (opts.hasListUnsubscribe || opts.isAutoSubmitted) return 'updates'
  const emailLower = (opts.from.email || '').toLowerCase()
  const local = emailLower.split('@')[0] || ''
  for (const pat of AUTOMATED_LOCAL_PARTS) {
    if (pat.endsWith('@')) {
      if (emailLower.startsWith(pat)) return 'updates'
    } else if (local === pat || local.includes(pat)) {
      return 'updates'
    }
  }
  const subj = (opts.subject || '').toLowerCase()
  if (
    /\b(receipt|order confirm|your invoice|shipping update|out for delivery|verification code|sign-in code|security alert|digest|weekly summary|newsletter)\b/.test(
      subj
    )
  ) {
    return 'updates'
  }
  return 'people'
}

function scrubNonCodeTokens(text: string): string {
  return (
    text
      // URLs & query params (e.g., ?id=760769 or /orders/760769)
      .replace(/https?:\/\/\S+/gi, ' ')
      // Bracketed ticket / helpdesk tags like [## 760769 ##], [#760769], [Case #760769]
      .replace(/\[[^\]]*#[^\]]*\]/g, ' ')
      // Explicit ticket/order/invoice/case/ref/tracking/account numbers (same-line only)
      .replace(
        /\b(?:ticket|case|order|invoice|receipt|ref(?:erence)?|tracking|claim|request|issue|incident|account|member|policy|confirmation[ \t]+(?:number|no\.?|id|#))(?:[ \t]+(?:no\.?|num(?:ber)?|id))?[ \t]*[#:\-]?[ \t]*\d[\d -]{2,}\b/gi,
        ' '
      )
      // CSS hex colors (#123456) and bare hashed IDs (#760769)
      .replace(/#[0-9a-f]{6}\b/gi, ' ')
      .replace(/#[ \t]*\d{4,8}\b/g, ' ')
      // US phone numbers (e.g., 555-123-4567)
      .replace(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/g, ' ')
  )
}

function formatSignInCode(raw: string): string | undefined {
  const clean = raw.replace(/[\s-]/g, '')
  if (clean.length < 4 || clean.length > 8) return undefined
  if (/^(?:19|20)\d{2}$/.test(clean)) return undefined
  return clean.length === 6 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean
}

export function extractSignInCode(subject: string, bodyText: string): string | undefined {
  // Real 2FA / OTP emails are never replies or forwards
  if (/^\s*(?:re|fwd?|fw)\s*:/i.test(subject || '')) return undefined

  const headBody = (bodyText || '').slice(0, 1400)
  const combinedRaw = `${subject || ''}\n${headBody}`

  // Require explicit 2FA / OTP intent rather than generic "login" or "security" mentions
  const strongContextRegex =
    /\b(?:verification\s+code|verify\s+(?:your\s+)?(?:email|account|identity|login|sign[- ]?in)|sign[- ]?in\s+code|login\s+code|log[- ]?in\s+code|security\s+code|auth(?:entication)?\s+code|confirmation\s+code|one[- ]?time\s+(?:code|passcode|password|pin)|passcode|2fa|two[- ]?factor|multi[- ]?factor|otp|enter\s+(?:this|the)\s+(?:code|pin)|use\s+(?:this|the)\s+(?:code|pin)|your\s+(?:code|pin)\s+is|code\s+expires?\s+in)\b/i
  if (!strongContextRegex.test(combinedRaw)) return undefined

  const cleanSubject = scrubNonCodeTokens(subject || '')
  const cleanBody = scrubNonCodeTokens(headBody)
  const cleanCombined = `${cleanSubject}\n${cleanBody}`

  // 1. Leading-code pattern: "481207 is your verification code"
  const leadingMatch = cleanCombined.match(
    /\b(\d{3}[\s-]\d{3}|\d{6,8}|\d{4})\s+is\s+your\s+(?:[a-z0-9-]+\s+){0,2}(?:code|pin|otp|passcode)\b/i
  )
  if (leadingMatch?.[1]) {
    const formatted = formatSignInCode(leadingMatch[1])
    if (formatted) return formatted
  }

  // 2. Keyword-adjacent pattern: "verification code is: 481 207" / "enter 481207"
  const nearMatch = cleanCombined.match(
    /\b(?:code|pin|otp|passcode|token)\s*(?:is\s*[:\-–—]?|[:\-–—])?\s*[*`"']?(\d{3}[\s-]\d{3}|\d{6,8}|\d{4})[*`"']?(?:\s|[.,!?)]|$)/i
  )
  if (nearMatch?.[1]) {
    const formatted = formatSignInCode(nearMatch[1])
    if (formatted) return formatted
  }

  // 3. Standalone code on its own line in the body (common centered 2FA block)
  for (const line of cleanBody.split(/\r?\n/)) {
    const lineMatch = line.match(/^\s*[*`"']?(\d{3}[\s-]\d{3}|\d{6}|\d{4})[*`"']?\s*$/)
    if (lineMatch?.[1]) {
      const formatted = formatSignInCode(lineMatch[1])
      if (formatted) return formatted
    }
  }

  // 4. Subject-line 6-digit code only when the subject itself has explicit 2FA intent
  if (strongContextRegex.test(cleanSubject)) {
    const subjMatch = cleanSubject.match(/\b(\d{3}[\s-]\d{3}|\d{6})\b/)
    if (subjMatch?.[1]) {
      const formatted = formatSignInCode(subjMatch[1])
      if (formatted) return formatted
    }
  }

  return undefined
}

export function stripTrackingPixels(html: string): { html: string; trackersBlocked: number } {
  if (!html) return { html: '', trackersBlocked: 0 }
  let count = 0
  const cleaned = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const lower = tag.toLowerCase()
    const is1x1 =
      /(?:width|height)\s*=\s*["']?[01](?:px)?["']?/i.test(lower) &&
      !/(?:width|height)\s*=\s*["']?[2-9]\d/i.test(lower)
    const isHidden = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)/i.test(lower)
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i)
    const src = (srcMatch?.[1] || '').toLowerCase()
    const isKnownTracker = KNOWN_TRACKER_DOMAINS.some((d) => src.includes(d))

    if (is1x1 || isHidden || isKnownTracker) {
      count += 1
      return ''
    }
    return tag
  })
  return { html: cleaned, trackersBlocked: count }
}

export function detectScamWarning(from: EmailAddress, subject: string): string | undefined {
  const nameLower = (from.name || '').toLowerCase()
  const emailLower = (from.email || '').toLowerCase()
  const domain = emailLower.split('@')[1] || ''
  if (!domain) return undefined

  // Check brand impersonation: display name claims major brand, domain doesn't match
  for (const [brand, allowedDomains] of Object.entries(TRUSTED_BRAND_DOMAINS)) {
    if (nameLower.includes(brand)) {
      const ok = allowedDomains.some((d) => domain === d || domain.endsWith('.' + d))
      if (!ok) {
        return `Sender name mentions "${brand}" but was sent from ${domain}. Verify before clicking links.`
      }
    }
  }

  // Punycode / IDN lookalike domain warning
  if (domain.includes('xn--')) {
    return `Sender uses an internationalized punycode domain (${domain}), which can mimic a trusted address.`
  }

  // Urgent wire / account suspension phishing heuristic from free webmail
  const subj = (subject || '').toLowerCase()
  const isFreeWebmail = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'].includes(domain)
  if (
    isFreeWebmail &&
    /\b(account suspended|verify your bank|wire transfer urgent|immediate action required|unusual sign-in)\b/.test(subj)
  ) {
    return `Urgent security/financial subject sent from a personal webmail address (${domain}).`
  }

  return undefined
}

export function parseListUnsubscribe(headerValue?: string): { url?: string; mailto?: string } {
  if (!headerValue) return {}
  const urls = Array.from(headerValue.matchAll(/<([^>]+)>/g)).map((m) => m[1].trim())
  const url = urls.find((u) => u.startsWith('http://') || u.startsWith('https://'))
  const mailto = urls.find((u) => u.startsWith('mailto:'))
  return { url, mailto }
}

export function parseIcsInvite(rawIcs: string, accountEmail?: string): CalendarInvite | undefined {
  try {
    const jcal = ICAL.parse(rawIcs)
    const comp = new ICAL.Component(jcal)
    const vevent = comp.getFirstSubcomponent('vevent')
    if (!vevent) return undefined
    const details = extractIcsVEventDetails(vevent)
    if (!details) return undefined

    const methodVal = comp.getFirstPropertyValue('method')
    const method = methodVal ? String(methodVal).toUpperCase() : undefined

    let status: CalendarInvite['status'] = 'NEEDS-ACTION'
    if (method === 'CANCEL' || details.status === 'cancelled') {
      status = 'CANCELLED'
    } else if (accountEmail) {
      const selfAtt = details.attendees.find(
        (a) => a.email && a.email.toLowerCase() === accountEmail.toLowerCase()
      )
      if (selfAtt?.status === 'accepted') status = 'ACCEPTED'
      else if (selfAtt?.status === 'declined') status = 'DECLINED'
      else if (selfAtt?.status === 'tentative') status = 'TENTATIVE'
    }

    return {
      uid: details.uid || `ics-${Date.now()}`,
      summary: details.title === '(No title)' ? 'Calendar Invitation' : details.title,
      description: details.description || undefined,
      descriptionHtml: details.descriptionHtml,
      location: details.location || undefined,
      meetingUrl: details.meetingUrl,
      startIso: new Date(details.startAt).toISOString(),
      endIso: new Date(details.endAt).toISOString(),
      allDay: details.allDay,
      organizerEmail: details.organizer?.email || undefined,
      organizerName: details.organizer?.name || undefined,
      attendees: details.attendees.length > 0 ? details.attendees : undefined,
      attachments: details.attachments.length > 0 ? details.attachments : undefined,
      method,
      status,
      rawIcs
    }
  } catch {
    return undefined
  }
}
