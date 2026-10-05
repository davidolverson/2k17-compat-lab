param(
  [string]$Config = "server\parallel-reconstruction.local.json",
  [string]$ArtifactPath = "",
  [switch]$SkipTests,
  [switch]$Smoke
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Fail([string]$message) {
  Write-Host "[parallel] ERROR: $message" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js is required but was not found in PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "npm is required but was not found in PATH."
}

if (-not (Test-Path "package.json")) {
  Fail "package.json not found. Run this script from the repository checkout."
}

if ($Smoke) {
  Write-Host "[parallel] Running synthetic end-to-end smoke test..."
  npm run smoke:parallel
  exit $LASTEXITCODE
}

if (-not $SkipTests) {
  Write-Host "[parallel] Running full test suite first..."
  npm test
  if ($LASTEXITCODE -ne 0) {
    Fail "Tests failed. Parallel capture was not started."
  }
}

$configPath = Join-Path $repoRoot $Config
$examplePath = Join-Path $repoRoot "server\parallel-reconstruction.example.json"

if (-not (Test-Path $configPath)) {
  if (-not (Test-Path $examplePath)) {
    Fail "Example configuration is missing: $examplePath"
  }

  Copy-Item $examplePath $configPath
  Write-Host "[parallel] Created local config: $configPath"
}

$configObject = Get-Content $configPath -Raw | ConvertFrom-Json

if ($ArtifactPath) {
  $resolvedArtifact = (Resolve-Path $ArtifactPath).Path
  $configObject.artifactPath = $resolvedArtifact
  $configObject | ConvertTo-Json -Depth 8 | Set-Content $configPath -Encoding UTF8
  Write-Host "[parallel] Artifact configured read-only: $resolvedArtifact"
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  2K17 COMPAT LAB - PARALLEL RECONSTRUCTION"
Write-Host "============================================================"
Write-Host "Config: $configPath"
Write-Host "Mode: loopback capture + read-only artifact analysis"
Write-Host "Stop: Ctrl+C"
Write-Host ""

node scripts\run-parallel-reconstruction.js $configPath
exit $LASTEXITCODE
