param(
  [string]$UserContentUpload = "",
  [string]$ProbeLogBefore = "",
  [string]$ProbeLogAfter = "",
  [string]$ParkSpec = "",
  [string]$OutputDir = "server\captures\p0-validation-local",
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Fail([string]$message) {
  Write-Host "[p0] ERROR: $message" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js is required but was not found in PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "npm is required but was not found in PATH."
}

if (-not $SkipTests) {
  Write-Host "[p0] Running aggregate test suite..."
  npm test
  if ($LASTEXITCODE -ne 0) {
    Fail "Tests failed. P0 validation stopped."
  }
}

$absoluteOutput = Join-Path $repoRoot $OutputDir
New-Item -ItemType Directory -Force -Path $absoluteOutput | Out-Null

$beforeSummary = $null
$afterSummary = $null

if ($UserContentUpload) {
  if (-not (Test-Path $UserContentUpload)) {
    Fail "UserContent upload file not found: $UserContentUpload"
  }

  Write-Host "[p0] Proving byte-exact UserContent persistence..."
  $storeDir = Join-Path $absoluteOutput "user-content-store"
  node scripts\test-user-content-roundtrip.js $UserContentUpload $storeDir
  if ($LASTEXITCODE -ne 0) {
    Fail "UserContent persistence round trip failed."
  }
}

if ($ProbeLogBefore) {
  if (-not (Test-Path $ProbeLogBefore)) {
    Fail "Before probe log not found: $ProbeLogBefore"
  }

  $beforeSummary = Join-Path $absoluteOutput "before.summary.json"
  Write-Host "[p0] Summarizing baseline probe log..."
  node scripts\summarize-probe-log.js $ProbeLogBefore $beforeSummary
  if ($LASTEXITCODE -ne 0) {
    Fail "Baseline probe summary failed."
  }
}

if ($ProbeLogAfter) {
  if (-not (Test-Path $ProbeLogAfter)) {
    Fail "After probe log not found: $ProbeLogAfter"
  }

  $afterSummary = Join-Path $absoluteOutput "after.summary.json"
  Write-Host "[p0] Summarizing experimental probe log..."
  node scripts\summarize-probe-log.js $ProbeLogAfter $afterSummary
  if ($LASTEXITCODE -ne 0) {
    Fail "Experimental probe summary failed."
  }
}

if ($beforeSummary -and $afterSummary) {
  $diffPath = Join-Path $absoluteOutput "before-after.diff.json"
  Write-Host "[p0] Diffing probe summaries..."
  node scripts\diff-probe-summaries.js $beforeSummary $afterSummary $diffPath
  if ($LASTEXITCODE -ne 0) {
    Fail "Probe summary diff failed."
  }

  if ($ParkSpec) {
    if (-not (Test-Path $ParkSpec)) {
      Fail "Park experiment spec not found: $ParkSpec"
    }

    $ledgerPath = Join-Path $absoluteOutput "park-experiments.jsonl"
    Write-Host "[p0] Recording one-variable Park experiment..."
    node scripts\record-park-experiment.js $ParkSpec $beforeSummary $afterSummary $ledgerPath
    if ($LASTEXITCODE -ne 0) {
      Fail "Park experiment record failed."
    }
  }
} elseif ($ParkSpec) {
  Fail "ParkSpec requires both ProbeLogBefore and ProbeLogAfter."
}

Write-Host ""
Write-Host "P0_VALIDATION_COMPLETE"
Write-Host ("OUTPUT " + $absoluteOutput)
Write-Host "No game process, Steam process, certificate, hosts entry, or network endpoint was modified by this script."
