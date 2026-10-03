<#
  await-client.ps1 -- watch for NBA 2K17 becoming licensed/installed, and the
  moment it does, fingerprint it immediately.

  WHY THE HURRY
  -------------
  2K has a documented history of revoking NBA 2K17 keys -- users reported
  "A Steam Product code you activated has been removed from your account", and
  duplicate NBA keys from Humble Monthly were revoked. A key that activates today
  is not guaranteed to still be activated next week.

  So this does not just announce "it's installed". It captures the evidence that
  survives a later revocation: the executable SHA-256, version metadata, PE
  timestamp and directory shape, written to experiment-state\client.json and
  docs\client-fingerprint.md. If the licence later disappears, we still hold a
  verifiable record of exactly which build we measured.

  Read-only with respect to the machine. It never modifies network state, and the
  only thing it writes is the fingerprint.

  Run it in a spare window:
      .\scripts\await-client.ps1
#>
[CmdletBinding()]
param(
    [int]$AppId = 385760,
    [int]$IntervalSeconds = 30,
    # [double], not [int]: an int parameter silently truncates a fractional value
    # to 0, which makes the deadline "now" and the watch loop never execute even
    # once. That produced a FALSE "app not found" against a game that was plainly
    # installed, and it looked like the watcher was broken rather than the test.
    [double]$MaxHours = 72,
    [switch]$NoFingerprint
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-LabDirs

$steamRoot = $null
try { $steamRoot = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath } catch { }
if (-not $steamRoot) { throw 'Steam install path not found in HKCU.' }
$steamRoot = ($steamRoot -replace '/', '\').TrimEnd('\')

# All library roots, not just the default one -- a new install may land elsewhere.
function Get-LibraryRoots {
    $roots = @($steamRoot)
    $vdf = Join-Path $steamRoot 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
        foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]*)"')) {
            $p = $m.Groups[1].Value -replace '\\\\', '\'
            if ($p -and (Test-Path $p)) { $roots += $p.TrimEnd('\') }
        }
    }
    return ($roots | Select-Object -Unique)
}

function Find-Install {
    foreach ($r in (Get-LibraryRoots)) {
        $mf = Join-Path $r "steamapps\appmanifest_$AppId.acf"
        if (-not (Test-Path $mf)) { continue }
        $t = Get-Content $mf -Raw
        $dirName = [regex]::Match($t, '"installdir"\s+"([^"]*)"').Groups[1].Value
        $stateFlags = [regex]::Match($t, '"StateFlags"\s+"(\d+)"').Groups[1].Value
        $bytesTotal = [regex]::Match($t, '"SizeOnDisk"\s+"(\d+)"').Groups[1].Value
        $dir = Join-Path $r "steamapps\common\$dirName"
        return (New-Object psobject -Property ([ordered]@{
            manifest = $mf; libraryRoot = $r; installDir = $dir
            stateFlags = $stateFlags; sizeOnDisk = $bytesTotal
            dirExists = (Test-Path $dir)
        }))
    }
    return $null
}

Write-Step "Watching for AppID $AppId to become licensed and installed."
Write-Step "  library roots: $((Get-LibraryRoots) -join ' ; ')"
Write-Step "  polling every ${IntervalSeconds}s for up to $MaxHours h. Ctrl+C to stop."
Write-Step ''
Write-Step 'Reminder of the sequence once it IS installed:' 'WARN'
Write-Step '  1. this script fingerprints it automatically (SHA-256 captured FIRST)' 'WARN'
Write-Step '  2. .\scripts\test-client.ps1          <- UNMODIFIED baseline, no redirect' 'WARN'
Write-Step '  3. record observed hostnames in research\service-map.md' 'WARN'
Write-Step '  4. .\scripts\test-replacement.ps1 -Hostname <observed>   <- the gate' 'WARN'
Write-Step ''

