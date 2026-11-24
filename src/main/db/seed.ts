import type { GlassmailDB } from './database'
import type { Account, CalendarEvent, Message } from '../../shared/types'

export function seedDemoDataIfEmpty(db: GlassmailDB): void {
  if (db.listAccounts().length > 0) return

  const now = Date.now()
  const hour = 3600 * 1000
  const day = 24 * hour

  const accounts: Account[] = [
    {
      id: 'demo-gmail-personal',
      provider: 'gmail',
      name: 'Personal',
      email: 'alex@example.com',
      color: '#E87A48',
      signatureHtml: '<p>Best,<br/>Alex</p>',
      isEnabled: true,
      isDemo: true,
      calendarEnabled: true,
      lastSyncAt: now - 60000,
      syncStatus: 'idle'
    },
    {
      id: 'demo-gmail-work',
      provider: 'gmail',
      name: 'Work Gmail',
      email: 'alex@work.example.com',
      color: '#4F9CF9',
      signatureHtml: '<p>Thanks,<br/>Alex</p>',
      isEnabled: true,
      isDemo: true,
      calendarEnabled: true,
      lastSyncAt: now - 60000,
      syncStatus: 'idle'
    },
    {
      id: 'demo-imap-studio',
      provider: 'imap',
      name: 'IMAP Mail',
      email: 'alex@studio.example.com',
      color: '#34C77B',
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
      lastSyncAt: now - 60000,
      syncStatus: 'idle'
    }
  ]

  for (const a of accounts) {
    db.upsertAccount(a)
    db.upsertFolder({
      id: `${a.id}|inbox`,
      accountId: a.id,
      remoteId: 'INBOX',
      name: 'Inbox',
      path: 'INBOX',
      role: 'inbox',
      unreadCount: 0,
      totalCount: 0
    })
  }

  // Workspaces
  db.upsertWorkspace({ id: 'ws-all', name: 'All Accounts', accountIds: [], color: '#E87A48', shortcutIndex: 1 })
  db.upsertWorkspace({
    id: 'ws-work',
    name: 'Work Focus',
    accountIds: ['demo-gmail-work', 'demo-imap-studio'],
    color: '#4F9CF9',
    shortcutIndex: 2
  })
  db.upsertWorkspace({
    id: 'ws-personal',
    name: 'Personal',
    accountIds: ['demo-gmail-personal'],
    color: '#34C77B',
    shortcutIndex: 3
  })

  // Sample Snippets
  db.upsertSnippet({
    id: 'snip-1',
    title: 'Next week availability',
    shortcut: '/nextweek',
    body: 'Happy to connect next week — Tuesday or Thursday afternoon works best on my end. Let me know what time suits you.'
  })
  db.upsertSnippet({
    id: 'snip-2',
    title: 'Quick thanks & follow-up',
    shortcut: '/thanks',
    body: 'Thanks for sending this over! I will review it today and get back to you with notes.'
  })

  // Sample Messages
  const msgs: { msg: Message; remoteThreadId: string }[] = [
    {
      remoteThreadId: 't-roadmap',
      msg: {
        id: 'm-1',
        accountId: 'demo-gmail-work',
        threadId: 'demo-gmail-work|t-roadmap',
        remoteId: 'm-1',
        from: { name: 'Maya Okafor', email: 'maya@northwind.co' },
        to: [{ name: 'Alex', email: 'alex@work.example.com' }],
        cc: [],
        bcc: [],
        subject: 'Q4 roadmap: final review before Thursday',
        snippet: "I've folded in the feedback from design and support. The two open questions are the migration window...",
        bodyText:
          "Hi Alex,\n\nI've folded in the feedback from design and support. The two open questions are the migration window and whether we ship the importer in the same release.\n\nMy recommendation is to split them: importer first, migration two weeks later. That keeps the risky change away from the holiday freeze.\n\nCan you look at section 3 before Thursday's review?\n\nThanks,\nMaya",
        bodyHtml:
          "<p>Hi Alex,</p><p>I've folded in the feedback from design and support. The two open questions are the migration window and whether we ship the importer in the same release.</p><p>My recommendation is to split them: importer first, migration two weeks later. That keeps the risky change away from the holiday freeze.</p><p>Can you look at section 3 before Thursday's review?</p><p>Thanks,<br/>Maya</p>",
        date: now - 1.5 * hour,
        isRead: false,
        isStarred: true,
        isDraft: false,
        isSent: false,
        folderRole: 'inbox',
        folderName: 'Inbox',
        labels: ['Inbox', 'Work'],
        category: 'people',
        hasAttachments: true,
        attachments: [
          {
            id: 'att-1',
            messageId: 'm-1',
            filename: 'Q4-roadmap-v7.pdf',
            mimeType: 'application/pdf',
            size: 689152,
            isInline: false
          }
        ],
        trackersBlocked: 0
      }
    },
    {
      remoteThreadId: 't-vercel',
      msg: {
        id: 'm-2',
        accountId: 'demo-gmail-work',
        threadId: 'demo-gmail-work|t-vercel',
        remoteId: 'm-2',
        from: { name: 'Vercel', email: 'noreply@vercel.com' },
        to: [{ name: 'Alex', email: 'alex@work.example.com' }],
        cc: [],
        bcc: [],
        subject: 'Your sign-in code is 481 207',
        snippet: 'Enter 481 207 to verify your login to Vercel. This code expires in 10 minutes.',
        bodyText: 'Enter 481 207 to verify your login to Vercel. This code expires in 10 minutes.',
        bodyHtml: '<p>Enter <strong>481 207</strong> to verify your login to Vercel. This code expires in 10 minutes.</p>',
        date: now - 0.3 * hour,
        isRead: false,
        isStarred: false,
        isDraft: false,
        isSent: false,
        folderRole: 'inbox',
        folderName: 'Inbox',
        labels: ['Inbox'],
        category: 'updates',
        hasAttachments: false,
        attachments: [],
        signInCode: '481 207',
        trackersBlocked: 1
      }
    },
    {
      remoteThreadId: 't-invite',
      msg: {
        id: 'm-3',
        accountId: 'demo-imap-studio',
        threadId: 'demo-imap-studio|t-invite',
        remoteId: 'm-3',
        from: { name: 'Daniel Reyes', email: 'daniel@studio.dev' },
        to: [{ name: 'Alex', email: 'alex@studio.example.com' }],
        cc: [],
        bcc: [],
        subject: 'Invitation: Architecture & Design Sync @ Tomorrow 2:00 PM',
        snippet: 'Hey Alex, sent an invite for tomorrow afternoon to walk through the new sync engine and calendar layout.',
        bodyText:
          'Hey Alex,\n\nSent an invite for tomorrow afternoon to walk through the new sync engine and calendar layout. Let me know if 2:00 PM works or if we should push by 30 minutes.\n\nBest,\nDaniel',
        bodyHtml:
          '<p>Hey Alex,</p><p>Sent an invite for tomorrow afternoon to walk through the new sync engine and calendar layout. Let me know if 2:00 PM works or if we should push by 30 minutes.</p><p>Best,<br/>Daniel</p>',
        date: now - 3 * hour,
        isRead: false,
        isStarred: false,
        isDraft: false,
        isSent: false,
        folderRole: 'inbox',
        folderName: 'Inbox',
        labels: ['Inbox'],
        category: 'people',
        hasAttachments: false,
        attachments: [],
        trackersBlocked: 0,
        calendarInvite: {
          uid: 'demo-invite-1',
          summary: 'Architecture & Design Sync',
          location: 'Google Meet',
          startIso: new Date(now + day + 2 * hour).toISOString(),
          endIso: new Date(now + day + 3 * hour).toISOString(),
          organizerEmail: 'daniel@studio.dev',
          organizerName: 'Daniel Reyes',
          status: 'NEEDS-ACTION',
          rawIcs: ''
        }
      }
    },
    {
      remoteThreadId: 't-dinner',
      msg: {
        id: 'm-4',
        accountId: 'demo-gmail-personal',
        threadId: 'demo-gmail-personal|t-dinner',
        remoteId: 'm-4',
        from: { name: 'Priya Natarajan', email: 'priya@gmail.com' },
        to: [{ name: 'Alex', email: 'alex@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Dinner on Saturday?',
        snippet: "We're thinking 7:30 at the new place downtown — can you make it?",
        bodyText:
          "Hey Alex!\n\nWe're thinking 7:30 at the new place downtown this Saturday — can you make it? Need to lock in the reservation by Friday.\n\nPriya",
        bodyHtml:
          "<p>Hey Alex!</p><p>We're thinking 7:30 at the new place downtown this Saturday — can you make it? Need to lock in the reservation by Friday.</p><p>Priya</p>",
        date: now - 5 * hour,
        isRead: false,
        isStarred: false,
        isDraft: false,
        isSent: false,
        folderRole: 'inbox',
        folderName: 'Inbox',
        labels: ['Inbox'],
        category: 'people',
        hasAttachments: false,
        attachments: [],
        trackersBlocked: 0
      }
    },
    {
      remoteThreadId: 't-stripe',
      msg: {
        id: 'm-5',
        accountId: 'demo-gmail-work',
        threadId: 'demo-gmail-work|t-stripe',
        remoteId: 'm-5',
        from: { name: 'Stripe', email: 'receipts@stripe.com' },
        to: [{ name: 'Alex', email: 'alex@work.example.com' }],
        cc: [],
        bcc: [],
        subject: 'Your receipt from Figma, Inc. #2841-9021',
        snippet: 'Receipt from Figma, Inc. Amount paid: $45.00 USD on Nov 23, 2026.',
        bodyText: 'Receipt from Figma, Inc.\nAmount paid: $45.00 USD\nDate paid: Nov 23, 2026\nReceipt number: #2841-9021',
        bodyHtml: '<p><strong>Receipt from Figma, Inc.</strong></p><p>Amount paid: $45.00 USD<br/>Receipt #2841-9021</p>',
        date: now - 6 * hour,
        isRead: false,
        isStarred: false,
        isDraft: false,
        isSent: false,
        folderRole: 'inbox',
        folderName: 'Inbox',
        labels: ['Inbox'],
        category: 'updates',
        hasAttachments: true,
        attachments: [
          {
            id: 'att-2',
            messageId: 'm-5',
            filename: 'Invoice-2841-9021.pdf',
            mimeType: 'application/pdf',
            size: 142300,
            isInline: false
          }
        ],
        trackersBlocked: 2
      }
    },
    {
      remoteThreadId: 't-newsletter',
      msg: {
        id: 'm-6',
        accountId: 'demo-gmail-personal',
        threadId: 'demo-gmail-personal|t-newsletter',
        remoteId: 'm-6',
        from: { name: 'Stratechery Digest', email: 'newsletter@stratechery.com' },
        to: [{ name: 'Alex', email: 'alex@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Weekly Tech & AI Infrastructure Roundup',
        snippet: 'Local inference hardware, desktop AI workflows, and why privacy-first apps are winning.',
        bodyText: 'Weekly Tech & AI Infrastructure Roundup\n\nLocal inference hardware is changing the economics of personal AI apps...',
        bodyHtml: '<h3>Weekly Tech & AI Infrastructure Roundup</h3><p>Local inference hardware is changing the economics of personal AI apps...</p>',
        date: now - day - 2 * hour,
        isRead: false,
        isStarred: false,
        isDraft: false,
        isSent: false,
        folderRole: 'inbox',
        folderName: 'Inbox',
        labels: ['Inbox'],
        category: 'updates',
        hasAttachments: false,
        attachments: [],
        trackersBlocked: 3,
        unsubscribeUrl: 'https://example.com/unsubscribe'
      }
    },
    {
      remoteThreadId: 't-waiting',
      msg: {
        id: 'm-7',
        accountId: 'demo-gmail-work',
        threadId: 'demo-gmail-work|t-waiting',
        remoteId: 'm-7',
        from: { name: 'Alex', email: 'alex@work.example.com' },
        to: [{ name: 'Jordan Rivera', email: 'jordan@partner.example.com' }],
        cc: [],
        bcc: [],
        subject: 'Updated contract redlines for Q1',
        snippet: 'Hey Jordan, attached the final redlines. Let me know once legal signs off so we can kick off.',
        bodyText: 'Hey Jordan,\n\nAttached the final redlines. Let me know once legal signs off so we can kick off.\n\nThanks,\nAlex',
        bodyHtml: '<p>Hey Jordan,</p><p>Attached the final redlines. Let me know once legal signs off so we can kick off.</p><p>Thanks,<br/>Alex</p>',
        date: now - 3 * day,
        isRead: true,
        isStarred: false,
        isDraft: false,
        isSent: true,
        folderRole: 'sent',
        folderName: 'Sent',
        labels: ['Sent'],
        category: 'people',
        hasAttachments: false,
        attachments: [],
        trackersBlocked: 0
      }
    }
  ]

  for (const item of msgs) {
    db.upsertMessageAndThread(item.msg, item.remoteThreadId)
  }

  // Sample Combined Calendar Events (Today + Tomorrow + This Week across all 3 accounts)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const base = startOfToday.getTime()

  const events: Omit<CalendarEvent, 'accountColor' | 'accountEmail'>[] = [
    {
      id: 'ev-1',
      accountId: 'demo-gmail-work',
      calendarId: 'primary',
      calendarName: 'Work Calendar',
      remoteId: 'ev-1',
      title: 'Product & Engineering Standup',
      location: 'Google Meet',
      meetingUrl: 'https://meet.google.com',
      startAt: base + 10 * hour,
      endAt: base + 10.5 * hour,
      allDay: false,
      attendees: [{ name: 'Maya Okafor', email: 'maya@northwind.co', status: 'accepted' }],
      status: 'confirmed',
      source: 'google',
      readOnly: false
    },
    {
      id: 'ev-2',
      accountId: 'demo-gmail-work',
      calendarId: 'primary',
      calendarName: 'Work Calendar',
      remoteId: 'ev-2',
      title: 'Q4 Roadmap Prep with Maya',
      description: 'Review migration window and section 3 notes.',
      location: 'Zoom',
      startAt: base + 14.5 * hour,
      endAt: base + 15.5 * hour,
      allDay: false,
      attendees: [{ name: 'Maya Okafor', email: 'maya@northwind.co', status: 'accepted' }],
      status: 'confirmed',
      source: 'google',
      readOnly: false
    },
    {
      id: 'ev-3',
      accountId: 'demo-gmail-personal',
      calendarId: 'primary',
      calendarName: 'Personal',
      remoteId: 'ev-3',
      title: 'Dentist Appointment',
      location: 'Downtown Dental',
      startAt: base + 17 * hour,
      endAt: base + 18 * hour,
      allDay: false,
      attendees: [],
      status: 'confirmed',
      source: 'google',
      readOnly: false
    },
    {
      id: 'ev-4',
      accountId: 'demo-imap-studio',
      calendarId: 'studio-cal',
      calendarName: 'Studio CalDAV',
      remoteId: 'ev-4',
      title: 'Architecture & Design Sync',
      location: 'Google Meet',
      startAt: base + day + 14 * hour,
      endAt: base + day + 15 * hour,
      allDay: false,
      attendees: [{ name: 'Daniel Reyes', email: 'daniel@studio.dev', status: 'accepted' }],
      status: 'confirmed',
      source: 'caldav',
      readOnly: false
    },
    {
      id: 'ev-5',
      accountId: 'demo-gmail-personal',
      calendarId: 'primary',
      calendarName: 'Personal',
      remoteId: 'ev-5',
      title: 'Dinner with Priya',
      location: 'Downtown Bistro',
      startAt: base + 2 * day + 19.5 * hour,
      endAt: base + 2 * day + 21.5 * hour,
      allDay: false,
      attendees: [{ name: 'Priya Natarajan', email: 'priya@gmail.com', status: 'accepted' }],
      status: 'confirmed',
      source: 'google',
      readOnly: false
    }
  ]

  for (const ev of events) {
    db.upsertCalendarEvent(ev)
  }
}
