<#
  setup.ps1 -- perform every machine mutation the experiment needs, and record
  each one precisely enough that cleanup.ps1 can undo exactly that and nothing
  else.

  Order matters: snapshot BEFORE mutate, and persist the snapshot to disk before
  the mutation runs. If this script dies halfway, cleanup.ps1 still has a
  complete record of whatever did happen.

  Run elevated.
#>
[CmdletBinding()]
param(
    [int]$Port = 443,
    [switch]$Force,                                   # stack onto un-cleaned state
    [ValidateSet('CurrentUser','LocalMachine')]
    [string]$TrustScope = 'CurrentUser'
)

<#
  TrustScope -- read this before changing the default.

  CurrentUser (default): narrowest possible trust. Windows ALWAYS shows a
    "Security Warning" consent dialog for a user root store, even when elevated,
    even non-interactively. That dialog is correct and is NOT suppressed here:
    trusting a CA is the machine owner's decision, not this script's. The run
    will block until someone clicks Yes. If nobody does, the CA is never trusted
    and the experiment stops -- which is the right failure.

  LocalMachine: no dialog, because elevation IS the authorization. Broader scope
    (every user on the box). Use when the import must run unattended. Still
    removed by exact thumbprint at cleanup, and cleanup verifies removal.

  Neither option patches, weakens or bypasses certificate validation anywhere.
#>

$trustStoreName     = 'Root'
$trustStoreLocation = $TrustScope
$trustStorePath     = "Cert:\$TrustScope\Root"

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

Assert-Admin
Initialize-LabDirs

$existing = Read-LabState
if ($existing -ne $null -and $existing.cleanedUpUtc -eq $null -and -not $Force) {
    Write-Step "A prior run ($($existing.runId)) is still active and was never cleaned up." 'ERROR'
    Write-Step "Run scripts\cleanup.ps1 first, or pass -Force to deliberately stack a second run." 'ERROR'
    throw 'Refusing to stack experiment state.'
}

$state = New-LabState
Write-Step "runId=$($state.runId)"

# ===========================================================================
# PROBLEM 3 -- port conflict detection. Detect, identify, report. Never kill.
# ===========================================================================
Write-Step "Checking TCP $Port ..."
$owner = Get-PortOwner -Port $Port
if ($owner -ne $null) {
    Write-Step "TCP $Port is ALREADY BOUND. Not touching the owning process." 'ERROR'
    foreach ($o in $owner) {
        Write-Step "  pid=$($o.pid) process=$($o.processName) addr=$($o.localAddress) path=$($o.processPath)" 'ERROR'
    }
    Write-Step "A 2K17 client will connect to 443 and nothing else, so an alternate port is NOT" 'ERROR'
    Write-Step "a usable fallback for the real-client gate. Free 443 by stopping that service" 'ERROR'
    Write-Step "yourself, then re-run. Candidates that commonly hold 443: IIS (W3SVC), Docker" 'ERROR'
    Write-Step "Desktop, VMware, BranchCache, or an http.sys reservation." 'ERROR'
    throw "TCP $Port unavailable."
}
Write-Step "TCP $Port is free."
$state.listener = New-Object psobject -Property ([ordered]@{
    port         = $Port
    address      = '127.0.0.1'
    verifiedFree = (Get-UtcStamp)
})

# ===========================================================================
# PROBLEM 1 -- exact hosts snapshot BEFORE any edit.
# ===========================================================================
Write-Step "Snapshotting hosts file ..."
$hostsBefore     = Join-Path $VaultDir "hosts.before.$($state.runId)"
Copy-Item -Path $HostsPath -Destination $hostsBefore -Force
$hostsBeforeHash = Get-FileSha256 -Path $hostsBefore

# Record the exact pre-existing lines that mention our hostname. If any exist,
# they are the user's, not ours, and cleanup must leave them alone.
$preExisting = @()
$lineNo = 0
foreach ($line in (Get-Content $HostsPath)) {
    $lineNo++
    if ($line -match [regex]::Escape($TargetHost)) {
        # [string] cast is load-bearing, not cosmetic. Get-Content emits strings
        # decorated with PSPath/PSDrive/PSProvider. ConvertTo-Json at any real
        # depth follows PSProvider -> Drives -> Provider, which is CYCLIC, and
        # spins at 100% CPU forever. Storing a raw Get-Content line in the state
        # object hangs Write-LabState with no error and no output.
        $preExisting += (New-Object psobject -Property ([ordered]@{ lineNumber = $lineNo; text = [string]$line }))
    }
}

