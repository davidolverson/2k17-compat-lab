<#
  verify.ps1 -- prove OUR HALF works, end to end, before a game is ever involved.

  Emits PROBE_SELF_TEST_PASS only if every check passes.

  Read this line before quoting that marker as progress:
  PROBE_SELF_TEST_PASS says our DNS override, listener, certificate chain and
  HTTP logging work. It says NOTHING about NBA 2K17. A synthetic client reaching
  the probe is explicitly a FALSE POSITIVE for the real gate -- only traffic
  attributable to NBA2K17.exe counts for that.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')

$state = Read-LabState
if ($state -eq $null) { throw 'No state. Run scripts\setup.ps1 first.' }

$checks = @()
function Add-Check {
    param([string]$Name, [bool]$Pass, [string]$Detail)
    $script:checks += (New-Object psobject -Property ([ordered]@{ name = $Name; pass = $Pass; detail = $Detail }))
    $tag = 'FAIL'
    if ($Pass) { $tag = 'PASS' }
    Write-Step ("{0}  {1,-28} {2}" -f $tag, $Name, $Detail) $(if ($Pass) { 'OK' } else { 'ERROR' })
}

Write-Step "--- PROBE SELF-TEST (runId=$($state.runId)) ---"

# 1. DNS override active
$ip = $null
try { $ip = (Resolve-DnsName $TargetHost -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1).IPAddress } catch { }
Add-Check 'dns.resolves.loopback' ($ip -eq '127.0.0.1') "$TargetHost -> $ip (want 127.0.0.1)"

# 2. Listener bound
$port = 443
if ($state.listener -ne $null) { $port = [int]$state.listener.port }
$owner = @(Get-PortOwner -Port $port)
# @().Count, not ($owner -ne $null). Once the probe began binding BOTH 127.0.0.1
# and ::1, Get-PortOwner returned two rows, and `-ne $null` on an array evaluates
# to the filtered ARRAY rather than a boolean -- which threw on the [bool]
# parameter and, because the throw skipped Add-Check entirely, left the suite
# printing PROBE_SELF_TEST_PASS with one check silently missing.
$bound = ($owner.Count -gt 0)
$ownerDesc = 'nothing bound'
if ($bound) { $ownerDesc = (($owner | ForEach-Object { "$($_.localAddress) pid=$($_.pid) $($_.processName)" }) -join ' | ') }
Add-Check 'tcp.listener.bound' $bound "port $port : $ownerDesc"

# Both address families must be listening, because setup.ps1 maps the hostname to
# 127.0.0.1 AND ::1. If only one is bound, an IPv6-preferring client would find
# nothing and we would mis-read that as "the client made no attempt".
$v4 = @($owner | Where-Object { $_.localAddress -eq '127.0.0.1' }).Count -gt 0
$v6 = @($owner | Where-Object { $_.localAddress -eq '::1' }).Count -gt 0
Add-Check 'tcp.listener.ipv4' $v4 '127.0.0.1:443'
Add-Check 'tcp.listener.ipv6' $v6 '[::1]:443'

# 3. Listener is OUR probe, not something that grabbed the port after setup
$isOurs = $false
if ($bound -and $state.probe -ne $null) {
    foreach ($o in $owner) { if ([int]$o.pid -eq [int]$state.probe.pid) { $isOurs = $true } }
}
Add-Check 'tcp.listener.is.probe' $isOurs "recorded probe pid=$(if($state.probe){$state.probe.pid}else{'none'})"

# 4. Certificate present, correct SAN, chains to our CA
$leaf = Get-Item "Cert:\CurrentUser\My\$($state.certs.leafThumbprint)" -ErrorAction SilentlyContinue
Add-Check 'cert.leaf.present' ([bool]$leaf) "thumbprint $($state.certs.leafThumbprint)"

$sanOk = $false
$sanText = 'no SAN extension'
if ($leaf) {
    $sanExt = $leaf.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' }
    if ($sanExt) {
        $sanText = $sanExt.Format($false)
        $sanOk = ($sanText -match [regex]::Escape($TargetHost))
    }
}
Add-Check 'cert.leaf.dns.san' $sanOk $sanText

