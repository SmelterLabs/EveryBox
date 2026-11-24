import type { GlassmailDB } from '../db/database'
import type { SecretStore } from '../security/secrets'
import type { CalendarEvent, CreateCalendarEventPayload } from '../../shared/types'
import { getAuthorizedGoogleClient } from '../mail/gmail-oauth'
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent, syncGoogleCalendar } from './google-calendar'
import { createCalDavEvent, syncImapAccountCalendars } from './caldav-sync'

export class CalendarManager {
  constructor(
    private db: GlassmailDB,
    private secrets: SecretStore
  ) {}

  async syncAllCalendars(): Promise<{ synced: number }> {
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
  }

  listEvents(startAt: number, endAt: number, accountIds?: string[]): CalendarEvent[] {
    return this.db.listCalendarEvents(startAt, endAt, accountIds)
  }

  async createEvent(payload: CreateCalendarEventPayload): Promise<{ ok: boolean; id?: string; error?: string }> {
    const account = this.db.getAccount(payload.accountId)
    if (!account) return { ok: false, error: 'Account not found.' }

    if (account.isDemo || (account.provider === 'imap' && !account.caldavUrl)) {
      const id = `${account.id}|local|primary|${Date.now()}`
      this.db.upsertCalendarEvent({
        id,
        accountId: account.id,
        calendarId: 'primary',
        calendarName: account.name,
        remoteId: id,
        title: payload.title,
        description: payload.description || '',
        location: payload.location || '',
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
}
