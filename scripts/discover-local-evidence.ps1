param(
  [string]$OutputPath = "experiment-state\local-evidence-discovery.json",
  [string]$SteamRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$appId = "385760"
$roots = New-Object System.Collections.Generic.List[string]

function Add-SteamRoot([string]$candidate) {
  if (-not $candidate) { return }
  try {
    $full = [System.IO.Path]::GetFullPath($candidate)
  } catch {
    return
  }
  if ((Test-Path $full) -and -not $roots.Contains($full)) {
    $roots.Add($full)
  }
}

if ($SteamRoot) {
  Add-SteamRoot $SteamRoot
} else {
  try {
    $steamPath = (Get-ItemProperty "HKCU:\Software\Valve\Steam" -ErrorAction Stop).SteamPath
    Add-SteamRoot $steamPath
  } catch {}

  try {
    $steamPath = (Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam" -ErrorAction Stop).InstallPath
    Add-SteamRoot $steamPath
  } catch {}

  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($programFilesX86) {
    Add-SteamRoot (Join-Path $programFilesX86 "Steam")
  }
}

# Expand Steam library roots from libraryfolders.vdf without contacting Steam.
foreach ($root in @($roots)) {
  $libraryFile = Join-Path $root "steamapps\libraryfolders.vdf"
  if (-not (Test-Path $libraryFile)) { continue }

  $text = Get-Content $libraryFile -Raw
  foreach ($match in [regex]::Matches($text, '"path"\s+"([^"]+)"')) {
    $candidate = $match.Groups[1].Value -replace '\\\\', '\'
    Add-SteamRoot $candidate
  }
}

$manifests = @()
$clients = @()
$syncCandidates = @()

foreach ($root in @($roots)) {
  $manifestPath = Join-Path $root "steamapps\appmanifest_$appId.acf"
  if (Test-Path $manifestPath) {
    $manifestText = Get-Content $manifestPath -Raw
    $installDir = $null
    $match = [regex]::Match($manifestText, '"installdir"\s+"([^"]+)"')
    if ($match.Success) {
      $installDir = $match.Groups[1].Value
    }

    $manifests += [pscustomobject]@{
      path = $manifestPath
      installDir = $installDir
    }

    if ($installDir) {
      $clientPath = Join-Path $root ("steamapps\common\" + $installDir + "\NBA2K17.exe")
      $clients += [pscustomobject]@{
        path = $clientPath
        exists = [bool](Test-Path $clientPath)
        steamRoot = $root
      }
    }
  }

  $userdata = Join-Path $root "userdata"
  if (Test-Path $userdata) {
    $patterns = @(
      (Join-Path $userdata "*\$appId\local\SYNC.BIN"),
      (Join-Path $userdata "*\$appId\remote\SYNC.BIN")
    )

    foreach ($pattern in $patterns) {
      foreach ($file in @(Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue)) {
        $hash = Get-FileHash -Algorithm SHA256 -Path $file.FullName
        $syncCandidates += [pscustomobject]@{
          path = $file.FullName
          byteSize = [int64]$file.Length
          sha256 = $hash.Hash.ToLowerInvariant()
          lastWriteUtc = $file.LastWriteTimeUtc.ToString("o")
          steamRoot = $root
        }
      }
    }
  }
}

# De-duplicate candidate paths if the same Steam root was discovered twice.
$syncCandidates = @(
  $syncCandidates |
    Group-Object path |
    ForEach-Object { $_.Group[0] }
)

$result = [ordered]@{
  schema = "2k17-compat-lab.local-evidence-discovery.v1"
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  appId = $appId
  mode = "READ_ONLY_LOCAL_DISCOVERY"
  steamRoots = @($roots)
  manifests = @($manifests)
  clients = @($clients)
  syncBinCandidates = @($syncCandidates)
  clientInstalled = [bool](@($clients | Where-Object { $_.exists }).Count -gt 0)
  syncBinFound = [bool]($syncCandidates.Count -gt 0)
  networkContacted = $false
  claimsPromoted = @()
}

$absoluteOutput = Join-Path $repoRoot $OutputPath
$parent = Split-Path -Parent $absoluteOutput
if ($parent) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}
$result | ConvertTo-Json -Depth 8 | Set-Content $absoluteOutput -Encoding UTF8

Write-Host "LOCAL_EVIDENCE_DISCOVERY_COMPLETE"
Write-Host ("STEAM_ROOTS " + $roots.Count)
Write-Host ("CLIENT_INSTALLED " + $result.clientInstalled)
Write-Host ("SYNC_BIN_CANDIDATES " + $syncCandidates.Count)
Write-Host ("OUTPUT " + $absoluteOutput)

foreach ($candidate in $syncCandidates) {
  Write-Host ("SYNC_BIN " + $candidate.path)
  Write-Host ("  SIZE " + $candidate.byteSize)
  Write-Host ("  SHA256 " + $candidate.sha256)
}

