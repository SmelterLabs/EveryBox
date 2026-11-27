import {
  classifyCategory,
  extractSignInCode,
  type Account,
  type CalendarEvent,
  type InboxCategory,
  type Message
} from '@everybox/shared'

export type VoiceToneKey = 'colleague' | 'executive' | 'personal'

export interface MobileThreadItem {
  id: string
  accountId: string
  accountColor: string
  accountIcon: Account['icon']
  accountEmail: string
  accountName: string
  group: 'Today' | 'Yesterday' | 'Earlier'
  subject: string
  snippet: string
  latestFrom: { name: string; email: string }
  initials: string
  lastMessageAt: number
  timeLabel: string
  messageCount: number
  isRead: boolean
  isStarred: boolean
  isReplied: boolean
  hasAttachments: boolean
  category: Exclude<InboxCategory, 'all'>
  folderRole: 'inbox' | 'archive' | 'trash' | 'junk'
  signInCode?: string
  trackersBlocked: number
  aiDrafts?: Record<VoiceToneKey, string>
  messages: Array<{
    id: string
    fromName: string
    fromEmail: string
    initials: string
    toLabel: string
    timeLabel: string
    dateLabel: string
    snippet: string
    body: string
    isSelf?: boolean
    attachment?: { filename: string; sizeLabel: string }
  }>
}

export interface MobileCalendarItem extends CalendarEvent {
  dayKey: 'thu' | 'fri' | 'sat'
  dayLabel: string
  startLabel: string
  endLabel: string
  durationLabel: string
}

const now = Date.now()
const hour = 3600_000
const day = 24 * hour

export const DEMO_ACCOUNTS: Account[] = [
  {
    id: 'acc-work',
    provider: 'gmail',
    name: 'Work',
    email: 'alex@northwind.co',
    color: '#3B82F6',
    icon: 'briefcase',
    signatureHtml: '<p>Thanks,<br/>Alex</p>',
    isEnabled: true,
    isDemo: true,
    calendarEnabled: true,
    lastSyncAt: now - 60_000,
    syncStatus: 'idle'
  },
  {
    id: 'acc-studio',
    provider: 'imap',
    name: 'Studio',
    email: 'alex@foundry.studio',
    color: '#34C77B',
    icon: 'rocket',
    signatureHtml: '<p>— Alex</p>',
    isEnabled: true,
    isDemo: true,
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    smtpSecure: true,
    calendarEnabled: true,
    lastSyncAt: now - 120_000,
    syncStatus: 'idle'
  },
  {
    id: 'acc-personal',
    provider: 'imap',
    name: 'Personal',
    email: 'alex.rivera@gmail.com',
    color: '#E87A48',
    icon: 'home',
    signatureHtml: '<p>Best,<br/>Alex</p>',
    isEnabled: true,
    isDemo: true,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    calendarEnabled: true,
    lastSyncAt: now - 180_000,
    syncStatus: 'idle'
  }
]

