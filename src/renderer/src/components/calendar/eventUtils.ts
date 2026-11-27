import type { CalendarEvent } from '../../../../shared/types'

export interface EventOrganizer {
  name?: string
  email?: string
}

/**
 * Forward-compatible extension of CalendarEvent so optional fields added by
 * calendar sync providers (organizer, htmlLink, descriptionHtml, etc.) render
 * gracefully whenever present.
 */
export interface RichAttendee {
  name?: string
  email: string
  status?: string
  organizer?: boolean
  optional?: boolean
}

export type RichCalendarEvent = Omit<CalendarEvent, 'attendees'> & {
  attendees: RichAttendee[]
  organizer?: EventOrganizer | string | null
  organizerName?: string
  organizerEmail?: string
  htmlLink?: string
  descriptionHtml?: string
  conferenceName?: string
  recurrence?: string
}

export interface EventOccurrence {
  accountId: string
  email: string
  color: string
  calendarName: string
  icon?: CalendarEvent['accountIcon']
}

export interface MergedCalendarEvent {
  primary: RichCalendarEvent
  occurrences: EventOccurrence[]
}

export interface PositionedEvent {
  item: MergedCalendarEvent
  topPx: number
  heightPx: number
  col: number
  colCount: number
}

export type RichTextSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; label: string; url: string }

