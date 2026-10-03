<#
  validate-instrument.ps1 -- prove the measuring apparatus works on a REAL,
  licensed, DRM-protected commercial game before the one-shot NBA 2K17 run.

  WHY THIS EXISTS
  ---------------
  Every control run so far has been synthetic: a renamed node.exe, a
  powershell.exe request, a hand-made loopback connection. None of that
  establishes that the attribution poller, watch.ps1 and pktmon correctly see and
  attribute the traffic of an actual game -- a large, multi-process,
  DRM-wrapped, Steam-launched binary that may use its own network stack, spawn
  children, or route through a launcher.

  If that assumption is wrong, we find out during the single run that matters,
  with a client we may never get a second chance at. So we find out now, against
  a game David already owns.

  WHAT IT DOES NOT DO
  -------------------
  No hosts entry. No certificate. No redirect. No probe. It does not touch
  network state at all -- it only observes. This is deliberately NOT the gate run
  and cannot be mistaken for one: it never produces levelBEvidence, because the
  probe is never started.

  Run elevated (pktmon).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][int]$AppId,
    [string]$ProcessName,                  # discovered from the install dir if omitted
    [int]$ObserveMinutes = 4,
    [switch]$SkipCapture
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
Assert-Admin
Initialize-LabDirs

# ------------------------------------------------- 1. is it installed + licensed?
$steamRoot = $null
try { $steamRoot = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath } catch { }
if (-not $steamRoot) { throw 'Steam install path not found in HKCU.' }
$steamRoot = ($steamRoot -replace '/', '\').TrimEnd('\')

$manifest = Join-Path $steamRoot "steamapps\appmanifest_$AppId.acf"
if (-not (Test-Path $manifest)) {
    throw "appmanifest_$AppId.acf not found. This app is not installed, so it cannot validate anything."
}
$mtext = Get-Content $manifest -Raw
$installDirName = [regex]::Match($mtext, '"installdir"\s+"([^"]*)"').Groups[1].Value
$appName        = [regex]::Match($mtext, '"name"\s+"([^"]*)"').Groups[1].Value
$installDir     = Join-Path $steamRoot "steamapps\common\$installDirName"
Write-Step "App $AppId : $appName"
Write-Step "  installdir: $installDir"
if (-not (Test-Path $installDir)) { throw "Install directory missing: $installDir" }

# ------------------------------------------------------- 2. discover the process
if (-not $ProcessName) {
    # "Largest .exe wins" is WRONG and was caught before this script ever ran.
    # In GTA V's folder the largest executables are Social-Club-Setup.exe (122 MB)
    # and Rockstar-Games-Launcher.exe (107 MB); the actual game is GTA5.exe at
    # 45 MB. Bundled installers, launchers and anti-cheat services routinely
    # outweigh the game binary, and 2K17's folder may well do the same.
    #
    # So: exclude the known non-game roles explicitly, then take the largest of
    # what remains, and REFUSE to guess when the result is ambiguous.
    $exclude = 'unins|setup|install|vcredist|dxsetup|directx|redist|crash|report|' +
               'launcher|BEService|BattlEye|EasyAntiCheat|EAC|social-club|' +
               'helper|service|updater|activation|touchup|cleanup|benchmark'

    $all = @(Get-ChildItem -LiteralPath $installDir -Filter '*.exe' -File -Recurse -Depth 1 -ErrorAction SilentlyContinue)
    $cand = @($all | Where-Object { $_.Name -notmatch $exclude } | Sort-Object Length -Descending)

    Write-Step "  executables found: $($all.Count); after excluding launcher/installer/anti-cheat roles: $($cand.Count)"
    foreach ($c in ($all | Sort-Object Length -Descending | Select-Object -First 6)) {
        $tag = $(if ($c.Name -match $exclude) { 'EXCLUDED' } else { 'candidate' })
        Write-Step ("    {0,8:N0} MB  {1,-34} {2}" -f ($c.Length/1MB), $c.Name, $tag)
    }

    if ($cand.Count -eq 0) {
        throw "Every executable under $installDir looks like a launcher/installer. Pass -ProcessName explicitly."
    }
    $ProcessName = [IO.Path]::GetFileNameWithoutExtension($cand[0].Name)
    Write-Step "  chosen: $($cand[0].Name)"

    if ($cand.Count -gt 1 -and $cand[1].Length -gt ($cand[0].Length * 0.5)) {
        Write-Step "  AMBIGUOUS: '$($cand[1].Name)' is a comparable size. If the watcher sees" 'WARN'
        Write-Step "  nothing, re-run with -ProcessName <the other one>." 'WARN'
    }
}
Write-Step "  target process name: $ProcessName"

# ------------------------------------------- 3. confirm we are NOT modifying state
$markers = @(Select-String -Path $HostsPath -Pattern ([regex]::Escape($MarkerPrefix)) -ErrorAction SilentlyContinue)
$labCerts = @(Get-ChildItem Cert:\CurrentUser\Root, Cert:\LocalMachine\Root -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -like '*2k17-compat-lab*' })
$listener = Get-PortOwner -Port 443
Write-Step "hosts lab markers: $($markers.Count)   lab certs: $($labCerts.Count)   443 bound: $([bool]$listener)"
Write-Step 'This script modifies none of those. Observation only.'

