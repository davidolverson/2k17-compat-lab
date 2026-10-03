<#
  compare-client-state.ps1 -- diff a `before` snapshot against an `after` snapshot
  and state plainly what a launcher did.

  Answers, by observation:
    - was the game executable modified?
    - which game files were added / removed / changed?
    - was the hosts file modified, and how?
    - were certificates added or removed (by thumbprint)?
    - were registry keys added or removed?
    - which new processes appeared, and from where?
    - which network destinations appeared?

  Read-only. It only reads the two snapshot directories.

      .\scripts\compare-client-state.ps1 -RunId b2b-test

  REFUSES to produce a report if either snapshot is incomplete. A diff computed
  against a partial `before` reports "unchanged" for everything that was never
  recorded, which is the most dangerous possible output: a confident false
  negative. Missing inputs are a hard failure, not a caveat.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RunId,
    [int]$MaxListed = 40,
    [switch]$Json
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')

$beforeDir = Join-Path $CapDir "$RunId\before"
$afterDir  = Join-Path $CapDir "$RunId\after"

foreach ($d in @($beforeDir, $afterDir)) {
    if (-not (Test-Path $d)) { throw "Missing snapshot directory: $d" }
}

# Which files must exist in BOTH snapshots for the corresponding section to be
# trustworthy. A section whose inputs are missing is reported UNVERIFIABLE, never
# "no change".
$required = @('machine.json','hosts.json','certificates.json','processes.json','sockets.json','registry.json')
$optional = @('client.json','inventory.json')

function Read-Snap {
    param([string]$Dir, [string]$Name)
    $p = Join-Path $Dir $Name
    if (-not (Test-Path $p)) { return $null }
    try { return (Get-Content $p -Raw | ConvertFrom-Json) } catch { return $null }
}

$missing = @()
foreach ($n in $required) {
    if (-not (Read-Snap $beforeDir $n)) { $missing += "before/$n" }
    if (-not (Read-Snap $afterDir  $n)) { $missing += "after/$n" }
}
if ($missing.Count -gt 0) {
    Write-Step 'REFUSING TO REPORT -- required snapshot inputs are missing:' 'ERROR'
    foreach ($m in $missing) { Write-Step "  $m" 'ERROR' }
    Write-Step 'A diff against an incomplete baseline reports "unchanged" for anything' 'ERROR'
    Write-Step 'that was never captured. That is a false negative, not a partial result.' 'ERROR'
    throw 'Incomplete snapshots.'
}

$findings = [ordered]@{}
$changedSections = @()

function Add-Finding {
    param([string]$Section, [bool]$Changed, $Detail)
    $findings[$Section] = [ordered]@{ changed = $Changed; detail = $Detail }
    if ($Changed) { $script:changedSections += $Section }
}

Write-Step "=== COMPARE runId=$RunId ==="
$mb = Read-Snap $beforeDir 'machine.json'
$ma = Read-Snap $afterDir  'machine.json'
Write-Step "  before: $($mb.capturedUtc)  (elevated=$($mb.elevated))"
Write-Step "  after : $($ma.capturedUtc)  (elevated=$($ma.elevated))"
if ($mb.elevated -ne $ma.elevated) {
    Write-Step '  WARNING: elevation DIFFERS between snapshots. Unelevated reads see less,' 'WARN'
    Write-Step '  so some "added" or "removed" items may be visibility artifacts.' 'WARN'
}

# ------------------------------------------------------------ 1. executable
Write-Step ''
Write-Step '--- game executable ---'
$cb = Read-Snap $beforeDir 'client.json'
$ca = Read-Snap $afterDir  'client.json'
if (-not $cb -or -not $ca) {
    Add-Finding 'executable' $false 'UNVERIFIABLE: client.json absent in one or both snapshots (-GamePath not supplied?)'
    Write-Step '  UNVERIFIABLE -- client.json missing. This is NOT "unchanged".' 'WARN'
} else {
    $same = ($cb.sha256 -eq $ca.sha256)
    $d = [ordered]@{
        exe = $ca.exe
        sha256Before = $cb.sha256; sha256After = $ca.sha256
        sizeBefore = $cb.sizeBytes; sizeAfter = $ca.sizeBytes
        peBefore = $cb.peTimestampUtc; peAfter = $ca.peTimestampUtc
        fileVersionBefore = $cb.fileVersion; fileVersionAfter = $ca.fileVersion
        signatureBefore = $cb.signatureStatus; signatureAfter = $ca.signatureStatus
    }
    Add-Finding 'executable' (-not $same) $d
    if ($same) {
        Write-Step "  UNCHANGED  $($ca.exe)  sha256=$($ca.sha256)" 'OK'
    } else {
        Write-Step "  *** MODIFIED ***  $($ca.exe)" 'ERROR'
        Write-Step "    before sha256 : $($cb.sha256)  ($($cb.sizeBytes) bytes, sig=$($cb.signatureStatus))" 'ERROR'
        Write-Step "    after  sha256 : $($ca.sha256)  ($($ca.sizeBytes) bytes, sig=$($ca.signatureStatus))" 'ERROR'
        Write-Step '    => the launcher PATCHES the executable. Record this as a fact and' 'ERROR'
        Write-Step '       note that we do not reproduce executable patching.' 'ERROR'
    }
}

