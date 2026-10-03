<#
  import-client.ps1 -- fingerprint a user-supplied NBA 2K17 directory.

  IT NEVER DOWNLOADS ANYTHING. It has no network code at all. It reads a folder
  you point it at and records what is there.

  PROVENANCE-NEUTRAL BY DESIGN
  ----------------------------
  This script does not try to decide whether a client came from Steam, from a
  Preserve-style archive, or from anywhere else, and it deliberately does NOT
  implement a "is this the expected Preserve 1.0.1 build?" classifier. Such a
  classifier has exactly one use -- certifying that an unauthorized copy is the
  correct unauthorized revision -- and that is the acquisition path this lab
  refuses to assist.

  What it reports instead is the distinction that actually matters: what the build
  IS (hashes, versions, PE timestamp, layout), and whether it sits inside a real
  Steam library with a matching licence record. That is useful for the experiment
  AND it is the honest legal signal.

  Run elevated is NOT required. Read-only.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Path,
    [switch]$IncludeMd5,          # only useful for matching historical public hashes
    [int]$MaxFilesToList = 40
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-LabDirs

if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "Not a directory: $Path"
}
$root = (Resolve-Path -LiteralPath $Path).Path
Write-Step "Inspecting $root"

# --- locate the executable; do NOT assume a filename --------------------------
# The brief suggested asserting NBA2K17.exe. We discover instead: `entry_exe` for
# 2K17 lives in a manifest we never fetched, so the real name is UNKNOWN to us,
# and a wrong assumption would fail on a legitimate install.
$exeCandidates = @(Get-ChildItem -LiteralPath $root -Filter '*.exe' -File -Recurse -Depth 2 -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending)

if ($exeCandidates.Count -eq 0) { throw "No .exe found under $root (searched depth 2)." }

$exe = $exeCandidates | Where-Object { $_.Name -match '^NBA2K17\.exe$' } | Select-Object -First 1
if ($exe -eq $null) {
    Write-Step 'No NBA2K17.exe found. Candidates by size:' 'WARN'
    $exeCandidates | Select-Object -First 8 | ForEach-Object {
        Write-Step ("  {0,10:N0} KB  {1}" -f ($_.Length/1KB), $_.FullName) 'WARN'
    }
    throw 'NBA2K17.exe not present. Point -Path at the game folder itself.'
}
Write-Step "Executable: $($exe.FullName)"

