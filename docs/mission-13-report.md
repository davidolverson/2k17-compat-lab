> **Superseded in part by Mission 14 (2026-10-05):** the active compatibility run moved from the lab probe to Granite, so use `npm run summarize:routes` rather than assuming probe JSONL. Mission 14 also records that the first richer ParkSummary experiment produced no progress, weakening H1 and moving the next observation lane to H3/H4. See `docs/mission-14-report.md`.

# Mission 13 — Persistence Proof + Park Experiment Loop

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Turn the two highest-value lanes into deterministic tooling:

1. prove UserContent persistence byte-for-byte;
2. compare Park runs before/after one controlled variable.

## Added

- `server/src/persistence/user-content-bundle.js`
- `server/src/persistence/byte-exact-store.js`
- `scripts/test-user-content-roundtrip.js`
- `scripts/diff-probe-summaries.js`
- `scripts/record-park-experiment.js`
- `scripts/run-p0-validation.ps1`
- `server/park-experiment.example.json`
- persistence, probe-diff, and Park-ledger regression tests

## UserContent evidence handling

The parser knows two structural bundle markers with explicit provenance:

- `BNH!` — `USER_REPORTED_MODIFIED_CLIENT_OBSERVATION`
- `BNH"` — `CROSS_VERSION_REFERENCE`

Neither marker promotes protocol semantics.

The parser reads only:

- marker offset;
- little-endian declared payload length;
- exact total bundle length;
- completeness;
- trailing-byte count.

It does not interpret save contents.

## Byte-exact persistence gate

Run:

```
npm run roundtrip:user-content -- <captured-upload.bin>
```

The gate:

1. extracts the structurally recognized bundle;
2. hashes it;
3. writes bytes + metadata atomically;
4. creates a new storage instance to simulate reopen/restart;
5. reads the bytes back;
6. verifies exact byte equality;
7. verifies SHA-256 equality.

Success marker:

```
USER_CONTENT_ROUNDTRIP_PASS
```

This proves the local storage mechanism. It does **not** prove the game can later download and consume the stored object; that remains the next integration gate.

## Probe before/after diff

First summarize each run:

```
npm run summarize:routes -- before.jsonl before.summary.json
npm run summarize:routes -- after.jsonl after.summary.json
```

Then:

```
npm run diff:probe -- before.summary.json after.summary.json park.diff.json
```

The diff identifies:

- new routes;
- disappeared routes;
- count deltas;
- newly observed body lengths;
- newly used response labels;
- fallback-response deltas;
- truncation deltas.

It explicitly does not assign causality.

## One-variable Park ledger

Copy:

```
server/park-experiment.example.json
```

and edit exactly one `variable` dimension.

Then:

```
npm run record:park-experiment -- experiment.json before.summary.json after.summary.json
```

The recorder rejects specs that try to change multiple variable fields.

Supported hypotheses:

- H1 — response-data deficiency;
- H2 — missing service-directory entry;
- H3 — lobby-state dependency;
- H4 — relay-state dependency;
- H5 — multiple dependencies.

Supported outcomes:

- `ADVANCED`
- `REGRESSED`
- `NEW_REQUEST`
- `NEW_SOCKET`
- `DISTINCT_ERROR`
- `NO_CHANGE`
- `INCONCLUSIVE`

## One-command evidence-processing wrapper

The wrapper performs no game launching, Steam actions, hosts edits, certificate changes, or network contact.

Example:

```powershell
.\scripts\run-p0-validation.ps1 \
  -UserContentUpload "C:\path\to\captured-upload.bin" \
  -ProbeLogBefore "C:\path\to\before.jsonl" \
  -ProbeLogAfter "C:\path\to\after.jsonl" \
  -ParkSpec "C:\path\to\park-experiment.json"
```

Outputs remain under ignored local capture directories.

## Next integration gates

### Persistence
After byte-exact storage passes, prove:

```
client upload
-> store
-> server restart
-> client list/download
-> returned SHA-256 equals stored SHA-256
-> client accepts returned object
```

### Park
The first richer ParkSummary experiment produced no loading progress. Mission 14 records this as evidence that **weakens H1** rather than fully disproving it.

The next observation lanes are H3 (Steam lobby lifecycle) and H4 (relay state), with H2 kept open. Do not build a relay/world component until observation points there.

## Security boundary

This mission does not acquire a client, bypass ownership/DRM, bypass authentication, alter anti-cheat or executable-integrity logic, or contact live 2K infrastructure.

## Mission status

`MISSION_13_IMPLEMENTED_AWAITING_INTEGRATED_CI_AND_LOCAL_EVIDENCE_RUN`
