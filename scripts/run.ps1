<#
  run.ps1 -- start the probe and record its identity for safe cleanup.
  Run elevated (binding 443).
#>
[CmdletBinding()]
param([switch]$Foreground)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

Assert-Admin
Initialize-LabDirs

$state = Read-LabState
if ($state -eq $null) { throw 'No state. Run scripts\setup.ps1 first.' }
if ($state.cleanedUpUtc -ne $null) { throw "Run $($state.runId) was already cleaned up. Run setup.ps1 again." }

$cfgPath = Join-Path $StateDir 'probe-config.json'
if (-not (Test-Path $cfgPath)) { throw "Missing $cfgPath. Re-run setup.ps1." }

$node = (Get-Command node -ErrorAction Stop).Source
$probeJs = Join-Path $RepoRoot 'probe\probe.js'

if ($Foreground) {
    Write-Step 'Starting probe in FOREGROUND (Ctrl+C to stop). State will not record a PID.'
    & $node $probeJs $cfgPath
    return
}

$stdout = Join-Path $LogDir "probe.$($state.runId).out.log"
$stderr = Join-Path $LogDir "probe.$($state.runId).err.log"

Write-Step 'Starting probe ...'
$p = Start-Process -FilePath $node -ArgumentList @($probeJs, $cfgPath) `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
        -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 2
$p.Refresh()
if ($p.HasExited) {
    Write-Step "Probe exited immediately (code $($p.ExitCode)). stderr:" 'ERROR'
    if (Test-Path $stderr) { Get-Content $stderr | ForEach-Object { Write-Step "  $_" 'ERROR' } }
    if (Test-Path $stdout) { Get-Content $stdout | ForEach-Object { Write-Step "  $_" 'ERROR' } }
    throw 'Probe failed to start.'
}

# Wait for the attribution poller to actually be live before declaring readiness.
# Its powershell child takes ~1-2s to start, and until it produces a row the port
# table is empty, so anything connecting in that window is UNATTRIBUTABLE and
# cannot support a Level B claim. Never launch the game until this passes.
$probeLog = Join-Path $LogDir "probe.$($state.runId).jsonl"
$ready = $false
$deadline = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $deadline) {
    if (Test-Path $probeLog) {
        if (@(Select-String -Path $probeLog -Pattern 'attribution.poller.ready' -SimpleMatch -ErrorAction SilentlyContinue).Count -gt 0) {
            $ready = $true; break
        }
    }
    Start-Sleep -Milliseconds 300
}
if ($ready) {
    Write-Step 'Attribution poller READY -- connections will be PID-attributed.' 'OK'
} else {
    Write-Step 'Attribution poller did NOT report ready within 25s.' 'WARN'
    Write-Step '  The probe still logs traffic, but owners may come back UNRESOLVED,' 'WARN'
    Write-Step '  and an UNRESOLVED request CANNOT be reported as Level B evidence.' 'WARN'
    Write-Step '  Check logs for attribution.poller.stderr before launching the game.' 'WARN'
}

$startUtc = $null
try { $startUtc = $p.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } catch { }

$state.probe = New-Object psobject -Property ([ordered]@{
    pid          = $p.Id
    processName  = $p.ProcessName
    startTimeUtc = $startUtc
    stdoutPath   = $stdout
    stderrPath   = $stderr
    startedUtc   = (Get-UtcStamp)
})
Write-LabState $state

Write-Step "Probe running: pid=$($p.Id) start=$startUtc"
Write-Step "  stdout: $stdout"
Write-Step 'Next: scripts\verify.ps1   (then scripts\watch.ps1 in a second window)'