# --------------------------------------------------------- 2. game files
Write-Step ''
Write-Step '--- game directory ---'
$ib = Read-Snap $beforeDir 'inventory.json'
$ia = Read-Snap $afterDir  'inventory.json'
if (-not $ib -or -not $ia) {
    Add-Finding 'files' $false 'UNVERIFIABLE: inventory.json absent in one or both snapshots'
    Write-Step '  UNVERIFIABLE -- inventory.json missing. This is NOT "unchanged".' 'WARN'
} else {
    $bmap = @{}; foreach ($f in $ib.files) { $bmap[$f.rel] = $f }
    $amap = @{}; foreach ($f in $ia.files) { $amap[$f.rel] = $f }

    $added = @($ia.files | Where-Object { -not $bmap.ContainsKey($_.rel) } | ForEach-Object { $_.rel })
    $removed = @($ib.files | Where-Object { -not $amap.ContainsKey($_.rel) } | ForEach-Object { $_.rel })
    $changed = @()
    $unhashed = 0
    foreach ($f in $ia.files) {
        if (-not $bmap.ContainsKey($f.rel)) { continue }
        $b = $bmap[$f.rel]
        if ($f.sha256 -and $b.sha256) {
            if ($f.sha256 -ne $b.sha256) { $changed += $f.rel }
        } else {
            # No hash on one side: fall back to size+mtime, and COUNT it, because a
            # size-and-mtime match is weaker evidence than a hash match.
            $unhashed++
            if ($f.size -ne $b.size -or $f.mtimeUtc -ne $b.mtimeUtc) { $changed += $f.rel }
        }
    }
    $any = ($added.Count + $removed.Count + $changed.Count) -gt 0
    Add-Finding 'files' $any ([ordered]@{
        addedCount = $added.Count; removedCount = $removed.Count; changedCount = $changed.Count
        sizeMtimeOnlyComparisons = $unhashed
        added = @($added | Select-Object -First $MaxListed)
        removed = @($removed | Select-Object -First $MaxListed)
        changed = @($changed | Select-Object -First $MaxListed)
    })
    Write-Step "  added=$($added.Count)  removed=$($removed.Count)  changed=$($changed.Count)"
    if ($unhashed -gt 0) {
        Write-Step "  NOTE: $unhashed file(s) compared by size+mtime only (above the hash cap)." 'WARN'
        Write-Step '  A size+mtime match is weaker than a hash match; re-run with -HashEverything' 'WARN'
        Write-Step '  on both snapshots if any of those files matter.' 'WARN'
    }
    foreach ($x in ($added   | Select-Object -First 12)) { Write-Step "    + $x" $(if($any){'ERROR'}else{'INFO'}) }
    foreach ($x in ($removed | Select-Object -First 12)) { Write-Step "    - $x" 'ERROR' }
    foreach ($x in ($changed | Select-Object -First 12)) { Write-Step "    ~ $x" 'ERROR' }
}

# -------------------------------------------------------------- 3. hosts
Write-Step ''
Write-Step '--- hosts ---'
$hb = Read-Snap $beforeDir 'hosts.json'
$ha = Read-Snap $afterDir  'hosts.json'
$hSame = ($hb.sha256 -eq $ha.sha256)
$beforeTexts = @($hb.activeEntries | ForEach-Object { $_.text.Trim() })
$afterTexts  = @($ha.activeEntries | ForEach-Object { $_.text.Trim() })
$hAdded   = @($afterTexts  | Where-Object { $beforeTexts -notcontains $_ })
$hRemoved = @($beforeTexts | Where-Object { $afterTexts  -notcontains $_ })
Add-Finding 'hosts' (-not $hSame) ([ordered]@{
    sha256Before = $hb.sha256; sha256After = $ha.sha256
    addedEntries = $hAdded; removedEntries = $hRemoved
})
if ($hSame) { Write-Step "  UNCHANGED  sha256=$($ha.sha256)" 'OK' }
else {
    Write-Step '  *** MODIFIED ***' 'ERROR'
    foreach ($x in $hAdded)   { Write-Step "    + $x" 'ERROR' }
    foreach ($x in $hRemoved) { Write-Step "    - $x" 'ERROR' }
    if ($hAdded.Count -eq 0 -and $hRemoved.Count -eq 0) {
        Write-Step '    hash differs but no active entry changed -- whitespace/comment only.' 'WARN'
    }
}

