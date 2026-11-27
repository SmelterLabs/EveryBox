import ICAL from 'ical.js'
import { decodeHtmlEntities } from '../../shared/html-entities'
import type { CalendarEvent } from '../../shared/types'

const MEETING_URL_REGEX =
  /https?:\/\/(?:[\w.-]*zoom\.us\/(?:j|w|s|my)\/[^\s<>"']+|meet\.google\.com\/[a-z0-9-]+(?:[^\s<>"']*)?|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+|teams\.live\.com\/meet\/[^\s<>"']+|aka\.ms\/JoinTeamsMeeting[^\s<>"']*|[\w.-]*webex\.com\/(?:meet|join|[\w.-]+\/j\.php)[^\s<>"']*|[\w.-]*webex\.com\/[^\s<>"']+|(?:global\.)?gotomeeting\.com\/join\/[^\s<>"']+|meet\.goto\.com\/[^\s<>"']+|whereby\.com\/[^\s<>"']+|bluejeans\.com\/[^\s<>"']+|chime\.aws\/[^\s<>"']+|meet\.jit\.si\/[^\s<>"']+|meetings\.ringcentral\.com\/j\/[^\s<>"']+|app\.gather\.town\/app\/[^\s<>"']+|cal\.com\/video\/[^\s<>"']+|hangouts\.google\.com\/[^\s<>"']+)/i

const HTML_TAG_REGEX = /<(?:a|p|div|br|span|ul|ol|li|b|strong|i|em|h[1-6]|table|tr|td|html|body)\b[^>]*>/i

export function cleanExtractedUrl(raw: string): string {
  let url = decodeHtmlEntities(raw).trim()
  // Strip wrapping angle brackets and trailing sentence punctuation
  url = url.replace(/^[<("']+/, '').replace(/[>.,;!?'"\])]+$/, '')
  // Balance unmatched closing parens if any remain
  while (url.endsWith(')') && (url.match(/\(/g)?.length || 0) < (url.match(/\)/g)?.length || 0)) {
    url = url.slice(0, -1)
  }
  return url
}

export function extractHrefUrls(html: string): string[] {
  if (!html) return []
  const urls: string[] = []
  const regex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const candidate = cleanExtractedUrl(match[1] || match[2] || match[3] || '')
    if (/^https?:\/\//i.test(candidate)) {
      urls.push(candidate)
    }
  }
  return urls
}

export function extractMeetingUrl(text: string, html?: string): string | undefined {
  // Check explicit hrefs in HTML first (most reliable for Teams/Zoom "Click here to join" links)
  if (html) {
    for (const href of extractHrefUrls(html)) {
      const m = href.match(MEETING_URL_REGEX)
      if (m) return cleanExtractedUrl(m[0])
    }
    const htmlMatch = html.match(MEETING_URL_REGEX)
    if (htmlMatch) return cleanExtractedUrl(htmlMatch[0])
  }
  if (text) {
    const textMatch = text.match(MEETING_URL_REGEX)
    if (textMatch) return cleanExtractedUrl(textMatch[0])
  }
  return undefined
}

export function looksLikeHtml(value?: string): boolean {
  return Boolean(value && HTML_TAG_REGEX.test(value))
}

/**
 * Convert HTML event descriptions into readable plain text while preserving every
 * `<a href="https://...">label</a>` URL so plain-text renderers never lose clickable links.
 */
