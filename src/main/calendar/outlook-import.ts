import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { GlassmailDB } from '../db/database'
import type { Account, CalendarEvent } from '../../shared/types'
import {
  cleanExtractedUrl,
  extractMeetingUrl,
  normalizeAttendeeStatus,
  normalizeEventDescription
} from './calendar-utils'

const execFileAsync = promisify(execFile)

export interface OutlookCalendarInfo {
  storeName: string
  folderName: string
  folderPath: string
  itemCount: number
}

interface RawOutlookRecipient {
  name?: string
  email?: string
  type?: number
  status?: number
}

interface RawOutlookEvent {
  uid: string
  title: string
  location: string
  description: string
  bodyHtml?: string
  rtfUrls?: string[]
  onlineMeetingUrl?: string
  startIso: string
  endIso: string
  allDay: boolean
  organizerName?: string
  organizerEmail?: string
  recipients?: RawOutlookRecipient[]
  requiredAttendees?: string
  optionalAttendees?: string
  meetingStatus?: number
  busyStatus?: number
  responseStatus?: number
}

async function runPowerShellJson<T>(script: string, timeoutMs = 45_000): Promise<T> {
  const scriptPath = join(tmpdir(), `everybox-cal-outlook-${randomUUID()}.ps1`)
  writeFileSync(scriptPath, `\uFEFF${script}`, 'utf8')
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 48 * 1024 * 1024
      }
    )
    const trimmed = stdout.trim()
    if (!trimmed) {
      throw new Error('Outlook returned no data.')
    }
    return JSON.parse(trimmed) as T
  } finally {
    try {
      unlinkSync(scriptPath)
    } catch {
      // Ignore temp cleanup failure
    }
  }
}