# ------------------------------------------------------- 4. certificates
Write-Step ''
Write-Step '--- certificates (by thumbprint) ---'
$xb = Read-Snap $beforeDir 'certificates.json'
$xa = Read-Snap $afterDir  'certificates.json'
$bKeys = @{}; foreach ($c in $xb.certificates) { $bKeys["$($c.store)|$($c.thumbprint)"] = $c }
$aKeys = @{}; foreach ($c in $xa.certificates) { $aKeys["$($c.store)|$($c.thumbprint)"] = $c }
$cAdded   = @($xa.certificates | Where-Object { -not $bKeys.ContainsKey("$($_.store)|$($_.thumbprint)") })
$cRemoved = @($xb.certificates | Where-Object { -not $aKeys.ContainsKey("$($_.store)|$($_.thumbprint)") })
$certChanged = ($cAdded.Count + $cRemoved.Count) -gt 0
Add-Finding 'certificates' $certChanged ([ordered]@{
    countBefore = $xb.count; countAfter = $xa.count
    added = @($cAdded | ForEach-Object { [ordered]@{ store=$_.store; thumbprint=$_.thumbprint; subject=$_.subject; notAfter=$_.notAfter } })
    removed = @($cRemoved | ForEach-Object { [ordered]@{ store=$_.store; thumbprint=$_.thumbprint; subject=$_.subject } })
    accessDeniedBefore = $xb.accessDenied; accessDeniedAfter = $xa.accessDenied
})
if (-not $certChanged) { Write-Step "  UNCHANGED  $($xa.count) certificate(s)" 'OK' }
else {
    Write-Step '  *** CHANGED ***' 'ERROR'
    foreach ($c in $cAdded)   { Write-Step "    + $($c.store)  $($c.thumbprint)  $($c.subject)" 'ERROR' }
    foreach ($c in $cRemoved) { Write-Step "    - $($c.store)  $($c.thumbprint)  $($c.subject)" 'ERROR' }
    Write-Step '  => a launcher-installed CA is a trust change. Record the thumbprint; it is' 'ERROR'
    Write-Step '     also what you need in order to remove it again afterwards.' 'ERROR'
}
if (@($xa.accessDenied).Count -gt 0) {
    Write-Step "  NOTE: $(@($xa.accessDenied).Count) store(s) unreadable in `after` -- additions there are INVISIBLE." 'WARN'
}

# ---------------------------------------------------------- 5. registry
Write-Step ''
Write-Step '--- registry (subkey names, one level) ---'
$rb = Read-Snap $beforeDir 'registry.json'
$ra = Read-Snap $afterDir  'registry.json'
$regDelta = @()
foreach ($rootAfter in $ra.keys) {
    $rootBefore = $rb.keys | Where-Object { $_.root -eq $rootAfter.root } | Select-Object -First 1
    if (-not $rootBefore) { continue }
    $bs = @($rootBefore.subKeys); $as = @($rootAfter.subKeys)
    $plus  = @($as | Where-Object { $bs -notcontains $_ })
    $minus = @($bs | Where-Object { $as -notcontains $_ })
    if ($plus.Count -or $minus.Count) {
        $regDelta += (New-Object psobject -Property ([ordered]@{ root=$rootAfter.root; added=$plus; removed=$minus }))
    }
}
Add-Finding 'registry' ($regDelta.Count -gt 0) $regDelta
if ($regDelta.Count -eq 0) { Write-Step '  UNCHANGED (at the depth captured)' 'OK' }
else {
    foreach ($d in $regDelta) {
        Write-Step "  $($d.root)" 'ERROR'
        foreach ($x in $d.added)   { Write-Step "    + $x" 'ERROR' }
        foreach ($x in $d.removed) { Write-Step "    - $x" 'ERROR' }
    }
}
Write-Step '  (only subkey NAMES one level deep are captured; a value-only change is invisible here)'

