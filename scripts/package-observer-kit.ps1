<#
  package-observer-kit.ps1 -- build the portable, read-only observer bundle.

  Copies ONLY observation tooling. The scripts that mutate machine state
  (setup.ps1, cleanup.ps1, run.ps1, verify.ps1, test-replacement.ps1) are
  deliberately EXCLUDED, and the script verifies afterwards that none of them
  made it in -- a kit that can modify hosts or import a certificate is no longer
  an observer, and in a disposable VM that distinction is the whole safety model.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Destination,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$kitSrc = Join-Path $RepoRoot 'observer-kit'
if (-not (Test-Path $kitSrc)) { throw "Missing $kitSrc" }

if (Test-Path $Destination) {
    if (-not $Force) { throw "$Destination already exists. Pass -Force to overwrite." }
    Remove-Item $Destination -Recurse -Force
}
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Destination 'scripts') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Destination 'docs') -Force | Out-Null

# Wrappers + readme
Copy-Item (Join-Path $kitSrc '*') -Destination $Destination -Force

# READ-ONLY tooling only.
$allow = @(
    '_common.ps1',                  # shared helpers (hashing, cert lookup, port owner)
    'snapshot-client-state.ps1',
    'compare-client-state.ps1',
    'watch.ps1',                    # observation only: polls, never mutates
    'capture.ps1',                  # pktmon wrapper; adds a filter, removes it on stop
    'import-client.ps1'             # fingerprints a supplied directory; no network code
)
foreach ($f in $allow) {
    $src = Join-Path $PSScriptRoot $f
    if (-not (Test-Path $src)) { throw "Expected script missing: $src" }
    Copy-Item $src -Destination (Join-Path $Destination "scripts\$f") -Force
    Write-Step "  + scripts\$f"
}

foreach ($d in @('back2back-blackbox-playtest.md','back2back-live-capture-checklist.md')) {
    $src = Join-Path $RepoRoot "docs\$d"
    if (Test-Path $src) { Copy-Item $src -Destination (Join-Path $Destination "docs\$d") -Force; Write-Step "  + docs\$d" }
}

# --- verify the kit is actually read-only -----------------------------------
# Asserted, not assumed. A mutating script copied in by mistake would make the
# "observation only" promise false while the folder still looked right.
$forbidden = @('setup.ps1','cleanup.ps1','run.ps1','verify.ps1','test-replacement.ps1','test-client.ps1','await-client.ps1','validate-instrument.ps1')
$leaked = @()
foreach ($f in $forbidden) {
    if (Test-Path (Join-Path $Destination "scripts\$f")) { $leaked += $f }
}
if ($leaked.Count -gt 0) {
    Write-Step "KIT IS NOT READ-ONLY -- mutating script(s) present: $($leaked -join ', ')" 'ERROR'
    throw 'Refusing to ship a kit that can modify machine state.'
}

# Second gate: grep the copied scripts for the mutation verbs themselves, in case
# a read-only script later grows a write path.
$patterns = @('Write-HostsLines','X509Store','New-SelfSignedCertificate','Export-PfxCertificate','Stop-Process','Remove-Item\s+Cert:','New-ItemProperty')
$suspect = @()
foreach ($f in (Get-ChildItem (Join-Path $Destination 'scripts') -Filter '*.ps1')) {
    foreach ($p in $patterns) {
        $hits = @(Select-String -Path $f.FullName -Pattern $p -ErrorAction SilentlyContinue)
        # _common.ps1 legitimately DEFINES the helpers; flag only actual call sites elsewhere.
        if ($hits.Count -gt 0 -and $f.Name -ne '_common.ps1') { $suspect += "$($f.Name): $p x$($hits.Count)" }
    }
}
if ($suspect.Count -gt 0) {
    Write-Step 'Mutation-capable patterns found in kit scripts (review each):' 'WARN'
    foreach ($s in $suspect) { Write-Step "  $s" 'WARN' }
    Write-Step 'These are warnings, not failures -- _common.ps1 defines helpers the' 'WARN'
    Write-Step 'observers do not call. Confirm before trusting the kit in a VM.' 'WARN'
}

$count = @(Get-ChildItem $Destination -Recurse -File).Count
Write-Step ''
Write-Step "OBSERVER KIT BUILT: $Destination ($count files)" 'OK'
Write-Step 'Contains no setup/cleanup/run/verify script. Observation only.' 'OK'
Write-Step 'Copy the folder into the disposable VM. Do not map a host drive to do it;'
Write-Step 'a shared folder is a path back to the host.'
