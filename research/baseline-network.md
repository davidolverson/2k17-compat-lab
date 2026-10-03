# Baseline Network Observations (Phase 1)

**Status: NOT STARTED. NBA 2K17 is not installed on this machine.**

This file stays empty until the unmodified client has been observed. That
ordering is deliberate and is the single most important methodological choice in
the whole plan: if the redirect is attempted first and nothing arrives, we cannot
distinguish between

- the hostname being wrong,
- the client never attempting any network call,
- TLS rejecting our certificate,
- the client not using the OS resolver,
- a cached service configuration, or
- our own redirect breaking the flow.

Capturing the untouched client first collapses that ambiguity to one unknown.

---

## Procedure when the game is installed

1. Start `scripts\watch.ps1` **first**, in its own window. It polls the OS
   connection table and attributes every connection to its owning PID.
2. Start `pktmon` scoped as tightly as possible (Wireshark is not installed and
   does not need to be):
   ```
   pktmon filter remove
   pktmon filter add -p 443
   pktmon start --capture --pkt-size 256 -f captures\baseline.etl
   ```
3. Launch through Steam so ownership and DRM are handled normally:
   `steam://rungameid/385760`
4. Record the `NBA2K17.exe` PID, SHA-256 and file version into
   `docs/environment-audit.md`.
5. Drive ONE server-dependent action, and nothing else. Note the exact UTC time
   it was triggered.
6. Stop the capture. `pktmon stop`.

**Passive only.** No traffic is decrypted, no destination is probed, no
production 2K endpoint is contacted beyond whatever the game does by itself.

---

## Observation table (to fill)

| UTC | in-game action | hostname | IP | port | proto | PID | confidence |
|---|---|---|---|---|---|---|---|
| -- | -- | -- | -- | -- | -- | -- | -- |

Confidence: `CONFIRMED` (PID-attributed here) / `PROBABLE` / `HYPOTHESIS`.

A row with no PID is not an observation about the game. It is an observation
about the machine.

---

## The question this baseline must answer first

Does `NBA2K17.exe` resolve and contact `nba2k17-ws.2ksports.com` at all?

If yes, the redirect test is worth running. If it contacts something else, the
service map changes and the brief's lead hostname was simply wrong for this
build. If it attempts no network call at all, the whole replacement-backend
premise needs rethinking before any more tooling is written.
