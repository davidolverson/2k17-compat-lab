# Timeline

All times UTC. Every entry is an action actually taken, with its observed result.

## 2026-10-03 -- Session 1: Phase 0 audit, lab construction, self-test

| UTC | Action | Result |
|---|---|---|
| 04:40 | Phase 0 audit: OS, PowerShell, admin status | Win 11 Home 26200, PS 5.1 only, elevated |
| 04:41 | Steam discovery: registry, libraryfolders.vdf | One library at `C:\Program Files (x86)\Steam` |
| 04:41 | Enumerate installed apps from appmanifests | 3 apps: 228980, 271590, 3240220. **No 385760** |
| 04:42 | Search for NBA 2K17: manifest, common\, localconfig, sharedconfig, appinfo.vdf, depotcache, Uninstall registry, non-Steam dirs | **All negative.** Never installed on this machine |
| 04:43 | Search Downloads/Desktop/Documents/project roots for `*2k17*` and `*probe*` | **Zero hits.** The brief's existing probe is not on this machine |
| 04:44 | Tooling inventory | pktmon, netsh, git, gh, node, python present. Wireshark, openssl, Sysinternals absent |
| 04:45 | Network preconditions | TCP 443 free; hosts clean of 2K entries, sha256 `4E561C8E...`; `nba2k17-ws.2ksports.com` resolves A `192.81.242.208` (**not contacted**) |
| 04:47 | Steam store check for 385760 via appdetails | `success:true`, carries 2K's notice "online servers will shut down on 12/31/18". Delisted, not purchasable |
| 04:48 | Attempt to read owning account's games list | Requires login. **Ownership UNKNOWN -- the blocker** |
| 04:50 | Create `2k17-compat-lab`, git init, write `.gitignore` before any key exists | Done |
| 04:52 | Write `docs/environment-audit.md` | Done |
| 04:55 | Write probe + 7 scripts + research docs | Done; all parse clean |
| 04:54 | **Plant controls**: a decoy pre-existing user hosts line, and a decoy CA with an identical subject in a trust store | Decoys in place |
| 04:58 | First `setup.ps1` run | **HUNG at 100% CPU.** Killed at ~10 min |
| 05:05 | Bisect the hang | Cause: `ConvertTo-Json -Depth 12` on a `Get-Content` string, whose `PSProvider -> Drives -> Provider` decoration is cyclic. Fixed with `[string]` cast + depth cap |
| 05:14 | Second `setup.ps1` run | Reached the CA trust import, then **blocked on a Windows "Security Warning" consent dialog** (PID 98272) |
| 05:20 | Declined the dialog (terminated) and inspected state | CA **not** trusted (correct). But `certs recorded=False`: two certificates existed that cleanup could not see. **Orphan bug in my own ordering** |
| 05:22 | Fix: persist state immediately after each cert creation; embed runId in CA subject; add `-TrustScope` and `-SweepOrphans` | Done |
| 05:25 | Remove the two unrecorded orphans by exact thumbprint; confirm decoy survives | Orphans gone, decoy intact |
| 05:28 | `setup.ps1 -TrustScope LocalMachine` | **Complete in 6s**, no dialog |
| 05:28 | `run.ps1` | Probe up, pid recorded with start time |
| 05:28 | `verify.ps1` | `PROBE_SELF_TEST_PASS` **but 3 errors fired**, incl. a check that passed while its own code threw |
| 05:30 | Fix: `@()` around `Get-Content`; locked-file read via `FileShare.ReadWrite`; unverifiable **must fail**; report the trust store actually used | Re-run: **12/12 PASS, zero errors**, leak check reports 1660 bytes actually searched |
| 05:31 | **Verify the verifier**: plant a known sentinel in a write-locked file | Old path THREW; new path reads it and **detects the sentinel (True)**, rejects an absent value (False) |
| 05:31 | `export-sanitized.ps1` | 9 records, raw fields dropped, passphrase absence verified |
| 05:32 | `cleanup.ps1` **with decoys present** | `CLEANUP_VERIFIED_CLEAN`. Our 3-line block removed; **decoy hosts line preserved**; our CA removed by exact thumbprint + sha256; **identical-subject decoy CA left alone as FOREIGN** |
| 05:33 | `cleanup.ps1` again (idempotency) | Clean no-op, exit 0 |
| 05:34 | Remove my own decoys; compare hosts to an independent backup | Content identical but **hash mismatch**: offset 0 `0xEF` -> `0x23`, delta -3 bytes = a stripped **UTF-8 BOM** |
| 05:36 | Fix: preserve the file's original byte prefix on every hosts write | Restored hosts byte-exactly from the independent backup |
| 05:38 | Regression run | New bug: a Mandatory `[string[]]` rejects the blank lines a hosts file legitimately contains. Fixed with `AllowEmptyString`/`AllowEmptyCollection` |
| 05:39 | `cleanup.ps1` on the partial run | Recovered it completely -- validating the incremental-state fix, since the same crash shape earlier left invisible orphans |
| 05:40 | **Final full cycle**: setup -> run -> verify -> cleanup | `PROBE_SELF_TEST_PASS` 12/12; TLSv1.2 / ECDHE-RSA-AES128-GCM-SHA256; HTTP 404 round trip; `CLEANUP_VERIFIED_CLEAN`; **hosts byte-exact (`4E561C8E...`), BOM intact, 0 lab certs, 443 free, DNS back to `192.81.242.208`** |

### Session 1 close

Machine is in its original state. Lab is built and verified. The feasibility gate
itself is untouched, because it requires a client that is not installed here.

**No verdict issued.** GO, PARTIAL and NO-GO-CURRENT-APPROACH all describe
observations of NBA 2K17's behavior, and zero such observations exist.

**Next action is David's:** confirm whether he owns NBA 2K17 on Steam.