export function htmlToPlainTextWithLinks(html: string): string {
  if (!html) return ''
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')

  // Preserve anchor href URLs alongside their visible label
  s = s.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_full, d1, d2, d3, inner) => {
      const href = cleanExtractedUrl(d1 || d2 || d3 || '')
      const label = decodeHtmlEntities(String(inner || '').replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim()
      if (!/^https?:\/\//i.test(href)) {
        return label || ''
      }
      if (!label) return href
      // Avoid duplicating URL if label is already the URL (or a prefix of it)
      const normLabel = label.replace(/\/$/, '').toLowerCase()
      const normHref = href.replace(/\/$/, '').toLowerCase()
      if (normLabel === normHref || normHref.includes(normLabel) || normLabel.includes(normHref)) {
        return href
      }
      return `${label} (${href})`
    }
  )

  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')

  return decodeHtmlEntities(s)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeEventDescription(
  rawDescription?: string,
  rawHtml?: string
): { description: string; descriptionHtml?: string } {
  const htmlCandidate = rawHtml?.trim()
    ? rawHtml.trim()
    : rawDescription && looksLikeHtml(rawDescription)
      ? rawDescription.trim()
      : undefined

  let plain = rawDescription ? rawDescription.trim() : ''
  if (plain && looksLikeHtml(plain)) {
    plain = htmlToPlainTextWithLinks(plain)
  }

  if (htmlCandidate) {
    const htmlPlain = htmlToPlainTextWithLinks(htmlCandidate)
    if (!plain) {
      plain = htmlPlain
    } else {
      // Ensure any important http(s) hrefs present in HTML (e.g. Teams join links) are not missing from plain text
      const missingHrefs = extractHrefUrls(htmlCandidate).filter((u) => !plain.includes(u))
      const importantMissing = missingHrefs.filter((u) => MEETING_URL_REGEX.test(u))
      if (importantMissing.length > 0) {
        plain = `${plain}\n\n${importantMissing.join('\n')}`.trim()
      }
    }
  }

  return {
    description: plain,
    descriptionHtml: htmlCandidate
  }
}

export function normalizeAttendeeStatus(raw?: string | number | null): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw === 'number') {
    // Outlook OlResponseStatus: 0=None, 1=Organized, 2=Tentative, 3=Accepted, 4=Declined, 5=NotResponded
    if (raw === 3) return 'accepted'
    if (raw === 4) return 'declined'
    if (raw === 2) return 'tentative'
    if (raw === 1) return 'accepted'
    if (raw === 5) return 'needsAction'
    return undefined
  }
  const s = String(raw).trim().toLowerCase()
  if (s === 'accepted') return 'accepted'
  if (s === 'declined') return 'declined'
  if (s === 'tentative') return 'tentative'
  if (s === 'needs-action' || s === 'needsaction' || s === 'notresponded' || s === 'delegated') {
    return 'needsAction'
  }
  return s || undefined
}

export function normalizeEventStatus(raw?: string | null): CalendarEvent['status'] {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  if (s === 'tentative') return 'tentative'
  return 'confirmed'
}

export interface ParsedIcsVEventDetails {
  uid: string
  title: string
  description: string
  descriptionHtml?: string
  location: string
  meetingUrl?: string
  htmlLink?: string
  organizer?: { name?: string; email: string }
  attendees: CalendarEvent['attendees']
  attachments: NonNullable<CalendarEvent['attachments']>
  status: CalendarEvent['status']
  allDay: boolean
  startAt: number
  endAt: number
  isRecurring: boolean
  recurrenceIdMs?: number
}

function stripMailto(val: string): string {
  return val.replace(/^mailto:/i, '').trim()
}

function filenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const seg = parsed.pathname.split('/').filter(Boolean).pop()
    return seg ? decodeURIComponent(seg) : 'Attachment'
  } catch {
    return 'Attachment'
  }
}