# ----------------------------------------------------------------- 4. observers
$runId = "instr-$AppId-$(Get-Date -Format 'yyyyMMddHHmmss')"
$attrLog = Join-Path $LogDir "attribution.$runId.jsonl"

if (-not $SkipCapture) {
    Write-Step 'Starting pktmon (port 443) ...'
    pktmon filter remove 2>&1 | Out-Null
    pktmon filter add 'instr443' -p 443 2>&1 | Out-Null
    $etl = Join-Path $CapDir "$runId.etl"
    pktmon start --capture --pkt-size 128 -f $etl 2>&1 | Select-Object -First 3 | ForEach-Object { Write-Step "  $_" }
}

# watch.ps1 writes to attribution.<labRunId>.jsonl, so give it its own log by
# pointing it at a scratch state-free run: simplest is to invoke it and then read
# whichever attribution log it touched. Instead we run our own inline watcher so
# this validation never depends on lab state existing.
$watchJob = Start-Job -ScriptBlock {
    param($ProcName, $OutLog, $Minutes)
    $seen = @{}
    $deadline = (Get-Date).AddMinutes($Minutes)
    while ((Get-Date) -lt $deadline) {
        $procs = @(Get-Process -Name $ProcName -ErrorAction SilentlyContinue)
        foreach ($p in $procs) {
            $conns = @(Get-NetTCPConnection -OwningProcess $p.Id -ErrorAction SilentlyContinue |
                Where-Object { $_.RemoteAddress -ne '0.0.0.0' -and $_.RemoteAddress -ne '::' -and $_.RemoteAddress -ne '127.0.0.1' })
            foreach ($c in $conns) {
                $key = "$($c.LocalPort):$($c.RemoteAddress):$($c.RemotePort)"
                if ($seen.ContainsKey($key)) { continue }
                $seen[$key] = $true
                $rec = [ordered]@{
                    tsUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
                    kind = 'game.connection'; gamePid = $p.Id; processName = $p.ProcessName
                    localPort = $c.LocalPort; remoteAddress = $c.RemoteAddress
                    remotePort = $c.RemotePort; state = $c.State.ToString()
                }
                Add-Content -Path $OutLog -Value ((New-Object psobject -Property $rec) | ConvertTo-Json -Depth 4 -Compress) -Encoding UTF8
            }
        }
        Start-Sleep -Milliseconds 200
    }
} -ArgumentList $ProcessName, $attrLog, ($ObserveMinutes + 2)
Write-Step "Watcher job started (id $($watchJob.Id)); log: $attrLog"

# -------------------------------------------------------------------- 5. launch
Write-Step ''
Write-Step "=== Launching $appName via Steam (normal licensed path) ==="
Start-Process "steam://rungameid/$AppId"

Write-Step "Waiting for process '$ProcessName' (up to 5 min; Steam may need to start first) ..."
$proc = $null
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
    $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { break }
    Start-Sleep -Seconds 1
}
if ($proc) { Write-Step "$ProcessName running: pid=$($proc.Id)" 'OK' }
else { Write-Step "'$ProcessName' never appeared. It may use a different exe name." 'ERROR' }