$state.hosts = New-Object psobject -Property ([ordered]@{
    path             = $HostsPath
    backupPath       = $hostsBefore
    backupSha256     = $hostsBeforeHash
    liveSha256Before = (Get-FileSha256 -Path $HostsPath)
    lineCountBefore  = (Get-Content $HostsPath).Count
    lastWriteUtcBefore = ((Get-Item $HostsPath).LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ssZ'))
    preExistingTargetLines = $preExisting
    beginMarker      = "$MarkerPrefix BEGIN $($state.runId)"
    endMarker        = "$MarkerPrefix END $($state.runId)"
    entryAddedUtc    = $null
    sha256AfterAdd   = $null
})
Write-LabState $state   # persist the snapshot BEFORE mutating

if ($preExisting.Count -gt 0) {
    Write-Step "hosts already contains $($preExisting.Count) line(s) for $TargetHost -- these are PRE-EXISTING and will NOT be removed by cleanup:" 'WARN'
    foreach ($p in $preExisting) { Write-Step "  L$($p.lineNumber): $($p.text)" 'WARN' }
    Write-Step "Note: an earlier pre-existing mapping may shadow ours depending on order." 'WARN'
} else {
    Write-Step "hosts has no pre-existing $TargetHost entry. (sha256=$hostsBeforeHash)"
}

# ===========================================================================
# Certificates -- generate our own CA and leaf. Record EXACT identifiers.
# ===========================================================================
Write-Step "Baselining $trustStorePath thumbprints that share our CA subject ..."

# The runId goes INSIDE the subject. Two reasons:
#  - A crashed run leaves orphan certificates. Thumbprint is the only safe
#    identity, but a crash can lose the thumbprint before it is persisted, which
#    would make the orphan unrecoverable. A runId in the subject makes it
#    findable again without ever weakening the thumbprint rule.
#  - It keeps a generic-subject lookalike (another tool, an older run, a decoy)
#    clearly distinguishable from this specific run.
$caSubject = "CN=2k17-compat-lab Local Dev CA $($state.runId), O=2k17-compat-lab"

$rootBaseline = @(Get-ChildItem $trustStorePath -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -like '*2k17-compat-lab*' } |
    ForEach-Object { $_.Thumbprint })
Write-Step "  pre-existing lookalikes in $($trustStoreName): $($rootBaseline.Count)"

Write-Step "Generating local CA (RSA 2048, SHA256, 90 days) ..."
$ca = New-SelfSignedCertificate `
    -Subject $caSubject `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddDays(90) `
    -CertStoreLocation Cert:\CurrentUser\My `
    -TextExtension @('2.5.29.19={text}CA=true&pathlength=0')
$caSha = Get-CertSha256 -Cert $ca
Write-Step "  CA thumbprint=$($ca.Thumbprint)"
Write-Step "  CA sha256=$caSha"

# PERSIST IMMEDIATELY. Anything that exists on the machine but is not yet in
# state.json is an orphan that cleanup cannot see. The gap between "created" and
# "recorded" must be as close to zero as possible, because the very next step
# (trust import) can block on a consent dialog for an unbounded time.
$state.certs = New-Object psobject -Property ([ordered]@{
    trustScope         = $TrustScope
    trustStorePath     = $trustStorePath
    caSubject          = $caSubject
    caThumbprint       = $ca.Thumbprint
    caSha256           = $caSha
    caNotAfter         = $ca.NotAfter.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    caStores           = @('Cert:\CurrentUser\My')
    caTrustImported    = $false
    leafSubject        = $null
    leafThumbprint     = $null
    leafSha256         = $null
    leafDnsSan         = @($TargetHost)
    leafStores         = @()
    pfxPath            = $null
    pfxPasswordPath    = $null
    rootLookalikesBeforeImport = $rootBaseline
    importedUtc        = $null
})
Write-LabState $state

Write-Step "Generating leaf for $TargetHost signed by our CA ..."
$leaf = New-SelfSignedCertificate `
    -Subject "CN=$TargetHost" `
    -DnsName $TargetHost `
    -Signer $ca `
    -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddDays(90) `
    -CertStoreLocation Cert:\CurrentUser\My `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.1')
$leafSha = Get-CertSha256 -Cert $leaf
Write-Step "  leaf thumbprint=$($leaf.Thumbprint)"
Write-Step "  leaf sha256=$leafSha"

$state.certs.leafSubject    = "CN=$TargetHost"
$state.certs.leafThumbprint = $leaf.Thumbprint
$state.certs.leafSha256     = $leafSha
$state.certs.leafStores     = @('Cert:\CurrentUser\My')
Write-LabState $state   # again: record before the next blocking step

