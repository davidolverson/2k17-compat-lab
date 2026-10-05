param(
  [string]$Config = "server\parallel-reconstruction.local.json",
  [string]$ArtifactPath = "",
  [switch]$SkipTests,
  [switch]$Smoke,
  [switch]$AutoDiscover
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

if ($AutoDiscover) {
  $discoveryRelative = "experiment-state\local-evidence-discovery.json"
  $discoveryScript = Join-Path $PSScriptRoot "discover-local-evidence.ps1"

  Write-Host "[parallel] Running read-only local evidence discovery..."
  & $discoveryScript -OutputPath $discoveryRelative

  $discoveryPath = Join-Path $repoRoot $discoveryRelative
  if (Test-Path $discoveryPath) {
    $discovery = Get-Content $discoveryPath -Raw | ConvertFrom-Json

    if ($discovery.clientInstalled) {
      $installedClient = @($discovery.clients | Where-Object { $_.exists } | Select-Object -First 1)
      if ($installedClient.Count -gt 0) {
        Write-Host ("[parallel] NBA 2K17 client found: " + $installedClient[0].path)
      }
    } else {
      Write-Host "[parallel] NBA 2K17 client not found in discovered Steam roots."
    }

    if (-not $ArtifactPath) {
      $syncCandidates = @($discovery.syncBinCandidates)
      if ($syncCandidates.Count -eq 1) {
        $ArtifactPath = [string]$syncCandidates[0].path
        Write-Host ("[parallel] Auto-selected single SYNC.BIN candidate: " + $ArtifactPath)
      } elseif ($syncCandidates.Count -gt 1) {
        Write-Host ("[parallel] Found " + $syncCandidates.Count + " SYNC.BIN candidates; none auto-selected.")
        Write-Host "[parallel] Re-run with -ArtifactPath to choose one explicitly."
      } else {
        Write-Host "[parallel] No SYNC.BIN candidate found."
      }
    }
  }
}

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
