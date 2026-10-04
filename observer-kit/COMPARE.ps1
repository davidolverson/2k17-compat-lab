<#  COMPARE.ps1 -- diff before vs after and print the verdict. Read-only.  #>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RunId,
    [switch]$Json
)
$ErrorActionPreference = 'Stop'
$a = @{ RunId = $RunId }
if ($Json) { $a['Json'] = $true }
& (Join-Path $PSScriptRoot 'scripts\compare-client-state.ps1') @a

Write-Host ''
Write-Host 'Read the verdict carefully:' -ForegroundColor Yellow
Write-Host '  "unchanged" means unchanged in what was MEASURED.' -ForegroundColor Yellow
Write-Host '  Registry VALUE writes, connections shorter than the gap between snapshots,' -ForegroundColor Yellow
Write-Host '  files above the hash cap and unreadable certificate stores are all outside' -ForegroundColor Yellow
Write-Host '  this diff. Cross-check against the pktmon capture before concluding.' -ForegroundColor Yellow