function buildDemoThreads(): MobileThreadItem[] {
  const otpBody =
    'Enter this one-time verification code to finish signing in on your Android device: 482 917. This code expires in 10 minutes.'
  const otpCode = extractSignInCode('Your sign-in verification code', otpBody) ?? '482 917'

  const mayaCategory = classifyCategory({
    from: { name: 'Maya Okafor', email: 'maya@northwind.co' },
    subject: 'Q4 roadmap: final review before Thursday',
    hasListUnsubscribe: false,
    isAutoSubmitted: false,
    isSent: false
  })
  const otpCategory = classifyCategory({
    from: { name: 'CloudVault Security', email: 'noreply@cloudvault.io' },
    subject: 'Your sign-in verification code',
    hasListUnsubscribe: false,
    isAutoSubmitted: true,
    isSent: false
  })
  const stripeCategory = classifyCategory({
    from: { name: 'Stripe Payouts', email: 'billing@stripe.com' },
    subject: 'Monthly payout summary — November',
    hasListUnsubscribe: true,
    isAutoSubmitted: true,
    isSent: false
  })

  return [
    {
      id: 't-roadmap',
      accountId: 'acc-work',
      accountColor: '#3B82F6',
      accountIcon: 'briefcase',
      accountEmail: 'alex@northwind.co',
      accountName: 'Work',
      group: 'Today',
      subject: 'Q4 roadmap: final review before Thursday',
      snippet: 'My recommendation is to ship the importer first and move migration two weeks later…',
      latestFrom: { name: 'Maya Okafor', email: 'maya@northwind.co' },
      initials: 'MO',
      lastMessageAt: now - 25 * 60_000,
      timeLabel: '9:18 AM',
      messageCount: 2,
      isRead: false,
      isStarred: true,
      isReplied: false,
      hasAttachments: true,
      category: mayaCategory,
      folderRole: 'inbox',
      trackersBlocked: 3,
      aiDrafts: {
        colleague:
          "Hi Maya — splitting the importer and migration makes sense. I'll review section 3 today before our 10:30 Thursday review.\n\nThanks,\nAlex",
        executive:
          "Maya — agreed on splitting importer and migration to protect the freeze. I'll sign off on section 3 today ahead of Thursday 10:30.\n\n— Alex",
        personal:
          "Hey Maya! Splitting the importer first sounds super smart — I'll read section 3 this afternoon so we're ready for Thursday!\n\nBest,\nAlex"
      },
      messages: [
        {
          id: 'm-roadmap-1',
          fromName: 'Alex Rivera',
          fromEmail: 'alex@northwind.co',
          initials: 'AR',
          toLabel: 'to Maya Okafor',
          timeLabel: '3:42 PM',
          dateLabel: 'Nov 24',
          snippet: 'Sharing the updated Q4 milestone table ahead of design & support review…',
          body: "Hi Maya,\n\nSharing the updated Q4 milestone table ahead of design and support review. Let me know if the migration timeline feels tight around the holiday freeze.\n\nThanks,\nAlex",
          isSelf: true
        },
        {
          id: 'm-roadmap-2',
          fromName: 'Maya Okafor',
          fromEmail: 'maya@northwind.co',
          initials: 'MO',
          toLabel: 'to Alex',
          timeLabel: '9:18 AM',
          dateLabel: 'Today',
          snippet: 'I folded in feedback from design and support…',
          body: "Hi Alex,\n\nI folded in feedback from design and support. My recommendation is to ship the importer first and move the migration window two weeks later to stay clear of the release freeze.\n\nCan you confirm section 3 before Thursday's 10:30 AM review?\n\nThanks,\nMaya",
          attachment: { filename: 'Q4-roadmap-v7.pdf', sizeLabel: '689 KB' }
        }
      ]
    },
    {
      id: 't-2fa',
      accountId: 'acc-personal',
      accountColor: '#E87A48',
      accountIcon: 'home',
      accountEmail: 'alex.rivera@gmail.com',
      accountName: 'Personal',
      group: 'Today',
      subject: 'Your sign-in verification code',
      snippet: 'Enter this one-time verification code to finish signing in on your Android device.',
      latestFrom: { name: 'CloudVault Security', email: 'noreply@cloudvault.io' },
      initials: 'CV',
      lastMessageAt: now - 50 * 60_000,
      timeLabel: '8:54 AM',
      messageCount: 1,
      isRead: false,
      isStarred: false,
      isReplied: false,
      hasAttachments: false,
      category: otpCategory,
      folderRole: 'inbox',
      signInCode: otpCode,
      trackersBlocked: 1,
      messages: [
        {
          id: 'm-2fa-1',
          fromName: 'CloudVault Security',
          fromEmail: 'noreply@cloudvault.io',
          initials: 'CV',
          toLabel: 'to alex.rivera@gmail.com',
          timeLabel: '8:54 AM',
          dateLabel: 'Today',
          snippet: otpBody,
          body: `${otpBody}\n\nIf you did not request this code, you can safely ignore this message.`
        }
      ]
    },
    {
      id: 't-brand',
      accountId: 'acc-studio',
      accountColor: '#34C77B',
      accountIcon: 'rocket',
      accountEmail: 'alex@foundry.studio',
      accountName: 'Studio',
      group: 'Today',
      subject: 'Brand guidelines PDF & Android icon grid',
      snippet: "You: Looks crisp — let's lock the 48dp adaptive mask before Friday.",
      latestFrom: { name: 'Devon Park', email: 'devon@foundry.studio' },
      initials: 'DP',
      lastMessageAt: now - 1.5 * hour,
      timeLabel: '8:12 AM',
      messageCount: 4,
      isRead: true,
      isStarred: false,
      isReplied: true,
      hasAttachments: true,
      category: 'people',
      folderRole: 'inbox',
      trackersBlocked: 0,
      messages: [
        {
          id: 'm-brand-1',
          fromName: 'Devon Park',
          fromEmail: 'devon@foundry.studio',
          initials: 'DP',
          toLabel: 'to Alex',
          timeLabel: '7:48 AM',
          dateLabel: 'Today',
          snippet: 'Exported the updated Nordic Prism adaptive icon mask and monochrome layer.',
          body: "Hey Alex,\n\nExported the updated Nordic Prism adaptive icon mask and monochrome themed layer for Android 13+. Attached the latest spec PDF so you can verify safe-zone padding.\n\n— Devon",
          attachment: { filename: 'Android-Icon-Grid.pdf', sizeLabel: '1.2 MB' }
        },
        {
          id: 'm-brand-2',
          fromName: 'Alex Rivera',
          fromEmail: 'alex@foundry.studio',
          initials: 'AR',
          toLabel: 'to Devon Park',
          timeLabel: '8:12 AM',
          dateLabel: 'Today',
          snippet: "Looks crisp — let's lock the 48dp adaptive mask before Friday.",
          body: "Looks crisp — let's lock the 48dp adaptive mask before Friday so we can ship it in the first APK build.\n\n— Alex",
          isSelf: true
        }
      ]
    },
    {
      id: 't-onboarding',
      accountId: 'acc-work',
      accountColor: '#3B82F6',
      accountIcon: 'briefcase',
      accountEmail: 'alex@northwind.co',
      accountName: 'Work',
      group: 'Today',
      subject: 'Customer onboarding checklist updates',
      snippet: 'Added the IMAP preset auto-detection flow for Fastmail and iCloud accounts.',
      latestFrom: { name: 'Priya Nair', email: 'priya@northwind.co' },
      initials: 'PN',
      lastMessageAt: now - 2.2 * hour,
      timeLabel: '7:40 AM',
      messageCount: 3,
      isRead: false,
      isStarred: false,
      isReplied: false,
      hasAttachments: false,
      category: 'people',
      folderRole: 'inbox',
      trackersBlocked: 2,
      aiDrafts: {
        colleague:
          "Thanks Priya — the Fastmail & iCloud preset auto-detect looks super smooth. Ready to publish this checklist once QA signs off.\n\nAlex",
        executive: "Looks solid, Priya. Approved to ship with the Phase 1 onboarding flow.\n\n— Alex",
        personal: "Awesome work Priya! That auto-detect step is going to save folks so much time.\n\nBest,\nAlex"
      },
      messages: [
        {
          id: 'm-onb-1',
          fromName: 'Priya Nair',
          fromEmail: 'priya@northwind.co',
          initials: 'PN',
          toLabel: 'to Alex',
          timeLabel: '7:40 AM',
          dateLabel: 'Today',
          snippet: 'Added the IMAP preset auto-detection flow for Fastmail and iCloud accounts.',
          body: "Hi Alex,\n\nAdded the IMAP preset auto-detection flow for Fastmail, iCloud, and Gmail App Password accounts into the onboarding checklist. Can you give it a quick look before we finalize docs?\n\nBest,\nPriya"
        }
      ]
    },
    {
      id: 't-pickup',
      accountId: 'acc-personal',
      accountColor: '#E87A48',
      accountIcon: 'home',
      accountEmail: 'alex.rivera@gmail.com',
      accountName: 'Personal',
      group: 'Yesterday',
      subject: 'Weekend dinner & airport pickup timing',
      snippet: 'Flight lands at 4:25 PM Terminal B — text me when you head over!',
      latestFrom: { name: 'Jordan Morales', email: 'jordan@rivera.family' },
      initials: 'JM',
      lastMessageAt: now - 1 * day,
      timeLabel: 'Nov 25',
      messageCount: 2,
      isRead: false,
      isStarred: false,
      isReplied: false,
      hasAttachments: false,
      category: 'people',
      folderRole: 'inbox',
      trackersBlocked: 0,
      messages: [
        {
          id: 'm-pick-1',
          fromName: 'Jordan Morales',
          fromEmail: 'jordan@rivera.family',
          initials: 'JM',
          toLabel: 'to Alex',
          timeLabel: '6:10 PM',
          dateLabel: 'Nov 25',
          snippet: 'Flight lands at 4:25 PM Terminal B — text me when you head over!',
          body: "Hey Alex!\n\nFlight lands at 4:25 PM Saturday at Terminal B — text me when you head over! Thinking we can grab Thai food on the way back.\n\n— Jordan"
        }
      ]
    },
    {
      id: 't-stripe',
      accountId: 'acc-studio',
      accountColor: '#34C77B',
      accountIcon: 'rocket',
      accountEmail: 'alex@foundry.studio',
      accountName: 'Studio',
      group: 'Yesterday',
      subject: 'Monthly payout summary — November',
      snippet: 'Your transfer of $4,820.00 is scheduled to arrive in your checking account.',
      latestFrom: { name: 'Stripe Payouts', email: 'billing@stripe.com' },
      initials: 'SP',
      lastMessageAt: now - 1.2 * day,
      timeLabel: 'Nov 25',
      messageCount: 1,
      isRead: true,
      isStarred: false,
      isReplied: false,
      hasAttachments: false,
      category: stripeCategory,
      folderRole: 'inbox',
      trackersBlocked: 4,
      messages: [
        {
          id: 'm-str-1',
          fromName: 'Stripe Payouts',
          fromEmail: 'billing@stripe.com',
          initials: 'SP',
          toLabel: 'to alex@foundry.studio',
          timeLabel: '2:05 PM',
          dateLabel: 'Nov 25',
          snippet: 'Your transfer of $4,820.00 is scheduled to arrive in your checking account.',
          body: "Hello Foundry Studio,\n\nYour November payout of $4,820.00 has been initiated and is expected to arrive in your checking account within 1–2 business days."
        }
      ]
    },
    {
      id: 't-trash-promo',
      accountId: 'acc-personal',
      accountColor: '#E87A48',
      accountIcon: 'home',
      accountEmail: 'alex.rivera@gmail.com',
      accountName: 'Personal',
      group: 'Earlier',
      subject: 'Flash clearance sale — 40% off luggage',
      snippet: 'Limited-time holiday travel deals ending midnight Sunday.',
      latestFrom: { name: 'Roam Goods', email: 'deals@roamgoods.example' },
      initials: 'RG',
      lastMessageAt: now - 3 * day,
      timeLabel: 'Nov 23',
      messageCount: 1,
      isRead: true,
      isStarred: false,
      isReplied: false,
      hasAttachments: false,
      category: 'updates',
      folderRole: 'trash',
      trackersBlocked: 6,
      messages: [
        {
          id: 'm-tr-1',
          fromName: 'Roam Goods',
          fromEmail: 'deals@roamgoods.example',
          initials: 'RG',
          toLabel: 'to alex.rivera@gmail.com',
          timeLabel: '11:00 AM',
          dateLabel: 'Nov 23',
          snippet: 'Limited-time holiday travel deals ending midnight Sunday.',
          body: 'Limited-time holiday travel deals ending midnight Sunday.'
        }
      ]
    }
  ]
}

