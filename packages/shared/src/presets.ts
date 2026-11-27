import type { AccountProvider } from './types'

export type AuthMode = 'oauth2-pkce' | 'app-password' | 'password'

export interface MailProviderPreset {
  id: string
  name: string
  provider: AccountProvider
  authMode: AuthMode
  domains: string[]
  imapHost?: string
  imapPort?: number
  imapSecure?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  caldavUrl?: string
  setupHint: string
  helpUrl?: string
}

export const MAIL_PROVIDER_PRESETS: readonly MailProviderPreset[] = [
  {
    id: 'gmail-imap',
    name: 'Gmail (IMAP + App Password)',
    provider: 'imap',
    authMode: 'app-password',
    domains: ['gmail.com', 'googlemail.com'],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    setupHint:
      'Works immediately on direct APK installs without Google OAuth verification. Create a 16-character App Password in your Google Account security settings (requires 2-Step Verification).',
    helpUrl: 'https://myaccount.google.com/apppasswords'
  },
  {
    id: 'gmail-oauth',
    name: 'Gmail (OAuth 2.0)',
    provider: 'gmail',
    authMode: 'oauth2-pkce',
    domains: ['gmail.com', 'googlemail.com'],
    setupHint:
      'Sign in with Google via Chrome Custom Tabs (PKCE) for Gmail API + two-way Google Calendar sync.'
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365 / Outlook.com',
    provider: 'microsoft',
    authMode: 'oauth2-pkce',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    setupHint:
      'Sign in with Microsoft (Entra ID OAuth 2.0 + PKCE) for Microsoft Graph Mail, Focused Inbox, and two-way Calendar sync.'
  },
  {
    id: 'icloud',
    name: 'Apple iCloud Mail',
    provider: 'imap',
    authMode: 'app-password',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    caldavUrl: 'https://caldav.icloud.com',
    setupHint: 'Generate an app-specific password at appleid.apple.com under Sign-In and Security.',
    helpUrl: 'https://appleid.apple.com/account/manage'
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    provider: 'imap',
    authMode: 'app-password',
    domains: ['fastmail.com', 'fastmail.fm', 'fastmail.net', 'fastmail.org'],
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    smtpSecure: true,
    caldavUrl: 'https://caldav.fastmail.com',
    setupHint: 'Create an app password in Fastmail Settings › Privacy & Security › Integrations.'
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    provider: 'imap',
    authMode: 'app-password',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    setupHint: 'Generate an App Password in Yahoo Account Security settings.'
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    provider: 'imap',
    authMode: 'app-password',
    domains: ['zoho.com', 'zohomail.com'],
    imapHost: 'imappro.zoho.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtppro.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
    caldavUrl: 'https://calendar.zoho.com/caldav',
    setupHint: 'Enable IMAP access in Zoho Mail settings; use an app-specific password if 2FA is active.'
  },
  {
    id: 'network-solutions',
    name: 'Network Solutions',
    provider: 'imap',
    authMode: 'password',
    domains: [],
    imapHost: 'mail.networksolutionsemail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.networksolutionsemail.com',
    smtpPort: 465,
    smtpSecure: true,
    setupHint: 'Standard IMAP/SMTP over SSL/TLS. Local SQLite calendar is enabled automatically.'
  },
  {
    id: 'godaddy',
    name: 'GoDaddy Workspace / Email',
    provider: 'imap',
    authMode: 'password',
    domains: [],
    imapHost: 'imap.secureserver.net',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtpout.secureserver.net',
    smtpPort: 465,
    smtpSecure: true,
    setupHint: 'For GoDaddy Microsoft 365 plans, choose Microsoft 365 / Outlook.com instead.'
  },
  {
    id: 'namecheap',
    name: 'Namecheap Private Email',
    provider: 'imap',
    authMode: 'password',
    domains: [],
    imapHost: 'mail.privateemail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'mail.privateemail.com',
    smtpPort: 465,
    smtpSecure: true,
    setupHint: 'Standard IMAP/SMTP over SSL/TLS.'
  },
  {
    id: 'custom-imap',
    name: 'Custom IMAP / SMTP',
    provider: 'imap',
    authMode: 'password',
    domains: [],
    imapPort: 993,
    imapSecure: true,
    smtpPort: 465,
    smtpSecure: true,
    setupHint: 'Enter your mail server hostname, ports, and optional CalDAV or ICS calendar URL.'
  }
] as const

export function findPresetById(id: string): MailProviderPreset | undefined {
  return MAIL_PROVIDER_PRESETS.find((p) => p.id === id)
}

export function findPresetByEmail(email: string): MailProviderPreset | undefined {
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain) return undefined
  return MAIL_PROVIDER_PRESETS.find((p) => p.domains.includes(domain))
}