# --- the only automated availability signal available to us -----------------
#
# What is NOT monitored, and why: SteamGifts and SteamTrades return HTTP 403 to
# automated requests -- even for robots.txt -- so they are deliberately blocking
# bots at the edge. Getting a scraper past that means spoofing a browser to defeat
# an access control the site intentionally put there. Not done. Giveaway and trade
# hunting on those boards is manual, by hand, signed in as yourself.
#
# Steam's own store API does answer us, so the one thing we can watch
# automatically is whether 2K ever re-lists 385760 for sale. Unlikely, but it
# would be decisive and it costs one request per cycle.
function Test-StoreRelisted {
    param([int]$Id)
    try {
        $r = Invoke-RestMethod -Uri "https://store.steampowered.com/api/appdetails?appids=$Id" `
                -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop
        $e = $r.$Id
        if (-not $e -or -not $e.success -or -not $e.data) { return $null }
        $d = $e.data
        $pkgs = 0
        if ($d.PSObject.Properties.Name -contains 'packages' -and $d.packages) { $pkgs = @($d.packages).Count }
        $groups = 0
        if ($d.PSObject.Properties.Name -contains 'package_groups' -and $d.package_groups) { $groups = @($d.package_groups).Count }
        $free = $false
        if ($d.PSObject.Properties.Name -contains 'is_free') { $free = [bool]$d.is_free }
        return (New-Object psobject -Property ([ordered]@{
            name = $d.name; packages = $pkgs; packageGroups = $groups
            isFree = $free; buyable = ($pkgs -gt 0 -or $groups -gt 0 -or $free)
        }))
    } catch { return $null }
}

$store = Test-StoreRelisted -Id $AppId
if ($store -ne $null) {
    Write-Step "Steam store check: '$($store.name)' packages=$($store.packages) groups=$($store.packageGroups) buyable=$($store.buyable)"
    if ($store.buyable) {
        Write-Step 'STORE SAYS BUYABLE -- that would be a relist. Verify on the store page.' 'OK'
    } else {
        Write-Step '  still delisted (no packages, no package groups) -- expected.'
    }
}
Write-Step ''

$deadline = (Get-Date).AddHours($MaxHours)
$announcedManifest = $false
$lastPct = -1
$lastStoreCheck = Get-Date
$storeCheckMinutes = 30

while ((Get-Date) -lt $deadline) {
    $found = Find-Install

    if ($found -eq $null) {
        # Low-frequency relist check while we wait. One request per 30 min.
        if (((Get-Date) - $lastStoreCheck).TotalMinutes -ge $storeCheckMinutes) {
            $lastStoreCheck = Get-Date
            $s = Test-StoreRelisted -Id $AppId
            if ($s -ne $null -and $s.buyable) {
                Write-Step '*****************************************************************' 'OK'
                Write-Step "RELISTED: Steam now reports $AppId as purchasable." 'OK'
                Write-Step "  packages=$($s.packages) groups=$($s.packageGroups) free=$($s.isFree)" 'OK'
                Write-Step '  Check the store page -- if real, buy it and skip the key hunt.' 'OK'
                Write-Step '*****************************************************************' 'OK'
            }
        }
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    if (-not $announcedManifest) {
        $announcedManifest = $true
        Write-Step '=================================================================' 'OK'
        Write-Step "LICENCE DETECTED. appmanifest_$AppId.acf exists." 'OK'
        Write-Step "  library : $($found.libraryRoot)" 'OK'
        Write-Step "  dir     : $($found.installDir)" 'OK'
        Write-Step "  size    : $([math]::Round([int64]$found.sizeOnDisk/1GB,1)) GB on disk per manifest" 'OK'
        Write-Step '=================================================================' 'OK'
        Write-Step 'Waiting for the download to finish before fingerprinting ...'
    }

    # StateFlags 4 = fully installed. Anything else usually means downloading,
    # validating or update-required, and hashing a partial file would record a
    # fingerprint that matches nothing.
    $fullyInstalled = ($found.stateFlags -eq '4')

    if (-not $fullyInstalled) {
        if ($found.dirExists) {
            $onDisk = 0
            try {
                $onDisk = (Get-ChildItem -LiteralPath $found.installDir -File -Recurse -ErrorAction SilentlyContinue |
                           Measure-Object -Property Length -Sum).Sum
            } catch { }
            $target = [int64]$found.sizeOnDisk
            if ($target -gt 0) {
                $pct = [math]::Min(100, [math]::Round(100 * $onDisk / $target))
                if ($pct -ne $lastPct) {
                    Write-Step "  downloading: ~$pct% ($([math]::Round($onDisk/1GB,1)) / $([math]::Round($target/1GB,1)) GB)  StateFlags=$($found.stateFlags)"
                    $lastPct = $pct
                }
            }
        }
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    # --- fully installed -------------------------------------------------------
    Write-Step ''
    Write-Step 'INSTALL COMPLETE (StateFlags=4).' 'OK'

    if (-not $found.dirExists) {
        Write-Step "Manifest says installed but $($found.installDir) is missing." 'ERROR'
        Write-Step 'Not fingerprinting a directory that is not there.' 'ERROR'
        break
    }

    if ($NoFingerprint) {
        Write-Step '-NoFingerprint given; stopping here.'
        Write-Step "Run: .\scripts\import-client.ps1 -Path `"$($found.installDir)`""
        break
    }

    Write-Step 'Fingerprinting NOW, before anything else.' 'OK'
    Write-Step 'A revoked licence cannot take the SHA-256 back once it is recorded.'
    Write-Step ''
    & (Join-Path $PSScriptRoot 'import-client.ps1') -Path $found.installDir -IncludeMd5
    $ingestExit = $LASTEXITCODE

    Write-Step ''
    if ($ingestExit -eq 2) {
        Write-Step 'Fingerprint reports ownership-bypass configuration in the directory.' 'ERROR'
        Write-Step 'That should NOT happen for a clean Steam install. Investigate before' 'ERROR'
        Write-Step 'treating this client as licensed.' 'ERROR'
        break
    }

    Write-Step '=================================================================' 'OK'
    Write-Step 'CLIENT READY. Next command, and nothing else first:' 'OK'
    Write-Step '    .\scripts\test-client.ps1' 'OK'
    Write-Step '' 'OK'
    Write-Step 'That is the UNMODIFIED baseline. It changes no network state. Do NOT' 'OK'
    Write-Step 'skip to the redirect: without a baseline, a negative gate result cannot' 'OK'
    Write-Step 'be told apart from a wrong hostname or a broken redirect.' 'OK'
    Write-Step '=================================================================' 'OK'
    break
}

if ((Get-Date) -ge $deadline) {
    Write-Step "Reached MaxHours=$MaxHours without the app appearing. Re-run to keep watching." 'WARN'
}
