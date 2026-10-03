# Shared helpers for the 2k17-compat-lab scripts. Dot-source this; do not run it.
# PowerShell 5.1 only -- no &&, no ternary, no ?? , no -AsHashtable.

Set-StrictMode -Version 2.0

# --- paths ------------------------------------------------------------------
$script:RepoRoot  = Split-Path -Parent $PSScriptRoot
$script:StateDir  = Join-Path $RepoRoot 'experiment-state'
$script:LogDir    = Join-Path $RepoRoot 'logs'
$script:CapDir    = Join-Path $RepoRoot 'captures'
$script:StateFile = Join-Path $StateDir 'state.json'
$script:HostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'

# Key material lives OUTSIDE the repo on purpose.
#
# Landmine this avoids: a .gitignore rule matching an exact name protects
# nothing that merely LOOKS like it. A PFX named `leaf.pfx.bak-20261003` slips
# past a rule written for `leaf.pfx`. Nothing key-shaped is written inside the
# working tree at all, so no ignore rule is load-bearing.
$script:VaultDir = Join-Path $env:USERPROFILE '.2k17-lab'

$script:TargetHost   = 'nba2k17-ws.2ksports.com'
$script:MarkerPrefix = '# 2k17-compat-lab'

function Initialize-LabDirs {
    foreach ($d in @($StateDir, $LogDir, $CapDir, $VaultDir)) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
}

function Get-UtcStamp { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }

function Write-Step {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "[{0}] [{1,-5}] {2}" -f (Get-UtcStamp), $Level, $Message
    Write-Host $line
    if (Test-Path $LogDir) {
        Add-Content -Path (Join-Path $LogDir 'lab.log') -Value $line -Encoding UTF8
    }
}

function Assert-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'This script must run elevated (hosts file + certificate store).'
    }
}

# --- state ------------------------------------------------------------------
# One JSON file is the single source of truth for every machine mutation.
# Nothing is cleaned up that is not recorded here, and nothing is recorded here
# that was not actually performed.

function Read-LabState {
    if (-not (Test-Path $StateFile)) { return $null }
    $raw = Get-Content $StateFile -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return ($raw | ConvertFrom-Json)
}

function Write-LabState {
    param([Parameter(Mandatory=$true)]$State)
    Initialize-LabDirs
    # Depth 6 covers this schema (deepest real nesting is 3) and is deliberately
    # NOT generous. A high depth turns any accidentally-stored decorated object
    # (Get-Content string, Get-Item result, FileInfo) into an infinite walk over
    # the cyclic PSProvider/PSDrive graph -- 100% CPU, no error, no output.
    $json = $State | ConvertTo-Json -Depth 6
    # WriteAllText, not Set-Content: Set-Content defaults to ANSI on 5.1 and
    # would corrupt any non-ASCII that ever lands in a recorded header.
    [IO.File]::WriteAllText($StateFile, $json, (New-Object Text.UTF8Encoding($false)))
}

function New-LabState {
    $o = [ordered]@{
        runId            = ([guid]::NewGuid().ToString('N').Substring(0,12))
        createdUtc       = (Get-UtcStamp)
        schema           = 1
        hosts            = $null
        certs            = $null
        listener         = $null
        probe            = $null
        cleanedUpUtc     = $null
    }
    return (New-Object psobject -Property $o)
}

# --- fingerprints -----------------------------------------------------------
function Get-CertSha256 {
    param([Parameter(Mandatory=$true)]$Cert)
    $sha = [Security.Cryptography.SHA256]::Create()
    try   { return (($sha.ComputeHash($Cert.RawData) | ForEach-Object { $_.ToString('X2') }) -join '') }
    finally { $sha.Dispose() }
}

