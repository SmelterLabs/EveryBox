import ICAL from 'ical.js'
import { createDAVClient } from 'tsdav'
import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { Account, CreateCalendarEventPayload } from '../../shared/types'

function ingestIcsText(
  icsText: string,
  account: Account,
  calendarId: string,
  calendarName: string,
  source: 'caldav' | 'ics',
  readOnly: boolean,
  db: GlassmailDB
): number {
  let count = 0
  try {
    const jcal = ICAL.parse(icsText)
    const comp = new ICAL.Component(jcal)
    const vevents = comp.getAllSubcomponents('vevent')
    for (const vevent of vevents) {
      const ev = new ICAL.Event(vevent)
      if (!ev.startDate) continue
      const startAt = ev.startDate.toJSDate().getTime()
      const endAt = ev.endDate ? ev.endDate.toJSDate().getTime() : startAt + 3600_000
      const uid = ev.uid || `${startAt}-${ev.summary || 'event'}`
      db.upsertCalendarEvent({
        id: `${account.id}|${source}|${calendarId}|${uid}`,
        accountId: account.id,
        calendarId,
        calendarName,
        remoteId: uid,
        title: ev.summary || '(No title)',
        description: ev.description || '',
        location: ev.location || '',
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
  } catch {
    // Ignore malformed ICS entries
  }
  return count
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
