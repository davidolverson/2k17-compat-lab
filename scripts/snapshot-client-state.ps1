<#
  snapshot-client-state.ps1 -- record machine + client state WITHOUT modifying anything.

  Strictly read-only. It opens no ports, writes no hosts entry, imports no
  certificate, and starts no process. The ONLY thing it writes is its own output
  under captures\<runId>\<phase>\.

  Purpose: take a `before` snapshot, let some launcher or installer do whatever it
  does, take an `after` snapshot, then let compare-client-state.ps1 say precisely
  what changed. That answers "does it patch the exe / install a CA / edit hosts /
  spawn helpers" by observation instead of assumption.

  Reuses the existing hardened instrumentation in _common.ps1 rather than
  duplicating it (Get-FileSha256, Get-ProcessesUnderPath, Get-PortOwner, hosts
  helpers).

      .\scripts\snapshot-client-state.ps1 -Phase before -RunId b2b-test -GamePath "<dir>"
      .\scripts\snapshot-client-state.ps1 -Phase after  -RunId b2b-test -GamePath "<dir>"

  Elevation is NOT required and not requested. Some LocalMachine registry reads
  and a few process paths will be unavailable unelevated; that is recorded as
  `accessDenied` rather than silently skipped, because a quiet gap in a `before`
  snapshot becomes a false "unchanged" in the diff.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('before','after')][string]$Phase,
    [Parameter(Mandatory=$true)][string]$RunId,
    [string]$GamePath,
    # Hashing every file of a ~70 GB install takes hours. Files at or below this
    # size get a SHA-256; everything larger is recorded by size+mtime only. The
    # executables, DLLs and configs a launcher would touch are all well under it.
    [int]$HashMaxMB = 64,
    [switch]$HashEverything
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
Initialize-LabDirs

