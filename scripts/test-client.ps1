<#
  test-client.ps1 -- Phase 1 baseline, one command.

  Fingerprints the supplied client, verifies the machine is clean, starts the
  attribution watcher and a packet capture, launches the game UNMODIFIED, waits
  for you to trigger one online action, then stops and summarises every endpoint
  the client actually contacted.

  IT CHANGES NO NETWORK STATE. No hosts entry, no certificate, no redirect, no
  probe. That is the entire point: the first run must observe the real client
  talking to the real internet, so that if a later redirect test produces nothing
  we can tell "wrong hostname" from "never tried" from "TLS refused" from "our
  redirect broke it".

  Run elevated (pktmon).
#>
[CmdletBinding()]
param(
    [string]$ClientPath,                      # omit to reuse experiment-state\client.json
    [int]$ObserveMinutes = 10,
    [switch]$SkipCapture,
    [switch]$AllowUnverifiedProvenance        # required to proceed on a non-Steam client
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Assert-Admin
Initialize-LabDirs

# ---------------------------------------------------------------- 1. client
if ($ClientPath) {
    Write-Step '=== STEP 1: fingerprint the supplied client ==='
    & (Join-Path $PSScriptRoot 'import-client.ps1') -Path $ClientPath
    if ($LASTEXITCODE -eq 2) { throw 'Client carries ownership-bypass configuration. Refusing to proceed.' }
}

$clientFile = Join-Path $StateDir 'client.json'
if (-not (Test-Path $clientFile)) {
    throw "No client recorded. Run: scripts\import-client.ps1 -Path '<game folder>'"
}
$client = Get-Content $clientFile -Raw | ConvertFrom-Json
Write-Step "Client: $($client.executable)"
Write-Step "  sha256     : $($client.sha256)"
Write-Step "  provenance : $($client.provenance)"

if ($client.provenance -eq 'OWNERSHIP_BYPASS_PRESENT') {
    throw 'Recorded client carries ownership-bypass configuration. Refusing to proceed.'
}
if ($client.provenance -ne 'STEAM_LICENSED_INSTALL' -and -not $AllowUnverifiedProvenance) {
    Write-Step "Provenance is $($client.provenance), not STEAM_LICENSED_INSTALL." 'ERROR'
    Write-Step 'Pass -AllowUnverifiedProvenance to run anyway. Be aware that results' 'ERROR'
    Write-Step 'from an unlicensed client will not be published as project evidence.' 'ERROR'
    throw 'Provenance gate.'
}
if (-not (Test-Path -LiteralPath $client.executable)) {
    throw "Recorded executable is missing: $($client.executable)"
}

# ---------------------------------------------------------- 2. machine state
Write-Step ''
Write-Step '=== STEP 2: confirm NO network modifications are active ==='
$problems = @()

$markers = @(Select-String -Path $HostsPath -Pattern ([regex]::Escape($MarkerPrefix)) -ErrorAction SilentlyContinue)
if ($markers.Count -gt 0) { $problems += "hosts still contains $($markers.Count) lab marker line(s)" }

$targetLines = @(Select-String -Path $HostsPath -Pattern ([regex]::Escape($TargetHost)) -ErrorAction SilentlyContinue)
if ($targetLines.Count -gt 0) {
    Write-Step "hosts has $($targetLines.Count) line(s) for $TargetHost :" 'ERROR'
    foreach ($l in $targetLines) { Write-Step "  L$($l.LineNumber): $($l.Line)" 'ERROR' }
    $problems += 'a hosts mapping for the target host exists -- the baseline would not be a baseline'
}

$ip = $null
try { $ip = (Resolve-DnsName $TargetHost -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1).IPAddress } catch { }
Write-Step "DNS $TargetHost -> $ip"
if ($ip -eq '127.0.0.1') { $problems += 'target host resolves to loopback' }

$labCerts = @(Get-ChildItem Cert:\CurrentUser\Root, Cert:\CurrentUser\My, Cert:\LocalMachine\Root -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -like '*2k17-compat-lab*' })
if ($labCerts.Count -gt 0) { $problems += "$($labCerts.Count) lab certificate(s) still trusted" }

$owner = Get-PortOwner -Port 443
if ($owner -ne $null) { $problems += 'something is listening on 443' }

if ($problems.Count -gt 0) {
    foreach ($p in $problems) { Write-Step "  $p" 'ERROR' }
    Write-Step 'Run scripts\cleanup.ps1 first. A baseline taken with our redirect active' 'ERROR'
    Write-Step 'is worthless -- it measures us, not the game.' 'ERROR'
    throw 'Machine is not in an unmodified state.'
}
Write-Step 'Machine is unmodified. This will be a true baseline.' 'OK'

# ------------------------------------------------------------- 3. observers
$runId = 'baseline'
$state = Read-LabState
if ($state -ne $null) { $runId = $state.runId }

Write-Step ''
Write-Step '=== STEP 3: start observers BEFORE the game ==='

if (-not $SkipCapture) {
    & (Join-Path $PSScriptRoot 'capture.ps1') -Action start
}

