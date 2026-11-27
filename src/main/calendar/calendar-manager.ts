import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { CalendarEvent, CreateCalendarEventPayload, OutlookCalendarInfo } from '../../shared/types'
import { getAuthorizedGoogleClient } from '../mail/gmail-oauth'
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent, syncGoogleCalendar } from './google-calendar'
import { createCalDavEvent, exportEventsToIcs, ingestIcsText, syncImapAccountCalendars } from './caldav-sync'
import { extractMeetingUrl, normalizeEventDescription } from './calendar-utils'
import { importOutlookCalendar, listOutlookCalendars } from './outlook-import'

export class CalendarManager {
  private syncing = false

  constructor(
    private db: GlassmailDB,
    private secrets: SecretStore
  ) {}

  async syncAllCalendars(): Promise<{ synced: number }> {
    if (this.syncing) return { synced: 0 }
    this.syncing = true
    try {
      const accounts = this.db.listAccounts().filter((a) => a.isEnabled && a.calendarEnabled && !a.isDemo)
      const settings = this.db.getSettings()
      let total = 0

      await Promise.all(
        accounts.map(async (account) => {
          try {
            if (account.provider === 'gmail') {
              if (!settings.googleOAuthClientId || !settings.googleOAuthClientSecret) return
              const auth = getAuthorizedGoogleClient(
                account.id,
                settings.googleOAuthClientId,
                settings.googleOAuthClientSecret,
                this.secrets
              )
              if (!auth) return
              const res = await syncGoogleCalendar(account, auth, this.db)
              total += res.synced
            } else if (account.provider === 'outlook-local') {
              if (account.caldavUrl) {
                const res = await importOutlookCalendar(account.caldavUrl, account, this.db)
                if (res.ok) total += res.imported
              }
            } else {
              const res = await syncImapAccountCalendars(account, this.secrets, this.db)
              total += res.synced
            }
          } catch {
            // Non-fatal per-account calendar sync error
          }
        })
      )
      return { synced: total }
    } finally {
      this.syncing = false
    }
  }

  listEvents(startAt: number, endAt: number, accountIds?: string[]): CalendarEvent[] {
    return this.db.listCalendarEvents(startAt, endAt, accountIds)
  }

  findEventForInvite(
    accountId: string,
    uid?: string,
    startAt?: number,
    title?: string
  ): CalendarEvent | null {
    return this.db.findCalendarEventForInvite(accountId, uid, startAt, title)
  }

  async createEvent(payload: CreateCalendarEventPayload): Promise<{ ok: boolean; id?: string; error?: string }> {
    const account = this.db.getAccount(payload.accountId)
    if (!account) return { ok: false, error: 'Account not found.' }

    if (account.isDemo || account.provider === 'outlook-local' || (account.provider === 'imap' && !account.caldavUrl)) {
      const id = `${account.id}|local|primary|${Date.now()}`
      const { description, descriptionHtml } = normalizeEventDescription(payload.description || '')
      const meetingUrl = extractMeetingUrl(`${payload.location || ''}\n${description}`, descriptionHtml)
      this.db.upsertCalendarEvent({
        id,
        accountId: account.id,
        calendarId: 'primary',
        calendarName: account.name,
        remoteId: id,
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
        source: 'local',
        readOnly: false
      })
      return { ok: true, id }
    }

    try {
      if (account.provider === 'gmail') {
        const settings = this.db.getSettings()
        const auth = getAuthorizedGoogleClient(
          account.id,
          settings.googleOAuthClientId || '',
          settings.googleOAuthClientSecret || '',
          this.secrets
        )
        if (!auth) throw new Error('Gmail calendar auth missing.')
        return await createGoogleCalendarEvent(account, auth, payload, this.db)
      } else {
        return await createCalDavEvent(account, this.secrets, payload, this.db)
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteEvent(eventId: string): Promise<{ ok: boolean; error?: string }> {
    const events = this.db.listCalendarEvents(0, Date.now() + 365 * 24 * 3600 * 1000 * 5)
    const ev = events.find((e) => e.id === eventId)
    if (!ev) return { ok: false, error: 'Event not found.' }

    this.db.deleteCalendarEvent(eventId)
    const account = this.db.getAccount(ev.accountId)
    if (account && !account.isDemo && ev.source === 'google') {
      const settings = this.db.getSettings()
      const auth = getAuthorizedGoogleClient(
        account.id,
        settings.googleOAuthClientId || '',
        settings.googleOAuthClientSecret || '',
        this.secrets
      )
      if (auth) {
        await deleteGoogleCalendarEvent(auth, ev.calendarId, ev.remoteId).catch(() => {})
      }
    }
    return { ok: true }
  }

  importIcsText(accountId: string, icsText: string, label?: string): { ok: boolean; imported: number; error?: string } {
    const account = this.db.getAccount(accountId)
    if (!account) return { ok: false, imported: 0, error: 'Account not found.' }
    const imported = ingestIcsText(
      icsText,
      account,
      `ics-import:${label || 'file'}`,
      label ? `${account.name} · ${label}` : `${account.name} (Imported)`,
      'local',
      false,
      this.db
    )
    return { ok: true, imported }
  }

  exportIcs(accountIds?: string[]): { ics: string; count: number } {
    const start = Date.now() - 5 * 365 * 24 * 3600 * 1000
    const end = Date.now() + 5 * 365 * 24 * 3600 * 1000
    const events = this.db.listCalendarEvents(start, end, accountIds)
    return { ics: exportEventsToIcs(events), count: events.length }
  }

  async listOutlookCalendars(): Promise<{ available: boolean; calendars: OutlookCalendarInfo[]; error?: string }> {
    return listOutlookCalendars()
  }

  async importOutlookCalendar(
    accountId: string,
    folderPath: string
  ): Promise<{ ok: boolean; imported: number; calendarName?: string; error?: string }> {
    const account = this.db.getAccount(accountId)
    if (!account) return { ok: false, imported: 0, error: 'Account not found.' }
    return importOutlookCalendar(folderPath, account, this.db)
  }
}