$caOk = $false
if ($leaf) { $caOk = ($leaf.Issuer -eq $state.certs.caSubject) }
Add-Check 'cert.leaf.issued.by.ca' $caOk "issuer=$(if($leaf){$leaf.Issuer}else{'n/a'})"

# Report the store we ACTUALLY imported into. Hardcoding CurrentUser\Root here
# printed a confident wrong fact when -TrustScope LocalMachine was used: the
# check passed only because Windows merges machine roots into the user view.
$trustPath = 'Cert:\CurrentUser\Root'
if ($state.certs.PSObject.Properties.Name -contains 'trustStorePath' -and $state.certs.trustStorePath) {
    $trustPath = $state.certs.trustStorePath
}
$caTrusted = [bool](Get-Item "$trustPath\$($state.certs.caThumbprint)" -ErrorAction SilentlyContinue)
Add-Check 'cert.ca.trusted' $caTrusted "$trustPath\$($state.certs.caThumbprint)"

# 5. Chain actually builds under Windows' own validator (not our opinion of it)
$chainOk = $false
$chainDetail = 'not evaluated'
if ($leaf) {
    $chain = New-Object Security.Cryptography.X509Certificates.X509Chain
    $chain.ChainPolicy.RevocationMode = 'NoCheck'
    $chainOk = $chain.Build($leaf)
    if ($chainOk) { $chainDetail = "built, $($chain.ChainElements.Count) element(s)" }
    else { $chainDetail = (($chain.ChainStatus | ForEach-Object { $_.Status }) -join ', ') }
}
Add-Check 'cert.chain.builds' $chainOk $chainDetail

# 6. Real TLS handshake + HTTPS request through the real hostname.
#    Uses .NET so Windows' own Schannel-equivalent trust decision is exercised,
#    which is far closer to what the game will do than a curl with -k.
$logBefore = 0
$probeLog = (Join-Path $LogDir "probe.$($state.runId).jsonl")
# @() is required: a single-line file makes Get-Content return a scalar string,
# which has no .Count, and StrictMode turns that into a terminating error.
if (Test-Path $probeLog) { $logBefore = @(Get-Content $probeLog).Count }

$tlsOk = $false; $tlsDetail = 'not attempted'
$httpOk = $false; $httpDetail = 'not attempted'
if ($bound) {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $probePath = "/__selftest/$($state.runId)"
        $req = [Net.HttpWebRequest]::Create("https://$TargetHost$probePath")
        $req.Method = 'GET'
        $req.Timeout = 8000
        $req.UserAgent = '2k17-compat-lab-selftest'
        $resp = $null
        try   { $resp = $req.GetResponse() }
        catch [Net.WebException] {
            # A 404 is a SUCCESSFUL round trip -- default response is 404 by design.
            if ($_.Exception.Response -ne $null) { $resp = $_.Exception.Response }
            else { throw }
        }
        $tlsOk = $true
        $code = [int]$resp.StatusCode
        $tlsDetail = 'handshake completed, cert accepted by .NET validator'
        $httpDetail = "HTTP $code from https://$TargetHost$probePath"
        $httpOk = $true
        $resp.Close()
    } catch {
        $tlsDetail = $_.Exception.Message
        if ($_.Exception.InnerException) { $tlsDetail += " / inner: $($_.Exception.InnerException.Message)" }
    }
}
Add-Check 'tls.established.selftest' $tlsOk $tlsDetail
Add-Check 'http.roundtrip.selftest' $httpOk $httpDetail

# 7. Request was actually LOGGED. An unlogged request is a blind instrument.
$logged = $false
$logDetail = 'probe log missing'
if (Test-Path $probeLog) {
    $after = @(Get-Content $probeLog)
    $logDetail = "$($after.Count) record(s), was $logBefore"
    $logged = ($after.Count -gt $logBefore)
    if ($logged) {
        $hit = $after | Select-String -Pattern '__selftest' -SimpleMatch
        if ($hit) { $logDetail += '; selftest path present in log' }
        else { $logged = $false; $logDetail += '; but selftest path NOT in log' }
    }
}
Add-Check 'probe.logged.request' $logged $logDetail