$watchLog = Join-Path $LogDir "attribution.$runId.jsonl"
$watchProc = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'watch.ps1'),'-MaxMinutes',[string]($ObserveMinutes + 5)) `
    -PassThru -WindowStyle Minimized
Write-Step "watch.ps1 started (pid $($watchProc.Id)); log: $watchLog"
Start-Sleep -Seconds 2

# ---------------------------------------------------------------- 4. launch
Write-Step ''
Write-Step '=== STEP 4: launch the client, unmodified ==='

$gameProc = $null
if ($client.steamManifestPresent -and $client.inSteamLibrary) {
    # Launch through Steam so licensing and any DRM are handled normally.
    Write-Step 'Launching via Steam (steam://rungameid/385760) -- normal licensed path.'
    Start-Process 'steam://rungameid/385760'
} else {
    Write-Step 'No Steam licence record; launching the executable directly.' 'WARN'
    Start-Process -FilePath $client.executable -WorkingDirectory (Split-Path -Parent $client.executable)
}

Write-Step 'Waiting for the NBA2K17 process ...'
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
    $gameProc = Get-Process -Name 'NBA2K17' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($gameProc) { break }
    Start-Sleep -Milliseconds 700
}
if ($gameProc -eq $null) {
    Write-Step 'NBA2K17 process never appeared within 3 minutes.' 'ERROR'
    Write-Step 'Possible: launch failed, DRM refused, a launcher is in the way, or the' 'ERROR'
    Write-Step 'process is named differently. Observers are still running.' 'ERROR'
} else {
    Write-Step "NBA2K17 running: pid=$($gameProc.Id)" 'OK'
}

Write-Step ''
Write-Step '################################################################'
Write-Step 'ACTION NEEDED:' 'WARN'
Write-Step '  In NBA 2K17, trigger ONE server-dependent action and nothing else.' 'WARN'
Write-Step '  MyCAREER / an online menu / anything that would need 2K services.' 'WARN'
Write-Step '  Note the time you do it. Then leave the game sitting there.' 'WARN'
Write-Step "  Observing for $ObserveMinutes minute(s). Observers keep running." 'WARN'
Write-Step '################################################################'

$until = (Get-Date).AddMinutes($ObserveMinutes)
$lastCount = 0
while ((Get-Date) -lt $until) {
    if (Test-Path $watchLog) {
        $n = @(Get-Content $watchLog -ErrorAction SilentlyContinue).Count
        if ($n -gt $lastCount) {
            Write-Step "  attribution log: $n record(s)"
            $lastCount = $n
        }
    }
    $g = Get-Process -Name 'NBA2K17' -ErrorAction SilentlyContinue
    if ($gameProc -ne $null -and $g -eq $null) {
        Write-Step 'NBA2K17 exited. Stopping observation early.' 'WARN'
        break
    }
    Start-Sleep -Seconds 5
}

# ------------------------------------------------------------------ 5. stop
Write-Step ''
Write-Step '=== STEP 5: stop observers ==='
if ($watchProc -and -not $watchProc.HasExited) { Stop-Process -Id $watchProc.Id -Force -ErrorAction SilentlyContinue }
if (-not $SkipCapture) { & (Join-Path $PSScriptRoot 'capture.ps1') -Action stop }

# --------------------------------------------------------------- 6. summary
Write-Step ''
Write-Step '=== STEP 6: endpoints the CLIENT actually contacted ==='

if (-not (Test-Path $watchLog)) {
    Write-Step 'No attribution log. Nothing was attributed to the game.' 'WARN'
} else {
    $recs = @(Get-Content $watchLog | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } | Where-Object { $_ })
    $gameConns = @($recs | Where-Object { $_.kind -eq 'game.connection' })
    Write-Step "game.connection records: $($gameConns.Count)"
    if ($gameConns.Count -eq 0) {
        Write-Step 'NO outbound connection was attributed to NBA2K17.exe.' 'WARN'
        Write-Step 'That is itself a finding: either the action did not trigger networking,' 'WARN'
        Write-Step 'or the client resolves/connects in a way watch.ps1 did not see. Check the' 'WARN'
        Write-Step 'pktmon capture before concluding anything.' 'WARN'
    } else {
        $byDest = $gameConns | Group-Object -Property { "$($_.remoteAddress):$($_.remotePort)" } | Sort-Object Count -Descending
        Write-Step 'Distinct destinations (reverse DNS attempted, best effort):'
        foreach ($g in $byDest) {
            $addr = ($g.Name -split ':')[0]
            $host_ = $null
            try { $host_ = (Resolve-DnsName $addr -Type PTR -ErrorAction Stop | Select-Object -First 1).NameHost } catch { }
            Write-Step ("  {0,-24} x{1,-4} {2}" -f $g.Name, $g.Count, $(if ($host_) { $host_ } else { '(no PTR)' }))
        }
        Write-Step ''
        Write-Step 'NEXT: put each of these into research/service-map.md with status OBSERVED' 'OK'
        Write-Step 'and confidence CONFIRMED. Only then pick ONE for the redirect test:' 'OK'
        Write-Step '  scripts\test-replacement.ps1 -Hostname <the confirmed hostname>' 'OK'
    }
}

Write-Step ''
Write-Step 'Baseline complete. Machine was NOT modified by this script.'
