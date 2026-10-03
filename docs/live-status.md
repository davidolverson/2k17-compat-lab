# Live Status

*Updated 2026-10-03 01:45 EDT*

```
CURRENT GATE:
  Phase 0 (machine audit) -- COMPLETE
  Phase 1 (unmodified baseline) -- CANNOT START

CURRENT RESULT:
  BLOCKED-PREREQUISITE

  Not NO-GO. Nothing has been learned that argues against the approach; the
  experiment simply cannot be run on this machine in its current state.
  Issuing GO / PARTIAL / NO-GO-CURRENT-APPROACH now would be fabrication --
  all three verdicts describe observations of a client that has never run here.

CONFIRMED:
  - NBA 2K17 (AppID 385760) is NOT installed. Six independent negative checks:
    no appmanifest, no common\ directory, no reference in any localconfig or
    sharedconfig, nothing in appinfo.vdf, no partial download, no Uninstall
    registry entry, no non-Steam install directory.
  - Steam account on this box is `olversond` (SteamID64 masked in tracked docs).
    Installed apps are exactly: Steamworks redist, GTA V Legacy, GTA V Enhanced.
  - NBA 2K17 is DELISTED from the Steam store. Its appdetails entry still
    returns metadata (success:true) and carries 2K's own notice that online
    servers shut down 2018-12-31. Metadata existing is not the same as being
    purchasable.
  - The probe described in the brief (2k17-probe-windows.zip / .exe) does NOT
    exist on this machine and no ZIP was supplied. Its three "known bugs" were
    therefore never code-reviewed here -- there was no code to review.
  - `nba2k17-ws.2ksports.com` still resolves: A 192.81.242.208. It has NOT been
    contacted, scanned or probed, and will not be.
  - Machine is admin-capable, PowerShell 5.1 only, one drive, 120.8 GB free.
    pktmon and netsh are available; Wireshark, openssl and Sysinternals are not.
  - A freshly written probe + script suite is BUILT and SELF-TEST VERIFIED:
    12/12 checks PASS, PROBE_SELF_TEST_PASS, and CLEANUP_VERIFIED_CLEAN with a
    byte-exact hosts restore. Details below.

UNKNOWN:
  - Whether David OWNS NBA 2K17 on Steam. This single fact decides whether the
    project can proceed at all, and it cannot be determined from this machine:
    local Steam files do not record ownership for never-installed apps, and the
    public profile games list requires login. THIS IS THE BLOCKER.
  - Every single thing about the client's actual network behavior. Which
    hostnames it contacts, whether it uses the OS resolver, whether it speaks
    TLS to 443, whether it pins, whether it demands a client certificate,
    whether it has a cached service config. All of it. No baseline exists.
  - Whether `nba2k17-ws.2ksports.com` is even the right hostname for the Steam
    build. It is a lead from 2023 community research, not an observation.

BLOCKED:
  - PREREQUISITE / ACCOUNT CONSENT: the game must be present. Installing or
    acquiring it is David's decision and his account -- exactly the
    "account/user consent" carve-out in the brief. Nothing else in the
    experiment can advance past Phase 0 until then.
  - NOT blocked on any security boundary. No pinning, mTLS or DRM obstacle has
    been encountered, because no client has run. If one appears later it will be
    recorded as BLOCKED_SECURITY_BOUNDARY with evidence, and not worked around.

LATEST EVIDENCE:
  - docs/environment-audit.md -- full Phase 0 audit, every check tagged
    FACT / INFERENCE / ASSUMPTION.
  - Three full setup -> run -> verify -> cleanup cycles executed on this machine.
    Final cycle (runId 71a9b2e1362c):
      PROBE_SELF_TEST_PASS          12/12 checks
      TLS                           TLSv1.2 / ECDHE-RSA-AES128-GCM-SHA256
      HTTP round trip               404 from https://nba2k17-ws.2ksports.com/...
      CLEANUP_VERIFIED_CLEAN        exit 0
      hosts byte-exact restore      sha256 4E561C8E... == pre-experiment value
      lab certificates remaining    0
      TCP 443                       free
      DNS                           back to 192.81.242.208
  - sanitized-fixtures/probe.66686d164ca1.sanitized.jsonl -- export pipeline
    proven on real probe output (9 records, raw fields dropped, passphrase
    absence verified).
  - THE MACHINE IS CURRENTLY IN ITS ORIGINAL STATE. No hosts entry, no trusted
    CA, no listener, no running probe.

NEXT EXPERIMENT:
  Gated on David answering one question: do you own NBA 2K17 on Steam?

  If YES -> install it (~70 GB, 120.8 GB free), then Phase 1 runs unattended:
    scripts\watch.ps1       (attribution watcher, started BEFORE the game)
    launch via Steam AppID 385760
    record every hostname / IP / port owned by the NBA2K17.exe PID
    -> research/baseline-network.md, research/service-map.md
  Only after that baseline exists does the redirect test (Phase 4/5) make sense.

  If NO -> it is delisted and cannot be bought on Steam. Resale keys exist but
  are grey-market and carry real risk (revocation, stolen-card chargebacks), so
  that is a decision to make deliberately, not a step to take automatically.
  Say the word and I will lay out the legitimate options.
```

