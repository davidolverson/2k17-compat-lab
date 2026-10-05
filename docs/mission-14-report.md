# Mission 14 — Granite Telemetry + Return Proof + Park Red-Team Corrections

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Why Mission 14 exists

Mission 13 had a real integration flaw: its route summarizer consumed the old probe JSONL format while the active compatibility run had moved to Granite text logs.

That meant the tools could produce technically valid summaries of **stale telemetry**.

Mission 14 fixes that failure mode.

## Added

- `scripts/summarize-granite-log.js`
- `scripts/summarize-route-log.js`
- `scripts/verify-user-content-return.js`
- `scripts/summarize-steam-lobby-log.js`
- regression tests for all four paths
- Granite-aware `scripts/run-p0-validation.ps1`

## Route telemetry

Use:

```
npm run summarize:routes -- <log> [output.json]
```

The tool auto-detects:

- probe JSONL;
- Granite text logs.

Granite summaries intentionally leave unavailable values unknown rather than fabricating them:

- no process attribution claim;
- no body hash unless logged elsewhere;
- no handler/fallback classification unless Granite logs it.

## UserContent return proof

Local storage persistence is not the same thing as a working download path.

Use:

```
npm run verify:user-content-return -- upload.bin returned.bin
```

The verifier extracts the supported bundle from each file and compares exact bytes and SHA-256.

A pass proves byte preservation only.

It does **not** prove that the game accepted/applied the returned save; that still requires an observed client state restoration.

## Steam lobby observation

Use:

```
npm run summarize:steam-lobby -- STEAM_LOG.txt
```

The parser counts lobby-related call names including:

- RequestLobbyList
- CreateLobby
- JoinLobby
- LeaveLobby
- GetLobbyByIndex
- GetLobbyData
- GetNumLobbyMembers
- lobby ownership/data/chat calls

This is an H3 observation tool only. It does not modify Steam matchmaking behavior.

## Red-team corrections

### Correction 1 — telemetry source
Old Mission 13 Park summaries were probe-specific. Active Granite runs must use the unified route summarizer.

### Correction 2 — H1 wording
One richer ParkSummary response produced no loading progress. That weakens H1 but does not logically eliminate all response-data deficiencies.

### Correction 3 — persistence wording
A byte-identical stored UserContent upload that survives server restart does not prove:

- the download route works;
- the client accepts returned data;
- full MyCareer progression is server-persistent.

### Correction 4 — observation before implementation
Do not start building Opal/relay/world infrastructure merely because related strings or cross-version components exist.

Observe H3/H4 first.

## Mission status

`MISSION_14_IMPLEMENTED_AWAITING_INTEGRATED_CI_AND_NEXT_LOCAL_OBSERVATION`
