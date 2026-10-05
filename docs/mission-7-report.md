# Mission 7 — Historical Cache Artifact Hunt

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Search public archival material for a concrete pre-shutdown NBA 2K17 client-side artifact that could preserve server-delivered state.

## Main result

`SYNC.BIN` is now the project's highest-value historical cache-artifact candidate.

Multiple public sources from the NBA 2K17 era associate it with:

- `Steam/userdata/<id>/385760/local`
- creation/update near startup before menus
- server-backed data retrieval/recovery
- official roster/update data
- default content consumed by the client
- historical modding workflows that edited or replaced the file

No source found in this mission reveals the internal `SYNC.BIN` format.

## Evidence added

### E013

Contemporary Steam reports place `SYNC.BIN` under app 385760 `local` and say it is written around startup.

Class:

`PUBLIC_2K17_SOURCE`

Confidence:

`MEDIUM_HIGH`

### E014

A contemporary Steam support thread reports a server-backed redownload after removing 385760 remote data.

Class:

`PUBLIC_2K17_SOURCE`

Confidence:

`MEDIUM`

### E015

Historical roster/update documentation distinguishes:

- `local/SYNC.BIN`
- `remote/Roster0001`
- `remote/RosterDescriptions`

and describes legitimate copies as receiving roster/update data through the game servers.

Class:

`PUBLIC_2K17_SOURCE`

Confidence:

`MEDIUM`

### E016

Historical modding pages show `SYNC.BIN` affecting default/content data and list a 2K17 tutorial specifically about preventing official `SYNC.BIN` updates.

Class:

`PUBLIC_2K17_SOURCE`

Confidence:

`MEDIUM`

## Important non-claims

Mission 7 does NOT establish:

- `SYNC.BIN` is a raw HTTP response
- `SYNC.BIN` uses Granite VcFieldList framing
- one canonical `SYNC.BIN` size
- one canonical `SYNC.BIN` hash
- exact compression/container format
- exact route that supplied the file
- whether all of the file comes from one 2K service

Those remain unknown.

## New metadata-only artifact workflow

Added:

- `evidence/schemas/cache-artifact-metadata-v1.schema.json`
- `scripts/hash-cache-artifact.js`
- `tests/cache-artifact.test.js`

The hasher records only:

- basename
- byte size
- SHA-256
- source description
- authorization status
- modification timestamp
- `contentCommitted: false`

It does not copy or serialize artifact contents.

Usage:

```
npm run hash:artifact -- <file> AUTHORIZED "source description"
```

or:

```
npm run hash:artifact -- <file> UNVERIFIED "source description"
```

This keeps large/copyrighted historical cache files out of Git while still making independently obtained artifacts comparable by hash and size.

## Protocol-matrix impact

The `HTTP-delivered cache/content` row now identifies `SYNC.BIN` as the strongest concrete historical cache candidate.

A separate `Historical cache artifact: SYNC.BIN` row was added.

The relationship:

```
HTTP API
   ↓
SYNC.BIN
```

remains a **hypothesis** rather than a proven wire mapping.

The evidence currently proves only that:

- the HTTP API reportedly caches files locally;
- `SYNC.BIN` is a major server/update-related local artifact.

Connecting those two with byte-level certainty requires an authorized historical artifact or packet/cache correlation.

## Test status

Mission 7 adds four cache-artifact tests:

- metadata-only output
- authorization-label validation
- Mission 7 ledger boundary checks
- no decoded-format overclaim

GitHub Actions will run the full combined suite on the branch.

## Next best experiment

### Hypothesis

A legitimately sourced historical `SYNC.BIN` will contain stable structural markers that narrow the server-content format even without any live server traffic.

### Single variable

The artifact under inspection.

No client execution, network redirection, TLS changes, or server response changes.

### Procedure

On a legitimately obtained historical `SYNC.BIN`:

1. record SHA-256 and exact size;
2. perform read-only file-type/signature inspection;
3. measure entropy in coarse regions;
4. look for standard compression/archive magic;
5. extract only protocol-relevant printable strings and offsets;
6. test whether the existing cross-version parser recognizes any aligned regions without relaxing its rules;
7. keep raw bytes local and commit only metadata/structural findings.

### Supporting result

The same recognizable framing/compression/string structures appear deterministically and can be described without guessing.

### Disproving result

The artifact is opaque/high-entropy with no stable standard framing or attributable structures, leaving the HTTP cache format unresolved.

## Mission status

`MISSION_7_COMPLETE`
