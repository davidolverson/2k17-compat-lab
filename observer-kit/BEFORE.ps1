<#  BEFORE.ps1 -- take the pre-test snapshot. Read-only.  #>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RunId,
    [string]$GamePath,
    [switch]$HashEverything
)
$ErrorActionPreference = 'Stop'
$args2 = @{ Phase = 'before'; RunId = $RunId }
if ($GamePath)       { $args2['GamePath'] = $GamePath }
if ($HashEverything) { $args2['HashEverything'] = $true }

& (Join-Path $PSScriptRoot 'scripts\snapshot-client-state.ps1') @args2

Write-Host ''
Write-Host 'NEXT, before you touch the launcher:' -ForegroundColor Yellow
Write-Host '  1. start the live network capture   .\scripts\capture.ps1 -Action start' -ForegroundColor Yellow
Write-Host '  2. start the attribution watcher    .\scripts\watch.ps1 -ProcessName <name>' -ForegroundColor Yellow
Write-Host '  3. open docs\back2back-live-capture-checklist.md and log timestamps as you go' -ForegroundColor Yellow
Write-Host ''
Write-Host 'The snapshot socket table is point-in-time. Without the live capture a' -ForegroundColor Yellow
Write-Host 'short-lived connection is invisible, and absence is NOT evidence of absence.' -ForegroundColor Yellow