# Remove a certificate from a store by EXACT thumbprint, via the X509Store API.
#
# Must not use Remove-Item: the certificate provider refuses to delete from a
# Root store without an interactive dialog ("UI is not allowed"), which makes
# unattended cleanup of a trusted CA impossible. The store API has no such
# restriction for removal.
#
# Returns $true only if the certificate is verifiably gone afterwards.
function Remove-CertByThumbprint {
    param(
        [Parameter(Mandatory=$true)][string]$StorePath,   # e.g. Cert:\CurrentUser\Root
        [Parameter(Mandatory=$true)][string]$Thumbprint
    )
    $parts = $StorePath.TrimEnd('\').Split('\')
    if ($parts.Count -lt 3) { throw "Unrecognized store path: $StorePath" }
    $location = $parts[1]   # CurrentUser | LocalMachine
    $name     = $parts[2]   # My | Root | ...

    $store = New-Object Security.Cryptography.X509Certificates.X509Store($name, $location)
    try {
        $store.Open('ReadWrite')
        $match = @($store.Certificates | Where-Object { $_.Thumbprint -eq $Thumbprint })
        if ($match.Count -eq 0) { return $true }   # already absent
        foreach ($c in $match) { $store.Remove($c) }
    } catch {
        Write-Step "Remove-CertByThumbprint failed on $StorePath : $($_.Exception.Message)" 'ERROR'
        return $false
    } finally { $store.Close() }

    return (-not [bool](Get-Item "$StorePath\$Thumbprint" -ErrorAction SilentlyContinue))
}

function Get-FileSha256 {
    param([Parameter(Mandatory=$true)][string]$Path)
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash
}

# --- process identity by PATH, not by name ----------------------------------
#
# Found by validating against GTA V on 2026-10-03, and it would have produced a
# FALSE NO-GO on the central question of this project:
#
#   * `GTA5.exe` (45 MB, the obvious "main binary") was NOT running at all.
#     `GTA5_BE.exe` (1 MB, a BattlEye shim) was. A size heuristic picks the wrong
#     one, and waiting on the wrong name reports "the game never started".
#   * Of the live Rockstar processes, `Launcher` and `RockstarService` owned ZERO
#     outbound connections. Seven `SocialClubHelper.exe` processes owned them.
#     **The network traffic belonged to helpers, not to the game binary.**
#
# If NBA 2K17 does the same, a single-name watcher sees nothing and we would
# conclude "no network attempt" when the client was talking the whole time.
#
# So identity is: does the owning process's EXECUTABLE PATH live under the game's
# install directory? That covers helpers, shims, child processes and renamed
# binaries in one rule, and it cannot be satisfied by a file dropped in a temp
# folder.

function Get-ProcessesUnderPath {
    param([Parameter(Mandatory=$true)][string]$InstallDir)
    $norm = $InstallDir.TrimEnd('\') + '\'
    $out = @()
    foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
        $path = $null
        try { $path = $p.Path } catch { continue }
        if (-not $path) { continue }
        if ($path.StartsWith($norm, [StringComparison]::OrdinalIgnoreCase)) {
            $out += (New-Object psobject -Property ([ordered]@{
                pid = $p.Id; name = $p.ProcessName; path = $path
            }))
        }
    }
    return $out
}

# Every outbound connection owned by any process under the install dir.
function Get-ConnectionsUnderPath {
    param(
        [Parameter(Mandatory=$true)][string]$InstallDir,
        [switch]$IncludeLoopback
    )
    $procs = Get-ProcessesUnderPath -InstallDir $InstallDir
    $out = @()
    foreach ($pr in $procs) {
        $conns = @(Get-NetTCPConnection -OwningProcess $pr.pid -ErrorAction SilentlyContinue)
        foreach ($c in $conns) {
            if ($c.RemoteAddress -in @('0.0.0.0', '::')) { continue }
            if (-not $IncludeLoopback -and $c.RemoteAddress -in @('127.0.0.1', '::1')) { continue }
            $out += (New-Object psobject -Property ([ordered]@{
                pid = $pr.pid; name = $pr.name; path = $pr.path
                localPort = $c.LocalPort
                remoteAddress = $c.RemoteAddress
                remotePort = $c.RemotePort
                state = $c.State.ToString()
            }))
        }
    }
    return $out
}

# --- port -------------------------------------------------------------------
# --- hosts file I/O ---------------------------------------------------------
# This machine's hosts file starts with a UTF-8 BOM (EF BB BF). Writing it back
# with ASCIIEncoding silently dropped those 3 bytes: the content stayed correct
# and Windows kept parsing it fine, but the file was no longer byte-identical, so
# "restored exactly" was a false claim and any integrity hash comparison failed.
#
# These two helpers preserve whatever byte prefix the file already had.

function Get-HostsBomPrefix {
    param([string]$Path)
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        return ([byte[]](0xEF, 0xBB, 0xBF))
    }
    return ([byte[]]@())
}

function Write-HostsLines {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        # A Mandatory [string[]] gets implicit ValidateNotNullOrEmpty applied to
        # its ELEMENTS, and a hosts file legitimately contains blank lines, so a
        # mandatory parameter here fails with "argument is an empty string" on
        # any normal hosts file. Allow empty strings and an empty collection.
        [AllowEmptyString()][AllowEmptyCollection()][AllowNull()]
        [string[]]$Lines = @(),
        [byte[]]$BomPrefix = $null
    )
    if ($Lines -eq $null) { $Lines = @() }
    if ($BomPrefix -eq $null) { $BomPrefix = Get-HostsBomPrefix -Path $Path }
    $text  = ($Lines -join "`r`n") + "`r`n"
    $body  = (New-Object Text.ASCIIEncoding).GetBytes($text)
    $out   = New-Object byte[] ($BomPrefix.Length + $body.Length)
    if ($BomPrefix.Length -gt 0) { [Array]::Copy($BomPrefix, 0, $out, 0, $BomPrefix.Length) }
    [Array]::Copy($body, 0, $out, $BomPrefix.Length, $body.Length)
    [IO.File]::WriteAllBytes($Path, $out)
}

function Get-PortOwner {
    param([int]$Port = 443)
    $conns = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($conns.Count -eq 0) { return $null }
    $out = @()
    foreach ($c in $conns) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        $name = 'unknown'
        $path = ''
        if ($p) { $name = $p.ProcessName; try { $path = $p.Path } catch { $path = '' } }
        $out += (New-Object psobject -Property ([ordered]@{
            localAddress = $c.LocalAddress
            pid          = $c.OwningProcess
            processName  = $name
            processPath  = $path
        }))
    }
    return $out
}