export interface RichTextLine {
  isBullet: boolean
  segments: RichTextSegment[]
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatDuration(startAt: number, endAt: number): string {
  const mins = Math.max(0, Math.round((endAt - startAt) / 60_000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr${h === 1 ? '' : 's'}`
}

export function formatTimeShort(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatEventSchedule(ev: CalendarEvent): {
  dateLabel: string
  timeLabel: string
  durationLabel: string
} {
  const start = new Date(ev.startAt)
  const end = new Date(ev.endAt)
  if (ev.allDay) {
    const endDisplay = new Date(Math.max(ev.startAt, ev.endAt - 60_000))
    const multiDay = !isSameDay(start, endDisplay)
    const dateLabel = multiDay
      ? `${start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} – ${endDisplay.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`
      : start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    return { dateLabel, timeLabel: 'All day', durationLabel: 'All day' }
  }
  const dateLabel = start.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
  const timeLabel = `${formatTimeShort(ev.startAt)} – ${formatTimeShort(ev.endAt)}`
  const durationLabel = formatDuration(ev.startAt, ev.endAt)
  return { dateLabel, timeLabel, durationLabel }
}

const MEETING_URL_REGEX =
  /https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us\/[jw]\/[^\s"'<>)]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<>)]+|teams\.live\.com\/meet\/[^\s"'<>)]+|meet\.google\.com\/[a-z0-9-]+[^\s"'<>)]*|webex\.com\/[^\s"'<>)]+|meet\.goto\.com\/[^\s"'<>)]+|gotomeet\.me\/[^\s"'<>)]+|whereby\.com\/[^\s"'<>)]+|chime\.aws\/[^\s"'<>)]+|meet\.jit\.si\/[^\s"'<>)]+|bluejeans\.com\/[^\s"'<>)]+|meetings\.ringcentral\.com\/[^\s"'<>)]+|dialpad\.com\/[^\s"'<>)]+)/i

function cleanTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]]+$/, '')
}

export function extractMeetingUrl(ev: RichCalendarEvent): string | undefined {
  if (ev.meetingUrl && /^https?:\/\//i.test(ev.meetingUrl.trim())) {
    return ev.meetingUrl.trim()
  }
  const sources = [ev.location, ev.descriptionHtml, ev.description]
  for (const src of sources) {
    if (!src) continue
    const match = src.match(MEETING_URL_REGEX)
    if (match?.[0]) return cleanTrailingPunctuation(match[0])
  }
  return undefined
}

export function getMeetingProviderLabel(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('zoom.us')) return 'Join Zoom'
  if (lower.includes('teams.microsoft.com') || lower.includes('teams.live.com')) return 'Join Teams'
  if (lower.includes('meet.google.com')) return 'Join Google Meet'
  if (lower.includes('webex.com')) return 'Join Webex'
  if (lower.includes('goto.com') || lower.includes('gotomeet.me')) return 'Join GoTo'
  if (lower.includes('whereby.com')) return 'Join Whereby'
  return 'Join meeting'
}

export function getOrganizerInfo(ev: RichCalendarEvent): EventOrganizer | null {
  if (ev.organizer) {
    if (typeof ev.organizer === 'string') {
      const trimmed = ev.organizer.trim()
      if (!trimmed) return null
      return trimmed.includes('@') ? { email: trimmed } : { name: trimmed }
    }
    if (ev.organizer.name || ev.organizer.email) {
      return ev.organizer
    }
  }
  if (ev.organizerName || ev.organizerEmail) {
    return { name: ev.organizerName, email: ev.organizerEmail }
  }
  return null
}

const BARE_URL_OR_MAILTO = /(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+)/gi

function pushTextWithAutoLinks(target: RichTextSegment[], text: string): void {
  if (!text) return
  let lastIdx = 0
  BARE_URL_OR_MAILTO.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BARE_URL_OR_MAILTO.exec(text)) !== null) {
    const start = match.index
    if (start > lastIdx) {
      target.push({ type: 'text', text: text.slice(lastIdx, start) })
    }
    const rawUrl = match[0]
    const cleanUrl = cleanTrailingPunctuation(rawUrl)
    const trailing = rawUrl.slice(cleanUrl.length)
    target.push({ type: 'link', label: cleanUrl, url: cleanUrl })
    if (trailing) {
      target.push({ type: 'text', text: trailing })
    }
    lastIdx = start + rawUrl.length
  }
  if (lastIdx < text.length) {
    target.push({ type: 'text', text: text.slice(lastIdx) })
  }
}

function isSafeExternalUrl(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim())
}

/**
 * Safely parses HTML or plain-text calendar descriptions into renderable lines
 * while preserving `<a href="...">label</a>` links and auto-linking bare URLs.
 * Uses DOMParser (no script execution, no dangerouslySetInnerHTML).
 */
export function parseRichDescription(raw: string): RichTextLine[] {
  if (!raw || !raw.trim()) return []

  const hasHtml = /<[a-z][\s\S]*>/i.test(raw)
  if (!hasHtml) {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split('\n')
      .map((line) => {
        const segments: RichTextSegment[] = []
        pushTextWithAutoLinks(segments, line)
        return { isBullet: false, segments }
      })
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')

  // Remove style/script/head elements
  doc.querySelectorAll('script, style, head, meta, link').forEach((el) => el.remove())

  const lines: RichTextLine[] = []
  let current: RichTextLine = { isBullet: false, segments: [] }

  const flushLine = (forceEmpty = false) => {
    const hasContent = current.segments.some((s) =>
      s.type === 'link' ? s.label.trim().length > 0 : s.text.trim().length > 0
    )
    if (hasContent || forceEmpty) {
      lines.push(current)
    }
    current = { isBullet: false, segments: [] }
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\u00a0/g, ' ').replace(/\r?\n/g, ' ')
      if (text) {
        pushTextWithAutoLinks(current.segments, text)
      }
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'br') {
      flushLine(true)
      return
    }

    if (tag === 'a') {
      const href = (el.getAttribute('href') || '').trim()
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (href && isSafeExternalUrl(href)) {
        current.segments.push({ type: 'link', label: label || href, url: href })
      } else if (label) {
        pushTextWithAutoLinks(current.segments, label)
      }
      return
    }

    if (tag === 'li') {
      flushLine(false)
      current = { isBullet: true, segments: [] }
      for (const child of Array.from(el.childNodes)) walk(child)
      flushLine(false)
      return
    }

    const isBlock =
      tag === 'p' ||
      tag === 'div' ||
      tag === 'section' ||
      tag === 'article' ||
      tag === 'blockquote' ||
      tag === 'tr' ||
      tag === 'h1' ||
      tag === 'h2' ||
      tag === 'h3' ||
      tag === 'h4' ||
      tag === 'ul' ||
      tag === 'ol'

    if (isBlock) {
      flushLine(false)
      for (const child of Array.from(el.childNodes)) walk(child)
      flushLine(tag === 'p')
      return
    }

    for (const child of Array.from(el.childNodes)) walk(child)
  }

  for (const child of Array.from(doc.body.childNodes)) {
    walk(child)
  }
  flushLine(false)

  // Collapse runs of more than 1 blank line and trim leading/trailing blank lines
  const normalized: RichTextLine[] = []
  for (const line of lines) {
    const empty =
      !line.isBullet &&
      line.segments.every((s) => s.type === 'text' && s.text.trim().length === 0)
    if (empty) {
      if (normalized.length === 0) continue
      const prev = normalized[normalized.length - 1]
      const prevEmpty =
        !prev.isBullet &&
        prev.segments.every((s) => s.type === 'text' && s.text.trim().length === 0)
      if (prevEmpty) continue
    }
    normalized.push(line)
  }
  while (
    normalized.length > 0 &&
    !normalized[normalized.length - 1].isBullet &&
    normalized[normalized.length - 1].segments.every(
      (s) => s.type === 'text' && s.text.trim().length === 0
    )
  ) {
    normalized.pop()
  }

  return normalized
}

export function formatAgendaPlainText(raw: string): string {
  const lines = parseRichDescription(raw)
  return lines
    .map((line) => {
      const prefix = line.isBullet ? '• ' : ''
      const text = line.segments
        .map((seg) => {
          if (seg.type === 'text') return seg.text
          return seg.label === seg.url ? seg.url : `${seg.label} (${seg.url})`
        })
        .join('')
      return prefix + text
    })
    .join('\n')
    .trim()
}

export function mergeDuplicateEvents(
  list: RichCalendarEvent[],
  accountPriority: Map<string, number>
): MergedCalendarEvent[] {
  const rankOf = (accountId: string) =>
    accountPriority.has(accountId) ? accountPriority.get(accountId)! : Number.MAX_SAFE_INTEGER

  const map = new Map<string, MergedCalendarEvent>()
  for (const ev of list) {
    const key = `${ev.title.trim().toLowerCase()}|${ev.startAt}|${ev.endAt}|${ev.allDay ? '1' : '0'}`
    const existing = map.get(key)
    const occ: EventOccurrence = {
      accountId: ev.accountId,
      email: ev.accountEmail,
      color: ev.accountColor,
      calendarName: ev.calendarName,
      icon: ev.accountIcon
    }
    if (!existing) {
      map.set(key, { primary: ev, occurrences: [occ] })
    } else {
      const curRank = rankOf(existing.primary.accountId)
      const newRank = rankOf(ev.accountId)
      const richness = (e: RichCalendarEvent) =>
        (e.readOnly ? 0 : 4) +
        (e.meetingUrl ? 2 : 0) +
        (e.descriptionHtml || e.description ? 1 : 0) +
        ((e.attachments?.length || 0) > 0 ? 1 : 0)

      const mergeFields = (winner: RichCalendarEvent, loser: RichCalendarEvent): RichCalendarEvent => ({
        ...winner,
        meetingUrl: winner.meetingUrl || loser.meetingUrl,
        description: winner.description || loser.description,
        descriptionHtml: winner.descriptionHtml || loser.descriptionHtml,
        location: winner.location || loser.location,
        organizer: winner.organizer || loser.organizer,
        organizerName: winner.organizerName || loser.organizerName,
        organizerEmail: winner.organizerEmail || loser.organizerEmail,
        htmlLink: winner.htmlLink || loser.htmlLink,
        attendees: winner.attendees.length >= loser.attendees.length ? winner.attendees : loser.attendees,
        attachments:
          (winner.attachments?.length || 0) >= (loser.attachments?.length || 0)
            ? winner.attachments
            : loser.attachments
      })

      if (newRank < curRank || (newRank === curRank && richness(ev) > richness(existing.primary))) {
        existing.primary = mergeFields(ev, existing.primary)
      } else {
        existing.primary = mergeFields(existing.primary, ev)
      }

      if (!existing.occurrences.some((o) => o.email === occ.email && o.color === occ.color)) {
        existing.occurrences.push(occ)
      }
    }
  }

  for (const entry of map.values()) {
    entry.occurrences.sort((a, b) => rankOf(a.accountId) - rankOf(b.accountId))
  }
  return Array.from(map.values())
}

/**
 * Computes side-by-side column positions for overlapping timed events on a single day.
 */
export function layoutDayTimedEvents(
  items: MergedCalendarEvent[],
  dayStartMs: number,
  hourHeightPx: number
): PositionedEvent[] {
  const dayEndMs = dayStartMs + 86_400_000
  const sorted = [...items].sort((a, b) => {
    if (a.primary.startAt !== b.primary.startAt) return a.primary.startAt - b.primary.startAt
    const durA = a.primary.endAt - a.primary.startAt
    const durB = b.primary.endAt - b.primary.startAt
    if (durA !== durB) return durB - durA
    return a.primary.title.localeCompare(b.primary.title)
  })

  type Entry = {
    item: MergedCalendarEvent
    startMin: number
    endMin: number
    col: number
    colCount: number
  }

  const entries: Entry[] = sorted.map((item) => {
    const clampedStart = Math.max(item.primary.startAt, dayStartMs)
    const clampedEnd = Math.min(Math.max(item.primary.endAt, clampedStart + 15 * 60_000), dayEndMs)
    const startMin = (clampedStart - dayStartMs) / 60_000
    const endMin = Math.max(startMin + 20, (clampedEnd - dayStartMs) / 60_000)
    return { item, startMin, endMin, col: 0, colCount: 1 }
  })

  // Cluster overlapping intervals and assign columns greedily per cluster
  let cluster: Entry[] = []
  let clusterEnd = -1

  const finalizeCluster = (group: Entry[]) => {
    if (group.length === 0) return
    const colEndTimes: number[] = []
    for (const e of group) {
      let placed = false
      for (let c = 0; c < colEndTimes.length; c++) {
        if (colEndTimes[c] <= e.startMin) {
          e.col = c
          colEndTimes[c] = e.endMin
          placed = true
          break
        }
      }
      if (!placed) {
        e.col = colEndTimes.length
        colEndTimes.push(e.endMin)
      }
    }
    const total = Math.max(1, colEndTimes.length)
    for (const e of group) {
      e.colCount = total
    }
  }

  for (const e of entries) {
    if (cluster.length === 0 || e.startMin < clusterEnd) {
      cluster.push(e)
      clusterEnd = Math.max(clusterEnd, e.endMin)
    } else {
      finalizeCluster(cluster)
      cluster = [e]
      clusterEnd = e.endMin
    }
  }
  finalizeCluster(cluster)

  return entries.map((e) => ({
    item: e.item,
    topPx: (e.startMin / 60) * hourHeightPx,
    heightPx: Math.max(24, ((e.endMin - e.startMin) / 60) * hourHeightPx - 2),
    col: e.col,
    colCount: e.colCount
  }))
}