$outDir = Join-Path $CapDir "$RunId\$Phase"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Save-Json {
    param([string]$Name, $Data)
    $p = Join-Path $outDir $Name
    [IO.File]::WriteAllText($p, ($Data | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    Write-Step "  wrote $Name"
}

Write-Step "=== SNAPSHOT [$Phase] runId=$RunId ==="
Write-Step "  output: $outDir"
Write-Step '  read-only: nothing on this machine is modified by this script.'

# --------------------------------------------------------------- 1. machine
$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
Save-Json 'machine.json' ([ordered]@{
    capturedUtc = (Get-UtcStamp)
    phase       = $Phase
    runId       = $RunId
    osCaption   = $(if ($os) { $os.Caption } else { $null })
    osVersion   = $(if ($os) { $os.Version } else { $null })
    psVersion   = $PSVersionTable.PSVersion.ToString()
    elevated    = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    user        = $id.Name
})

# ----------------------------------------------------------------- 2. hosts
$hostsLines = @()
$lineNo = 0
foreach ($l in (Get-Content $HostsPath -ErrorAction SilentlyContinue)) {
    $lineNo++
    $trimmed = ([string]$l).Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $hostsLines += (New-Object psobject -Property ([ordered]@{ line = $lineNo; text = [string]$l }))
}
Save-Json 'hosts.json' ([ordered]@{
    path        = $HostsPath
    sha256      = (Get-FileSha256 -Path $HostsPath)
    sizeBytes   = (Get-Item $HostsPath -ErrorAction SilentlyContinue).Length
    lastWriteUtc= (Get-Item $HostsPath -ErrorAction SilentlyContinue).LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    activeEntries = $hostsLines      # comments stripped: a comment change is not a routing change
})

# ---------------------------------------------------- 3. certificate stores
# A launcher installing its own CA is one of the headline questions, so every
# store that could carry one is enumerated by THUMBPRINT -- subject names are not
# identities (two certs can share one).
$certStores = @('Cert:\CurrentUser\Root','Cert:\CurrentUser\My','Cert:\CurrentUser\CA',
                'Cert:\LocalMachine\Root','Cert:\LocalMachine\CA')
$certs = @()
$certErrors = @()
foreach ($s in $certStores) {
    try {
        foreach ($c in (Get-ChildItem $s -ErrorAction Stop)) {
            $certs += (New-Object psobject -Property ([ordered]@{
                store      = $s
                thumbprint = $c.Thumbprint
                subject     = $c.Subject
                issuer      = $c.Issuer
                notAfter    = $c.NotAfter.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
            }))
        }
    } catch {
        $certErrors += "$s : $($_.Exception.Message)"
    }
}
Save-Json 'certificates.json' ([ordered]@{
    stores      = $certStores
    count       = $certs.Count
    accessDenied= $certErrors        # NOT silently dropped
    certificates= $certs
})

# ------------------------------------------------------------- 4. processes
# ONE CIM query, not Get-Process + a second Get-CimInstance for parents.
#
# The two-enumeration version had a real race: short-lived processes present in
# the first pass had already exited by the second, so they landed in the snapshot
# with a NULL parentPid. Measured: 33 of 750 rows. Win32_Process returns
# ProcessId, Name, ExecutablePath and ParentProcessId together, so there is no
# window in which the two can disagree.
$procs = @()
foreach ($cp in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
    $procs += (New-Object psobject -Property ([ordered]@{
        pid       = [int]$cp.ProcessId
        name      = [string]$cp.Name
        path      = [string]$cp.ExecutablePath      # empty for protected processes
        parentPid = [int]$cp.ParentProcessId
        cmdLine   = $null                            # deliberately NOT captured: command lines routinely carry tokens and passwords
    }))
}
Save-Json 'processes.json' ([ordered]@{ count = $procs.Count; processes = $procs })

# --------------------------------------------------------------- 5. sockets
$socks = @()
foreach ($c in (Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    $pname = $null; $ppath = $null
    $op = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($op) { $pname = $op.ProcessName; try { $ppath = $op.Path } catch { } }
    $socks += (New-Object psobject -Property ([ordered]@{
        state         = $c.State.ToString()
        localAddress  = $c.LocalAddress
        localPort     = $c.LocalPort
        remoteAddress = $c.RemoteAddress
        remotePort    = $c.RemotePort
        addressFamily = $(if ($c.RemoteAddress -like '*:*' -or $c.LocalAddress -like '*:*') { 'IPv6' } else { 'IPv4' })
        pid           = $c.OwningProcess
        processName   = $pname
        processPath   = $ppath
    }))
}
Save-Json 'sockets.json' ([ordered]@{ count = $socks.Count; connections = $socks })

# -------------------------------------------------------------- 6. registry
# We cannot know in advance which key a launcher writes, so this records the
# SUBKEY NAMES one level under the vendor roots plus a few specific paths. A new
# vendor key therefore shows up in the diff even though its contents are not dumped.
$regRoots = @(
    'HKCU:\Software',
    'HKCU:\Software\Classes',
    'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options',
    'HKCU:\Software\Valve\Steam',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
)
$reg = @()
$regErrors = @()
foreach ($r in $regRoots) {
    try {
        if (-not (Test-Path $r)) { $reg += (New-Object psobject -Property ([ordered]@{ root=$r; exists=$false; subKeys=@() })); continue }
        $names = @(Get-ChildItem $r -ErrorAction Stop | ForEach-Object { $_.PSChildName } | Sort-Object)
        $reg += (New-Object psobject -Property ([ordered]@{ root=$r; exists=$true; subKeyCount=$names.Count; subKeys=$names }))
    } catch {
        $regErrors += "$r : $($_.Exception.Message)"
        $reg += (New-Object psobject -Property ([ordered]@{ root=$r; exists=$null; accessDenied=$true; subKeys=@() }))
    }
}
Save-Json 'registry.json' ([ordered]@{ roots=$regRoots; accessDenied=$regErrors; keys=$reg })

# ----------------------------------------------------- 7. client + inventory
if ($GamePath) {
    if (-not (Test-Path -LiteralPath $GamePath -PathType Container)) {
        Write-Step "GamePath not a directory: $GamePath" 'ERROR'
    } else {
        $root = (Resolve-Path -LiteralPath $GamePath).Path
        Write-Step "  inventorying $root ..."

        $all = @(Get-ChildItem -LiteralPath $root -File -Recurse -Force -ErrorAction SilentlyContinue)
        $cap = $HashMaxMB * 1MB
        $inv = @()
        $hashed = 0
        foreach ($f in $all) {
            $sha = $null
            if ($HashEverything -or $f.Length -le $cap) {
                try { $sha = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash; $hashed++ } catch { }
            }
            $inv += (New-Object psobject -Property ([ordered]@{
                rel      = $f.FullName.Substring($root.Length).TrimStart('\')
                size     = $f.Length
                mtimeUtc = $f.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
                sha256   = $sha
            }))
        }
        Write-Step "  $($all.Count) files, $hashed hashed (cap ${HashMaxMB}MB), $([math]::Round((($all | Measure-Object -Property Length -Sum).Sum)/1GB,2)) GB"

        Save-Json 'inventory.json' ([ordered]@{
            root        = $root
            fileCount   = $all.Count
            totalBytes  = ($all | Measure-Object -Property Length -Sum).Sum
            hashedCount = $hashed
            hashMaxMB   = $(if ($HashEverything) { 'all' } else { $HashMaxMB })
            files       = $inv
        })

        # Headline artifact: the main executable, fingerprinted on its own so the
        # diff can answer "was the exe patched" in one line.
        $exe = $all | Where-Object { $_.Name -match '^NBA2K17\.exe$' } | Select-Object -First 1
        if (-not $exe) {
            $exclude = 'unins|setup|install|vcredist|dxsetup|directx|redist|crash|report|launcher|BEService|BattlEye|EasyAntiCheat|social-club|helper|service|updater|benchmark'
            $exe = $all | Where-Object { $_.Extension -eq '.exe' -and $_.Name -notmatch $exclude } | Sort-Object Length -Descending | Select-Object -First 1
            if ($exe) { Write-Step "  NBA2K17.exe absent; fingerprinting best candidate: $($exe.Name)" 'WARN' }
        }
        if ($exe) {
            $peStamp = $null
            try {
                $fs2 = [IO.File]::Open($exe.FullName, 'Open', 'Read', 'ReadWrite')
                try {
                    $br = New-Object IO.BinaryReader($fs2)
                    $fs2.Position = 0x3C; $peOff = $br.ReadInt32(); $fs2.Position = $peOff
                    if ($br.ReadUInt32() -eq 0x00004550) {
                        $null = $br.ReadUInt16(); $null = $br.ReadUInt16()
                        $peStamp = ([DateTimeOffset]::FromUnixTimeSeconds($br.ReadUInt32())).UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
                    }
                } finally { $fs2.Dispose() }
            } catch { }
            $vi = $exe.VersionInfo
            $sig = $null
            try { $sig = Get-AuthenticodeSignature -LiteralPath $exe.FullName } catch { }
            Save-Json 'client.json' ([ordered]@{
                exe             = $exe.Name
                fullPath        = $exe.FullName
                sizeBytes       = $exe.Length
                sha256          = (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash
                sha1            = (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA1).Hash
                md5             = (Get-FileHash -LiteralPath $exe.FullName -Algorithm MD5).Hash
                peTimestampUtc  = $peStamp
                fileVersion     = $vi.FileVersion
                productVersion  = $vi.ProductVersion
                productName     = $vi.ProductName
                companyName     = $vi.CompanyName
                signatureStatus = $(if ($sig) { [string]$sig.Status } else { 'unchecked' })
                signerSubject   = $(if ($sig -and $sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null })
                # Provenance is recorded, never inferred. 'UNKNOWN' until something proves otherwise.
                source          = 'UNKNOWN'
            })
            Write-Step "  client exe: $($exe.Name) sha256=$((Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash)"
        } else {
            Write-Step '  no candidate executable found in GamePath' 'WARN'
        }
    }
} else {
    Write-Step '  no -GamePath given: client.json and inventory.json skipped.'
}

Write-Step "SNAPSHOT [$Phase] COMPLETE -> $outDir" 'OK'