---

## What was built while blocked

The brief's FIRST ACTIONS included fixing the probe's cleanup bugs and adding
state snapshots, port-conflict detection and sanitized logging. Those are the
only parts of the plan that do not need the game, so they are done -- and
verified against planted controls rather than asserted.

| Brief's requirement | Status | How it was proven |
|---|---|---|
| Problem 1: cleanup must not delete a pre-existing user hosts entry | **Fixed, proven** | Planted a decoy user entry for the same hostname. Before cleanup, hosts held two visually identical lines (L29 decoy, L31 ours). Cleanup removed only its own marker-delimited block and logged *"Pre-existing user line preserved"*. |
| Problem 2: cleanup must match the exact certificate, not the subject | **Fixed, proven** | Planted a CA with a byte-for-byte identical subject string in a trust store. Ours was removed by exact thumbprint with a SHA-256 double-check; the decoy was classified FOREIGN and left alone. |
| Problem 3: detect port 443 conflicts, do not kill processes | **Implemented** | setup.ps1 refuses to start if 443 is bound, names the owning PID/process/path, and explains why an alternate port is useless for this gate (the client will only talk to 443). |
| Problem 4: full rollback, exact state backups, idempotent cleanup | **Implemented, proven** | state.json records every mutation with hashes and thumbprints; cleanup ran twice in a row with the second a clean no-op; hosts restored byte-exactly including its UTF-8 BOM. |
| Secret redaction + sanitized export | **Implemented, proven** | `export-sanitized.ps1` drops raw fields and re-redacts; verified the PFX passphrase is absent from the output. |
| Baseline capture before any modification | **Script ready, cannot run** | `watch.ps1` attributes connections to the owning PID. Needs the game. |

### Defects found in my own work during that verification

Writing the scripts was not the useful part; testing them was. Five real bugs,
all found by running the thing rather than reading it:

1. **`ConvertTo-Json -Depth 12` hung at 100% CPU, forever, silently.** `Get-Content` returns strings decorated with `PSPath`/`PSDrive`/`PSProvider`; serializing one walks the cyclic `PSProvider -> Drives -> Provider` graph. Storing a raw hosts line in the state object was enough. Fixed with a `[string]` cast and a depth cap.
2. **A verifier reported PASS while doing nothing.** The secret-leak check called `ReadAllText` on the probe's stdout log, which the probe holds open. It threw, `$out` was never assigned, and `$leak` kept its initial `$false` -- so "could not read the file" rendered as "no leak found". Now reads with `FileShare.ReadWrite` and **fails** when it cannot verify. Then verified the verifier: planted a known sentinel in a locked file and confirmed detection returns True.
3. **Certificates were created before being recorded.** A kill during the trust-consent dialog left two certificates on the machine that cleanup could not see. Now state is persisted immediately after each creation, and the runId is embedded in the CA subject so a crashed run's orphans are findable.
4. **`Remove-Item` cannot delete from a Root store** -- it fails with *"the operation is on user root store and UI is not allowed"*, which would have made the **default** `-TrustScope CurrentUser` impossible to clean up unattended. Switched to the `X509Store` API, which has no such restriction. (Adding to a user root store does prompt, by design; removing does not.)
5. **An ASCII write silently stripped the hosts file's UTF-8 BOM.** Content stayed correct and Windows kept parsing it, but the file was no longer byte-identical, so "restored exactly" was a false claim. Now the original byte prefix is preserved.

Items 2 and 5 are the ones worth remembering: both produced a **green result that
was not true**. A check that cannot run must never report clean.

### One honest caveat about trust scope

`-TrustScope CurrentUser` is the default and the narrowest option, but Windows
always shows a "Security Warning" consent dialog for a user root store -- even
elevated, even non-interactively. That dialog is correct and is **not**
suppressed: trusting a CA is the machine owner's decision. Tonight's unattended
verification therefore used `-TrustScope LocalMachine`, where elevation is the
authorization and no dialog appears. Both paths are removed by exact thumbprint
at cleanup, and both were verified clean. When the real run happens, pick
deliberately: `CurrentUser` + one click, or `LocalMachine` + broader scope.