# 8. Secrets never written to the probe's console log.
#
# This check previously reported PASS while silently doing nothing: the probe
# holds an open write handle on its own stdout log, ReadAllText threw a sharing
# violation, $out was never assigned, and $leak kept its initial $false -- so
# "could not read the file" rendered as "no leak found".
#
# A verifier that cannot inspect its target must FAIL, never pass. "Unverified"
# and "clean" are different answers and only one of them is safe to report.
function Read-LockedFile {
    param([string]$Path)
    # FileShare ReadWrite|Delete so an open writer does not block us.
    $fs = New-Object IO.FileStream($Path, [IO.FileMode]::Open,
            [IO.FileAccess]::Read,
            ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
        $sr = New-Object IO.StreamReader($fs)
        try { return $sr.ReadToEnd() } finally { $sr.Dispose() }
    } finally { $fs.Dispose() }
}

$leakVerified = $false   # did the check actually run?
$leak         = $false   # did it find something?
$leakDetail   = 'no probe stdout log recorded'

if ($state.probe -ne $null -and $state.probe.stdoutPath -and (Test-Path $state.probe.stdoutPath)) {
    $pwFile = $state.certs.pfxPasswordPath
    if (-not ($pwFile -and (Test-Path $pwFile))) {
        $leakDetail = 'UNVERIFIABLE: passphrase file absent, nothing to search for'
    } else {
        try {
            $pw  = (Read-LockedFile -Path $pwFile).Trim()
            $out = Read-LockedFile -Path $state.probe.stdoutPath
            if ([string]::IsNullOrEmpty($pw)) {
                $leakDetail = 'UNVERIFIABLE: passphrase file empty'
            } else {
                $leak = $out.Contains($pw)
                $leakVerified = $true
                $leakDetail = "searched $($out.Length) bytes of stdout; passphrase present=$leak"
            }
        } catch {
            $leakDetail = "UNVERIFIABLE: $($_.Exception.Message)"
        }
    }
}
Add-Check 'no.secret.in.stdout' ($leakVerified -and -not $leak) $leakDetail

# --- verdict ---------------------------------------------------------------
#
# A check that THREW never reaches Add-Check, so it leaves no record and the
# verdict below would see zero failures and declare PASS. That is exactly how this
# suite printed PROBE_SELF_TEST_PASS while `tcp.listener.bound` was erroring out.
# So the count of checks that actually ran is itself asserted: if any are missing,
# the suite fails and says which number is wrong.
$EXPECTED_CHECKS = 14
$failed = @($checks | Where-Object { -not $_.pass })

if ($checks.Count -ne $EXPECTED_CHECKS) {
    Write-Step '---'
    Write-Step "PROBE_SELF_TEST_FAIL -- only $($checks.Count) of $EXPECTED_CHECKS checks recorded." 'ERROR'
    Write-Step 'A check threw before registering a result. Scroll up for the exception.' 'ERROR'
    Write-Step 'An unrecorded check is NOT a passing check.' 'ERROR'
    Write-Step "  recorded: $(($checks | ForEach-Object { $_.name }) -join ', ')" 'ERROR'
    exit 1
}

Write-Step '---'
if ($failed.Count -eq 0) {
    Write-Step 'PROBE_SELF_TEST_PASS' 'OK'
    Write-Step 'Our half works. This is NOT evidence about NBA 2K17 -- a synthetic'
    Write-Step 'client reaching the probe is an explicit false positive for the gate.'
    exit 0
} else {
    Write-Step "PROBE_SELF_TEST_FAIL -- $($failed.Count) of $($checks.Count) check(s) failed:" 'ERROR'
    foreach ($f in $failed) { Write-Step "  - $($f.name): $($f.detail)" 'ERROR' }
    exit 1
}
