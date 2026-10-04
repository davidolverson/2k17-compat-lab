<#  AFTER.ps1 -- take the post-test snapshot. Read-only.
    Close the launcher and game FIRST so file handles are released, otherwise
    hashing can fail on locked files and leave gaps in the comparison.          #>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RunId,
    [string]$GamePath,
    [switch]$HashEverything
)
$ErrorActionPreference = 'Stop'

$running = @(Get-Process -Name 'NBA2K17','launcher','back2back','Back2Back' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    Write-Host 'WARNING: these are still running; close them before snapshotting:' -ForegroundColor Red
    foreach ($p in $running) { Write-Host "  $($p.ProcessName) (pid $($p.Id))" -ForegroundColor Red }
    Write-Host 'A locked file cannot be hashed, and a gap here becomes a false "unchanged".' -ForegroundColor Red
}

$args2 = @{ Phase = 'after'; RunId = $RunId }
if ($GamePath)       { $args2['GamePath'] = $GamePath }
if ($HashEverything) { $args2['HashEverything'] = $true }

& (Join-Path $PSScriptRoot 'scripts\snapshot-client-state.ps1') @args2

Write-Host ''
Write-Host 'Now stop the live capture:  .\scripts\capture.ps1 -Action stop' -ForegroundColor Yellow
Write-Host 'Then:                       .\COMPARE.ps1 -RunId ' -NoNewline -ForegroundColor Yellow
Write-Host $RunId -ForegroundColor Yellow
