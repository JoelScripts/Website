<#
.SYNOPSIS
  Creates a GDPR/UK-GDPR/CCPA-style Data Access Request (DSAR) packet folder.

.DESCRIPTION
  This website is static and does not run a first-party user database.
  Most “data we have” will be in third-party systems (email inbox, Discord, hosting logs).

  This script:
   - Prompts you for a data subject's name and identifiers
   - Creates a timestamped folder under ..\data_requests\
   - Generates a small packet of files (request JSON + collection checklist + instructions)

.NOTES
  - This does NOT automatically pull data from Gmail/Discord (requires provider tools).
  - Store the resulting folder securely; it likely contains personal data.

.USAGE
  From repo root:
    powershell -ExecutionPolicy Bypass -File .\tools\create_data_access_packet.ps1
#>

$ErrorActionPreference = 'Stop'

function Get-NonEmptyInput {
  param(
    [Parameter(Mandatory=$true)][string]$Prompt,
    [switch]$AllowEmpty
  )

  while ($true) {
    $value = Read-Host $Prompt
    if ($AllowEmpty -or ($null -ne $value -and $value.Trim().Length -gt 0)) {
      return $value.Trim()
    }
    Write-Host "Please enter a value." -ForegroundColor Yellow
  }
}

function To-SafeFilePart {
  param([Parameter(Mandatory=$true)][string]$Value)

  $v = $Value.Trim()
  if ($v.Length -eq 0) { return "unknown" }

  # Replace invalid filename chars and collapse whitespace
  $v = $v -replace '[\\/:*?"<>|]', '-'
  $v = $v -replace '\s+', ' '
  $v = $v.Trim()

  # Keep it reasonably short
  if ($v.Length -gt 60) { $v = $v.Substring(0, 60).Trim() }

  return $v
}

$subjectName = Get-NonEmptyInput -Prompt "Enter the data subject's full name"
$subjectEmail = Get-NonEmptyInput -Prompt "Enter their email (if known) (optional)" -AllowEmpty
$subjectHandle = Get-NonEmptyInput -Prompt "Enter their Twitch/Discord handle (if known) (optional)" -AllowEmpty
$requestChannel = Get-NonEmptyInput -Prompt "Request received via (email/contact form/DM/etc)" -AllowEmpty
$requestDate = (Get-Date)
$requestId = [guid]::NewGuid().ToString("N")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
$dataRoot = Join-Path $repoRoot "data_requests"

$timestamp = $requestDate.ToString("yyyyMMdd-HHmmss")
$safeName = To-SafeFilePart -Value $subjectName
$folderName = "DSAR-$timestamp-$safeName-$($requestId.Substring(0,8))"
$outDir = Join-Path $dataRoot $folderName

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$requestObj = [ordered]@{
  requestId = $requestId
  createdAt = $requestDate.ToString("o")
  subject = [ordered]@{
    name = $subjectName
    email = $(if ($subjectEmail) { $subjectEmail } else { $null })
    handle = $(if ($subjectHandle) { $subjectHandle } else { $null })
  }
  receivedVia = $(if ($requestChannel) { $requestChannel } else { $null })
  scopeNotes = "Static website. First-party storage is minimal (localStorage preferences). Messages/suggestions are typically stored in email and Discord. Hosting providers may have access/security logs."
  collection = [ordered]@{
    email = [ordered]@{ status = "pending"; notes = "Search flywithjoeluk@gmail.com for subject identifiers." }
    discord = [ordered]@{ status = "pending"; notes = "Search Discord channel/history for suggestions from this user." }
    localStorage = [ordered]@{ status = "n/a"; notes = "No server-side access to a visitor's localStorage. Only user can export their browser storage." }
    hostingLogs = [ordered]@{ status = "pending"; notes = "Provider-managed; usually not attributable without additional identifiers." }
  }
  delivery = [ordered]@{
    method = "pending"
    passwordProtectedZip = $true
    notes = "Prefer encrypted archive + separate password channel."
  }
}

($requestObj | ConvertTo-Json -Depth 10) | Out-File -FilePath (Join-Path $outDir "REQUEST.json") -Encoding UTF8

@"
# Data Access Packet

This folder was created by `tools/create_data_access_packet.ps1`.

## Data subject
- Name: $subjectName
- Email (if known): $(if ($subjectEmail) { $subjectEmail } else { "(not provided)" })
- Handle (if known): $(if ($subjectHandle) { $subjectHandle } else { "(not provided)" })

## Request metadata
- Request ID: $requestId
- Created: $($requestDate.ToString("yyyy-MM-dd HH:mm:ss"))
- Received via: $(if ($requestChannel) { $requestChannel } else { "(not specified)" })