# Trust ONLY our CA. The PUBLIC certificate is imported; the CA private key
# never enters a trust store.
Write-Step "Importing CA into $trustStorePath ..."
if ($TrustScope -eq 'CurrentUser') {
    Write-Step ''  'WARN'
    Write-Step 'ACTION NEEDED:' 'WARN'
    Write-Step '  Windows is about to show a "Security Warning" dialog asking whether to' 'WARN'
    Write-Step '  install this root certificate. Click YES to continue.' 'WARN'
    Write-Step "  Expected thumbprint in the dialog: $($ca.Thumbprint)" 'WARN'
    Write-Step '  This script will block until you answer. That prompt is deliberate --' 'WARN'
    Write-Step '  trusting a CA is your decision, and it is not suppressed here.' 'WARN'
    Write-Step '  Declining is a valid answer: the experiment stops, nothing is trusted.' 'WARN'
    Write-Step ''  'WARN'
}
$rootStore = New-Object Security.Cryptography.X509Certificates.X509Store($trustStoreName, $trustStoreLocation)
$rootStore.Open('ReadWrite')
try {
    $pub = New-Object Security.Cryptography.X509Certificates.X509Certificate2(,$ca.RawData)
    $rootStore.Add($pub)
} finally { $rootStore.Close() }

$importedRoot = Get-Item "$trustStorePath\$($ca.Thumbprint)" -ErrorAction SilentlyContinue
if ($importedRoot -eq $null) { throw "CA import into $trustStorePath could not be verified (consent declined?)." }
Write-Step '  verified present in the trust store by thumbprint.'
$state.certs.caTrustImported = $true
$state.certs.caStores = @('Cert:\CurrentUser\My', $trustStorePath)
Write-LabState $state

# Export the leaf (with key) to the vault so node can serve TLS without openssl.
# Record the paths BEFORE writing the files, so a crash mid-export still leaves
# cleanup able to find and shred whatever landed.
$pfxPath = Join-Path $VaultDir "leaf.$($state.runId).pfx"
$pwPath  = Join-Path $VaultDir "leaf.$($state.runId).pfxpw"
$state.certs.pfxPath         = $pfxPath
$state.certs.pfxPasswordPath = $pwPath
Write-LabState $state

$bytes   = New-Object byte[] 32
$rng     = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$pwPlain = [Convert]::ToBase64String($bytes)
# The password is never echoed, never piped, never put in a command line.
# WriteAllText (no BOM, no CRLF) so node can read it with a plain trim.
[IO.File]::WriteAllText($pwPath, $pwPlain, (New-Object Text.UTF8Encoding($false)))
$pwSecure = ConvertTo-SecureString -String $pwPlain -Force -AsPlainText
Export-PfxCertificate -Cert $leaf -FilePath $pfxPath -Password $pwSecure -ChainOption BuildChain | Out-Null
Remove-Variable pwPlain, pwSecure, bytes -ErrorAction SilentlyContinue
Write-Step "  leaf exported to vault (outside the repo)."

$state.certs.importedUtc = (Get-UtcStamp)
Write-LabState $state

# ===========================================================================
# hosts entry -- marker-delimited block. Narrowest possible redirect.
# ===========================================================================
Write-Step "Adding marker-delimited hosts block for $TargetHost ..."
$block = @(
    $state.hosts.beginMarker,
    "127.0.0.1`t$TargetHost",
    $state.hosts.endMarker
)
# CRLF + ASCII body, but the file's existing BOM (if any) is preserved -- see
# Write-HostsLines. A plain ASCII write silently drops a UTF-8 BOM, which makes
# any later byte-exact restore check fail for a reason unrelated to our edit.
$existingLines = @(Get-Content $HostsPath)
Write-HostsLines -Path $HostsPath -Lines ($existingLines + $block)

$state.hosts.entryAddedUtc  = (Get-UtcStamp)
$state.hosts.sha256AfterAdd = (Get-FileSha256 -Path $HostsPath)
Write-LabState $state
Write-Step "  hosts sha256 after add = $($state.hosts.sha256AfterAdd)"

ipconfig /flushdns | Out-Null
Write-Step "DNS cache flushed."

# ===========================================================================
# Probe config -- the probe never guesses a path or a password location.
# ===========================================================================
$probeCfg = [ordered]@{
    runId             = $state.runId
    address           = '127.0.0.1'
    port              = $Port
    pfxPath           = $pfxPath
    pfxPasswordPath   = $pwPath
    logPath           = (Join-Path $LogDir "probe.$($state.runId).jsonl")
    responsesPath     = (Join-Path $RepoRoot 'probe\responses.json')
    maxBodyBytes      = 65536
}
$cfgPath = Join-Path $StateDir 'probe-config.json'
[IO.File]::WriteAllText($cfgPath, (($probeCfg | ConvertTo-Json -Depth 6)), (New-Object Text.UTF8Encoding($false)))
Write-Step "Probe config written: $cfgPath"

Write-Step "SETUP COMPLETE. runId=$($state.runId)"
Write-Step "Next: scripts\run.ps1   then   scripts\verify.ps1"
