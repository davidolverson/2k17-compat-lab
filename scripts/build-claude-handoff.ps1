param(
  [string]$InputDir = "server\captures\parallel-reconstruction-local",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $OutputDir) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "handoffs\claude\$stamp"
}

node scripts\build-claude-handoff.js $InputDir $OutputDir
exit $LASTEXITCODE
