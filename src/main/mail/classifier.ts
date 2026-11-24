import ICAL from 'ical.js'
import type { CalendarInvite, EmailAddress } from '../../shared/types'

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

export function extractSignInCode(subject: string, bodyText: string): string | undefined {
  const combined = `${subject}\n${bodyText.slice(0, 1200)}`
  const contextRegex =
    /(?:verification|verify|sign[- ]?in|login|log[- ]?in|one[- ]?time|passcode|security|auth(?:entication)?|2fa|otp|confirm(?:ation)?)\s*(?:code|pin|token|number)?/i
  if (!contextRegex.test(combined)) return undefined

  // Look for 6-digit or 4-8 digit codes near keywords, or space-split "481 207"
  const nearMatch = combined.match(
    /(?:code|pin|otp|passcode|is|enter|:)\s*[*`"']?(\d{3}[\s-]\d{3}|\d{6,8}|\d{4})[*`"']?(?:\s|[.,!?]|$)/i
  )
  if (nearMatch?.[1]) {
    const clean = nearMatch[1].replace(/[\s-]/g, '')
    if (clean.length >= 4 && clean.length <= 8 && !/^20[2-3]\d$/.test(clean)) {
      return clean.length === 6 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean
    }
  }
  const standalone = combined.match(/\b(\d{3}\s\d{3}|\d{6})\b/)
  if (standalone?.[1]) {
    const clean = standalone[1].replace(/\s/g, '')
    return `${clean.slice(0, 3)} ${clean.slice(3)}`
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

export function parseIcsInvite(rawIcs: string): CalendarInvite | undefined {
  try {
    const jcal = ICAL.parse(rawIcs)
    const comp = new ICAL.Component(jcal)
    const vevent = comp.getFirstSubcomponent('vevent')
    if (!vevent) return undefined
    const ev = new ICAL.Event(vevent)
    const organizerProp = vevent.getFirstProperty('organizer')
    const organizerVal = organizerProp ? String(organizerProp.getFirstValue() || '').replace(/^mailto:/i, '') : undefined
    const organizerCn = organizerProp?.getParameter('cn') ? String(organizerProp.getParameter('cn')) : undefined

    return {
      uid: ev.uid || `ics-${Date.now()}`,
      summary: ev.summary || 'Calendar Invitation',
      description: ev.description || undefined,
      location: ev.location || undefined,
      startIso: ev.startDate ? ev.startDate.toJSDate().toISOString() : new Date().toISOString(),
      endIso: ev.endDate ? ev.endDate.toJSDate().toISOString() : new Date(Date.now() + 3600000).toISOString(),
      organizerEmail: organizerVal,
      organizerName: organizerCn,
      status: 'NEEDS-ACTION',
      rawIcs
    }
  } catch {
    return undefined
  }
}
