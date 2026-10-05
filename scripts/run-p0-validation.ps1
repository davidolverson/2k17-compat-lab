param(
  [string]$UserContentUpload = "",
  [string]$UserContentDownload = "",
  [string]$RouteLogBefore = "",
  [string]$RouteLogAfter = "",
  [string]$ProbeLogBefore = "",
  [string]$ProbeLogAfter = "",
  [string]$ParkSpec = "",
  [string]$OutputDir = "",
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

# Backward compatibility with Mission 13 parameter names.
if (-not $RouteLogBefore -and $ProbeLogBefore) {
  $RouteLogBefore = $ProbeLogBefore
}
if (-not $RouteLogAfter -and $ProbeLogAfter) {
  $RouteLogAfter = $ProbeLogAfter
}

if (-not $SkipTests) {
  Write-Host "[p0] Running aggregate test suite..."
  npm test
  if ($LASTEXITCODE -ne 0) {
    Fail "Tests failed. P0 validation stopped."
  }
}

if (-not $OutputDir) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "server\captures\p0-validation-local\$stamp"
}

$absoluteOutput = Join-Path $repoRoot $OutputDir
New-Item -ItemType Directory -Force -Path $absoluteOutput | Out-Null

$beforeSummary = $null
$afterSummary = $null

if ($UserContentUpload) {
  if (-not (Test-Path $UserContentUpload)) {
    Fail "UserContent upload file not found: $UserContentUpload"
  }

  Write-Host "[p0] Proving byte-exact UserContent local persistence..."
  $storeDir = Join-Path $absoluteOutput "user-content-store"
  node scripts\test-user-content-roundtrip.js $UserContentUpload $storeDir
  if ($LASTEXITCODE -ne 0) {
    Fail "UserContent local persistence round trip failed."
  }
}

if ($UserContentDownload) {
  if (-not $UserContentUpload) {
    Fail "UserContentDownload requires UserContentUpload for comparison."
  }
  if (-not (Test-Path $UserContentDownload)) {
    Fail "UserContent download/return file not found: $UserContentDownload"
  }

  Write-Host "[p0] Comparing uploaded and returned UserContent bundles..."
  $returnProof = Join-Path $absoluteOutput "upload-download-proof.json"
  node scripts\verify-user-content-return.js $UserContentUpload $UserContentDownload $returnProof
  if ($LASTEXITCODE -ne 0) {
    Fail "Returned UserContent is not byte-identical to the uploaded bundle."
  }
}

if ($RouteLogBefore) {
  if (-not (Test-Path $RouteLogBefore)) {
    Fail "Before route log not found: $RouteLogBefore"
  }

  $beforeSummary = Join-Path $absoluteOutput "before.summary.json"
  Write-Host "[p0] Summarizing baseline route log (auto-detect Probe/Granite)..."
  node scripts\summarize-route-log.js $RouteLogBefore $beforeSummary
  if ($LASTEXITCODE -ne 0) {
    Fail "Baseline route summary failed."
  }
}

if ($RouteLogAfter) {
  if (-not (Test-Path $RouteLogAfter)) {
    Fail "After route log not found: $RouteLogAfter"
  }

  $afterSummary = Join-Path $absoluteOutput "after.summary.json"
  Write-Host "[p0] Summarizing experimental route log (auto-detect Probe/Granite)..."
  node scripts\summarize-route-log.js $RouteLogAfter $afterSummary
  if ($LASTEXITCODE -ne 0) {
    Fail "Experimental route summary failed."
  }
}

if ($beforeSummary -and $afterSummary) {
  $diffPath = Join-Path $absoluteOutput "before-after.diff.json"
  Write-Host "[p0] Diffing route summaries..."
  node scripts\diff-probe-summaries.js $beforeSummary $afterSummary $diffPath
  if ($LASTEXITCODE -ne 0) {
    Fail "Route summary diff failed."
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
  Fail "ParkSpec requires both RouteLogBefore and RouteLogAfter."
}

Write-Host ""
Write-Host "P0_VALIDATION_COMPLETE"
Write-Host ("OUTPUT " + $absoluteOutput)
Write-Host "This script only reads supplied evidence and writes local reports/store fixtures."
Write-Host "It does not launch the game, Steam, modify certificates/hosts, or contact network endpoints."
