import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { GlassmailDB } from '../db/database'
import type {
  Account,
  CalendarInvite,
  EmailAddress,
  Folder,
  Message,
  OutlookStoreInfo,
  SendEmailPayload
} from '../../shared/types'
import {
  cleanExtractedUrl,
  extractMeetingUrl,
  normalizeAttendeeStatus,
  normalizeEventDescription
} from '../calendar/calendar-utils'
import {
  classifyCategory,
  detectScamWarning,
  extractSignInCode,
  stripTrackingPixels
} from './classifier'

const execFileAsync = promisify(execFile)

async function runPowerShellJson<T>(script: string, timeoutMs = 90_000): Promise<T> {
  // Write to a temporary .ps1 file (UTF-8 with BOM) so large scripts never hit
  // Windows' 32 KB command-line limit (ENAMETOOLONG) on -EncodedCommand.
  const scriptPath = join(tmpdir(), `everybox-outlook-${randomUUID()}.ps1`)
  writeFileSync(scriptPath, `\uFEFF${script}`, 'utf8')
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024
      }
    )
    const trimmed = stdout.trim()
    if (!trimmed) {
      throw new Error('Classic Outlook returned no data.')
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

function toB64(str: string): string {
  return Buffer.from(str || '', 'utf8').toString('base64')
}

async function runPowerShellEncodedJson<T>(script: string, timeoutMs = 45_000): Promise<T> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  // Fall back to temp .ps1 if encoded command approaches Windows' 32 KB command-line ceiling
  if (encoded.length > 24_000) {
    return runPowerShellJson<T>(script, timeoutMs)
  }
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024
    }
  )
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('Classic Outlook returned no data.')
  }
  return JSON.parse(trimmed) as T
}

const PS_COMMON_HELPERS = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

function Get-OutlookApp {
  try {
    return [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
  } catch {
    return New-Object -ComObject Outlook.Application
  }
}

function From-B64($b64) {
  if ([string]::IsNullOrEmpty($b64)) { return '' }
  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
}

function Find-TargetStore($ns, $targetEmail, $targetStoreName) {
  $emailLow = $targetEmail.ToLower()
  $nameLow = $targetStoreName.ToLower()
  try {
    foreach ($acc in $ns.Accounts) {
      $smtp = ''
      try { $smtp = ([string]$acc.SmtpAddress).ToLower() } catch {}
      if ($smtp -and $smtp -eq $emailLow -and $null -ne $acc.DeliveryStore) {
        return $acc.DeliveryStore
      }
    }
  } catch {}
  foreach ($st in $ns.Stores) {
    $dn = ''
    try { $dn = ([string]$st.DisplayName).ToLower() } catch {}
    if ($dn -eq $emailLow -or ($nameLow -and $dn -eq $nameLow)) {
      return $st
    }
  }
  return $null
}

function Resolve-SenderEmail($item) {
  try {
    $t = [string]$item.SenderEmailType
    if ($t -eq 'EX') {
      try {
        $ex = $item.Sender.GetExchangeUser()
        if ($null -ne $ex -and $ex.PrimarySmtpAddress) { return [string]$ex.PrimarySmtpAddress }
      } catch {}
      try {
        $smtp = [string]$item.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x5D01001F')
        if ($smtp) { return $smtp }
      } catch {}
    }
    return [string]$item.SenderEmailAddress
  } catch {
    return ''
  }
}

function Resolve-Recipients($item) {
  $toList = New-Object System.Collections.ArrayList
  $ccList = New-Object System.Collections.ArrayList
  try {
    foreach ($rec in $item.Recipients) {
      $addr = ''
      try {
        $addr = [string]$rec.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x39FE001E')
      } catch {}
      if (-not $addr) {
        try {
          $ex = $rec.AddressEntry.GetExchangeUser()
          if ($null -ne $ex -and $ex.PrimarySmtpAddress) { $addr = [string]$ex.PrimarySmtpAddress }
        } catch {}
      }
      if (-not $addr) {
        try { $addr = [string]$rec.Address } catch {}
      }
      if ($addr -and $addr.StartsWith('/')) { $addr = '' }
      $obj = [PSCustomObject]@{ name = [string]$rec.Name; email = [string]$addr }
      if ($rec.Type -eq 1) { $null = $toList.Add($obj) }
      elseif ($rec.Type -eq 2) { $null = $ccList.Add($obj) }
    }
  } catch {}
  return @{ to = @($toList); cc = @($ccList) }
}
`

export async function listOutlookStores(): Promise<{
  available: boolean
  stores: OutlookStoreInfo[]
  error?: string
}> {
  if (process.platform !== 'win32') {
    return {
      available: false,
      stores: [],
      error: 'Classic Outlook Desktop sync is only available on Windows.'
    }
  }

  const script = `
${PS_COMMON_HELPERS}
try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $accByStore = @{}
  foreach ($acc in $ns.Accounts) {
    try {
      if ($null -ne $acc.DeliveryStore -and $acc.SmtpAddress) {
        $accByStore[[string]$acc.DeliveryStore.StoreID] = @{
          email = [string]$acc.SmtpAddress
          type  = [int]$acc.AccountType
        }
      }
    } catch {}
  }

  $results = New-Object System.Collections.ArrayList
  foreach ($st in $ns.Stores) {
    try {
      $sid = [string]$st.StoreID
      $dn = [string]$st.DisplayName
      $info = $accByStore[$sid]
      $email = if ($info) { $info.email } elseif ($dn -match '@') { $dn } else { '' }
      if (-not $email) { continue }

      $storeType = 'Outlook'
      if ($info) {
        if ($info.type -eq 0) { $storeType = 'Exchange / M365' }
        elseif ($info.type -eq 1) { $storeType = 'IMAP' }
        elseif ($info.type -eq 2) { $storeType = 'POP3' }
        elseif ($info.type -eq 4) { $storeType = 'Exchange / M365' }
      } elseif ($st.ExchangeStoreType -in @(0, 1, 2, 3)) {
        $storeType = 'Exchange / M365'
      }

      $inboxCount = 0
      $unreadCount = 0
      try {
        $inbox = $st.GetDefaultFolder(6)
        $inboxCount = [int]$inbox.Items.Count
        $unreadCount = [int]$inbox.UnReadItemCount
      } catch {}

      $calPath = ''
      try {
        $cal = $st.GetDefaultFolder(9)
        if ($null -ne $cal) { $calPath = [string]$cal.FolderPath }
      } catch {}

      $null = $results.Add([PSCustomObject]@{
        storeId      = $sid
        displayName  = $dn
        email        = $email
        storeType    = $storeType
        inboxCount   = $inboxCount
        unreadCount  = $unreadCount
        calendarPath = $calPath
      })
    } catch {}
  }
  ConvertTo-Json -InputObject @($results) -Depth 4 -Compress
} catch {
  Write-Output (ConvertTo-Json -InputObject @{ error = $_.Exception.Message } -Compress)
}
`

  try {
    const raw = await runPowerShellJson<OutlookStoreInfo[] | { error: string }>(script, 30_000)
    if (!Array.isArray(raw)) {
      return {
        available: false,
        stores: [],
        error: raw.error || 'Could not detect Classic Outlook Desktop.'
      }
    }
    return { available: true, stores: raw }
  } catch (err) {
    return {
      available: false,
      stores: [],
      error: `Could not connect to Classic Outlook Desktop (${err instanceof Error ? err.message : String(err)}). Make sure Classic Outlook is open.`
    }
  }
}

interface RawComFolder {
  name: string
  path: string
  role: Folder['role']
  totalCount: number
  unreadCount: number
}

interface RawComMeetingInvite {
  uid?: string
  summary?: string
  location?: string
  description?: string
  startIso?: string
  endIso?: string
  allDay?: boolean
  organizerName?: string
  organizerEmail?: string
  onlineMeetingUrl?: string
  method?: string
  attendees?: { name?: string; email?: string; type?: number; status?: number }[]
}

interface RawComMessage {
  entryId: string
  conversationId?: string
  internetMessageId?: string
  folderRole: Folder['role']
  folderName?: string
  fromName?: string
  fromEmail?: string
  to?: EmailAddress[]
  cc?: EmailAddress[]
  subject?: string
  bodyText?: string
  bodyHtml?: string
  dateIso: string
  isRead: boolean
  isStarred: boolean
  isSent: boolean
  isDraft: boolean
  hasAttachments?: boolean
  attachments?: { filename: string; size: number; index: number }[]
  meetingInvite?: RawComMeetingInvite | null
  isOther: boolean
  cached?: boolean
}

const lastFolderWalkByAccount = new Map<string, number>()

export async function syncOutlookComAccount(
  account: Account,
  db: GlassmailDB,
  singleFolder?: Folder
): Promise<{ synced: number }> {
  if (process.platform !== 'win32') return { synced: 0 }

  const knownRemoteIds = db.getKnownRemoteIds(account.id)
  const missingAttRemoteIds = db.getRemoteIdsMissingAttachments(account.id)
  for (const rid of missingAttRemoteIds) {
    knownRemoteIds.delete(rid)
  }
  const isIncremental = !singleFolder && Boolean(account.lastSyncAt) && knownRemoteIds.size > 0
  const lastWalk = lastFolderWalkByAccount.get(account.id) || 0
  const shouldWalkCustomFolders = !singleFolder && (!isIncremental || Date.now() - lastWalk > 10 * 60_000)

  const inboxLimit = isIncremental ? 60 : 80
  const sentLimit = isIncremental ? 25 : 160
  const otherLimit = isIncremental ? 15 : 30

  const knownFile = join(tmpdir(), `everybox-known-${randomUUID()}.txt`)
  writeFileSync(knownFile, Array.from(knownRemoteIds).join('\n'), 'utf8')

  const targetEmailB64 = toB64(account.email)
  const targetStoreB64 = toB64(account.imapHost || account.email)
  const singleFolderPathB64 = toB64(singleFolder?.path || '')
  const knownFileB64 = toB64(knownFile)

  const script = `