## What this site typically has
This is a static site. We generally **do not** have a first‑party user database.
The personal data we may have is usually:
- Email messages sent to `flywithjoeluk@gmail.com` (contact form or direct email)
- Suggestions submitted via the Suggestions form, delivered to Discord (third party)
- Provider logs (hosting/CDN/email/Discord) which are generally provider-managed

## Next steps
1. Follow `COLLECTION_CHECKLIST.md`
2. Put exports into the `exports/` folder
3. Fill `DATA_SUMMARY.md`
4. Create a password-protected ZIP and record delivery details in `DELIVERY.md`
"@ | Out-File -FilePath (Join-Path $outDir "README.md") -Encoding UTF8

New-Item -ItemType Directory -Path (Join-Path $outDir "exports") -Force | Out-Null

@"
# Collection Checklist

Mark items as you complete them.

## Identity verification
- [ ] Confirm requester controls the email address (reply-from address verification)
- [ ] Confirm scope (access / deletion / correction)
- [ ] Record verification outcome in `REQUEST.json` (notes)

## Email (flywithjoeluk@gmail.com)
- [ ] Search for: "$subjectName" $(if ($subjectEmail) { ", $subjectEmail" } else { "" }) $(if ($subjectHandle) { ", $subjectHandle" } else { "" })
- [ ] Export relevant messages (PDF or .eml) into `exports/email/`
- [ ] If attachments exist, include them

## Discord (Suggestions inbox)
- [ ] Search messages for the name/handle/email
- [ ] Export relevant messages (screenshots or copy/paste into a text file) into `exports/discord/`
- [ ] Include timestamps + channel/context

## Website/localStorage
- [ ] N/A: You cannot access a visitor’s browser localStorage from the server
- [ ] If user requests it, instruct them how to export their own browser storage (see `USER_SIDE_EXPORT.md`)

## Hosting/provider logs
- [ ] Determine if logs are needed/possible (usually not attributable without IP + timestamps)
- [ ] If provided by platform support, include in `exports/provider_logs/`

## Final assembly
- [ ] Create `DATA_SUMMARY.md` describing what’s included
- [ ] Create a password-protected ZIP of the folder contents (excluding passwords)
- [ ] Fill in `DELIVERY.md` (date/method)
"@ | Out-File -FilePath (Join-Path $outDir "COLLECTION_CHECKLIST.md") -Encoding UTF8

@"
# Data Summary (fill this in)

## Summary
- Request ID: $requestId
- Data subject: $subjectName

## Included exports
- Email:
  - 
- Discord:
  - 
- Provider logs:
  - 

## Notes / limits
- This is a static website; there is no first‑party user account database.
- We cannot access the user’s localStorage or browser data; only the user can export that.
- Third-party providers (email/Discord/hosting) may store additional logs subject to their own policies.
"@ | Out-File -FilePath (Join-Path $outDir "DATA_SUMMARY.md") -Encoding UTF8

@"
# Delivery Record

Record how you delivered the packet and any security steps.

- Request ID: $requestId
- Delivered on (date):
- Delivery method (encrypted email / secure link / etc):
- Archive name:
- Password delivered via (separate channel):
- Notes:
"@ | Out-File -FilePath (Join-Path $outDir "DELIVERY.md") -Encoding UTF8

@"
# Provider Export Notes

This script cannot automatically export from third parties.
Use this file as a practical reminder.

## Gmail/Email
- Search mailbox for the subject’s name/email/handle.
- Export relevant messages as PDF or download .eml.
- Put files in `exports/email/`.

## Discord
- Discord does not provide a one-click “export all messages for this user” for typical servers.
- Practical approach:
  - Search within the relevant channel(s)
  - Copy message links, timestamps, and content
  - Save screenshots or paste content into `exports/discord/notes.txt`

## Hosting/CDN logs
- Usually provider-managed and not easily attributable.
- If you have a lawful reason and enough identifiers (timestamps, IP, request IDs), you may request help from the provider.
"@ | Out-File -FilePath (Join-Path $outDir "PROVIDER_EXPORT_NOTES.md") -Encoding UTF8

@"
# User-Side Export (localStorage)

This site stores some preferences in the visitor’s browser (localStorage), for example:
- consent preference for optional third-party content

We (the site operator) cannot read a visitor’s localStorage remotely.
If the user asks for “everything you have”, you can tell them:
- You do not have server-side access to their browser storage
- They can export it themselves via browser developer tools

## Chrome/Edge quick steps
1. Open the site in the browser
2. Press F12 (DevTools)
3. Go to Application (or Storage)
4. Local Storage → select the site origin
5. Screenshot or copy the key/values they want to share

(Only do this if the user explicitly requests it.)
"@ | Out-File -FilePath (Join-Path $outDir "USER_SIDE_EXPORT.md") -Encoding UTF8

Write-Host "Created data access packet:" -ForegroundColor Green
Write-Host "  $outDir" -ForegroundColor Green

try {
  Invoke-Item $outDir
} catch {
  # ignore if no shell association
}
