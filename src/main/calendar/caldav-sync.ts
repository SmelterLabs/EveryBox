import ICAL from 'ical.js'
import { createDAVClient } from 'tsdav'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { Account, CalendarEvent, CreateCalendarEventPayload } from '../../shared/types'
import { extractIcsVEventDetails, extractMeetingUrl, normalizeEventDescription } from './calendar-utils'

export { extractMeetingUrl }

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

    // Process master/regular VEVENTs first, then RECURRENCE-ID override VEVENTs so overrides win cleanly.
    const masters: ICAL.Component[] = []
    const overrides: ICAL.Component[] = []
    for (const vevent of vevents) {
      if (vevent.getFirstProperty('recurrence-id')) overrides.push(vevent)
      else masters.push(vevent)
    }

    for (const vevent of [...masters, ...overrides]) {
      const details = extractIcsVEventDetails(vevent)
      if (!details) continue
      const ev = new ICAL.Event(vevent)

      if (details.isRecurring && details.recurrenceIdMs === undefined) {
        const durationMs = Math.max(details.endAt - details.startAt, 15 * 60_000)
        const iter = ev.iterator()
        let next = iter.next()
        let guard = 0
        while (next && guard < 250) {
          guard += 1
          const occStart = next.toJSDate().getTime()
          if (occStart > windowEnd) break
          if (occStart >= windowStart) {
            db.upsertCalendarEvent({
              id: `${account.id}|${source}|${calendarId}|${details.uid}|${occStart}`,
              accountId: account.id,
              calendarId,
              calendarName,
              remoteId: details.uid,
              title: details.title,
              description: details.description,
              descriptionHtml: details.descriptionHtml,
              location: details.location,
              meetingUrl: details.meetingUrl,
              htmlLink: details.htmlLink,
              organizer: details.organizer,
              startAt: occStart,
              endAt: occStart + durationMs,
              allDay: details.allDay,
              attendees: details.attendees,
              attachments: details.attachments,
              status: details.status,
              source,
              readOnly
            })
            count += 1
          }
          next = iter.next()
        }
      } else {
        const idSuffix =
          details.recurrenceIdMs !== undefined ? `|${details.recurrenceIdMs}` : ''
        db.upsertCalendarEvent({
          id: `${account.id}|${source}|${calendarId}|${details.uid}${idSuffix}`,
          accountId: account.id,
          calendarId,
          calendarName,
          remoteId: details.uid,
          title: details.title,
          description: details.description,
          descriptionHtml: details.descriptionHtml,
          location: details.location,
          meetingUrl: details.meetingUrl,
          htmlLink: details.htmlLink,
          organizer: details.organizer,
          startAt: details.startAt,
          endAt: details.endAt,
          allDay: details.allDay,
          attendees: details.attendees,
          attachments: details.attachments,
          status: details.status,
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
    if (ev.meetingUrl || ev.htmlLink) lines.push(`URL:${ev.meetingUrl || ev.htmlLink}`)
    if (ev.organizer?.email) {
      const cn = ev.organizer.name ? `;CN=${escapeIcsText(ev.organizer.name)}` : ''
      lines.push(`ORGANIZER${cn}:mailto:${ev.organizer.email}`)
    }
    if (ev.status) lines.push(`STATUS:${ev.status.toUpperCase()}`)
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

  const uid = `everybox-${Date.now()}@local`
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const iCalString = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EveryBox//Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(payload.startAt)}`,
    `DTEND:${fmt(payload.endAt)}`,
    `SUMMARY:${escapeIcsText(payload.title)}`,
    ...(payload.location ? [`LOCATION:${escapeIcsText(payload.location)}`] : []),
    ...(payload.description ? [`DESCRIPTION:${escapeIcsText(payload.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  await client.createCalendarObject({
    calendar: target,
    filename: `${uid}.ics`,
    iCalString
  })

  const id = `${account.id}|caldav|${target.url}|${uid}`
  const { description, descriptionHtml } = normalizeEventDescription(payload.description || '')
  const meetingUrl = extractMeetingUrl(`${payload.location || ''}\n${description}`, descriptionHtml)
  db.upsertCalendarEvent({
    id,
    accountId: account.id,
    calendarId: target.url,
    calendarName: String(target.displayName || 'CalDAV'),
    remoteId: uid,
    title: payload.title,
    description,
    descriptionHtml,
    location: payload.location || '',
    meetingUrl,
    organizer: { name: account.name || undefined, email: account.email },
    startAt: payload.startAt,
    endAt: payload.endAt,
    allDay: payload.allDay,
    attendees: (payload.attendees || []).map((email) => ({ email })),
    status: 'confirmed',
    source: 'caldav',
    readOnly: false
  })
  return { ok: true, id }
}