${PS_COMMON_HELPERS}
$targetEmail = From-B64 '${targetEmailB64}'
$targetStore = From-B64 '${targetStoreB64}'
$singlePath  = From-B64 '${singleFolderPathB64}'
$knownPath   = From-B64 '${knownFileB64}'
$walkCustom  = ${shouldWalkCustomFolders ? '$true' : '$false'}

$knownSet = @{}
if ($knownPath -and (Test-Path -LiteralPath $knownPath)) {
  foreach ($line in [System.IO.File]::ReadLines($knownPath)) {
    if ($line) { $knownSet[$line] = $true }
  }
}

function Read-FolderMessages($folder, $role, $folderLabel, $limit, $outList) {
  try {
    $items = $folder.Items
    if ($role -eq 'sent') {
      try { $items.Sort('[SentOn]', $true) } catch { try { $items.Sort('[ReceivedTime]', $true) } catch {} }
    } else {
      try { $items.Sort('[ReceivedTime]', $true) } catch {}
    }

    $taken = 0
    foreach ($item in $items) {
      if ($taken -ge $limit) { break }
      try {
        # 43 = olMail; 53 = olMeetingRequest; 54 = olMeetingCancellation; 55-57 = olMeetingResponse*
        $cls = [int]$item.Class
        $isMeetingItem = ($cls -in @(53, 54, 55, 56, 57))
        if ($cls -ne 43 -and -not $isMeetingItem) { continue }
        $taken++
        $entryId = [string]$item.EntryID

        $dt = $null
        if ($role -eq 'sent') {
          try { $dt = $item.SentOn } catch {}
        }
        if ($null -eq $dt) {
          try { $dt = $item.ReceivedTime } catch {}
        }
        if ($null -eq $dt) {
          try { $dt = $item.LastModificationTime } catch {}
        }
        $dateIso = if ($null -ne $dt) { ([datetime]$dt).ToUniversalTime().ToString('o') } else { (Get-Date).ToUniversalTime().ToString('o') }

        $starred = $false
        try { $starred = ([int]$item.FlagStatus -eq 2) } catch {}

        $unread = $false
        try { $unread = [bool]$item.UnRead } catch {}

        # Focused Inbox classification: MAPI proptag 0x12130003 == 1 means "Other" tab (0 or missing = "Focused")
        $isOther = $false
        if ($role -eq 'inbox') {
          try {
            $ic = $item.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x12130003')
            if ([int]$ic -eq 1) { $isOther = $true }
          } catch {}
        }

        # Fast path: skip expensive HTMLBody/Body/Recipients/Header COM reads for emails already cached in SQLite
        if ($knownSet.ContainsKey($entryId)) {
          $null = $outList.Add([PSCustomObject]@{
            entryId    = $entryId
            folderRole = $role
            dateIso    = $dateIso
            isRead     = (-not $unread)
            isStarred  = $starred
            isSent     = ($role -eq 'sent')
            isDraft    = ($role -eq 'drafts')
            isOther    = $isOther
            cached     = $true
          })
          continue
        }

        if ($role -eq 'inbox' -and -not $isOther) {
          try {
            $hdrs = [string]$item.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x007D001F')
            if ($hdrs -match '(?im)^X-MS-Exchange-Organization-Focused:\s*(false|other)\b') { $isOther = $true }
          } catch {}
        }

        $convId = ''
        try { $convId = [string]$item.ConversationID } catch {}
        if (-not $convId) { $convId = $entryId }

        $msgIdHdr = ''
        try {
          $msgIdHdr = [string]$item.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x1035001E')
        } catch {}

        $fromEmail = Resolve-SenderEmail $item
        $fromName = ''
        try { $fromName = [string]$item.SenderName } catch {}
        if (-not $fromEmail -and $role -eq 'sent') { $fromEmail = $targetEmail }
        $recips = Resolve-Recipients $item

        $bodyText = ''
        try { $bodyText = [string]$item.Body } catch {}
        if ($bodyText.Length -gt 24000) { $bodyText = $bodyText.Substring(0, 24000) }

        $bodyHtml = ''
        try { $bodyHtml = [string]$item.HTMLBody } catch {}
        if ($bodyHtml.Length -gt 120000) { $bodyHtml = $bodyHtml.Substring(0, 120000) }

        $hasAtt = $false
        $attList = @()
        try {
          $attCount = [int]$item.Attachments.Count
          if ($attCount -gt 0) {
            for ($ai = 1; $ai -le $attCount; $ai++) {
              try {
                $a = $item.Attachments.Item($ai)
                $fn = ''
                try { $fn = [string]$a.FileName } catch {}
                if (-not $fn) { continue }
                # Only skip inline images (referenced via cid: in HTMLBody or marked hidden + image extension);
                # never skip real documents (PDF, XLSX, DOCX, etc.) even if Exchange assigns a Content-ID.
                $cid = ''
                try { $cid = [string]$a.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F') } catch {}
                $isHidden = $false
                try { $isHidden = [bool]$a.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B') } catch {}
                $isImgExt = $fn -match '\.(png|jpe?g|gif|bmp|webp|svg|ico)$'
                if ($cid -and $bodyHtml -and ($bodyHtml -match [regex]::Escape("cid:$cid"))) { continue }
                if ($isHidden -and $isImgExt) { continue }
                $sz = 0
                try { $sz = [int]$a.Size } catch {}
                $attList += [PSCustomObject]@{ filename = $fn; size = $sz; index = $ai }
              } catch {}
            }
            $hasAtt = ($attList.Count -gt 0)
          }
        } catch {}

        $meetingInviteObj = $null
        if ($isMeetingItem) {
          try {
            $appt = $item.GetAssociatedAppointment($false)
            if ($null -ne $appt) {
              $mUid = ''
              try { $mUid = [string]$appt.GlobalAppointmentID } catch {}
              $mStart = ''
              try { $mStart = ([DateTime]$appt.Start).ToUniversalTime().ToString('o') } catch {}
              $mEnd = ''
              try { $mEnd = ([DateTime]$appt.End).ToUniversalTime().ToString('o') } catch {}
              $mOrgName = ''
              $mOrgEmail = ''
              try { $mOrgName = [string]$appt.Organizer } catch {}
              try {
                $oe = $appt.GetOrganizer()
                if ($null -ne $oe) {
                  try { $mOrgEmail = [string]$oe.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x39FE001E') } catch {}
                  if (-not $mOrgEmail) {
                    try { $ex = $oe.GetExchangeUser(); if ($null -ne $ex) { $mOrgEmail = [string]$ex.PrimarySmtpAddress } } catch {}
                  }
                }
              } catch {}
              $mUrl = ''
              foreach ($pu in @(
                'http://schemas.microsoft.com/mapi/string/{00020329-0000-0000-C000-000000000046}/SkypeTeamsMeetingUrl',
                'http://schemas.microsoft.com/mapi/string/{00020329-0000-0000-C000-000000000046}/OnlineMeetingExternalLink'
              )) {
                if (-not $mUrl) {
                  try {
                    $v = [string]$appt.PropertyAccessor.GetProperty($pu)
                    if ($v -and $v -match '^https?://') { $mUrl = $v }
                  } catch {}
                }
              }
              $mAtts = New-Object System.Collections.ArrayList
              try {
                foreach ($mr in $appt.Recipients) {
                  try {
                    $ma = ''
                    try { $ma = [string]$mr.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x39FE001E') } catch {}
                    if (-not $ma) {
                      try { $mex = $mr.AddressEntry.GetExchangeUser(); if ($null -ne $mex) { $ma = [string]$mex.PrimarySmtpAddress } } catch {}
                    }
                    if (-not $ma) { try { $ra = [string]$mr.Address; if ($ra -and -not $ra.StartsWith('/')) { $ma = $ra } } catch {} }
                    $ms = 0; try { $ms = [int]$mr.MeetingResponseStatus } catch {}
                    $mt = 1; try { $mt = [int]$mr.Type } catch {}
                    $null = $mAtts.Add([PSCustomObject]@{ name = [string]$mr.Name; email = $ma; type = $mt; status = $ms })
                  } catch {}
                }
              } catch {}
              $mMethod = if ($cls -eq 54) { 'CANCEL' } elseif ($cls -eq 53) { 'REQUEST' } else { 'REPLY' }
              $mBody = ''
              try {
                $mBody = [string]$appt.Body
                if ($mBody.Length -gt 8000) { $mBody = $mBody.Substring(0, 8000) }
              } catch {}
              $meetingInviteObj = [PSCustomObject]@{
                uid              = $mUid
                summary          = [string]$appt.Subject
                location         = [string]$appt.Location
                description      = $mBody
                startIso         = $mStart
                endIso           = $mEnd
                allDay           = [bool]$appt.AllDayEvent
                organizerName    = $mOrgName
                organizerEmail   = $mOrgEmail
                onlineMeetingUrl = $mUrl
                method           = $mMethod
                attendees        = @($mAtts)
              }
            }
          } catch {}
        }

        $null = $outList.Add([PSCustomObject]@{
          entryId           = $entryId
          conversationId    = $convId
          internetMessageId = $msgIdHdr
          folderRole        = $role
          folderName        = $folderLabel
          fromName          = $fromName
          fromEmail         = $fromEmail
          to                = $recips.to
          cc                = $recips.cc
          subject           = [string]$item.Subject
          bodyText          = $bodyText
          bodyHtml          = $bodyHtml
          dateIso           = $dateIso
          isRead            = (-not $unread)
          isStarred         = $starred
          isSent            = ($role -eq 'sent')
          isDraft           = ($role -eq 'drafts')
          hasAttachments    = $hasAtt
          attachments       = @($attList)
          meetingInvite     = $meetingInviteObj
          isOther           = $isOther
          cached            = $false
        })
      } catch {}
    }
  } catch {}
}

try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $store = Find-TargetStore $ns $targetEmail $targetStore
  if ($null -eq $store) {
    throw "Outlook store not found for $targetEmail. Make sure Classic Outlook is open and signed into this account."
  }

  $foldersOut = New-Object System.Collections.ArrayList
  $messagesOut = New-Object System.Collections.ArrayList

  $root = $store.GetRootFolder()

  if ($singlePath) {
    function Find-ByPath($f, $depth) {
      if ($depth -gt 4) { return $null }
      if ([string]$f.FolderPath -eq $singlePath) { return $f }
      foreach ($sub in $f.Folders) {
        $hit = Find-ByPath $sub ($depth + 1)
        if ($null -ne $hit) { return $hit }
      }
      return $null
    }
    $targetF = Find-ByPath $root 0
    if ($null -ne $targetF) {
      Read-FolderMessages $targetF 'custom' ([string]$targetF.Name) 50 $messagesOut
    }
    ConvertTo-Json -InputObject @{ folders = @(); messages = @($messagesOut) } -Depth 6 -Compress
    exit 0
  }

  $stdDefs = @(
    @{ id = 6;  role = 'inbox';  limit = ${inboxLimit} }
    @{ id = 5;  role = 'sent';   limit = ${sentLimit} }
    @{ id = 16; role = 'drafts'; limit = ${otherLimit} }
    @{ id = 23; role = 'junk';   limit = ${otherLimit} }
    @{ id = 3;  role = 'trash';  limit = ${otherLimit} }
  )

  $seenPaths = @{}
  foreach ($def in $stdDefs) {
    try {
      $f = $store.GetDefaultFolder($def.id)
      if ($null -eq $f) { continue }
      $fp = [string]$f.FolderPath
      $seenPaths[$fp.ToLower()] = $true
      $tot = 0; $unr = 0
      try { $tot = [int]$f.Items.Count } catch {}
      try { $unr = if ($def.role -eq 'sent') { 0 } else { [int]$f.UnReadItemCount } } catch {}
      $null = $foldersOut.Add([PSCustomObject]@{
        name        = [string]$f.Name
        path        = $fp
        role        = $def.role
        totalCount  = $tot
        unreadCount = $unr
      })
      Read-FolderMessages $f $def.role ([string]$f.Name) $def.limit $messagesOut
    } catch {}
  }

  # Walk custom & Archive mail folders on initial sync and every 10 minutes (skipping on fast 1-min polls)
  if ($walkCustom) {
    function Walk-MailFolders($parent, $prefix, $depth) {
      if ($depth -gt 2) { return }
      foreach ($sub in $parent.Folders) {
        try {
          if ($sub.DefaultItemType -ne 0) { continue }
          $fp = [string]$sub.FolderPath
          $nm = [string]$sub.Name
          if ($nm -match '^(Outbox|Sync Issues|Conversation Action Settings|Quick Step Settings|ExternalContacts|RSS Feeds|Search Folders|Suggested Contacts|Yammer Root|Files)$') { continue }
          $displayName = if ($prefix) { "$prefix/$nm" } else { $nm }
          if (-not $seenPaths.ContainsKey($fp.ToLower())) {
            $seenPaths[$fp.ToLower()] = $true
            $role = if ($nm -match '^Archive$') { 'archive' } else { 'custom' }
            $tot = 0; $unr = 0
            try { $tot = [int]$sub.Items.Count } catch {}
            try { $unr = [int]$sub.UnReadItemCount } catch {}
            $null = $foldersOut.Add([PSCustomObject]@{
              name        = $displayName
              path        = $fp
              role        = $role
              totalCount  = $tot
              unreadCount = $unr
            })
            if ($role -eq 'archive') {
              Read-FolderMessages $sub 'archive' $nm ${otherLimit} $messagesOut
            }
          }
          Walk-MailFolders $sub $displayName ($depth + 1)
        } catch {}
      }
    }
    Walk-MailFolders $root '' 0
  }

  ConvertTo-Json -InputObject @{ folders = @($foldersOut); messages = @($messagesOut) } -Depth 6 -Compress
} catch {
  Write-Output (ConvertTo-Json -InputObject @{ error = $_.Exception.Message } -Compress)
}
`

  let raw: { folders: RawComFolder[]; messages: RawComMessage[]; error?: string }
  try {
    raw = await runPowerShellJson<
      { folders: RawComFolder[]; messages: RawComMessage[]; error?: string }
    >(script, 120_000)
  } finally {
    try {
      unlinkSync(knownFile)
    } catch {
      // ignore cleanup errors
    }
  }

  if (raw.error) {
    throw new Error(raw.error)
  }

  if (shouldWalkCustomFolders) {
    lastFolderWalkByAccount.set(account.id, Date.now())
  }

  const computeOutlookParentPath = (folderPath: string): string | null => {
    if (!folderPath.startsWith('\\\\')) return null
    const parts = folderPath.slice(2).split('\\')
    if (parts.length <= 2) return null
    return '\\\\' + parts.slice(0, -1).join('\\')
  }

  const liveFolderPaths: string[] = []
  for (const f of raw.folders || []) {
    liveFolderPaths.push(f.path)
    db.upsertFolder({
      id: `${account.id}|${f.path}`,
      accountId: account.id,
      remoteId: f.path,
      name: f.name,
      path: f.path,
      parentPath: computeOutlookParentPath(f.path),
      delimiter: '\\',
      role: f.role,
      totalCount: f.totalCount,
      unreadCount: f.role === 'sent' ? 0 : f.unreadCount,
      isSelectable: true
    })
  }
  if (shouldWalkCustomFolders && liveFolderPaths.length > 0) {
    db.pruneMissingFolders(account.id, liveFolderPaths)
  }

  const settings = db.getSettings()
  const focusedMode = account.outlookFocusedMode || 'all'
  const skippedOtherEntryIds: string[] = []
  const liveByRole = new Map<Folder['role'], { ids: string[]; minDateMs?: number; rawCount: number }>()
  const noteRawSeen = (role: Folder['role'], dateMs: number, keptEntryId?: string) => {
    const cur = liveByRole.get(role) || { ids: [], minDateMs: undefined, rawCount: 0 }
    cur.rawCount += 1
    if (cur.minDateMs === undefined || dateMs < cur.minDateMs) {
      cur.minDateMs = dateMs
    }
    if (keptEntryId) cur.ids.push(keptEntryId)
    liveByRole.set(role, cur)
  }
  let synced = 0

  for (const m of raw.messages || []) {
    const dateMs = Date.parse(m.dateIso) || Date.now()
    if (m.folderRole === 'inbox' && m.isOther && focusedMode === 'focused-only') {
      skippedOtherEntryIds.push(m.entryId)
      noteRawSeen('inbox', dateMs)
      continue
    }
    noteRawSeen(m.folderRole, dateMs, m.entryId)

    // Fast path for already-cached emails: only sync read/star flag changes without re-parsing HTML
    if (m.cached) {
      db.updateLocalMessageFlagsByRemoteId(account.id, m.entryId, m.isSent ? true : m.isRead, m.isStarred)
      continue
    }

    const from: EmailAddress = {
      name: m.fromName || m.fromEmail || account.name,
      email: m.fromEmail || ''
    }
    const toList = Array.isArray(m.to) ? m.to : []
    const ccList = Array.isArray(m.cc) ? m.cc : []
    const rawHtml = m.bodyHtml || `<p>${(m.bodyText || '').replace(/\n/g, '<br/>')}</p>`
    const stripped = settings.privacy.stripTrackingPixels
      ? stripTrackingPixels(rawHtml)
      : { html: rawHtml, trackersBlocked: 0 }
    const cleanHtml = stripped.html
    const trackersBlocked = stripped.trackersBlocked

    const hasUnsub = /unsubscribe/i.test(m.bodyText || '') || /unsubscribe/i.test(rawHtml)
    const category =
      m.folderRole === 'inbox' && focusedMode === 'other-to-updates'
        ? m.isOther
          ? 'updates'
          : 'people'
        : classifyCategory({
            from,
            subject: m.subject || '',
            hasListUnsubscribe: hasUnsub,
            isAutoSubmitted: false,
            isSent: m.isSent
          })
    const signInCode = m.isSent ? undefined : extractSignInCode(m.subject || '', m.bodyText || '')
    const scamWarning = m.isSent ? undefined : detectScamWarning(from, m.subject || '')

    const remoteThreadId = m.conversationId || m.entryId
    const threadId = `${account.id}|${remoteThreadId}`
    const msgId = `${account.id}|${m.entryId}`

    const rawAtts = Array.isArray(m.attachments)
      ? m.attachments
      : m.attachments
        ? [m.attachments as { filename: string; size: number; index: number }]
        : []

    let calendarInvite: CalendarInvite | undefined
    if (m.meetingInvite && (m.meetingInvite.startIso || m.meetingInvite.summary)) {
      const mi = m.meetingInvite
      const rawAttList = Array.isArray(mi.attendees) ? mi.attendees : []
      const normalized = normalizeEventDescription(mi.description || m.bodyText || '', m.bodyHtml || undefined)
      const meetingUrl =
        (mi.onlineMeetingUrl && /^https?:\/\//i.test(mi.onlineMeetingUrl)
          ? cleanExtractedUrl(mi.onlineMeetingUrl)
          : undefined) ||
        extractMeetingUrl(`${mi.location || ''}\n${normalized.description}`, normalized.descriptionHtml)

      calendarInvite = {
        uid: mi.uid || m.entryId,
        summary: mi.summary || m.subject || 'Calendar Invitation',
        description: normalized.description || undefined,
        descriptionHtml: normalized.descriptionHtml,
        location: mi.location || undefined,
        meetingUrl,
        startIso: mi.startIso || new Date(dateMs).toISOString(),
        endIso: mi.endIso || new Date(dateMs + 3600_000).toISOString(),
        allDay: Boolean(mi.allDay),
        organizerName: mi.organizerName || from.name || undefined,
        organizerEmail: mi.organizerEmail || from.email || undefined,
        attendees: rawAttList
          .filter((a) => a.email || a.name)
          .map((a) => ({
            name: a.name || undefined,
            email: a.email || '',
            status: normalizeAttendeeStatus(a.status),
            optional: a.type === 2 ? true : undefined,
            organizer: a.status === 1 ? true : undefined
          })),
        method: mi.method,
        status: mi.method === 'CANCEL' ? 'CANCELLED' : 'NEEDS-ACTION',
        rawIcs: ''
      }
    }

    const msg: Message = {
      id: msgId,
      accountId: account.id,
      threadId,
      remoteId: m.entryId,
      messageIdHeader: m.internetMessageId || undefined,
      from,
      to: toList,
      cc: ccList,
      bcc: [],
      subject: m.subject || '(No subject)',
      snippet: (m.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      bodyText: m.bodyText || '',
      bodyHtml: cleanHtml,
      date: dateMs,
      isRead: m.isSent ? true : m.isRead,
      isStarred: m.isStarred,
      isDraft: m.isDraft,
      isSent: m.isSent,
      folderRole: m.folderRole,
      folderName: m.folderName || 'Inbox',
      labels: [m.folderName || 'Inbox'],
      category,
      hasAttachments: rawAtts.length > 0,
      attachments: rawAtts.map((a) => ({
        id: `${msgId}|att-${a.index}`,
        messageId: msgId,
        filename: a.filename,
        mimeType: 'application/octet-stream',
        size: Number(a.size || 0),
        isInline: false,
        remoteAttachmentId: String(a.index)
      })),
      signInCode,
      trackersBlocked,
      scamWarning,
      calendarInvite
    }

    db.upsertMessageAndThread(msg, remoteThreadId)
    synced++
  }

  // Reconcile synced standard folders against live Outlook EntryIDs so emails deleted or moved
  // in Outlook Webmail / mobile / Classic Outlook disappear from EveryBox on the next sync.
  if (!singleFolder) {
    const limitsByRole: Partial<Record<Folder['role'], number>> = {
      inbox: inboxLimit,
      drafts: otherLimit,
      junk: otherLimit,
      trash: otherLimit,
      archive: otherLimit
    }
    for (const role of ['inbox', 'drafts', 'junk', 'trash', 'archive'] as Folder['role'][]) {
      const folderMeta = (raw.folders || []).find((f) => f.role === role)
      if (!folderMeta) continue
      const bucket = liveByRole.get(role)
      const limit = limitsByRole[role] || 30
      if (!bucket || bucket.rawCount === 0) {
        if (folderMeta.totalCount === 0) {
          db.reconcileFolderMessages(account.id, role, [])
        }
        continue
      }
      // If we read the entire folder (< limit), reconcile everything; otherwise reconcile within the fetched date window
      const minDateMs = bucket.rawCount < limit ? undefined : bucket.minDateMs
      db.reconcileFolderMessages(account.id, role, bucket.ids, minDateMs)
    }
  }

  // If Focused-only mode is enabled, purge any previously synced "Other" items locally (never touches Exchange)
  if (focusedMode === 'focused-only' && skippedOtherEntryIds.length > 0) {
    db.removeLocalMessagesByRemoteIds(account.id, skippedOtherEntryIds)
  }

  // Reconcile Inbox folder badge counts in Focused-only mode so sidebar counts reflect Focused items only
  if (focusedMode === 'focused-only') {
    const inboxFolder = (raw.folders || []).find((f) => f.role === 'inbox')
    if (inboxFolder) {
      const localCounts = db.getMailboxCounts([account.id])
      db.upsertFolder({
        id: `${account.id}|${inboxFolder.path}`,
        accountId: account.id,
        remoteId: inboxFolder.path,
        name: inboxFolder.name,
        path: inboxFolder.path,
        role: 'inbox',
        totalCount: localCounts.inboxTotal || 0,
        unreadCount: localCounts.inbox || 0
      })
    }
  }

  return { synced }
}

export async function sendOrSaveOutlookComMessage(
  account: Account,
  payload: SendEmailPayload,
  mode: 'send' | 'draft'
): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Classic Outlook Desktop is only available on Windows.' }
  }

  const emailB64 = toB64(account.email)
  const toB64Str = toB64((payload.to || []).join('; '))
  const ccB64Str = toB64((payload.cc || []).join('; '))
  const bccB64Str = toB64((payload.bcc || []).join('; '))
  const subjB64 = toB64(payload.subject || '(No subject)')
  const htmlB64 = toB64(payload.bodyHtml || `<p>${(payload.bodyText || '').replace(/\n/g, '<br/>')}</p>`)
  const attPathsJsonB64 = toB64(
    JSON.stringify((payload.attachments || []).map((a) => a.localPath).filter((p): p is string => Boolean(p)))
  )

  const script = `
${PS_COMMON_HELPERS}
try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $targetEmail = (From-B64 '${emailB64}').ToLower()

  $mail = $outlook.CreateItem(0)
  foreach ($acc in $ns.Accounts) {
    try {
      if (([string]$acc.SmtpAddress).ToLower() -eq $targetEmail) {
        $mail.SendUsingAccount = $acc
        break
      }
    } catch {}
  }

  $mail.To = From-B64 '${toB64Str}'
  $cc = From-B64 '${ccB64Str}'
  if ($cc) { $mail.CC = $cc }
  $bcc = From-B64 '${bccB64Str}'
  if ($bcc) { $mail.BCC = $bcc }
  $mail.Subject = From-B64 '${subjB64}'
  $mail.HTMLBody = From-B64 '${htmlB64}'
  $attPaths = ConvertFrom-Json (From-B64 '${attPathsJsonB64}')
  foreach ($ap in $attPaths) {
    if ($ap -and (Test-Path -LiteralPath $ap)) {
      try { $null = $mail.Attachments.Add($ap) } catch {}
    }
  }

  if ('${mode}' -eq 'draft') {
    $mail.Save()
  } else {
    $mail.Send()
  }
  ConvertTo-Json -InputObject @{ ok = $true } -Compress
} catch {
  ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress
}
`

  const res = await runPowerShellJson<{ ok: boolean; error?: string }>(script, 30_000)
  return res
}

export async function saveOutlookComAttachment(
  entryId: string,
  filename: string,
  destPath: string
): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') return { ok: false, error: 'Only available on Windows.' }
  const entryB64 = toB64(entryId)
  const fileB64 = toB64(filename)
  const destB64 = toB64(destPath)

  const script = `
${PS_COMMON_HELPERS}
try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $entryId = From-B64 '${entryB64}'
  $targetName = (From-B64 '${fileB64}').ToLower()
  $dest = From-B64 '${destB64}'

  $item = $ns.GetItemFromID($entryId)
  if ($null -eq $item) { throw 'Message not found in Outlook.' }
  $saved = $false
  for ($i = 1; $i -le $item.Attachments.Count; $i++) {
    $a = $item.Attachments.Item($i)
    if (([string]$a.FileName).ToLower() -eq $targetName) {
      $a.SaveAsFile($dest)
      $saved = $true
      break
    }
  }
  if (-not $saved -and $item.Attachments.Count -gt 0) {
    $item.Attachments.Item(1).SaveAsFile($dest)
    $saved = $true
  }
  if (-not $saved) { throw 'Attachment not found on message.' }
  ConvertTo-Json -InputObject @{ ok = $true } -Compress
} catch {
  ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress
}
`
  return runPowerShellJson<{ ok: boolean; error?: string }>(script, 30_000)
}

export async function mutateOutlookComMessages(
  account: Account,
  opts: {
    entryIds: string[]
    action: 'archive' | 'trash' | 'read' | 'unread' | 'star' | 'unstar' | 'move' | 'delete'
    targetRole?: Folder['role']
    targetFolderName?: string
  }
): Promise<void> {
  if (process.platform !== 'win32' || opts.entryIds.length === 0) return

  const emailB64 = toB64(account.email)
  const storeB64 = toB64(account.imapHost || account.email)
  const idsB64 = toB64(JSON.stringify(opts.entryIds))
  const targetFolderB64 = toB64(opts.targetFolderName || '')

  const script = `
${PS_COMMON_HELPERS}
try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $targetEmail = From-B64 '${emailB64}'
  $targetStore = From-B64 '${storeB64}'
  $store = Find-TargetStore $ns $targetEmail $targetStore
  if ($null -eq $store) { exit 0 }

  $entryIds = ConvertFrom-Json (From-B64 '${idsB64}')
  $action = '${opts.action}'
  $targetRole = '${opts.targetRole || ''}'
  $targetFolderName = From-B64 '${targetFolderB64}'

  function Find-FolderRecursive($parent, $prefix, $target, $depth) {
    if ($depth -gt 6) { return $null }
    $targetLow = $target.ToLower()
    foreach ($sub in $parent.Folders) {
      try {
        $fp = [string]$sub.FolderPath
        $nm = [string]$sub.Name
        $disp = if ($prefix) { "$prefix/$nm" } else { $nm }
        if ($fp.ToLower() -eq $targetLow -or $disp.ToLower() -eq $targetLow) {
          return $sub
        }
        $hit = Find-FolderRecursive $sub $disp $target ($depth + 1)
        if ($null -ne $hit) { return $hit }
      } catch {}
    }
    return $null
  }

  function Find-FolderByLeafName($parent, $target, $depth) {
    if ($depth -gt 6) { return $null }
    $targetLow = $target.ToLower()
    foreach ($sub in $parent.Folders) {
      try {
        if (([string]$sub.Name).ToLower() -eq $targetLow) { return $sub }
        $hit = Find-FolderByLeafName $sub $target ($depth + 1)
        if ($null -ne $hit) { return $hit }
      } catch {}
    }
    return $null
  }

  function Resolve-DestFolder {
    if ($action -eq 'archive' -or $targetRole -eq 'archive') {
      foreach ($sub in $store.GetRootFolder().Folders) {
        if ($sub.Name -match '^Archive$') { return $sub }
      }
      return $store.GetRootFolder().Folders.Add('Archive')
    }
    if ($targetRole -eq 'inbox') { return $store.GetDefaultFolder(6) }
    if ($targetRole -eq 'junk')  { return $store.GetDefaultFolder(23) }
    if ($targetRole -eq 'trash') { return $store.GetDefaultFolder(3) }
    if ($targetFolderName) {
      $rootF = $store.GetRootFolder()
      $exact = Find-FolderRecursive $rootF '' $targetFolderName 0
      if ($null -ne $exact) { return $exact }
      if (-not $targetFolderName.Contains('/') -and -not $targetFolderName.Contains('\')) {
        return Find-FolderByLeafName $rootF $targetFolderName 0
      }
    }
    return $null
  }

  $dest = $null
  if ($action -in @('archive', 'move')) {
    $dest = Resolve-DestFolder
  }

  foreach ($eid in $entryIds) {
    try {
      $item = $ns.GetItemFromID([string]$eid, $store.StoreID)
      if ($null -eq $item) { continue }
      if ($action -eq 'read') {
        $item.UnRead = $false
        $item.Save()
      } elseif ($action -eq 'unread') {
        $item.UnRead = $true
        $item.Save()
      } elseif ($action -eq 'star') {
        $item.FlagStatus = 2
        $item.Save()
      } elseif ($action -eq 'unstar') {
        $item.FlagStatus = 0
        $item.Save()
      } elseif ($action -eq 'trash' -or $action -eq 'delete') {
        $item.Delete()
      } elseif (($action -eq 'archive' -or $action -eq 'move') -and $null -ne $dest) {
        $null = $item.Move($dest)
      }
    } catch {}
  }
  ConvertTo-Json -InputObject @{ ok = $true } -Compress
} catch {
  ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress
}
`

  await runPowerShellJson<{ ok: boolean }>(script, 45_000).catch(() => {})
}

// ---- Classic Outlook COM Folder CRUD ----

const PS_OUTLOOK_FOLDER_HELPERS = `
function Get-DefaultFolderEntryIds($store) {
  $ids = @{}
  foreach ($fid in @(3, 4, 5, 6, 16, 23)) {
    try {
      $df = $store.GetDefaultFolder($fid)
      if ($null -ne $df -and $df.EntryID) { $ids[[string]$df.EntryID] = $true }
    } catch {}
  }
  return $ids
}

function Find-FolderByPathOrName($parent, $prefix, $target, $depth) {
  if ($depth -gt 8) { return $null }
  $targetLow = $target.ToLower()
  foreach ($sub in $parent.Folders) {
    try {
      $fp = [string]$sub.FolderPath
      $nm = [string]$sub.Name
      $disp = if ($prefix) { "$prefix/$nm" } else { $nm }
      if ($fp.ToLower() -eq $targetLow -or $disp.ToLower() -eq $targetLow) {
        return $sub
      }
      $hit = Find-FolderByPathOrName $sub $disp $target ($depth + 1)
      if ($null -ne $hit) { return $hit }
    } catch {}
  }
  return $null
}

function Collect-DescendantFolders($folder, $outList, $depth) {
  if ($depth -gt 8) { return }
  foreach ($sub in $folder.Folders) {
    try {
      $null = $outList.Add([PSCustomObject]@{
        name = [string]$sub.Name
        path = [string]$sub.FolderPath
      })
      Collect-DescendantFolders $sub $outList ($depth + 1)
    } catch {}
  }
}
`

export async function createOutlookFolder(
  account: Account,
  name: string,
  parentPath?: string | null
): Promise<{ ok: boolean; name?: string; path?: string; parentPath?: string | null; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Classic Outlook Desktop is only available on Windows.' }
  }
  const cleanName = name.trim()
  if (!cleanName) return { ok: false, error: 'Folder name cannot be empty.' }

  const emailB64 = toB64(account.email)
  const storeB64 = toB64(account.imapHost || account.email)
  const nameB64 = toB64(cleanName)
  const parentB64 = toB64(parentPath || '')

  const script = `
${PS_COMMON_HELPERS}
${PS_OUTLOOK_FOLDER_HELPERS}
try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $store = Find-TargetStore $ns (From-B64 '${emailB64}') (From-B64 '${storeB64}')
  if ($null -eq $store) { throw 'Outlook store not found for this account.' }

  $root = $store.GetRootFolder()
  $parentSpec = From-B64 '${parentB64}'
  $parentFolder = $root
  if ($parentSpec) {
    $foundParent = Find-FolderByPathOrName $root '' $parentSpec 0
    if ($null -eq $foundParent) { throw "Parent folder not found: $parentSpec" }
    $parentFolder = $foundParent
  }

  $folderName = From-B64 '${nameB64}'
  # 0 = olFolderInbox (mail folder type)
  $created = $parentFolder.Folders.Add($folderName, 0)
  $createdPath = [string]$created.FolderPath
  $resolvedParent = if ($parentFolder.FolderPath -eq $root.FolderPath) { $null } else { [string]$parentFolder.FolderPath }

  ConvertTo-Json -InputObject @{
    ok         = $true
    name       = [string]$created.Name
    path       = $createdPath
    parentPath = $resolvedParent
  } -Compress
} catch {
  ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress
}
`

  return runPowerShellEncodedJson<{
    ok: boolean
    name?: string
    path?: string
    parentPath?: string | null
    error?: string
  }>(script, 30_000)
}

export async function renameOutlookFolder(
  account: Account,
  folderPath: string,
  newName: string
): Promise<{
  ok: boolean
  name?: string
  path?: string
  childRenames?: { oldPath: string; newPath: string }[]
  error?: string
}> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Classic Outlook Desktop is only available on Windows.' }
  }
  const cleanName = newName.trim()
  if (!cleanName) return { ok: false, error: 'New folder name cannot be empty.' }

  const emailB64 = toB64(account.email)
  const storeB64 = toB64(account.imapHost || account.email)
  const pathB64 = toB64(folderPath)
  const newNameB64 = toB64(cleanName)

  const script = `