export const DEMO_THREADS: MobileThreadItem[] = buildDemoThreads()

const todayMidnight = new Date()
todayMidnight.setHours(0, 0, 0, 0)
const baseDay = todayMidnight.getTime()

export const DEMO_CALENDAR_EVENTS: MobileCalendarItem[] = [
  {
    id: 'cal-allday-freeze',
    accountId: 'acc-work',
    accountColor: '#3B82F6',
    accountIcon: 'briefcase',
    accountEmail: 'alex@northwind.co',
    calendarId: 'work-primary',
    calendarName: 'Work',
    remoteId: 'g-allday-1',
    title: 'Q4 Design Freeze',
    description: 'All visual assets and release milestones locked for Q4.',
    startAt: baseDay,
    endAt: baseDay + day,
    allDay: true,
    attendees: [{ name: 'Alex Rivera', email: 'alex@northwind.co', status: 'accepted' }],
    status: 'confirmed',
    source: 'google',
    readOnly: false,
    dayKey: 'thu',
    dayLabel: 'Thu',
    startLabel: 'All day',
    endLabel: '',
    durationLabel: 'All day'
  },
  {
    id: 'cal-roadmap-work',
    accountId: 'acc-work',
    accountColor: '#3B82F6',
    accountIcon: 'briefcase',
    accountEmail: 'alex@northwind.co',
    calendarId: 'work-primary',
    calendarName: 'Work',
    remoteId: 'g-ev-101',
    title: 'Q4 Roadmap Final Review',
    description: 'Review importer rollout vs. migration window before release freeze.',
    location: 'Google Meet · 3 guests',
    meetingUrl: 'https://meet.google.com/northwind-q4-review',
    startAt: baseDay + 10.5 * hour,
    endAt: baseDay + 11.25 * hour,
    allDay: false,
    attendees: [
      { name: 'Maya Okafor', email: 'maya@northwind.co', status: 'accepted' },
      { name: 'Devon Park', email: 'devon@foundry.studio', status: 'accepted' },
      { name: 'Alex Rivera', email: 'alex@northwind.co', status: 'accepted' }
    ],
    status: 'confirmed',
    source: 'google',
    readOnly: false,
    dayKey: 'thu',
    dayLabel: 'Thu',
    startLabel: '10:30 AM',
    endLabel: '11:15 AM',
    durationLabel: '45 min'
  },
  // Duplicate cross-account invite so Merged vs. Raw toggle works live!
  {
    id: 'cal-roadmap-studio',
    accountId: 'acc-studio',
    accountColor: '#34C77B',
    accountIcon: 'rocket',
    accountEmail: 'alex@foundry.studio',
    calendarId: 'studio-caldav',
    calendarName: 'Studio',
    remoteId: 'cd-ev-101',
    title: 'Q4 Roadmap Final Review',
    description: 'Review importer rollout vs. migration window before release freeze.',
    location: 'Google Meet · 3 guests',
    meetingUrl: 'https://meet.google.com/northwind-q4-review',
    startAt: baseDay + 10.5 * hour,
    endAt: baseDay + 11.25 * hour,
    allDay: false,
    attendees: [
      { name: 'Maya Okafor', email: 'maya@northwind.co', status: 'accepted' },
      { name: 'Devon Park', email: 'devon@foundry.studio', status: 'accepted' },
      { name: 'Alex Rivera', email: 'alex@foundry.studio', status: 'accepted' }
    ],
    status: 'confirmed',
    source: 'caldav',
    readOnly: false,
    dayKey: 'thu',
    dayLabel: 'Thu',
    startLabel: '10:30 AM',
    endLabel: '11:15 AM',
    durationLabel: '45 min'
  },
  {
    id: 'cal-icon-pass',
    accountId: 'acc-studio',
    accountColor: '#34C77B',
    accountIcon: 'rocket',
    accountEmail: 'alex@foundry.studio',
    calendarId: 'studio-caldav',
    calendarName: 'Studio',
    remoteId: 'cd-ev-102',
    title: 'Android Icon & Contrast Pass',
    description: 'Verify WCAG AA tokens and adaptive icon mask across all 5 themes.',
    location: 'Studio Huddle',
    meetingUrl: 'https://meet.foundry.studio/icon-pass',
    startAt: baseDay + 13 * hour,
    endAt: baseDay + 13.5 * hour,
    allDay: false,
    attendees: [
      { name: 'Devon Park', email: 'devon@foundry.studio', status: 'accepted' },
      { name: 'Alex Rivera', email: 'alex@foundry.studio', status: 'accepted' }
    ],
    status: 'confirmed',
    source: 'caldav',
    readOnly: false,
    dayKey: 'thu',
    dayLabel: 'Thu',
    startLabel: '1:00 PM',
    endLabel: '1:30 PM',
    durationLabel: '30 min'
  },
  {
    id: 'cal-dentist',
    accountId: 'acc-personal',
    accountColor: '#E87A48',
    accountIcon: 'home',
    accountEmail: 'alex.rivera@gmail.com',
    calendarId: 'personal-local',
    calendarName: 'Personal',
    remoteId: 'loc-ev-103',
    title: 'Dentist Checkup',
    description: 'Semi-annual checkup and cleaning.',
    location: '214 Cedar St, Suite 200',
    startAt: baseDay + 16.25 * hour,
    endAt: baseDay + 17 * hour,
    allDay: false,
    attendees: [],
    status: 'confirmed',
    source: 'local',
    readOnly: false,
    dayKey: 'thu',
    dayLabel: 'Thu',
    startLabel: '4:15 PM',
    endLabel: '5:00 PM',
    durationLabel: '45 min'
  },
  {
    id: 'cal-sprint-demo',
    accountId: 'acc-work',
    accountColor: '#3B82F6',
    accountIcon: 'briefcase',
    accountEmail: 'alex@northwind.co',
    calendarId: 'work-primary',
    calendarName: 'Work',
    remoteId: 'g-ev-201',
    title: 'Sprint Demo',
    location: 'Google Meet',
    meetingUrl: 'https://meet.google.com/northwind-demo',
    startAt: baseDay + day + 11 * hour,
    endAt: baseDay + day + 11.75 * hour,
    allDay: false,
    attendees: [],
    status: 'confirmed',
    source: 'google',
    readOnly: false,
    dayKey: 'fri',
    dayLabel: 'Fri',
    startLabel: '11:00 AM',
    endLabel: '11:45 AM',
    durationLabel: '45 min'
  },
  {
    id: 'cal-client-sync',
    accountId: 'acc-studio',
    accountColor: '#34C77B',
    accountIcon: 'rocket',
    accountEmail: 'alex@foundry.studio',
    calendarId: 'studio-caldav',
    calendarName: 'Studio',
    remoteId: 'cd-ev-202',
    title: 'Client Sync',
    location: 'Studio Room B',
    startAt: baseDay + day + 14.5 * hour,
    endAt: baseDay + day + 15 * hour,
    allDay: false,
    attendees: [],
    status: 'confirmed',
    source: 'caldav',
    readOnly: false,
    dayKey: 'fri',
    dayLabel: 'Fri',
    startLabel: '2:30 PM',
    endLabel: '3:00 PM',
    durationLabel: '30 min'
  },
  {
    id: 'cal-airport',
    accountId: 'acc-personal',
    accountColor: '#E87A48',
    accountIcon: 'home',
    accountEmail: 'alex.rivera@gmail.com',
    calendarId: 'personal-local',
    calendarName: 'Personal',
    remoteId: 'loc-ev-301',
    title: 'Airport Pickup — Jordan',
    location: 'Terminal B Arrivals',
    startAt: baseDay + 2 * day + 16.4 * hour,
    endAt: baseDay + 2 * day + 17.5 * hour,
    allDay: false,
    attendees: [],
    status: 'confirmed',
    source: 'local',
    readOnly: false,
    dayKey: 'sat',
    dayLabel: 'Sat',
    startLabel: '4:25 PM',
    endLabel: '5:30 PM',
    durationLabel: '1 hr 5 min'
  }
]
