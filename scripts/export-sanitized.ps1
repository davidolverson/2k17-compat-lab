<#
  export-sanitized.ps1 -- turn the raw gitignored probe log into a shareable
  fixture. The OUTPUT of this script is the only probe artifact that may leave
  this machine or enter git.

  Drops every raw field (headersRaw, bodyRaw) and keeps only the redacted ones,
  then re-applies redaction to the result. Belt and braces: a single missed
  pattern in the probe is not allowed to become a published secret.
#>
[CmdletBinding()]
param(
    [string]$RunId,
    [string]$OutFile
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-LabDirs

if (-not $RunId) {
    $state = Read-LabState
    if ($state -eq $null) { throw 'No state and no -RunId given.' }
    $RunId = $state.runId
}

$src = Join-Path $LogDir "probe.$RunId.jsonl"
if (-not (Test-Path $src)) { throw "No probe log for run $RunId at $src" }

if (-not $OutFile) {
    $OutFile = Join-Path $RepoRoot ("sanitized-fixtures\probe.$RunId.sanitized.jsonl")
}
$outDir = Split-Path -Parent $OutFile
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

# Second-pass redaction patterns, applied to ALREADY-redacted text.
$patterns = @(
    @{ Re = '(?i)\bbearer\s+[A-Za-z0-9._~+/-]{10,}=*';            Rep = 'Bearer [REDACTED]' },
    @{ Re = '\b7656119\d{10}\b';                                   Rep = '[STEAMID64_REDACTED]' },
    @{ Re = '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b';  Rep = '[EMAIL_REDACTED]' },
    @{ Re = '\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b'; Rep = '[JWT_REDACTED]' },
    @{ Re = '\b[0-9a-fA-F]{32,}\b';                                Rep = '[HEX_REDACTED]' },
    @{ Re = '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b';              Rep = '[IP_REDACTED]' }
)

function Scrub {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $t = $Text
    foreach ($p in $patterns) { $t = [regex]::Replace($t, $p.Re, $p.Rep) }
    return $t
}

$DROP = @('headersRaw', 'bodyRaw')

$lines = @()
$stats = @{}
foreach ($line in (Get-Content $src)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $rec = $line | ConvertFrom-Json
    $o = [ordered]@{}
    foreach ($prop in $rec.PSObject.Properties) {
        if ($DROP -contains $prop.Name) { continue }
        $v = $prop.Value
        if ($v -is [string]) { $v = Scrub $v }
        elseif ($v -is [psobject] -and $v -ne $null) {
            $inner = [ordered]@{}
            foreach ($ip in $v.PSObject.Properties) {
                $iv = $ip.Value
                if ($iv -is [string]) { $iv = Scrub $iv }
                $inner[$ip.Name] = $iv
            }
            $v = (New-Object psobject -Property $inner)
        }
        $o[$prop.Name] = $v
    }
    $k = $rec.kind
    if (-not $stats.ContainsKey($k)) { $stats[$k] = 0 }
    $stats[$k]++
    $lines += ((New-Object psobject -Property $o) | ConvertTo-Json -Depth 10 -Compress)
}

[IO.File]::WriteAllLines($OutFile, $lines, (New-Object Text.UTF8Encoding($false)))

Write-Step "Sanitized export written: $OutFile"
Write-Step "  records: $($lines.Count)"
foreach ($k in ($stats.Keys | Sort-Object)) { Write-Step "    $k = $($stats[$k])" }
Write-Step "  dropped fields: $($DROP -join ', ')"

# Prove the export does not contain the one secret we know the value of.
$state = Read-LabState
if ($state -ne $null -and $state.certs -ne $null -and (Test-Path $state.certs.pfxPasswordPath)) {
    $pw = [IO.File]::ReadAllText($state.certs.pfxPasswordPath).Trim()
    $txt = [IO.File]::ReadAllText($OutFile)
    if ($txt.Contains($pw)) { Write-Step '  LEAK: pfx passphrase present in export!' 'ERROR'; exit 1 }
    Write-Step '  verified: pfx passphrase absent from export.'
}
Write-Step 'Review this file by eye before sharing. Redaction is a net, not a proof.'
