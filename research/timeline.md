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

## 2026-10-03 -- Session 2: proof-first mode, STEP 1, instrumentation hardening

| UTC | Action | Result |
|---|---|---|
| 06:35 | STEP 1: audit Steam Families + ownership across 8 local sources | **No family configured** (0 markers in `config.vdf`); 385760 absent from every cache incl. a 90-entry librarycache. `CLIENT_ACCESS_BLOCKED` |
| 06:38 | `appdetails?appids=385760` packages check | **No `packages` array, empty `package_groups`** -- delisted signature; nothing purchasable |
| 06:40 | Decided NOT to launch Steam as David | Family membership is other people's data; he can answer in 5s. Asked instead |
| 06:42 | Test pktmon loopback capability | First grep said 0 loopback hits -> nearly reported "pktmon is blind to loopback" |
| 06:44 | **Re-checked that result** | **My grep was wrong**: `-SimpleMatch` with an escaped regex searched for literal backslashes. pktmon DOES capture loopback: 7 `127.0.0.1` hits, 5 matching `.1.443`, beside 23,633 real-adapter `.443:` lines |
| 06:47 | Tried ETW `Microsoft-Windows-Kernel-Network` for PID attribution | Session started, 688 KB ETL, but `tracerpt` produced nothing. **Abandoned as a rabbit hole** -- a simpler mechanism existed |
| 06:50 | Built `capture.ps1` (pktmon wrapper, start/stop/status) | Verified behaviour + loopback caveat documented in the file |
| 06:52 | Instrumentation fix: attribution resolved per-connection by spawning powershell | **BROKEN**: ~1-5s process startup added a visible 5s stall and the connection was gone before the query ran. Every request `UNRESOLVED` -- the exact failure it was meant to prevent |
| 06:57 | Replaced with ONE long-lived poller streaming the TCP table; in-memory lookups | Negative control attributed to `powershell`, but the record landed AFTER the request |
| 07:00 | Fix: resolve **before responding** | While the request is held open the client cannot exit and its socket is in the table, so resolution is guaranteed possible. Both controls attributed |
| 07:03 | Added `clientPath` + `pathLooksLikeSteamInstall` | **Regression: everything `UNRESOLVED` again** |
| 07:06 | Dumped the actually-generated poller script | **Windows paths with single backslashes made the NDJSON invalid** (`\P`), `JSON.parse` threw, and the catch silently discarded EVERY row while the poller looked healthy |
| 07:09 | Replaced the wire format with pipe-delimited text; count + surface malformed rows and poller stderr | No escaping layers left to get wrong |
| 07:13 | Added a startup-readiness gate to `run.ps1` | **It immediately caught a flaw in my own ready signal**: ready only fired on a parsed row, but an idle listener produces none, so it could never fire. Fixed with a per-cycle `HB` heartbeat |
| 07:16 | **Final controls, both directions** | NEG: `levelB=False attributedTo=powershell path=...powershell.exe`. POS (node.exe renamed `NBA2K17.exe`): `levelB=True attributedTo=NBA2K17` **and `pathLooksLikeSteamInstall=False`**, flagging the fake |
| 07:18 | `cleanup.ps1` | `CLEANUP_VERIFIED_CLEAN`; poller self-terminated with its parent (no orphan) |
| 07:20 | **Destroyed every synthetic artifact** | Fake `NBA2K17.exe` deleted; all probe logs purged. 3 records had carried `levelBEvidence:true` from a renamed binary and must never be mistakable for real evidence. Only source-code string matches remain |
| 07:21 | Machine verified | hosts byte-exact `4E561C8E...`, 0 lab certs, 443 free, DNS `192.81.242.208`, vault empty, no pktmon filters |

### Session 2 lesson worth keeping

A process **name is not an identity**. A copy of `node.exe` renamed
`NBA2K17.exe`, sitting in a temp directory, satisfied the Level B test and wrote
`levelBEvidence: true` to disk. The gate is defined by process name, so the
record now also carries the executable path and a `pathLooksLikeSteamInstall`
flag. Had that log survived into a fixture, it would have been a fabricated
proof of the exact thing the whole project is trying to establish.

### Session 1 close

Machine is in its original state. Lab is built and verified. The feasibility gate
itself is untouched, because it requires a client that is not installed here.

**No verdict issued.** GO, PARTIAL and NO-GO-CURRENT-APPROACH all describe
observations of NBA 2K17's behavior, and zero such observations exist.

**Next action is David's:** confirm whether he owns NBA 2K17 on Steam.
