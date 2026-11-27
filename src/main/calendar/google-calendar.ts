import { google, type calendar_v3 } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { GlassmailDB } from '../db/database'
import type { Account, CalendarEvent, CreateCalendarEventPayload } from '../../shared/types'
import {
  cleanExtractedUrl,
  extractMeetingUrl,
  normalizeAttendeeStatus,
  normalizeEventDescription,
  normalizeEventStatus
} from './calendar-utils'

const MAX_GCAL_PAGES = 20

function extractGoogleMeetingUrl(
  item: calendar_v3.Schema$Event,
  plainDescription: string,
  descriptionHtml?: string
): string | undefined {
  if (item.hangoutLink) {
    return cleanExtractedUrl(item.hangoutLink)
  }
  const entryPoints = item.conferenceData?.entryPoints || []
  const videoEntry = entryPoints.find((e) => e.entryPointType === 'video' && e.uri)
  if (videoEntry?.uri) {
    return cleanExtractedUrl(videoEntry.uri)
  }
  const moreEntry = entryPoints.find((e) => e.uri && /^https?:\/\//i.test(e.uri))
  if (moreEntry?.uri) {
    return cleanExtractedUrl(moreEntry.uri)
  }
  return extractMeetingUrl(`${item.location || ''}\n${plainDescription}`, descriptionHtml)
}

export async function syncGoogleCalendar(
  account: Account,
  auth: OAuth2Client,
  db: GlassmailDB
): Promise<{ synced: number }> {
  const calendar = google.calendar({ version: 'v3', auth })

  const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()

  const freshEvents: Omit<CalendarEvent, 'accountColor' | 'accountEmail'>[] = []
  let calSummary = account.name || account.email
  let pageToken: string | undefined
  let pageCount = 0

  // Sync strictly the account's own 'primary' calendar by default so subscribed coworker,
  // conference-room, or duplicate holiday calendars never pollute the user's schedule.
  // Paginate via nextPageToken so busy calendars never drop events beyond the first 250.
  while (pageCount < MAX_GCAL_PAGES) {
    const evRes = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken
    })

    if (pageCount === 0 && evRes.data.summary) {
      calSummary = evRes.data.summary
    }

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

      const { description, descriptionHtml } = normalizeEventDescription(item.description || '')
      const meetingUrl = extractGoogleMeetingUrl(item, description, descriptionHtml)

      const organizer =
        item.organizer && (item.organizer.email || item.organizer.displayName)
          ? {
              name: item.organizer.displayName || undefined,
              email: item.organizer.email || ''
            }
          : undefined

      freshEvents.push({
        id: `${account.id}|gcal|primary|${item.id}`,
        accountId: account.id,
        calendarId: 'primary',
        calendarName: calSummary,
        remoteId: item.id,
        title: item.summary || '(No title)',
        description,
        descriptionHtml,
        location: item.location || '',
        meetingUrl,
        htmlLink: item.htmlLink || undefined,
        organizer,
        startAt,
        endAt,
        allDay,
        attendees: (item.attendees || []).map((a) => ({
          name: a.displayName || undefined,
          email: a.email || '',
          status: normalizeAttendeeStatus(a.responseStatus),
          organizer: a.organizer ? true : undefined,
          optional: a.optional ? true : undefined
        })),
        attachments: (item.attachments || [])
          .filter((att) => Boolean(att.fileUrl))
          .map((att) => ({
            title: att.title || 'Attachment',
            fileUrl: att.fileUrl!,
            mimeType: att.mimeType || undefined
          })),
        status: normalizeEventStatus(item.status),
        source: 'google',
        readOnly: false
      })
    }

    pageToken = evRes.data.nextPageToken || undefined
    pageCount += 1
    if (!pageToken) break
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
    const { description, descriptionHtml } = normalizeEventDescription(item.description ?? payload.description ?? '')
    const meetingUrl = extractGoogleMeetingUrl(item, description, descriptionHtml)
    db.upsertCalendarEvent({
      id,
      accountId: account.id,
      calendarId,
      calendarName: account.name || 'Primary',
      remoteId: item.id,
      title: payload.title,
      description,
      descriptionHtml,
      location: payload.location || '',
      meetingUrl,
      htmlLink: item.htmlLink || undefined,
      organizer: { name: account.name || undefined, email: account.email },
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