export async function listOutlookCalendars(): Promise<{
  available: boolean
  calendars: OutlookCalendarInfo[]
  error?: string
}> {
  if (process.platform !== 'win32') {
    return {
      available: false,
      calendars: [],
      error: 'Classic Outlook import is only available on Windows. Use Import .ics instead.'
    }
  }

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

function Get-OutlookApp {
  try {
    return [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
  } catch {
    return New-Object -ComObject Outlook.Application
  }
}

$results = New-Object System.Collections.ArrayList

function Walk-Folders($folder, $storeName, $depth) {
  if ($depth -gt 3) { return }
  try {
    if ($folder.DefaultItemType -eq 1) {
      $count = 0
      try { $count = [int]$folder.Items.Count } catch {}
      $null = $results.Add([PSCustomObject]@{
        storeName  = [string]$storeName
        folderName = [string]$folder.Name
        folderPath = [string]$folder.FolderPath
        itemCount  = $count
      })
    }
    foreach ($sub in $folder.Folders) {
      Walk-Folders $sub $storeName ($depth + 1)
    }
  } catch {}
}

try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  foreach ($root in $ns.Folders) {
    Walk-Folders $root ([string]$root.Name) 0
  }
  ConvertTo-Json -InputObject @($results) -Depth 4 -Compress
} catch {
  $msg = $_.Exception.Message
  Write-Output (ConvertTo-Json -InputObject @{ error = $msg } -Compress)
}
`

  try {
    const raw = await runPowerShellJson<OutlookCalendarInfo[] | { error: string }>(script, 25_000)
    if (!Array.isArray(raw)) {
      return {
        available: false,
        calendars: [],
        error:
          raw.error ||
          'Classic Outlook Desktop was not detected. You can still export a .ics file from Outlook and use Import .ics.'
      }
    }
    return { available: true, calendars: raw }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      available: false,
      calendars: [],
      error: `Could not connect to Classic Outlook Desktop (${msg}). Make sure Classic Outlook is installed, or use Import .ics.`
    }
  }
}

export async function importOutlookCalendar(
  folderPath: string,
  account: Account,
  db: GlassmailDB
): Promise<{ ok: boolean; imported: number; calendarName?: string; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, imported: 0, error: 'Classic Outlook import is only available on Windows.' }
  }

  const targetPathB64 = Buffer.from(folderPath, 'utf8').toString('base64')

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$targetPath = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${targetPathB64}'))

function Get-OutlookApp {
  try {
    return [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
  } catch {
    return New-Object -ComObject Outlook.Application
  }
}

function Find-Folder($folder, $depth) {
  if ($depth -gt 4) { return $null }
  try {
    if ([string]$folder.FolderPath -eq $targetPath) { return $folder }
    foreach ($sub in $folder.Folders) {
      $found = Find-Folder $sub ($depth + 1)
      if ($null -ne $found) { return $found }
    }
  } catch {}
  return $null
}

function Resolve-AddressEntryEmail($entry) {
  if ($null -eq $entry) { return '' }
  try {
    $smtp = [string]$entry.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x39FE001E')
    if ($smtp -and $smtp -match '@') { return $smtp }
  } catch {}
  try {
    $ex = $entry.GetExchangeUser()
    if ($null -ne $ex -and $ex.PrimarySmtpAddress) { return [string]$ex.PrimarySmtpAddress }
  } catch {}
  try {
    $addr = [string]$entry.Address
    if ($addr -and -not $addr.StartsWith('/')) { return $addr }
  } catch {}
  return ''
}

try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $target = $null
  foreach ($root in $ns.Folders) {
    $target = Find-Folder $root 0
    if ($null -ne $target) { break }
  }
  if ($null -eq $target) {
    Write-Output (ConvertTo-Json -InputObject @{ error = 'Selected Outlook calendar folder was not found.' } -Compress)
    exit 0
  }

  $items = $target.Items
  $items.Sort('[Start]')
  $items.IncludeRecurrences = $true

  $inv = [System.Globalization.CultureInfo]::InvariantCulture
  $winStart = (Get-Date).AddYears(-1).ToString('MM/dd/yyyy hh:mm tt', $inv)
  $winEnd = (Get-Date).AddYears(2).ToString('MM/dd/yyyy hh:mm tt', $inv)
  $filter = "[Start] >= '$winStart' AND [Start] <= '$winEnd'"
  $restricted = $items.Restrict($filter)

  $events = New-Object System.Collections.ArrayList
  $limit = 3000
  $i = 0

  foreach ($item in $restricted) {
    if ($i -ge $limit) { break }
    $i++
    try {
      $uid = ''
      try { $uid = [string]$item.GlobalAppointmentID } catch {}
      if (-not $uid) {
        try { $uid = [string]$item.EntryID } catch {}
      }
      $startUtc = ([DateTime]$item.Start).ToUniversalTime().ToString('o')
      $endUtc = ([DateTime]$item.End).ToUniversalTime().ToString('o')

      $body = ''
      try {
        $body = [string]$item.Body
        if ($body.Length -gt 20000) { $body = $body.Substring(0, 20000) }
      } catch {}

      # Extract PR_HTML if present
      $bodyHtml = ''
      try {
        $htmlBytes = $item.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x10130102')
        if ($htmlBytes -and $htmlBytes.Length -gt 0) {
          $bodyHtml = [System.Text.Encoding]::UTF8.GetString($htmlBytes)
          if ($bodyHtml.Length -gt 60000) { $bodyHtml = $bodyHtml.Substring(0, 60000) }
        }
      } catch {}

      # Extract Teams / Online Meeting URL from MAPI named properties
      $onlineMeetingUrl = ''
      foreach ($propUri in @(
        'http://schemas.microsoft.com/mapi/string/{00020329-0000-0000-C000-000000000046}/SkypeTeamsMeetingUrl',
        'http://schemas.microsoft.com/mapi/string/{00020329-0000-0000-C000-000000000046}/OnlineMeetingExternalLink'
      )) {
        if (-not $onlineMeetingUrl) {
          try {
            $val = [string]$item.PropertyAccessor.GetProperty($propUri)
            if ($val -and $val -match '^https?://') { $onlineMeetingUrl = $val }
          } catch {}
        }
      }

      # Extract HYPERLINK URLs embedded in RTFBody (Outlook strips hrefs from plain Body!)
      $rtfUrls = New-Object System.Collections.ArrayList
      try {
        $rtfBytes = $item.RTFBody
        if ($rtfBytes -and $rtfBytes.Length -gt 0) {
          $rtfText = [System.Text.Encoding]::ASCII.GetString($rtfBytes)
          $matches = [regex]::Matches($rtfText, 'HYPERLINK\s+"(https?://[^"\\]+)"')
          foreach ($m in $matches) {
            $u = $m.Groups[1].Value
            if ($u -and -not $rtfUrls.Contains($u)) {
              $null = $rtfUrls.Add($u)
            }
          }
        }
      } catch {}

      $orgName = ''
      $orgEmail = ''
      try { $orgName = [string]$item.Organizer } catch {}
      try {
        $orgEntry = $item.GetOrganizer()
        $orgEmail = Resolve-AddressEntryEmail $orgEntry
      } catch {}

      $recips = New-Object System.Collections.ArrayList
      try {
        foreach ($rec in $item.Recipients) {
          try {
            $addr = ''
            try { $addr = [string]$rec.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x39FE001E') } catch {}
            if (-not $addr) { $addr = Resolve-AddressEntryEmail $rec.AddressEntry }
            if (-not $addr) {
              try {
                $rawAddr = [string]$rec.Address
                if ($rawAddr -and -not $rawAddr.StartsWith('/')) { $addr = $rawAddr }
              } catch {}
            }
            $rStatus = 0
            try { $rStatus = [int]$rec.MeetingResponseStatus } catch {}
            $rType = 1
            try { $rType = [int]$rec.Type } catch {}
            $null = $recips.Add([PSCustomObject]@{
              name   = [string]$rec.Name
              email  = $addr
              type   = $rType
              status = $rStatus
            })
          } catch {}
        }
      } catch {}

      $req = ''
      try { $req = [string]$item.RequiredAttendees } catch {}
      $opt = ''
      try { $opt = [string]$item.OptionalAttendees } catch {}
      $mStatus = 0
      try { $mStatus = [int]$item.MeetingStatus } catch {}
      $bStatus = 2
      try { $bStatus = [int]$item.BusyStatus } catch {}
      $respStatus = 0
      try { $respStatus = [int]$item.ResponseStatus } catch {}

      $null = $events.Add([PSCustomObject]@{
        uid               = $uid
        title             = [string]$item.Subject
        location          = [string]$item.Location
        description       = $body
        bodyHtml          = $bodyHtml
        rtfUrls           = @($rtfUrls)
        onlineMeetingUrl  = $onlineMeetingUrl
        startIso          = $startUtc
        endIso            = $endUtc
        allDay            = [bool]$item.AllDayEvent
        organizerName     = $orgName
        organizerEmail    = $orgEmail
        recipients        = @($recips)
        requiredAttendees = $req
        optionalAttendees = $opt
        meetingStatus     = $mStatus
        busyStatus        = $bStatus
        responseStatus    = $respStatus
      })
    } catch {}
  }

  $payload = @{
    calendarName = [string]$target.Name
    events       = @($events)
  }
  ConvertTo-Json -InputObject $payload -Depth 6 -Compress
} catch {
  $msg = $_.Exception.Message
  Write-Output (ConvertTo-Json -InputObject @{ error = $msg } -Compress)
}
`

  try {
    const raw = await runPowerShellJson<
      { calendarName: string; events: RawOutlookEvent[] } | { error: string }
    >(script, 90_000)

    if ('error' in raw) {
      return { ok: false, imported: 0, error: raw.error }
    }

    const calName = raw.calendarName || 'Outlook Calendar'
    let imported = 0
    for (const ev of raw.events || []) {
      const startAt = Date.parse(ev.startIso)
      const endAt = Date.parse(ev.endIso)
      if (!Number.isFinite(startAt)) continue
      const safeEnd = Number.isFinite(endAt) && endAt > startAt ? endAt : startAt + 3600_000
      const uid = ev.uid || `${startAt}-${ev.title || 'event'}`

      // Build rich attendees from COM Recipients first, falling back to Required/Optional strings
      const rawRecipients = Array.isArray(ev.recipients)
        ? ev.recipients
        : ev.recipients
          ? [ev.recipients as RawOutlookRecipient]
          : []
      const attendees: CalendarEvent['attendees'] = []
      const seenKeys = new Set<string>()
      const orgEmailLower = (ev.organizerEmail || '').toLowerCase()

      for (const r of rawRecipients) {
        const email = (r.email || '').trim()
        const name = (r.name || '').trim()
        if (!email && !name) continue
        const key = (email || name).toLowerCase()
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        const isOrganizer = Boolean(
          r.status === 1 || (orgEmailLower && email.toLowerCase() === orgEmailLower)
        )
        attendees.push({
          name: name || undefined,
          email,
          status: normalizeAttendeeStatus(r.status),
          optional: r.type === 2 ? true : undefined,
          organizer: isOrganizer ? true : undefined
        })
      }

      if (attendees.length === 0) {
        const addFallback = (rawStr: string | undefined, optional?: boolean) => {
          for (const entry of (rawStr || '').split(';').map((s) => s.trim()).filter(Boolean)) {
            const key = entry.toLowerCase()
            if (seenKeys.has(key)) continue
            seenKeys.add(key)
            attendees.push({
              email: entry.includes('@') ? entry : '',
              name: entry,
              optional
            })
          }
        }
        addFallback(ev.requiredAttendees)
        addFallback(ev.optionalAttendees, true)
      }

      const rtfUrls = (Array.isArray(ev.rtfUrls) ? ev.rtfUrls : ev.rtfUrls ? [String(ev.rtfUrls)] : [])
        .map((u) => cleanExtractedUrl(String(u)))
        .filter((u) => /^https?:\/\//i.test(u))

      const normalized = normalizeEventDescription(ev.description || '', ev.bodyHtml || undefined)
      let description = normalized.description
      // Preserve any hyperlinks from RTFBody that plain Body stripped out
      const missingRtfUrls = rtfUrls.filter((u) => !description.includes(u))
      if (missingRtfUrls.length > 0) {
        const suffix = missingRtfUrls.join('\n')
        description = description ? `${description}\n\n${suffix}` : suffix
      }

      const meetingUrl =
        (ev.onlineMeetingUrl && /^https?:\/\//i.test(ev.onlineMeetingUrl)
          ? cleanExtractedUrl(ev.onlineMeetingUrl)
          : undefined) ||
        rtfUrls.map((u) => extractMeetingUrl(u)).find(Boolean) ||
        extractMeetingUrl(`${ev.location || ''}\n${description}`, normalized.descriptionHtml)

      const organizer =
        ev.organizerEmail || ev.organizerName
          ? { name: ev.organizerName || undefined, email: ev.organizerEmail || '' }
          : undefined

      let status: CalendarEvent['status'] = 'confirmed'
      if (ev.meetingStatus === 5 || ev.meetingStatus === 7) {
        status = 'cancelled'
      } else if (ev.busyStatus === 1 || ev.responseStatus === 2) {
        status = 'tentative'
      }

      db.upsertCalendarEvent({
        id: `${account.id}|local|outlook:${folderPath}|${uid}|${startAt}`,
        accountId: account.id,
        calendarId: `outlook:${folderPath}`,
        calendarName: `${account.name} · ${calName}`,
        remoteId: uid,
        title: ev.title || '(No title)',
        description,
        descriptionHtml: normalized.descriptionHtml,
        location: ev.location || '',
        meetingUrl,
        organizer,
        startAt,
        endAt: safeEnd,
        allDay: Boolean(ev.allDay),
        attendees,
        status,
        source: 'local',
        readOnly: false
      })
      imported += 1
    }

    return { ok: true, imported, calendarName: calName }
  } catch (err) {
    return {
      ok: false,
      imported: 0,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
