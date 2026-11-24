import { execFile } from 'child_process'
import { promisify } from 'util'
import type { GlassmailDB } from '../db/database'
import type { Account } from '../../shared/types'
import { extractMeetingUrl } from './caldav-sync'

const execFileAsync = promisify(execFile)

export interface OutlookCalendarInfo {
  storeName: string
  folderName: string
  folderPath: string
  itemCount: number
}

interface RawOutlookEvent {
  uid: string
  title: string
  location: string
  description: string
  startIso: string
  endIso: string
  allDay: boolean
  attendees: string
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

async function runPowerShellJson<T>(script: string, timeoutMs = 45_000): Promise<T> {
  const encoded = encodePowerShell(script)
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024
    }
  )
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('Outlook returned no data.')
  }
  return JSON.parse(trimmed) as T
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
        if ($body.Length -gt 4000) { $body = $body.Substring(0, 4000) }
      } catch {}
      $req = ''
      try { $req = [string]$item.RequiredAttendees } catch {}

      $null = $events.Add([PSCustomObject]@{
        uid         = $uid
        title       = [string]$item.Subject
        location    = [string]$item.Location
        description = $body
        startIso    = $startUtc
        endIso      = $endUtc
        allDay      = [bool]$item.AllDayEvent
        attendees   = $req
      })
    } catch {}
  }

  $payload = @{
    calendarName = [string]$target.Name
    events       = @($events)
  }
  ConvertTo-Json -InputObject $payload -Depth 5 -Compress
} catch {
  $msg = $_.Exception.Message
  Write-Output (ConvertTo-Json -InputObject @{ error = $msg } -Compress)
}
`

  try {
    const raw = await runPowerShellJson<
      { calendarName: string; events: RawOutlookEvent[] } | { error: string }
    >(script, 60_000)

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
      const attendees = (ev.attendees || '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => ({
          email: entry.includes('@') ? entry : '',
          name: entry
        }))
        .filter((a) => a.name || a.email)

      const meetingUrl = extractMeetingUrl(`${ev.location || ''}\n${ev.description || ''}`)

      db.upsertCalendarEvent({
        id: `${account.id}|local|outlook:${folderPath}|${uid}|${startAt}`,
        accountId: account.id,
        calendarId: `outlook:${folderPath}`,
        calendarName: `${account.name} · ${calName}`,
        remoteId: uid,
        title: ev.title || '(No title)',
        description: ev.description || '',
        location: ev.location || '',
        meetingUrl,
        startAt,
        endAt: safeEnd,
        allDay: Boolean(ev.allDay),
        attendees,
        status: 'confirmed',
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
