<#
  test-replacement.ps1 -- the gate attempt, one command, fully reversible.

  Redirects ONE hostname that has ALREADY been OBSERVED coming from the real
  client, stands up the probe, launches the game, and reports which Level was
  reached. Always cleans up, including on failure.

  REFUSES TO RUN unless the hostname is recorded as observed in
  research/service-map.md. That guard is the point: redirecting a hostname we only
  guessed at produces an uninterpretable negative, and the brief's own ordering
  says the baseline comes first. Use -Force only if you are deliberately testing a
  hypothesis and will label the result as such.

  Run elevated.
#>
[CmdletBinding()]
param(
    [string]$Hostname = 'nba2k17-ws.2ksports.com',
    [int]$ObserveMinutes = 10,
    [ValidateSet('CurrentUser','LocalMachine')][string]$TrustScope = 'LocalMachine',
    [switch]$SkipCapture,
    [switch]$Force,
    [switch]$AllowUnverifiedProvenance
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Assert-Admin
Initialize-LabDirs

# ------------------------------------------------- 0. is this hostname earned?
$mapPath = Join-Path $RepoRoot 'research\service-map.md'
$observed = $false
if (Test-Path $mapPath) {
    $rows = @(Select-String -Path $mapPath -Pattern ([regex]::Escape($Hostname)) -ErrorAction SilentlyContinue)
    foreach ($r in $rows) {
        if ($r.Line -match 'OBSERVED|REACHED_LOCAL|RESPONDED|CLIENT_ADVANCED') { $observed = $true }
    }
}
if (-not $observed) {
    Write-Step "$Hostname is not recorded as OBSERVED in research/service-map.md." 'ERROR'
    Write-Step 'Run scripts\test-client.ps1 first and record what the client actually' 'ERROR'
    Write-Step 'contacted. Redirecting a guessed hostname gives a negative result that' 'ERROR'
    Write-Step 'cannot be interpreted: wrong host, no attempt, TLS refusal and a broken' 'ERROR'
    Write-Step 'redirect all look identical.' 'ERROR'
    if (-not $Force) { throw 'Hostname not observed. Pass -Force to test it as an explicit hypothesis.' }
    Write-Step '-Force given: proceeding as a LABELLED HYPOTHESIS, not a clean test.' 'WARN'
}

# ------------------------------------------------------------------ 1. client
$clientFile = Join-Path $StateDir 'client.json'
if (-not (Test-Path $clientFile)) { throw "No client recorded. Run scripts\import-client.ps1 first." }
$client = Get-Content $clientFile -Raw | ConvertFrom-Json
if ($client.provenance -eq 'OWNERSHIP_BYPASS_PRESENT') { throw 'Client carries ownership-bypass configuration. Refusing.' }
if ($client.provenance -ne 'STEAM_LICENSED_INSTALL' -and -not $AllowUnverifiedProvenance) {
    throw "Provenance is $($client.provenance). Pass -AllowUnverifiedProvenance to override (results will not be published as evidence)."
}
if (-not (Test-Path -LiteralPath $client.executable)) { throw "Executable missing: $($client.executable)" }
Write-Step "Client: $($client.executable)  sha256=$($client.sha256)"
Write-Step "Target hostname: $Hostname"

$watchProc = $null
$cleanedUp = $false

function Invoke-LabCleanup {
    if ($script:cleanedUp) { return }
    $script:cleanedUp = $true
    Write-Step ''
    Write-Step '=== CLEANUP (always runs) ==='
    if ($script:watchProc -and -not $script:watchProc.HasExited) {
        Stop-Process -Id $script:watchProc.Id -Force -ErrorAction SilentlyContinue
    }
    if (-not $SkipCapture) { try { & (Join-Path $PSScriptRoot 'capture.ps1') -Action stop } catch { Write-Step "capture stop: $($_.Exception.Message)" 'WARN' } }
    try { & (Join-Path $PSScriptRoot 'cleanup.ps1') } catch { Write-Step "cleanup.ps1: $($_.Exception.Message)" 'ERROR' }
}

try {
    # ------------------------------------------------------------- 2. setup
    Write-Step ''
    Write-Step '=== STEP 2: snapshot state, create certs, map the hostname ==='
    & (Join-Path $PSScriptRoot 'setup.ps1') -TrustScope $TrustScope
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) { throw "setup.ps1 failed ($LASTEXITCODE)" }

    # --------------------------------------------------------------- 3. probe
    Write-Step ''
    Write-Step '=== STEP 3: start the probe (blocks until attribution is live) ==='
    & (Join-Path $PSScriptRoot 'run.ps1')

    $state = Read-LabState
    if ($state -eq $null) { throw 'No lab state after setup.' }
    $probeLog = Join-Path $LogDir "probe.$($state.runId).jsonl"

    Write-Step ''
    Write-Step '=== STEP 4: self-test our half before involving the game ==='
    & (Join-Path $PSScriptRoot 'verify.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'PROBE_SELF_TEST_FAIL -- fix our half before blaming the client.' }

    # ----------------------------------------------------------- 5. observers
    if (-not $SkipCapture) { & (Join-Path $PSScriptRoot 'capture.ps1') -Action start }
    $watchProc = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'watch.ps1'),'-MaxMinutes',[string]($ObserveMinutes + 5)) `
        -PassThru -WindowStyle Minimized
    Start-Sleep -Seconds 2

    # -------------------------------------------------------------- 6. launch
    Write-Step ''
    Write-Step '=== STEP 6: launch the client with the redirect active ==='
    $selfTestCount = @(Select-String -Path $probeLog -Pattern '__selftest' -SimpleMatch -ErrorAction SilentlyContinue).Count
    Write-Step "  (self-test requests already in log: $selfTestCount -- these are NOT evidence)"

    if ($client.steamManifestPresent -and $client.inSteamLibrary) {
        Start-Process 'steam://rungameid/385760'
    } else {
        Start-Process -FilePath $client.executable -WorkingDirectory (Split-Path -Parent $client.executable)
    }

    $gameProc = $null
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
        $gameProc = Get-Process -Name 'NBA2K17' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($gameProc) { break }
        Start-Sleep -Milliseconds 700
    }
    if ($gameProc) { Write-Step "NBA2K17 running: pid=$($gameProc.Id)" 'OK' }
    else { Write-Step 'NBA2K17 never started. Observers still running.' 'ERROR' }

    Write-Step ''
    Write-Step '################################################################'
    Write-Step 'ACTION NEEDED:' 'WARN'
    Write-Step '  Trigger the SAME server-dependent action you used for the baseline.' 'WARN'
    Write-Step '  Watch this window: tcp / tls / HTTP events print as they arrive.' 'WARN'
    Write-Step '################################################################'

    $until = (Get-Date).AddMinutes($ObserveMinutes)
    $seen = 0
    while ((Get-Date) -lt $until) {
        if (Test-Path $probeLog) {
            $n = @(Get-Content $probeLog -ErrorAction SilentlyContinue).Count
            if ($n -gt $seen) { Write-Step "  probe log: $n record(s)"; $seen = $n }
        }
        $g = Get-Process -Name 'NBA2K17' -ErrorAction SilentlyContinue
        if ($gameProc -ne $null -and $g -eq $null) { Write-Step 'NBA2K17 exited.' 'WARN'; break }
        Start-Sleep -Seconds 4
    }

    # ------------------------------------------------------------- 7. verdict
    Write-Step ''
    Write-Step '=== STEP 7: which Level did we reach? ==='
    $recs = @()
    if (Test-Path $probeLog) {
        $recs = @(Get-Content $probeLog | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } | Where-Object { $_ })
    }

    # Only records attributed to the game count. Self-tests are excluded by
    # construction: levelBEvidence is false unless the owner is NBA2K17.exe.
    $tcp      = @($recs | Where-Object { $_.kind -eq 'tcp.connect' })
    $tlsOk    = @($recs | Where-Object { $_.kind -eq 'tls.established' })
    $tlsFail  = @($recs | Where-Object { $_.kind -eq 'tls.clientError' })
    $gameAttr = @($recs | Where-Object { $_.kind -eq 'attribution' -and $_.isGameClient -eq $true })
    $levelB   = @($recs | Where-Object { $_.kind -eq 'http.request' -and $_.levelBEvidence -eq $true })
    $unres    = @($recs | Where-Object { $_.kind -eq 'attribution' -and $_.unresolved -eq $true })

    Write-Step "tcp.connect        : $($tcp.Count)"
    Write-Step "attributed to game : $($gameAttr.Count)"
    Write-Step "tls.established    : $($tlsOk.Count)"
    Write-Step "tls.clientError    : $($tlsFail.Count)"
    Write-Step "unattributed       : $($unres.Count)"
    Write-Step "LEVEL B (game HTTP): $($levelB.Count)"

    $level = 'NONE'
    if ($gameAttr.Count -gt 0) { $level = 'A' }
    if ($levelB.Count -gt 0)   { $level = 'B' }

    Write-Step ''
    if ($level -eq 'B') {
        Write-Step 'LEVEL_REACHED: B -- an HTTP request attributable to NBA2K17.exe' 'OK'
        foreach ($r in $levelB) {
            Write-Step "  $($r.method) $($r.path)  pid=$($r.clientPid)"
            Write-Step "  exe: $($r.clientPath)"
            Write-Step "  pathLooksLikeSteamInstall=$($r.pathLooksLikeSteamInstall)" $(if ($r.pathLooksLikeSteamInstall) { 'OK' } else { 'ERROR' })
        }
        Write-Step 'STOP HERE. Do not build MyCareer/Park/VC/matchmaking/persistence.' 'WARN'
        Write-Step 'Export the fixture and have the response red-teamed first:' 'WARN'
        Write-Step '  scripts\export-sanitized.ps1' 'WARN'
    }
    elseif ($level -eq 'A') {
        Write-Step 'LEVEL_REACHED: A -- the game reached our listener but sent no HTTP request.' 'WARN'
        if ($tlsFail.Count -gt 0) {
            Write-Step 'TLS handshake(s) FAILED. Record the exact codes:' 'WARN'
            foreach ($f in $tlsFail) { Write-Step "  code=$($f.code) msg=$($f.message)" 'WARN' }
            Write-Step 'Classify as CERTIFICATE_REJECTION or CLIENT_CERT_REQUIRED from the code' 'WARN'
            Write-Step 'alone. Do NOT infer what the ORIGINAL 2K service required, and do NOT' 'WARN'
            Write-Step 'patch validation. If it is a trust boundary: BLOCKED_SECURITY_BOUNDARY.' 'WARN'
        }
    }
    else {
        Write-Step 'LEVEL_REACHED: NONE -- nothing attributable to the game reached us.' 'ERROR'
        Write-Step 'Classify the failing layer before theorising:' 'ERROR'
        Write-Step '  DNS_NOT_USED / DIFFERENT_HOSTNAME / NO_NETWORK_ATTEMPT / TCP_FAILURE' 'ERROR'
        Write-Step '  CACHED_SERVICE_CONFIG / CUSTOM_NETWORK_STACK / UNKNOWN' 'ERROR'
        Write-Step 'Compare the pktmon capture against the baseline capture. If the client' 'ERROR'
        Write-Step 'contacted a DIFFERENT host, this hostname was simply wrong.' 'ERROR'
        if ($unres.Count -gt 0) {
            Write-Step "$($unres.Count) connection(s) were UNATTRIBUTED -- instrument gap, not a" 'ERROR'
            Write-Step 'finding. Re-run before concluding.' 'ERROR'
        }
    }
}
finally {
    Invoke-LabCleanup
}