# --------------------------------------------------------- 6. processes
Write-Step ''
Write-Step '--- new processes ---'
$pb = Read-Snap $beforeDir 'processes.json'
$pa = Read-Snap $afterDir  'processes.json'
$bNames = @{}; foreach ($p in $pb.processes) { $bNames["$($p.name)|$($p.path)"] = $true }
$newProcs = @($pa.processes | Where-Object { -not $bNames.ContainsKey("$($_.name)|$($_.path)") })
Add-Finding 'processes' ($newProcs.Count -gt 0) @($newProcs | ForEach-Object {
    [ordered]@{ pid=$_.pid; name=$_.name; path=$_.path; parentPid=$_.parentPid } })
Write-Step "  $($newProcs.Count) process identity/ies present in after but not before"
foreach ($p in ($newProcs | Select-Object -First 20)) {
    Write-Step "    + $($p.name) (pid $($p.pid), parent $($p.parentPid))  $($p.path)"
}

# ----------------------------------------------------- 7. new destinations
Write-Step ''
Write-Step '--- new network destinations ---'
$sb = Read-Snap $beforeDir 'sockets.json'
$sa = Read-Snap $afterDir  'sockets.json'
function Is-Local { param($a) return ($a -in @('127.0.0.1','::1','0.0.0.0','::','')) }
$bDest = @{}
foreach ($c in $sb.connections) { if (-not (Is-Local $c.remoteAddress)) { $bDest["$($c.remoteAddress):$($c.remotePort)"] = $true } }
# pid 0 rows are TIME_WAIT / ownerless leftovers. They cannot be attributed to any
# process, so including them as "new destinations" adds noise that looks like
# evidence. Counted separately and excluded from the attributed list.
$newDest = @()
$ownerless = 0
foreach ($c in $sa.connections) {
    if (Is-Local $c.remoteAddress) { continue }
    $k = "$($c.remoteAddress):$($c.remotePort)"
    if ($bDest.ContainsKey($k)) { continue }
    if ([int]$c.pid -eq 0) { $ownerless++; continue }
    $newDest += (New-Object psobject -Property ([ordered]@{
        remote=$k; addressFamily=$c.addressFamily; pid=$c.pid
        processName=$c.processName; processPath=$c.processPath; state=$c.state }))
}
Add-Finding 'destinations' ($newDest.Count -gt 0) @($newDest | Select-Object -First $MaxListed)
Write-Step "  $($newDest.Count) new ATTRIBUTED remote destination(s)"
if ($ownerless -gt 0) {
    Write-Step "  ($ownerless further new destination(s) had pid 0 -- ownerless TIME_WAIT"
    Write-Step "   leftovers, excluded because they cannot support an attribution claim)"
}
foreach ($d in ($newDest | Select-Object -First 20)) {
    Write-Step "    -> $($d.remote)  [$($d.addressFamily)]  $($d.processName) (pid $($d.pid))"
}
Write-Step '  NOTE: a point-in-time socket table only shows connections OPEN at capture.'
Write-Step '  Short-lived connections are missed here by construction -- that is what the'
Write-Step '  pktmon capture and the live watcher are for. Absence here is NOT absence.'

# ------------------------------------------------------------- verdict
Write-Step ''
Write-Step '=== SUMMARY ==='
foreach ($k in $findings.Keys) {
    $tag = $(if ($findings[$k].changed) { 'CHANGED  ' } else { 'unchanged' })
    Write-Step ("  {0,-14} {1}" -f $k, $tag) $(if ($findings[$k].changed) { 'ERROR' } else { 'OK' })
}
Write-Step ''
if ($changedSections.Count -eq 0) {
    Write-Step 'NO CHANGES DETECTED in any captured dimension.' 'OK'
    Write-Step 'Read that carefully: it means nothing changed in what we MEASURED.'
    Write-Step 'Value-only registry writes, short-lived sockets, files above the hash cap'
    Write-Step 'and unreadable cert stores are all outside this diff.'
} else {
    Write-Step "CHANGES DETECTED in: $($changedSections -join ', ')" 'ERROR'
}

$reportPath = Join-Path $CapDir "$RunId\comparison.json"
[IO.File]::WriteAllText($reportPath, (([ordered]@{
    runId = $RunId
    beforeUtc = $mb.capturedUtc; afterUtc = $ma.capturedUtc
    changedSections = $changedSections
    findings = $findings
}) | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
Write-Step ''
Write-Step "Report: $reportPath" 'OK'
if ($Json) { Get-Content $reportPath -Raw }
