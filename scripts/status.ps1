<#
  status.ps1 -- read-only. What is currently true on this machine.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')

$state = Read-LabState

Write-Host ''
Write-Host '=== 2k17-compat-lab status ==='
Write-Host ("time (UTC)      : {0}" -f (Get-UtcStamp))

if ($state -eq $null) {
    Write-Host 'state           : NONE (setup.ps1 has never run, or state was deleted)'
} else {
    Write-Host ("runId           : {0}" -f $state.runId)
    Write-Host ("created (UTC)   : {0}" -f $state.createdUtc)
    $cu = 'ACTIVE (not cleaned up)'
    if ($state.cleanedUpUtc -ne $null) { $cu = "cleaned up $($state.cleanedUpUtc)" }
    Write-Host ("lifecycle       : {0}" -f $cu)
}

Write-Host ''
Write-Host '--- hosts ---'
$ourMarkers = @(Select-String -Path $HostsPath -Pattern ([regex]::Escape($MarkerPrefix)) -ErrorAction SilentlyContinue)
$targetLines = @(Select-String -Path $HostsPath -Pattern ([regex]::Escape($TargetHost)) -ErrorAction SilentlyContinue)
Write-Host ("live sha256     : {0}" -f (Get-FileSha256 -Path $HostsPath))
if ($state -ne $null -and $state.hosts -ne $null) {
    Write-Host ("sha256 before   : {0}" -f $state.hosts.liveSha256Before)
    Write-Host ("snapshot        : {0}" -f $state.hosts.backupPath)
    $snapOk = 'MISSING'
    if (Test-Path $state.hosts.backupPath) {
        $h = Get-FileSha256 -Path $state.hosts.backupPath
        if ($h -eq $state.hosts.backupSha256) { $snapOk = "intact ($h)" } else { $snapOk = "ALTERED (want $($state.hosts.backupSha256), got $h)" }
    }
    Write-Host ("snapshot state  : {0}" -f $snapOk)
    Write-Host ("pre-existing    : {0} user line(s) for the target host" -f @($state.hosts.preExistingTargetLines).Count)
}
Write-Host ("lab markers     : {0}" -f $ourMarkers.Count)
Write-Host ("target lines    : {0}" -f $targetLines.Count)
foreach ($l in $targetLines) { Write-Host ("  L{0}: {1}" -f $l.LineNumber, $l.Line) }

Write-Host ''
Write-Host '--- dns ---'
$ip = '(no answer)'
try { $ip = (Resolve-DnsName $TargetHost -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1).IPAddress } catch { }
Write-Host ("{0} -> {1}" -f $TargetHost, $ip)

Write-Host ''
Write-Host '--- certificates ---'
if ($state -ne $null -and $state.certs -ne $null) {
    foreach ($pair in @(
        @{ P = "Cert:\CurrentUser\Root\$($state.certs.caThumbprint)";  L = 'CA   in Root' },
        @{ P = "Cert:\CurrentUser\My\$($state.certs.caThumbprint)";    L = 'CA   in My  ' },
        @{ P = "Cert:\CurrentUser\My\$($state.certs.leafThumbprint)";  L = 'leaf in My  ' })) {
        $c = Get-Item $pair.P -ErrorAction SilentlyContinue
        if ($c) { Write-Host ("{0} : PRESENT  notAfter={1}" -f $pair.L, $c.NotAfter.ToString('yyyy-MM-dd')) }
        else    { Write-Host ("{0} : absent" -f $pair.L) }
    }
    Write-Host ("CA sha256       : {0}" -f $state.certs.caSha256)
    Write-Host ("leaf sha256     : {0}" -f $state.certs.leafSha256)
} else { Write-Host 'no certificates recorded' }
$look = @(Get-ChildItem Cert:\CurrentUser\Root, Cert:\CurrentUser\My -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like '*2k17-compat-lab*' })
Write-Host ("subject lookalikes present: {0}" -f $look.Count)

Write-Host ''
Write-Host '--- listener ---'
$owner = Get-PortOwner -Port 443
if ($owner -eq $null) { Write-Host 'TCP 443         : free' }
else { foreach ($o in $owner) { Write-Host ("TCP 443         : pid={0} {1} {2}" -f $o.pid, $o.processName, $o.localAddress) } }

Write-Host ''
Write-Host '--- probe ---'
if ($state -ne $null -and $state.probe -ne $null) {
    $p = Get-Process -Id $state.probe.pid -ErrorAction SilentlyContinue
    if ($p) { Write-Host ("pid {0}        : RUNNING ({1})" -f $state.probe.pid, $p.ProcessName) }
    else    { Write-Host ("pid {0}        : not running" -f $state.probe.pid) }
    $log = Join-Path $LogDir "probe.$($state.runId).jsonl"
    if (Test-Path $log) {
        $recs = Get-Content $log
        Write-Host ("log records     : {0}" -f $recs.Count)
        foreach ($k in 'tcp.connect','attribution','tls.established','tls.clientError','http.request') {
            $n = @($recs | Select-String -Pattern ('"kind":"' + $k + '"') -SimpleMatch).Count
            Write-Host ("  {0,-18}: {1}" -f $k, $n)
        }
        # The only number that matters for the gate.
        $lb = @($recs | Select-String -Pattern '"levelBEvidence":true' -SimpleMatch).Count
        $unres = @($recs | Select-String -Pattern '"unresolved":true' -SimpleMatch).Count
        Write-Host ("  {0,-18}: {1}" -f 'LEVEL B (game)', $lb)
        Write-Host ("  {0,-18}: {1}  (cannot support a Level B claim)" -f 'unattributed', $unres)
    } else { Write-Host 'log records     : (no log yet)' }
} else { Write-Host 'no probe recorded' }

Write-Host ''
Write-Host '--- game ---'
$manifest = 'C:\Program Files (x86)\Steam\steamapps\appmanifest_385760.acf'
if (Test-Path $manifest) {
    Write-Host 'NBA 2K17 (385760): INSTALLED'
    $exe = Get-ChildItem 'C:\Program Files (x86)\Steam\steamapps\common' -Recurse -Depth 2 -Filter 'NBA2K17.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
        Write-Host ("  exe           : {0}" -f $exe.FullName)
        Write-Host ("  sha256        : {0}" -f (Get-FileSha256 -Path $exe.FullName))
        Write-Host ("  version       : {0}" -f $exe.VersionInfo.FileVersion)
    }
    $proc = Get-Process -Name 'NBA2K17' -ErrorAction SilentlyContinue
    if ($proc) { Write-Host ("  process       : RUNNING pid={0}" -f $proc.Id) } else { Write-Host '  process       : not running' }
} else {
    Write-Host 'NBA 2K17 (385760): NOT INSTALLED  <-- the gate cannot run'
}
Write-Host ''
