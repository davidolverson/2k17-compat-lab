<#
  cleanup.ps1 -- undo exactly what setup.ps1 recorded, and nothing else.
  Safe, idempotent, and verified afterward.

  The two rules this file exists to enforce:

    1. Remove ONLY our marker-delimited hosts block. A pre-existing user entry
       for the same hostname is left untouched, even though it looks identical
       to what we would have added.

    2. Remove ONLY certificates whose EXACT thumbprint we recorded at creation.
       Never remove a certificate because its subject name matches -- subject is
       an attacker-choosable, user-choosable, collision-prone label, not an
       identity.

  Run elevated.
#>
[CmdletBinding()]
param(
    [string]$RunId,             # clean a specific run; default = current state
    [switch]$RestoreSnapshot,   # replace hosts wholesale from the snapshot
    [switch]$SweepOrphans       # also remove certs from CRASHED runs (see below)
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

Assert-Admin
Initialize-LabDirs

$state = Read-LabState
if ($state -eq $null) {
    Write-Step 'No experiment state found. Nothing recorded, so nothing to undo.' 'WARN'
    Write-Step 'Running post-conditions anyway to prove the machine is clean.'
} elseif ($RunId -and $state.runId -ne $RunId) {
    throw "State holds runId=$($state.runId) but -RunId $RunId was requested. Refusing to guess."
}

$problems = @()

# ===========================================================================
# 1. Stop the probe -- by recorded PID, identity-checked before any kill.
# ===========================================================================
if ($state -ne $null -and $state.probe -ne $null -and $state.probe.pid) {
    $wantPid   = [int]$state.probe.pid
    $wantStart = $state.probe.startTimeUtc
    $p = Get-Process -Id $wantPid -ErrorAction SilentlyContinue
    if ($p -eq $null) {
        Write-Step "Probe pid=$wantPid already gone."
    } else {
        # A PID is recycled by Windows. A PID alone is NOT an identity.
        # Confirm name AND start time before killing anything.
        $actualStart = $null
        try { $actualStart = $p.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } catch { }
        $nameOk  = ($p.ProcessName -eq $state.probe.processName)
        $startOk = ($wantStart -eq $null -or $actualStart -eq $wantStart)
        if ($nameOk -and $startOk) {
            Write-Step "Stopping probe pid=$wantPid ($($p.ProcessName), start=$actualStart) ..."
            Stop-Process -Id $wantPid -Force
            Start-Sleep -Milliseconds 400
            Write-Step '  stopped.'
        } else {
            Write-Step "pid=$wantPid is now '$($p.ProcessName)' start=$actualStart but we recorded '$($state.probe.processName)' start=$wantStart." 'WARN'
            Write-Step '  PID was recycled. NOT killing an unrelated process.' 'WARN'
            $problems += "probe pid $wantPid recycled; not killed"
        }
    }
} else {
    Write-Step 'No probe PID recorded.'
}

# ===========================================================================
# 2. hosts -- remove ONLY our marker block (PROBLEM 1 fix).
# ===========================================================================
if ($state -ne $null -and $state.hosts -ne $null) {
    $begin = $state.hosts.beginMarker
    $end   = $state.hosts.endMarker

    if ($RestoreSnapshot) {
        # Wholesale restore is correct ONLY if the file has not changed since we
        # touched it. If it has, someone else edited hosts and a blind restore
        # would silently destroy their edit.
        $liveNow = Get-FileSha256 -Path $HostsPath
        $expected = $state.hosts.sha256AfterAdd
        if ($expected -ne $null -and $liveNow -ne $expected) {
            Write-Step 'hosts changed since setup.ps1 ran. Refusing a wholesale restore.' 'ERROR'
            Write-Step "  expected $expected" 'ERROR'
            Write-Step "  found    $liveNow" 'ERROR'
            Write-Step '  Falling back to surgical marker-block removal instead.' 'WARN'
        } else {
            $snap = $state.hosts.backupPath
            if (-not (Test-Path $snap)) { throw "Snapshot missing: $snap" }
            $snapHash = Get-FileSha256 -Path $snap
            if ($snapHash -ne $state.hosts.backupSha256) {
                throw "Snapshot integrity FAILED. recorded=$($state.hosts.backupSha256) actual=$snapHash"
            }
            Copy-Item -Path $snap -Destination $HostsPath -Force
            Write-Step "hosts restored wholesale from verified snapshot ($snapHash)."
            $RestoreSnapshot = $false   # done; skip surgical path
        }
    }

    if ($RestoreSnapshot -ne $true) {
        $lines  = @(Get-Content $HostsPath)
        $kept   = @()
        $inBlk  = $false
        $removed = 0
        foreach ($line in $lines) {
            if ($line.Trim() -eq $begin) { $inBlk = $true;  $removed++; continue }
            if ($line.Trim() -eq $end)   { $inBlk = $false; $removed++; continue }
            if ($inBlk) { $removed++; continue }
            $kept += $line
        }
        if ($inBlk) {
            Write-Step 'BEGIN marker found with no END marker. hosts left untouched.' 'ERROR'
            $problems += 'unterminated hosts marker block'
        } elseif ($removed -eq 0) {
            Write-Step 'No marker block present. hosts already clean (idempotent no-op).'
        } else {
            # Preserve the file's original BOM; a bare ASCII write strips it.
            Write-HostsLines -Path $HostsPath -Lines $kept
            Write-Step "Removed $removed line(s) belonging to run $($state.runId)."
        }

        # Prove we did not eat a pre-existing user entry.
        $pre = @($state.hosts.preExistingTargetLines)
        if ($pre.Count -gt 0) {
            $nowText = [IO.File]::ReadAllText($HostsPath)
            foreach ($p in $pre) {
                if ($nowText -notmatch [regex]::Escape($p.text.Trim())) {
                    Write-Step "PRE-EXISTING hosts line was LOST: $($p.text)" 'ERROR'
                    $problems += 'pre-existing hosts line lost'
                } else {
                    Write-Step "Pre-existing user line preserved: $($p.text)"
                }
            }
        }
    }
    ipconfig /flushdns | Out-Null
}

# ===========================================================================
# 3. Certificates -- remove ONLY our exact thumbprints (PROBLEM 2 fix).
# ===========================================================================
if ($state -ne $null -and $state.certs -ne $null) {
    $trustPath = 'Cert:\CurrentUser\Root'
    if ($state.certs.PSObject.Properties.Name -contains 'trustStorePath' -and $state.certs.trustStorePath) {
        $trustPath = $state.certs.trustStorePath
    }
    $targets = @(
        @{ Store = $trustPath;             Thumb = $state.certs.caThumbprint;   Sha = $state.certs.caSha256;   Label = 'CA (trust)' },
        @{ Store = 'Cert:\CurrentUser\My'; Thumb = $state.certs.caThumbprint;   Sha = $state.certs.caSha256;   Label = 'CA (keypair)' },
        @{ Store = 'Cert:\CurrentUser\My'; Thumb = $state.certs.leafThumbprint; Sha = $state.certs.leafSha256; Label = 'leaf' }
    )
    foreach ($t in $targets) {
        if (-not $t.Thumb) { Write-Step "$($t.Label): never created (nothing recorded)."; continue }
        $path = "$($t.Store)\$($t.Thumb)"
        $c = Get-Item $path -ErrorAction SilentlyContinue
        if ($c -eq $null) { Write-Step "$($t.Label): not present at $path (already removed)."; continue }

        # Second gate: the SHA-256 of the raw DER must match what we recorded.
        # Thumbprint is SHA-1. Checking the SHA-256 too means a thumbprint
        # collision cannot trick us into deleting a different certificate.
        $actualSha = Get-CertSha256 -Cert $c
        if ($actualSha -ne $t.Sha) {
            Write-Step "$($t.Label) at $path has sha256=$actualSha but we recorded $($t.Sha)." 'ERROR'
            Write-Step '  This is NOT our certificate. Leaving it in place.' 'ERROR'
            $problems += "$($t.Label) sha256 mismatch; not removed"
            continue
        }
        # Remove via the X509Store API, not Remove-Item.
        #
        # Remove-Item against a *Root* store fails with "The operation is on user
        # root store and UI is not allowed", so the default -TrustScope
        # CurrentUser run would have been impossible to clean up unattended.
        # X509Store.Remove() does the same job with no dialog. (Note the
        # asymmetry: ADDING to a user root store does prompt, by design --
        # granting trust is the dangerous direction, revoking it is not.)
        $removed = Remove-CertByThumbprint -StorePath $t.Store -Thumbprint $t.Thumb
        if ($removed) {
            Write-Step "$($t.Label) removed by exact thumbprint $($t.Thumb) (sha256 verified)."
        } else {
            Write-Step "$($t.Label) removal FAILED at $path" 'ERROR'
            $problems += "$($t.Label) could not be removed"
        }
    }

    # Report every subject-name lookalike we deliberately did NOT touch, and
    # separate the two very different kinds.
    #
    #   ORPHAN  -- subject carries a 12-hex runId, so WE provably generated it in
    #              some earlier run that crashed before persisting its thumbprint.
    #              Removable with -SweepOrphans.
    #   FOREIGN -- subject matches but carries no runId. Could be anything: an
    #              older tool, a different lab, a deliberate decoy. NEVER removed,
    #              no matter what flag is passed. Subject is not identity.
    $searchStores = @('Cert:\CurrentUser\Root', 'Cert:\CurrentUser\My', 'Cert:\LocalMachine\Root')
    # Dedupe by thumbprint. Windows merges LocalMachine\Root into the CurrentUser
    # view, so one certificate enumerates twice across these stores and the count
    # printed below would otherwise claim 2 certificates where only 1 exists.
    $lookalikes = @(Get-ChildItem $searchStores -ErrorAction SilentlyContinue |
        Where-Object { $_.Subject -like '*2k17-compat-lab*' } |
        Group-Object -Property Thumbprint |
        ForEach-Object { $_.Group[0] })

    $orphans = @()
    $foreign = @()
    foreach ($l in $lookalikes) {
        if ($l.Subject -match 'Local Dev CA\s+([0-9a-f]{12})\b') { $orphans += $l } else { $foreign += $l }
    }

    if ($foreign.Count -gt 0) {
        Write-Step "$($foreign.Count) certificate(s) match our subject but carry NO runId. LEFT ALONE, always:" 'WARN'
        foreach ($l in $foreign) { Write-Step "  $($l.Thumbprint) $($l.Subject)" 'WARN' }
        Write-Step '  (subject-name match is not identity; -SweepOrphans does not touch these)' 'WARN'
    }

    if ($orphans.Count -gt 0) {
        Write-Step "$($orphans.Count) ORPHAN certificate(s) from crashed run(s) -- subject carries a runId:" 'WARN'
        foreach ($l in $orphans) { Write-Step "  $($l.Thumbprint) $($l.Subject)" 'WARN' }
        if ($SweepOrphans) {
            foreach ($l in $orphans) {
                # An orphan can sit in more than one store; try each.
                foreach ($s in $searchStores) {
                    if (Get-Item "$s\$($l.Thumbprint)" -ErrorAction SilentlyContinue) {
                        Remove-CertByThumbprint -StorePath $s -Thumbprint $l.Thumbprint | Out-Null
                    }
                }
                $gone = -not [bool](Get-ChildItem $searchStores -ErrorAction SilentlyContinue |
                        Where-Object { $_.Thumbprint -eq $l.Thumbprint })
                if ($gone) { Write-Step "  swept orphan $($l.Thumbprint)" }
                else { Write-Step "  FAILED to sweep $($l.Thumbprint)" 'ERROR'; $problems += "orphan $($l.Thumbprint) not removed" }
            }
        } else {
            Write-Step '  Pass -SweepOrphans to remove these. Not done automatically.' 'WARN'
            $problems += "$($orphans.Count) orphan cert(s) left in place (use -SweepOrphans)"
        }
    }

    # Vault key material: shred the PFX and its password file.
    foreach ($f in @($state.certs.pfxPath, $state.certs.pfxPasswordPath)) {
        if ($f -and (Test-Path $f)) {
            $len = (Get-Item $f).Length
            $z = New-Object byte[] $len
            [IO.File]::WriteAllBytes($f, $z)
            Remove-Item $f -Force
            Write-Step "Vault file overwritten and deleted: $(Split-Path -Leaf $f)"
        }
    }
}

# ===========================================================================
# 4. POST-CONDITIONS -- verify, do not assume.
# ===========================================================================
Write-Step '--- post-cleanup verification ---'

$hostsLines = @(Select-String -Path $HostsPath -Pattern ([regex]::Escape($TargetHost)) -ErrorAction SilentlyContinue)
$ourMarkers = @(Select-String -Path $HostsPath -Pattern ([regex]::Escape($MarkerPrefix)) -ErrorAction SilentlyContinue)
Write-Step "hosts: lines mentioning $TargetHost = $($hostsLines.Count); lab markers = $($ourMarkers.Count)"
if ($ourMarkers.Count -gt 0) { $problems += 'lab markers still in hosts' }

$dns = $null
try { $dns = (Resolve-DnsName $TargetHost -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1).IPAddress } catch { }
Write-Step "dns: $TargetHost -> $dns"
if ($dns -eq '127.0.0.1') {
    # Loopback after cleanup is a FAILURE only if we are the reason for it.
    # If the user had their own loopback mapping before we started, preserving it
    # is the correct outcome and flagging it would be a false alarm -- the exact
    # mistake the marker-block design exists to avoid.
    $userOwnsIt = $false
    if ($state -ne $null -and $state.hosts -ne $null) {
        foreach ($p in @($state.hosts.preExistingTargetLines)) {
            if ($p.text -match '127\.0\.0\.1') { $userOwnsIt = $true }
        }
    }
    if ($userOwnsIt) {
        Write-Step '  loopback is from a PRE-EXISTING user entry we deliberately kept. Not a failure.' 'WARN'
    } else {
        $problems += 'hostname still resolves to loopback and no pre-existing user entry explains it'
    }
}

if ($state -ne $null -and $state.certs -ne $null) {
    $tp = 'Cert:\CurrentUser\Root'
    if ($state.certs.PSObject.Properties.Name -contains 'trustStorePath' -and $state.certs.trustStorePath) {
        $tp = $state.certs.trustStorePath
    }
    foreach ($pair in @(
        @{ T = $state.certs.caThumbprint;   P = "$tp\$($state.certs.caThumbprint)";                  L = 'CA in trust store' },
        @{ T = $state.certs.caThumbprint;   P = "Cert:\CurrentUser\My\$($state.certs.caThumbprint)";   L = 'CA in My' },
        @{ T = $state.certs.leafThumbprint; P = "Cert:\CurrentUser\My\$($state.certs.leafThumbprint)"; L = 'leaf in My' })) {
        if (-not $pair.T) { Write-Step "cert: $($pair.L) -- none recorded, nothing to check"; continue }
        $present = [bool](Get-Item $pair.P -ErrorAction SilentlyContinue)
        Write-Step "cert: $($pair.L) present=$present"
        if ($present) { $problems += "$($pair.L) still present" }
    }
}

$portNow = Get-PortOwner -Port 443
if ($portNow -eq $null) { Write-Step 'port: TCP 443 free.' }
else { foreach ($o in $portNow) { Write-Step "port: TCP 443 still bound pid=$($o.pid) $($o.processName)" 'WARN' } }

if ($state -ne $null) {
    $state.cleanedUpUtc = (Get-UtcStamp)
    Write-LabState $state
}

if ($problems.Count -eq 0) {
    Write-Step 'CLEANUP_VERIFIED_CLEAN' 'OK'
    exit 0
} else {
    Write-Step "CLEANUP_INCOMPLETE -- $($problems.Count) issue(s):" 'ERROR'
    foreach ($p in $problems) { Write-Step "  - $p" 'ERROR' }
    exit 1
}