# --- hashes -------------------------------------------------------------------
Write-Step 'Hashing (this reads the whole file) ...'
$sha256 = (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash
$sha1   = (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA1).Hash
$md5    = $null
if ($IncludeMd5) { $md5 = (Get-FileHash -LiteralPath $exe.FullName -Algorithm MD5).Hash }
Write-Step "  SHA-256 $sha256"
Write-Step "  SHA-1   $sha1"

# --- PE header timestamp ------------------------------------------------------
# Read the COFF TimeDateStamp directly. More stable than LastWriteTime, which any
# copy or extraction can change.
function Get-PeTimestamp {
    param([string]$File)
    $fs = [IO.File]::Open($File, 'Open', 'Read', 'ReadWrite')
    try {
        $br = New-Object IO.BinaryReader($fs)
        $fs.Position = 0x3C
        $peOffset = $br.ReadInt32()
        $fs.Position = $peOffset
        $sig = $br.ReadUInt32()
        if ($sig -ne 0x00004550) { return $null }   # 'PE\0\0'
        $null = $br.ReadUInt16()                     # Machine
        $null = $br.ReadUInt16()                     # NumberOfSections
        $stamp = $br.ReadUInt32()                    # TimeDateStamp
        return ([DateTimeOffset]::FromUnixTimeSeconds($stamp)).UtcDateTime
    } finally { $fs.Dispose() }
}
$peStamp = $null
try { $peStamp = Get-PeTimestamp -File $exe.FullName } catch { Write-Step "PE timestamp unreadable: $($_.Exception.Message)" 'WARN' }
Write-Step "  PE TimeDateStamp (UTC): $(if($peStamp){$peStamp.ToString('yyyy-MM-dd HH:mm:ss')}else{'unreadable'})"

# --- version + signature ------------------------------------------------------
$vi = $exe.VersionInfo
$sig = $null
try { $sig = Get-AuthenticodeSignature -LiteralPath $exe.FullName } catch { }
$signerName = $null
$sigStatus = 'unchecked'
if ($sig) {
    $sigStatus = [string]$sig.Status
    if ($sig.SignerCertificate) { $signerName = $sig.SignerCertificate.Subject }
}
Write-Step "  FileVersion    : $($vi.FileVersion)"
Write-Step "  ProductVersion : $($vi.ProductVersion)"
Write-Step "  Signature      : $sigStatus"

# --- provenance signals (NOT a Preserve-revision classifier) ------------------
$steamLibRe = [regex]'steamapps[\\/]common[\\/]'
$inSteamLibrary = $steamLibRe.IsMatch($root)

# Is there a Steam licence record for 385760 on this machine?
$steamRoot = $null
try { $steamRoot = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath } catch { }
$manifestPresent = $false
if ($steamRoot) {
    $sr = $steamRoot -replace '/', '\'
    $manifestPresent = Test-Path (Join-Path $sr 'steamapps\appmanifest_385760.acf')
}

# Preserve install markers, if any. Recorded as a FACT about the machine, used
# only to describe provenance -- never as validation of a build.
$preserveIndex = Join-Path $env:USERPROFILE '.preserve\index.json'
$preserveMarkerPresent = Test-Path $preserveIndex

$steamDlls = @(Get-ChildItem -LiteralPath $root -Filter 'steam_api*.dll' -File -Recurse -Depth 2 -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName.Substring($root.Length).TrimStart('\') })
# steam_emu.ini / Goldberg configs are an ownership-bypass signal. We REPORT them
# so a tainted client is never silently used as the basis of a published result.
$bypassSignals = @(Get-ChildItem -LiteralPath $root -File -Recurse -Depth 2 -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'steam_emu|goldberg|smartsteam|creamapi|steamclient_loader' } |
    ForEach-Object { $_.FullName.Substring($root.Length).TrimStart('\') })
$bypassSignals += @(Get-ChildItem -LiteralPath $root -Directory -Recurse -Depth 2 -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^steam_settings$' } |
    ForEach-Object { $_.FullName.Substring($root.Length).TrimStart('\') })
$bypassSignals = @($bypassSignals)

Write-Step "  inside steamapps\common : $inSteamLibrary"
Write-Step "  appmanifest_385760.acf  : $manifestPresent"
Write-Step "  steam_api*.dll present  : $($steamDlls.Count)"
Write-Step "  Preserve index.json     : $preserveMarkerPresent"
if ($bypassSignals.Count -gt 0) {
    Write-Step "  OWNERSHIP-BYPASS SIGNALS: $($bypassSignals.Count)" 'ERROR'
    foreach ($b in $bypassSignals) { Write-Step "    $b" 'ERROR' }
}

# --- provenance verdict -------------------------------------------------------
# Three outcomes only. Deliberately NOT a Preserve build classifier.
$provenance = 'UNVERIFIED_SOURCE'
if ($inSteamLibrary -and $manifestPresent) { $provenance = 'STEAM_LICENSED_INSTALL' }
elseif ($bypassSignals.Count -gt 0)        { $provenance = 'OWNERSHIP_BYPASS_PRESENT' }

# --- directory shape ----------------------------------------------------------
Write-Step 'Measuring directory ...'
$all = @(Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue)
$totalBytes = ($all | Measure-Object -Property Length -Sum).Sum
Write-Step "  $($all.Count) files, $([math]::Round($totalBytes/1GB,2)) GB"

$topLevel = @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |
    Select-Object -First $MaxFilesToList |
    ForEach-Object { $(if ($_.PSIsContainer) { 'D ' } else { 'F ' }) + $_.Name })

# --- write state --------------------------------------------------------------
$client = [ordered]@{
    recordedUtc       = (Get-UtcStamp)
    rootPath          = $root
    executable        = $exe.FullName
    executableName    = $exe.Name
    sizeBytes         = $exe.Length
    sha256            = $sha256
    sha1              = $sha1
    md5               = $md5
    peTimeDateStampUtc= $(if ($peStamp) { $peStamp.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { $null })
    fileVersion       = $vi.FileVersion
    productVersion    = $vi.ProductVersion
    productName       = $vi.ProductName
    companyName       = $vi.CompanyName
    signatureStatus   = $sigStatus
    signerSubject     = $signerName
    dirFileCount      = $all.Count
    dirTotalBytes     = $totalBytes
    inSteamLibrary    = $inSteamLibrary
    steamManifestPresent = $manifestPresent
    steamApiDlls      = $steamDlls
    preserveIndexPresent = $preserveMarkerPresent
    ownershipBypassSignals = $bypassSignals
    provenance        = $provenance
}
$clientPath = Join-Path $StateDir 'client.json'
[IO.File]::WriteAllText($clientPath, ($client | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
Write-Step "Wrote $clientPath"

# --- sanitized doc ------------------------------------------------------------
# No proprietary file contents, no full user paths beyond the leaf folder.
$leaf = Split-Path -Leaf $root
$md = @()
$md += '# Client Fingerprint'
$md += ''
$md += "*Recorded $(Get-UtcStamp) by ``scripts/import-client.ps1``. Nothing was downloaded.*"
$md += ''
$md += '| Field | Value |'
$md += '|---|---|'
$md += "| folder (leaf only) | ``$leaf`` |"
$md += "| executable | ``$($exe.Name)`` |"
$md += "| exe size | $($exe.Length) bytes |"
$md += "| **SHA-256** | ``$sha256`` |"
$md += "| SHA-1 | ``$sha1`` |"
if ($md5) { $md += "| MD5 | ``$md5`` |" }
$md += "| PE TimeDateStamp (UTC) | $(if($peStamp){$peStamp.ToString('yyyy-MM-dd HH:mm:ss')}else{'unreadable'}) |"
$md += "| FileVersion | $($vi.FileVersion) |"
$md += "| ProductVersion | $($vi.ProductVersion) |"
$md += "| ProductName | $($vi.ProductName) |"
$md += "| Authenticode | $sigStatus |"
$md += "| directory | $($all.Count) files, $([math]::Round($totalBytes/1GB,2)) GB |"
$md += "| inside ``steamapps\common`` | $inSteamLibrary |"
$md += "| ``appmanifest_385760.acf`` | $manifestPresent |"
$md += "| ``steam_api*.dll`` count | $($steamDlls.Count) |"
$md += "| **PROVENANCE** | **$provenance** |"
$md += ''
$md += '## Provenance meaning'
$md += ''
$md += '- `STEAM_LICENSED_INSTALL` -- lives in a Steam library AND Steam holds an'
$md += '  `appmanifest` for 385760. This is the only provenance this lab will'
$md += '  publish results from.'
$md += '- `OWNERSHIP_BYPASS_PRESENT` -- emulator/crack configuration detected.'
$md += '  **Results from such a client will not be published or treated as evidence.**'
$md += '- `UNVERIFIED_SOURCE` -- a 2K17-shaped directory with no licence record.'
$md += '  Not accused of anything, but not certified either.'
$md += ''
$md += 'This file deliberately contains **no** judgement about whether the build'
$md += 'matches any particular third-party archive revision. See'
$md += '`research/preserve-client-contract.md` for why that classifier was not built.'
$md += ''
$md += '`verified: true` in a Preserve install marker means its own SHA-256 pass'
$md += 'succeeded against the manifest it was handed. It is not a statement about'
$md += 'licensing or authenticity, and this lab never treats it as one.'

$mdPath = Join-Path $RepoRoot 'docs\client-fingerprint.md'
[IO.File]::WriteAllText($mdPath, (($md -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding($false)))
Write-Step "Wrote $mdPath"

Write-Step '---'
Write-Step "PROVENANCE: $provenance" $(if ($provenance -eq 'STEAM_LICENSED_INSTALL') { 'OK' } else { 'WARN' })
if ($provenance -eq 'OWNERSHIP_BYPASS_PRESENT') {
    Write-Step 'This client carries ownership-bypass configuration. The lab will not' 'ERROR'
    Write-Step 'publish or report results obtained from it.' 'ERROR'
    exit 2
}
