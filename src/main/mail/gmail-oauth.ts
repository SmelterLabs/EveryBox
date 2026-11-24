import { createServer } from 'http'
import { URL } from 'url'
import { shell } from 'electron'
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { SecretStore } from '../security/secrets'

export const GMAIL_AND_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]

export interface GoogleTokens {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
  scope?: string
  token_type?: string | null
}

export function createOAuthClient(clientId: string, clientSecret: string, redirectUri: string): OAuth2Client {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getAuthorizedGoogleClient(
  accountId: string,
  clientId: string,
  clientSecret: string,
  secrets: SecretStore
): OAuth2Client | null {
  const raw = secrets.get(`google_tokens:${accountId}`)
  if (!raw) return null
  try {
    const tokens = JSON.parse(raw) as GoogleTokens
    const oauth2 = createOAuthClient(clientId, clientSecret, 'http://127.0.0.1')
    oauth2.setCredentials(tokens)
    oauth2.on('tokens', (newTokens) => {
      const merged: GoogleTokens = {
        ...tokens,
        ...newTokens,
        refresh_token: newTokens.refresh_token || tokens.refresh_token
      }
      secrets.set(`google_tokens:${accountId}`, JSON.stringify(merged))
    })
    return oauth2
  } catch {
    return null
  }
}

export async function runGoogleOAuthLoopback(
  clientId: string,
  clientSecret: string
): Promise<{ email: string; name: string; tokens: GoogleTokens }> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    let settled = false

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        server.close()
        reject(new Error('Google sign-in timed out after 3 minutes. Please try again.'))
      }
    }, 180_000)

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        clearTimeout(timeout)
        server.close()
        reject(new Error('Could not bind local OAuth callback port.'))
        return
      }
      const redirectUri = `http://127.0.0.1:${addr.port}/oauth2callback`
      const oauth2 = createOAuthClient(clientId, clientSecret, redirectUri)

      const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent select_account',
        scope: GMAIL_AND_CALENDAR_SCOPES
      })

      server.on('request', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', redirectUri)
          if (reqUrl.pathname !== '/oauth2callback') {
            res.writeHead(404)
            res.end()
            return
          }
          const error = reqUrl.searchParams.get('error')
          const code = reqUrl.searchParams.get('code')
          if (error || !code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              '<html><body style="font-family:Segoe UI,sans-serif;background:#171615;color:#eee;padding:40px;text-align:center;"><h2>Sign-in cancelled</h2><p>You can close this tab and return to EveryBox.</p></body></html>'
            )
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              server.close()
              reject(new Error(error || 'No authorization code returned.'))
            }
            return
          }

          const { tokens } = await oauth2.getToken(code)
          oauth2.setCredentials(tokens)

          const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 })
          const { data: userInfo } = await oauth2Api.userinfo.get()
          const email = userInfo.email || ''
          const name = userInfo.name || email.split('@')[0] || 'Gmail'

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(
            `<html><body style="font-family:Segoe UI,sans-serif;background:#171615;color:#f5f4f2;padding:48px;text-align:center;">
              <h2 style="color:#E87A48;">Connected ${email}</h2>
              <p style="color:#b8b3ac;">Gmail and Google Calendar are now linked to EveryBox. You can close this browser tab.</p>
            </body></html>`
          )

          if (!settled) {
            settled = true
            clearTimeout(timeout)
            server.close()
            resolve({ email, name, tokens })
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Authentication error. You can close this tab.')
          if (!settled) {
            settled = true
            clearTimeout(timeout)
            server.close()
            reject(err)
          }
        }
      })

      shell.openExternal(authUrl)
    })
  })
}
