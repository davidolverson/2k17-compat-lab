param(
  [Parameter(Mandatory=$true)]
  [string]$SourceDir,
  [string]$Label = "snapshot",
  [string]$OutputRoot = "experiment-state\snapshots"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$source = (Resolve-Path $SourceDir).Path
if (-not (Test-Path $source -PathType Container)) {
  throw "SourceDir must be an existing directory: $SourceDir"
}

$safeLabel = ($Label -replace '[^A-Za-z0-9._-]', '_')
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destRoot = Join-Path $repoRoot $OutputRoot
$dest = Join-Path $destRoot ($stamp + "-" + $safeLabel)
$filesDest = Join-Path $dest "files"

New-Item -ItemType Directory -Force -Path $filesDest | Out-Null

$records = @()

Get-ChildItem -LiteralPath $source -File -Recurse | ForEach-Object {
  $full = $_.FullName
  $relative = $full.Substring($source.Length).TrimStart('\','/')
  $target = Join-Path $filesDest $relative
  $parent = Split-Path -Parent $target
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $sourceHashBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLowerInvariant()
  Copy-Item -LiteralPath $full -Destination $target -Force
  $sourceHashAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLowerInvariant()
  $copyHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()

  if ($sourceHashBefore -ne $sourceHashAfter) {
    throw "Source file changed during snapshot: $relative"
  }
  if ($sourceHashAfter -ne $copyHash) {
    throw "Snapshot hash mismatch for $relative"
  }

  $sourceHash = $sourceHashAfter

  $records += [pscustomobject]@{
    relativePath = $relative
    byteSize = [int64]$_.Length
    sha256 = $sourceHash
    lastWriteUtc = $_.LastWriteTimeUtc.ToString("o")
  }
}

$manifest = [ordered]@{
  schema = "2k17-compat-lab.directory-snapshot.v1"
  createdAtUtc = [DateTime]::UtcNow.ToString("o")
  sourcePath = $source
  label = $safeLabel
  fileCount = $records.Count
  files = @($records | Sort-Object relativePath)
  claimsPromoted = @()
}

$manifestPath = Join-Path $dest "manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content $manifestPath -Encoding UTF8

Write-Host "DIRECTORY_SNAPSHOT_PASS"
Write-Host ("SOURCE " + $source)
Write-Host ("FILES " + $records.Count)
Write-Host ("DESTINATION " + $dest)
Write-Host ("MANIFEST " + $manifestPath)
Write-Host "No source file was modified."