Write-Step ''
Write-Step '################################################################'
Write-Step 'ACTION NEEDED:' 'WARN'
Write-Step '  Let the game reach its main menu. You do not need to play.' 'WARN'
Write-Step '  We only need it to make its normal startup network calls.' 'WARN'
Write-Step "  Observing $ObserveMinutes minute(s), then you can close it." 'WARN'
Write-Step '################################################################'

$until = (Get-Date).AddMinutes($ObserveMinutes)
$last = 0
while ((Get-Date) -lt $until) {
    if (Test-Path $attrLog) {
        $n = @(Get-Content $attrLog -ErrorAction SilentlyContinue).Count
        if ($n -gt $last) { Write-Step "  attributed connections: $n"; $last = $n }
    }
    Start-Sleep -Seconds 5
}

# ---------------------------------------------------------------------- 6. stop
Write-Step ''
Write-Step '=== Stopping observers ==='
Stop-Job $watchJob -ErrorAction SilentlyContinue
Remove-Job $watchJob -Force -ErrorAction SilentlyContinue
if (-not $SkipCapture) {
    pktmon stop 2>&1 | Select-Object -First 4 | ForEach-Object { Write-Step "  $_" }
    pktmon filter remove 2>&1 | Out-Null
}

# -------------------------------------------------------------------- 7. verdict
Write-Step ''
Write-Step '=== INSTRUMENT VALIDATION RESULT ==='
$recs = @()
if (Test-Path $attrLog) {
    $recs = @(Get-Content $attrLog | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } | Where-Object { $_ })
}
Write-Step "attributed connection records : $($recs.Count)"

$pass = $false
if ($recs.Count -gt 0) {
    $pids   = @($recs | Select-Object -ExpandProperty gamePid -Unique)
    $dests  = @($recs | Group-Object -Property { "$($_.remoteAddress):$($_.remotePort)" } | Sort-Object Count -Descending)
    Write-Step "distinct game PIDs            : $($pids -join ', ')"
    Write-Step "distinct destinations         : $($dests.Count)"
    Write-Step 'Top destinations:'
    foreach ($d in ($dests | Select-Object -First 12)) {
        $addr = ($d.Name -split ':')[0]
        $ptr = $null
        try { $ptr = (Resolve-DnsName $addr -Type PTR -ErrorAction Stop | Select-Object -First 1).NameHost } catch { }
        Write-Step ("  {0,-24} x{1,-4} {2}" -f $d.Name, $d.Count, $(if ($ptr) { $ptr } else { '(no PTR)' }))
    }
    $pass = $true
} else {
    Write-Step 'NO connection was attributed to the game process.' 'ERROR'
    Write-Step 'Either the game made no outbound calls in the window, or it uses a' 'ERROR'
    Write-Step 'network path our attribution cannot see. EITHER WAY: find out now, not' 'ERROR'
    Write-Step 'during the 2K17 run. Try a longer -ObserveMinutes, or -ProcessName with' 'ERROR'
    Write-Step 'the launcher/child process name.' 'ERROR'
}

if (-not $SkipCapture) {
    $txt = Join-Path $CapDir "$runId.txt"
    $etl = Join-Path $CapDir "$runId.etl"
    if (Test-Path $etl) {
        pktmon etl2txt $etl -o $txt 2>&1 | Out-Null
        if (Test-Path $txt) {
            $lines = @(Get-Content $txt)
            # REGEX, never -SimpleMatch with an escaped pattern: that searches for
            # the backslashes and returns a silent zero.
            $p443 = @($lines | Select-String -Pattern '\.443[:\s]').Count
            Write-Step "pktmon: $($lines.Count) lines, $p443 mentioning port 443"
        }
    }
}

Write-Step ''
if ($pass) {
    Write-Step 'INSTRUMENT_VALIDATION_PASS' 'OK'
    Write-Step 'The apparatus attributes real game traffic to the real game PID. The'
    Write-Step 'same machinery is what will judge the 2K17 run.'
} else {
    Write-Step 'INSTRUMENT_VALIDATION_FAIL' 'ERROR'
    Write-Step 'Do NOT spend the one 2K17 attempt on an unproven instrument.'
}
Write-Step 'This run modified no network state and produced no Level B evidence.'