${PS_COMMON_HELPERS}
${PS_OUTLOOK_FOLDER_HELPERS}
try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $store = Find-TargetStore $ns (From-B64 '${emailB64}') (From-B64 '${storeB64}')
  if ($null -eq $store) { throw 'Outlook store not found for this account.' }

  $root = $store.GetRootFolder()
  $targetSpec = From-B64 '${pathB64}'
  $target = Find-FolderByPathOrName $root '' $targetSpec 0
  if ($null -eq $target) { throw "Folder not found in Outlook: $targetSpec" }

  $defaultIds = Get-DefaultFolderEntryIds $store
  if ($defaultIds.ContainsKey([string]$target.EntryID)) {
    throw 'Cannot rename a default Outlook system folder.'
  }

  $oldPath = [string]$target.FolderPath
  $desc = New-Object System.Collections.ArrayList
  Collect-DescendantFolders $target $desc 0

  $nextName = From-B64 '${newNameB64}'
  $target.Name = $nextName
  $newPath = [string]$target.FolderPath

  $childRenames = New-Object System.Collections.ArrayList
  foreach ($d in $desc) {
    $op = [string]$d.path
    if ($op.ToLower().StartsWith(($oldPath + '\').ToLower())) {
      $np = $newPath + $op.Substring($oldPath.Length)
      $null = $childRenames.Add([PSCustomObject]@{ oldPath = $op; newPath = $np })
    }
  }

  ConvertTo-Json -InputObject @{
    ok           = $true
    name         = [string]$target.Name
    path         = $newPath
    childRenames = @($childRenames)
  } -Depth 4 -Compress
} catch {
  ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress
}
`

  return runPowerShellEncodedJson<{
    ok: boolean
    name?: string
    path?: string
    childRenames?: { oldPath: string; newPath: string }[]
    error?: string
  }>(script, 30_000)
}

export async function deleteOutlookFolder(
  account: Account,
  folderPath: string,
  opts?: { moveMessagesToRole?: 'archive' | 'inbox' | 'trash' }
): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Classic Outlook Desktop is only available on Windows.' }
  }

  const emailB64 = toB64(account.email)
  const storeB64 = toB64(account.imapHost || account.email)
  const pathB64 = toB64(folderPath)
  const moveRole = opts?.moveMessagesToRole || ''

  const script = `
${PS_COMMON_HELPERS}
${PS_OUTLOOK_FOLDER_HELPERS}
try {
  $outlook = Get-OutlookApp
  $ns = $outlook.GetNamespace('MAPI')
  $store = Find-TargetStore $ns (From-B64 '${emailB64}') (From-B64 '${storeB64}')
  if ($null -eq $store) { throw 'Outlook store not found for this account.' }

  $root = $store.GetRootFolder()
  $targetSpec = From-B64 '${pathB64}'
  $target = Find-FolderByPathOrName $root '' $targetSpec 0
  if ($null -eq $target) {
    ConvertTo-Json -InputObject @{ ok = $true } -Compress
    exit 0
  }

  $defaultIds = Get-DefaultFolderEntryIds $store
  if ($defaultIds.ContainsKey([string]$target.EntryID)) {
    throw 'Cannot delete a default Outlook system folder.'
  }

  $moveRole = '${moveRole}'
  if ($moveRole) {
    $dest = $null
    if ($moveRole -eq 'inbox') { $dest = $store.GetDefaultFolder(6) }
    elseif ($moveRole -eq 'trash') { $dest = $store.GetDefaultFolder(3) }
    elseif ($moveRole -eq 'archive') {
      foreach ($sub in $root.Folders) {
        if ($sub.Name -match '^Archive$') { $dest = $sub; break }
      }
      if ($null -eq $dest) { $dest = $root.Folders.Add('Archive') }
    }

    if ($null -ne $dest -and ([string]$dest.EntryID) -ne ([string]$target.EntryID)) {
      function Move-AllItems($f, $d, $depth) {
        if ($depth -gt 8) { return }
        foreach ($sub in $f.Folders) {
          Move-AllItems $sub $d ($depth + 1)
        }
        $cnt = [int]$f.Items.Count
        for ($i = $cnt; $i -ge 1; $i--) {
          try { $null = $f.Items.Item($i).Move($d) } catch {}
        }
      }
      Move-AllItems $target $dest 0
    }
  }

  $target.Delete()
  ConvertTo-Json -InputObject @{ ok = $true } -Compress
} catch {
  ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress
}
`

  return runPowerShellEncodedJson<{ ok: boolean; error?: string }>(script, 45_000)
}
