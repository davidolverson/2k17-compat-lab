<#
  watch.ps1 -- process attribution. This is the script that stops us from
  declaring a false positive.

  The probe can only see a remote port. It cannot see WHICH process opened it.
  A curl, a browser, a Steam overlay or an antivirus TLS inspector hitting the
  probe looks identical in the probe log to the game hitting it.

  This watcher polls the OS connection table and records, per connection to our
  listener, the owning PID and process name. Correlation key = remote port
  (ephemeral ports are not reused within the poll window in practice).

  Run it in a second window alongside run.ps1, BEFORE launching the game.
  Read-only; mutates nothing.
#>
[CmdletBinding()]
param(
    [int]$Port = 443,
    [int]$IntervalMs = 250,
    [int]$MaxMinutes = 120
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-LabDirs

$state = Read-LabState
$runId = 'nostate'
if ($state -ne $null) { $runId = $state.runId }
$outLog = Join-Path $LogDir "attribution.$runId.jsonl"

Write-Host "=== attribution watcher ==="
Write-Host "watching 127.0.0.1:$Port  interval=${IntervalMs}ms  log=$outLog"
Write-Host 'Also tracking every outbound connection owned by NBA2K17.exe.'
Write-Host 'Ctrl+C to stop.'
Write-Host ''

$seen = @{}
$deadline = (Get-Date).AddMinutes($MaxMinutes)
$procCache = @{}

function Resolve-ProcName {
    param([int]$ProcId)
    if ($procCache.ContainsKey($ProcId)) { return $procCache[$ProcId] }
    $p = Get-Process -Id $ProcId -ErrorAction SilentlyContinue
    $n = 'exited-or-unknown'
    if ($p) { $n = $p.ProcessName }
    $procCache[$ProcId] = $n
    return $n
}

function Write-Attr {
    param([string]$Kind, $Data)
    $rec = [ordered]@{ tsUtc = (Get-UtcStamp); kind = $Kind }
    foreach ($k in $Data.Keys) { $rec[$k] = $Data[$k] }
    $json = (New-Object psobject -Property $rec) | ConvertTo-Json -Depth 6 -Compress
    Add-Content -Path $outLog -Value $json -Encoding UTF8
    return $rec
}

while ((Get-Date) -lt $deadline) {

    # --- connections INTO our listener -------------------------------------
    $conns = @(Get-NetTCPConnection -RemoteAddress '127.0.0.1' -RemotePort $Port -ErrorAction SilentlyContinue)
    foreach ($c in $conns) {
        $key = "in:$($c.LocalPort)"
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $name = Resolve-ProcName -ProcId $c.OwningProcess
        $r = Write-Attr 'conn.to.probe' @{
            clientPid     = $c.OwningProcess
            clientProcess = $name
            clientPort    = $c.LocalPort     # == probe's remotePort. THE correlation key.
            state         = $c.State.ToString()
        }
        $isGame = ($name -like 'NBA2K17*')
        if ($isGame) {
            Write-Host ''
            Write-Host "*** NBA2K17.exe -> PROBE ***  pid=$($c.OwningProcess) clientPort=$($c.LocalPort)" -ForegroundColor Green
            Write-Host "    Correlate probe log records with remotePort=$($c.LocalPort)." -ForegroundColor Green
            Write-Host ''
        } else {
            Write-Host "[conn] $name (pid $($c.OwningProcess)) -> probe, clientPort=$($c.LocalPort)  [NOT the game -- false positive for the gate]"
        }
    }

    # --- everything NBA2K17.exe talks to, anywhere --------------------------
    $game = @(Get-Process -Name 'NBA2K17' -ErrorAction SilentlyContinue)
    foreach ($g in $game) {
        $gc = @(Get-NetTCPConnection -OwningProcess $g.Id -ErrorAction SilentlyContinue |
                Where-Object { $_.RemoteAddress -ne '0.0.0.0' -and $_.RemoteAddress -ne '::' })
        foreach ($c in $gc) {
            $key = "game:$($c.LocalPort):$($c.RemoteAddress):$($c.RemotePort)"
            if ($seen.ContainsKey($key)) { continue }
            $seen[$key] = $true
            Write-Attr 'game.connection' @{
                gamePid       = $g.Id
                localPort     = $c.LocalPort
                remoteAddress = $c.RemoteAddress
                remotePort    = $c.RemotePort
                state         = $c.State.ToString()
            } | Out-Null
            Write-Host "[game] NBA2K17 pid=$($g.Id) -> $($c.RemoteAddress):$($c.RemotePort) ($($c.State))"
        }
    }

    Start-Sleep -Milliseconds $IntervalMs
}

Write-Host "Watcher reached MaxMinutes=$MaxMinutes. Stopping."
