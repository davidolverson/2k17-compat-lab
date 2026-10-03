<#
  capture.ps1 -- packet-level record that runs in PARALLEL with watch.ps1 and the
  probe, so no connection goes unrecorded.

  WHY THIS EXISTS
  ---------------
  watch.ps1 POLLS the OS connection table. A connection that opens and closes
  inside one poll interval has no owner by the next tick, so polling alone can
  lose a hit entirely. Three layers now cover that:

    1. the probe   -- cannot miss a connection TO ITSELF; it is the endpoint,
                      and it resolves the owning PID at the instant `connection`
                      fires (socket still ESTABLISHED, no race).
    2. pktmon      -- an independent packet record that does not depend on any
                      polling interval or on our code being correct.
    3. watch.ps1   -- continuous view of everything NBA2K17.exe talks to,
                      including destinations that never reach us at all.

  Use all three. Layer 2 is what proves a connection HAPPENED even if our own
  instrumentation were wrong, which is the only reason a negative result is
  trustworthy.

  VERIFIED BEHAVIOUR ON THIS MACHINE (2026-10-03)
  -----------------------------------------------
  pktmon DOES capture 127.0.0.1 loopback on this box. Measured: 5 deliberate
  loopback connections to 127.0.0.1:443 produced 5 matching entries
  (`127.0.0.1.63849 > 127.0.0.1.443` etc.) alongside 23,633 real-adapter `.443:`
  lines. So it is useful for BOTH the Phase 4 baseline (real remote traffic) and
  the Phase 5 redirect test (loopback).

  Caveat, stated honestly: loopback coverage was PARTIAL -- only a handful of
  packets per connection surfaced, several tagged `Drop:` by pktmon's own
  classifier. Treat pktmon on loopback as corroborating evidence that a
  connection occurred, NOT as a complete byte-level record. The probe's own log
  is the complete record of what reached us.

  Run elevated.
#>
[CmdletBinding()]
param(
    [ValidateSet('start','stop','status')][string]$Action = 'start',
    [int[]]$Ports = @(443),
    [int]$PacketSize = 256,
    [switch]$KeepFilters
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
Assert-Admin
Initialize-LabDirs

$state = Read-LabState
$runId = 'nostate'
if ($state -ne $null) { $runId = $state.runId }
$etl = Join-Path $CapDir "baseline.$runId.etl"
$txt = Join-Path $CapDir "baseline.$runId.txt"

switch ($Action) {

  'start' {
    Write-Step 'Clearing any pre-existing pktmon filters ...'
    pktmon filter remove 2>&1 | Out-Null

    foreach ($p in $Ports) {
        pktmon filter add "lab$p" -p $p 2>&1 | Out-Null
        Write-Step "  filter: TCP/UDP port $p"
    }

    if (Test-Path $etl) {
        $bak = "$etl.prev"
        Move-Item $etl $bak -Force
        Write-Step "Existing capture moved to $(Split-Path -Leaf $bak)"
    }

    Write-Step "Starting pktmon capture -> $etl"
    pktmon start --capture --pkt-size $PacketSize -f $etl 2>&1 | Select-Object -First 6 | ForEach-Object { Write-Step "  $_" }

    Write-Step ''
    Write-Step 'CAPTURING. Now, in this order:' 'WARN'
    Write-Step '  1. scripts\watch.ps1   (separate window)' 'WARN'
    Write-Step '  2. launch NBA 2K17     (steam://rungameid/385760)' 'WARN'
    Write-Step '  3. trigger ONE server-dependent action, note the UTC time' 'WARN'
    Write-Step '  4. scripts\capture.ps1 -Action stop' 'WARN'
  }

  'stop' {
    Write-Step 'Stopping pktmon ...'
    pktmon stop 2>&1 | Select-Object -First 8 | ForEach-Object { Write-Step "  $_" }

    if (-not (Test-Path $etl)) {
        Write-Step "No capture file at $etl" 'ERROR'
        return
    }
    Write-Step "Capture: $etl ($([math]::Round((Get-Item $etl).Length/1MB,2)) MB)"

    Write-Step 'Converting to text ...'
    pktmon etl2txt $etl -o $txt 2>&1 | Select-Object -First 4 | ForEach-Object { Write-Step "  $_" }

    if (Test-Path $txt) {
        $lines = @(Get-Content $txt)
        Write-Step "  $($lines.Count) line(s)"

        # NOTE for anyone extending this: pass these as REGEX, never with
        # -SimpleMatch. An escaped pattern plus -SimpleMatch searches for the
        # literal backslashes and silently returns zero -- which is exactly how
        # this lab briefly "proved" pktmon could not see loopback at all.
        $loop   = @($lines | Select-String -Pattern '127\.0\.0\.1').Count
        $p443   = @($lines | Select-String -Pattern '\.443[:\s]').Count
        Write-Step "  lines mentioning 127.0.0.1 : $loop"
        Write-Step "  lines mentioning port 443  : $p443"

        if ($p443 -eq 0) {
            Write-Step '  WARNING: zero port-443 lines. Either nothing talked to 443, or the' 'WARN'
            Write-Step '  filter did not apply. Verify with a known-good connection before' 'WARN'
            Write-Step '  treating this as evidence of absence.' 'WARN'
        }
    }

    if (-not $KeepFilters) {
        pktmon filter remove 2>&1 | Out-Null
        Write-Step 'pktmon filters removed.'
    }
  }

  'status' {
    Write-Step '--- pktmon filters ---'
    pktmon filter list 2>&1 | Select-Object -First 12 | ForEach-Object { Write-Step "  $_" }
    Write-Step '--- capture files ---'
    Get-ChildItem $CapDir -Filter '*.etl' -ErrorAction SilentlyContinue |
        ForEach-Object { Write-Step ("  {0}  {1} MB" -f $_.Name, [math]::Round($_.Length/1MB,2)) }
  }
}
