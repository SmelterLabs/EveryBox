import ICAL from 'ical.js'
import { createDAVClient } from 'tsdav'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { Account, CalendarEvent, CreateCalendarEventPayload } from '../../shared/types'

const MEETING_URL_REGEX =
  /https?:\/\/(?:[\w.-]*zoom\.us\/j\/[^\s<>"]+|meet\.google\.com\/[a-z-]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+|[\w.-]*webex\.com\/[^\s<>"]+)/i

export function extractMeetingUrl(text: string): string | undefined {
  const match = text.match(MEETING_URL_REGEX)
  return match ? match[0] : undefined
}

export function ingestIcsText(
  icsText: string,
  account: Account,
  calendarId: string,
  calendarName: string,
  source: 'caldav' | 'ics' | 'local',
  readOnly: boolean,
  db: GlassmailDB
): number {
  let count = 0
  try {
    const jcal = ICAL.parse(icsText)
    const comp = new ICAL.Component(jcal)
    const vevents = comp.getAllSubcomponents('vevent')
    const windowStart = Date.now() - 180 * 24 * 3600 * 1000
    const windowEnd = Date.now() + 365 * 24 * 3600 * 1000

    for (const vevent of vevents) {
      const ev = new ICAL.Event(vevent)
      if (!ev.startDate) continue
      const uid = ev.uid || `${ev.startDate.toJSDate().getTime()}-${ev.summary || 'event'}`
      const meetingUrl = extractMeetingUrl(`${ev.location || ''}\n${ev.description || ''}`)

      if (ev.isRecurring()) {
        const durationMs =
          ev.endDate && ev.startDate
            ? Math.max(ev.endDate.toJSDate().getTime() - ev.startDate.toJSDate().getTime(), 15 * 60_000)
            : 3600_000
        const iter = ev.iterator()
        let next = iter.next()
        let guard = 0
        while (next && guard < 250) {
          guard += 1
          const occStart = next.toJSDate().getTime()
          if (occStart > windowEnd) break
          if (occStart >= windowStart) {
            db.upsertCalendarEvent({
              id: `${account.id}|${source}|${calendarId}|${uid}|${occStart}`,
              accountId: account.id,
              calendarId,
              calendarName,
              remoteId: uid,
              title: ev.summary || '(No title)',
              description: ev.description || '',
              location: ev.location || '',
              meetingUrl,
              startAt: occStart,
              endAt: occStart + durationMs,
              allDay: ev.startDate.isDate,
              attendees: [],
              status: 'confirmed',
              source,
              readOnly
            })
            count += 1
          }
          next = iter.next()
        }
      } else {
        const startAt = ev.startDate.toJSDate().getTime()
        const endAt = ev.endDate ? ev.endDate.toJSDate().getTime() : startAt + 3600_000
        db.upsertCalendarEvent({
          id: `${account.id}|${source}|${calendarId}|${uid}`,
          accountId: account.id,
          calendarId,
          calendarName,
          remoteId: uid,
          title: ev.summary || '(No title)',
          description: ev.description || '',
          location: ev.location || '',
          meetingUrl,
          startAt,
          endAt,
          allDay: ev.startDate.isDate,
          attendees: [],
          status: 'confirmed',
          source,
          readOnly
        })
        count += 1
      }
    }
  } catch {
    // Ignore malformed ICS entries
  }
  return count
}

function escapeIcsText(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export function exportEventsToIcs(events: CalendarEvent[]): string {
  const fmtUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EveryBox//Calendar Export//EN',
    'CALSCALE:GREGORIAN'
  ]

  for (const ev of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${escapeIcsText(ev.remoteId || ev.id)}`)
    lines.push(`DTSTAMP:${fmtUtc(Date.now())}`)
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(ev.startAt)}`)
      lines.push(`DTEND;VALUE=DATE:${fmtDate(Math.max(ev.endAt, ev.startAt + 86400_000))}`)
    } else {
      lines.push(`DTSTART:${fmtUtc(ev.startAt)}`)
      lines.push(`DTEND:${fmtUtc(ev.endAt)}`)
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.title || '(No title)')}`)
    if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export async function syncImapAccountCalendars(
  account: Account,
  secrets: SecretStore,
  db: GlassmailDB
): Promise<{ synced: number }> {
  let synced = 0

  // 1. Optional Two-Way CalDAV
  if (account.caldavUrl) {
    const password = secrets.get(`caldav_pass:${account.id}`) || secrets.get(`imap_pass:${account.id}`)
    if (password) {
      const client = await createDAVClient({
        serverUrl: account.caldavUrl,
        credentials: {
          username: account.caldavUsername || account.email,
          password
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav'
      })
      const calendars = await client.fetchCalendars()
      const timeRange = {
        start: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        end: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()
      }
      for (const cal of calendars) {
        if (!cal.url) continue
        const objects = await client.fetchCalendarObjects({ calendar: cal, timeRange })
        for (const obj of objects) {
          if (typeof obj.data === 'string') {
            synced += ingestIcsText(
              obj.data,
              account,
              cal.url,
              String(cal.displayName || 'CalDAV'),
              'caldav',
              false,
              db
            )
          }
        }
      }
    }
  }

  // 2. Optional Read-Only ICS Feed URL
  if (account.icsFeedUrl) {
    const res = await fetch(account.icsFeedUrl)
    if (res.ok) {
      const text = await res.text()
      synced += ingestIcsText(text, account, 'ics-feed', `${account.name} Feed`, 'ics', true, db)
    }
  }

  return { synced }
}

export async function createCalDavEvent(
  account: Account,
  secrets: SecretStore,
  payload: CreateCalendarEventPayload,
  db: GlassmailDB
): Promise<{ ok: boolean; id?: string }> {
  if (!account.caldavUrl) return { ok: false }
  const password = secrets.get(`caldav_pass:${account.id}`) || secrets.get(`imap_pass:${account.id}`)
  if (!password) return { ok: false }

  const client = await createDAVClient({
    serverUrl: account.caldavUrl,
    credentials: {
      username: account.caldavUsername || account.email,
      password
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav'
  })

  const calendars = await client.fetchCalendars()
  const target = calendars.find((c) => c.url === payload.calendarId) || calendars[0]
  if (!target?.url) return { ok: false }

  const uid = `glassmail-${Date.now()}@local`
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const iCalString = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Glassmail Windows//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(payload.startAt)}`,
    `DTEND:${fmt(payload.endAt)}`,
    `SUMMARY:${payload.title}`,
    ...(payload.location ? [`LOCATION:${payload.location}`] : []),
    ...(payload.description ? [`DESCRIPTION:${payload.description.replace(/\n/g, '\\n')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  await client.createCalendarObject({
    calendar: target,
    filename: `${uid}.ics`,
    iCalString
  })

  const id = `${account.id}|caldav|${target.url}|${uid}`
  db.upsertCalendarEvent({
    id,
    accountId: account.id,
    calendarId: target.url,
    calendarName: String(target.displayName || 'CalDAV'),
    remoteId: uid,
    title: payload.title,
    description: payload.description || '',
    location: payload.location || '',
    startAt: payload.startAt,
    endAt: payload.endAt,
    allDay: payload.allDay,
    attendees: [],
    status: 'confirmed',
    source: 'caldav',
    readOnly: false
  })
  return { ok: true, id }
}