export function extractIcsVEventDetails(vevent: ICAL.Component): ParsedIcsVEventDetails | null {
  const ev = new ICAL.Event(vevent)
  if (!ev.startDate) return null

  const startAt = ev.startDate.toJSDate().getTime()
  const rawEndAt = ev.endDate ? ev.endDate.toJSDate().getTime() : startAt + 3600_000
  const endAt = rawEndAt > startAt ? rawEndAt : startAt + 3600_000
  const uid = ev.uid || `${startAt}-${ev.summary || 'event'}`

  // Description + X-ALT-DESC (HTML)
  const altDescProp = vevent.getFirstProperty('x-alt-desc')
  const rawAltDesc = altDescProp ? String(altDescProp.getFirstValue() || '') : undefined
  const { description, descriptionHtml } = normalizeEventDescription(ev.description || '', rawAltDesc)

  // Organizer
  const orgProp = vevent.getFirstProperty('organizer')
  let organizer: { name?: string; email: string } | undefined
  if (orgProp) {
    const orgEmail = stripMailto(String(orgProp.getFirstValue() || ''))
    const orgCn = orgProp.getParameter('cn') ? String(orgProp.getParameter('cn')).trim() : undefined
    if (orgEmail || orgCn) {
      organizer = { name: orgCn || undefined, email: orgEmail }
    }
  }

  // Attendees (CN + PARTSTAT + ROLE)
  const attendees: CalendarEvent['attendees'] = []
  const seenEmails = new Set<string>()
  for (const prop of vevent.getAllProperties('attendee')) {
    const email = stripMailto(String(prop.getFirstValue() || ''))
    const cn = prop.getParameter('cn') ? String(prop.getParameter('cn')).trim() : undefined
    if (!email && !cn) continue
    const key = (email || cn || '').toLowerCase()
    if (seenEmails.has(key)) continue
    seenEmails.add(key)

    const partstat = prop.getParameter('partstat')
    const role = prop.getParameter('role') ? String(prop.getParameter('role')).toUpperCase() : ''
    const isOrganizer = Boolean(organizer?.email && email && organizer.email.toLowerCase() === email.toLowerCase())

    attendees.push({
      name: cn || undefined,
      email,
      status: normalizeAttendeeStatus(partstat ? String(partstat) : undefined),
      optional: role === 'OPT-PARTICIPANT' ? true : undefined,
      organizer: isOrganizer ? true : undefined
    })
  }

  // Attachments (ATTACH with http(s) URI)
  const attachments: NonNullable<CalendarEvent['attachments']> = []
  const seenAttUrls = new Set<string>()
  for (const prop of vevent.getAllProperties('attach')) {
    const val = cleanExtractedUrl(String(prop.getFirstValue() || ''))
    if (!/^https?:\/\//i.test(val) || seenAttUrls.has(val)) continue
    seenAttUrls.add(val)
    const filenameParam = prop.getParameter('filename') || prop.getParameter('x-filename')
    const fmtType = prop.getParameter('fmttype')
    attachments.push({
      title: filenameParam ? String(filenameParam) : filenameFromUrl(val),
      fileUrl: val,
      mimeType: fmtType ? String(fmtType) : undefined
    })
  }

  // Meeting URL & htmlLink from explicit ICS conference/URL properties first, then regex fallback
  const readUrlProp = (name: string): string | undefined => {
    const p = vevent.getFirstProperty(name)
    if (!p) return undefined
    const v = cleanExtractedUrl(String(p.getFirstValue() || ''))
    return /^https?:\/\//i.test(v) ? v : undefined
  }

  const teamsProp = readUrlProp('x-microsoft-skypeteamsmeetingurl')
  const googleConfProp = readUrlProp('x-google-conference')
  let conferenceProp: string | undefined
  for (const cp of vevent.getAllProperties('conference')) {
    const v = cleanExtractedUrl(String(cp.getFirstValue() || ''))
    if (/^https?:\/\//i.test(v)) {
      conferenceProp = v
      break
    }
  }
  const urlProp = readUrlProp('url')

  const location = (ev.location || '').trim()
  const meetingUrl =
    teamsProp ||
    googleConfProp ||
    conferenceProp ||
    (urlProp && extractMeetingUrl(urlProp)) ||
    extractMeetingUrl(`${location}\n${description}`, descriptionHtml)

  const htmlLink = urlProp && urlProp !== meetingUrl ? urlProp : undefined

  const statusProp = vevent.getFirstPropertyValue('status')
  const status = normalizeEventStatus(statusProp ? String(statusProp) : undefined)

  const recIdProp = vevent.getFirstPropertyValue('recurrence-id')
  let recurrenceIdMs: number | undefined
  if (recIdProp && typeof (recIdProp as ICAL.Time).toJSDate === 'function') {
    recurrenceIdMs = (recIdProp as ICAL.Time).toJSDate().getTime()
  }

  return {
    uid,
    title: (ev.summary || '').trim() || '(No title)',
    description,
    descriptionHtml,
    location,
    meetingUrl,
    htmlLink,
    organizer,
    attendees,
    attachments,
    status,
    allDay: Boolean(ev.startDate.isDate),
    startAt,
    endAt,
    isRecurring: ev.isRecurring(),
    recurrenceIdMs
  }
}
