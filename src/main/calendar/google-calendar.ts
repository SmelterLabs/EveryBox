import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { GlassmailDB } from '../db/database'
import type { Account, CreateCalendarEventPayload } from '../../shared/types'

export async function syncGoogleCalendar(
  account: Account,
  auth: OAuth2Client,
  db: GlassmailDB
): Promise<{ synced: number }> {
  const calendar = google.calendar({ version: 'v3', auth })
  const listRes = await calendar.calendarList.list()
  const calendars = (listRes.data.items || []).filter((c) => c.selected !== false)

  const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()

  const freshEvents: Omit<import('../../shared/types').CalendarEvent, 'accountColor' | 'accountEmail'>[] = []

  for (const cal of calendars) {
    if (!cal.id) continue
    try {
      const evRes = await calendar.events.list({
        calendarId: cal.id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250
      })

      for (const item of evRes.data.items || []) {
        if (!item.id) continue
        if (item.status === 'cancelled') continue
        // Skip Google Calendar "Working Location" (Home/Office) blocks that clutter multi-account views
        if (item.eventType === 'workingLocation') continue

        const allDay = Boolean(item.start?.date && !item.start?.dateTime)
        const startAt = item.start?.dateTime
          ? new Date(item.start.dateTime).getTime()
          : item.start?.date
            ? new Date(`${item.start.date}T00:00:00`).getTime()
            : Date.now()
        // Google Calendar's all-day end.date is EXCLUSIVE (e.g. Nov 26 event has end.date = Nov 27).
        // Using T00:00:00 ensures 1-day all-day events stay strictly on their own day.
        const endAt = item.end?.dateTime
          ? new Date(item.end.dateTime).getTime()
          : item.end?.date
            ? Math.max(new Date(`${item.end.date}T00:00:00`).getTime(), startAt + 3600_000)
            : startAt + 3600_000

        const meetingUrl =
          item.hangoutLink ||
          item.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
          undefined

        freshEvents.push({
          id: `${account.id}|gcal|${cal.id}|${item.id}`,
          accountId: account.id,
          calendarId: cal.id,
          calendarName: cal.summary || 'Calendar',
          remoteId: item.id,
          title: item.summary || '(No title)',
          description: item.description || '',
          location: item.location || '',
          meetingUrl,
          startAt,
          endAt,
          allDay,
          attendees: (item.attendees || []).map((a) => ({
            name: a.displayName || undefined,
            email: a.email || '',
            status: a.responseStatus || undefined
          })),
          status: (item.status as 'confirmed' | 'tentative' | 'cancelled') || 'confirmed',
          source: 'google',
          readOnly: cal.accessRole === 'reader' || cal.accessRole === 'freeBusyReader'
        })
      }
    } catch {
      // Skip individual inaccessible sub-calendars cleanly
    }
  }

  db.deleteCalendarEventsBySource(account.id, 'google')
  for (const ev of freshEvents) {
    db.upsertCalendarEvent(ev)
  }
  return { synced: freshEvents.length }
}

export async function createGoogleCalendarEvent(
  account: Account,
  auth: OAuth2Client,
  payload: CreateCalendarEventPayload,
  db: GlassmailDB
): Promise<{ ok: boolean; id?: string }> {
  const calendar = google.calendar({ version: 'v3', auth })
  const calendarId = payload.calendarId || 'primary'

  const start = payload.allDay
    ? { date: new Date(payload.startAt).toISOString().slice(0, 10) }
    : { dateTime: new Date(payload.startAt).toISOString() }
  const end = payload.allDay
    ? { date: new Date(payload.endAt).toISOString().slice(0, 10) }
    : { dateTime: new Date(payload.endAt).toISOString() }

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: payload.title,
      description: payload.description,
      location: payload.location,
      start,
      end,
      attendees: (payload.attendees || []).filter(Boolean).map((email) => ({ email }))
    }
  })

  const item = res.data
  if (item.id) {
    const id = `${account.id}|gcal|${calendarId}|${item.id}`
    db.upsertCalendarEvent({
      id,
      accountId: account.id,
      calendarId,
      calendarName: 'Primary',
      remoteId: item.id,
      title: payload.title,
      description: payload.description || '',
      location: payload.location || '',
      startAt: payload.startAt,
      endAt: payload.endAt,
      allDay: payload.allDay,
      attendees: (payload.attendees || []).map((email) => ({ email })),
      status: 'confirmed',
      source: 'google',
      readOnly: false
    })
    return { ok: true, id }
  }
  return { ok: false }
}

export async function deleteGoogleCalendarEvent(
  auth: OAuth2Client,
  calendarId: string,
  remoteId: string
): Promise<void> {
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({ calendarId, eventId: remoteId })
}
