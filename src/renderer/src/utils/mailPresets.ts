export interface MailProviderPreset {
  id: string
  label: string
  domains: string[]
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  caldavUrl?: string
  hint?: string
}

export const MAIL_PROVIDER_PRESETS: MailProviderPreset[] = [
  {
    id: 'icloud',
    label: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    caldavUrl: 'https://caldav.icloud.com',
    hint: 'Use an App-Specific Password from account.apple.com → Sign-In and Security.'
  },
  {
    id: 'yahoo',
    label: 'Yahoo Mail',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    hint: 'Generate an App Password in Yahoo Account Security → Other App Passwords.'
  },
  {
    id: 'fastmail',
    label: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm', 'fastmail.net', 'fastmail.org'],
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    caldavUrl: 'https://caldav.fastmail.com/dav/',
    hint: 'Create an App Password in Fastmail Settings → Privacy & Security → Integrations.'
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    domains: ['zoho.com', 'zohomail.com'],
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    hint: 'Enable IMAP in Zoho Mail settings; use an App Password if 2FA is enabled.'
  },
  {
    id: 'aol',
    label: 'AOL Mail',
    domains: ['aol.com', 'aim.com'],
    imapHost: 'imap.aol.com',
    imapPort: 993,
    smtpHost: 'smtp.aol.com',
    smtpPort: 465,
    hint: 'Generate an App Password in AOL Account Security.'
  },
  {
    id: 'proton',
    label: 'Proton Bridge',
    domains: ['proton.me', 'protonmail.com', 'pm.me'],
    imapHost: '127.0.0.1',
    imapPort: 1143,
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    hint: 'Requires Proton Mail Bridge running locally — use the Bridge password shown in the Bridge app.'
  },
  {
    id: 'godaddy',
    label: 'GoDaddy',
    domains: [],
    imapHost: 'imap.secureserver.net',
    imapPort: 993,
    smtpHost: 'smtpout.secureserver.net',
    smtpPort: 465,
    hint: 'For GoDaddy Workspace Email accounts (use Classic Outlook if hosted on Microsoft 365).'
  },
  {
    id: 'netsol',
    label: 'Network Solutions',
    domains: [],
    imapHost: 'imap.netsolmail.com',
    imapPort: 993,
    smtpHost: 'smtp.netsolmail.com',
    smtpPort: 465
  },
  {
    id: 'custom',
    label: 'Custom IMAP',
    domains: [],
    imapHost: '',
    imapPort: 993,
    smtpHost: '',
    smtpPort: 465
  }
]

export function detectPresetByEmail(email: string): MailProviderPreset | undefined {
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain) return undefined
  return MAIL_PROVIDER_PRESETS.find((p) => p.domains.includes(domain))
}
