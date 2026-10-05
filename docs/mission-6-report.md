# Mission 6 — Public NBA 2K17 Research and Source Harvest

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Find public, independently reviewable evidence that sharpens the NBA 2K17 replacement-service architecture without importing disputed local-client observations or cross-version assumptions as facts.

## Artifacts added/updated

Added:

- `research/public-2k17-evidence.md`
- `research/public-source-catalog.json`
- `tests/public-evidence.test.js`

Updated:

- `evidence/ledger.json`
- `docs/protocol-matrix.md`
- `tests/run.js`

## Highest-value finding

The strongest Mission 6 source is a Plutonium forum post from administrator `Eldor` describing the team's prior NBA 2K17 investigation.

The post reports that 2K17 used:

- an HTTP API for most live-service tasks
- custom/binary body serialization
- a special HTTPS client certificate
- WebSockets and UDP for game traffic
- WebSockets for neighborhood/Park-like behavior
- UDP for actual matches
- locally cached files downloaded from the HTTP API

These are now tracked as `PUBLIC_2K17_SOURCE`, not `OBSERVED_2K17`.

## Material changes to the protocol matrix

### Promoted from UNKNOWN/HYPOTHESIS to public-source evidence

- HTTP API existence: MEDIUM
- binary/custom serialization existence: MEDIUM
- special HTTPS client-certificate expectation: MEDIUM
- WebSocket + UDP realtime split: MEDIUM
- Park/neighborhood likely WebSocket: MEDIUM
- match traffic likely UDP: MEDIUM
- HTTP-delivered local cache behavior: LOW–MEDIUM

### Strengthened

The primary hostname:

`nba2k17-ws.2ksports.com`

now has two independent public evidence paths:

1. a 2023 developer report from someone recreating the API;
2. a 2018-era game HOSTS list labeling the hostname under NBA 2K17.

The ledger confidence for the hostname is now HIGH.

### Replacement-project architecture evidence

Revival first-party status material separately identifies:

- Revival API
- game servers handling login, matchmaking and the game wire
- Park servers

This is high-confidence evidence about a working replacement project's architecture.

It does NOT prove the original 2K17 production service used the same topology.

## What Mission 6 did NOT find

No public source located in this mission exposed a reproducible:

- 2K17 `Session/login` request body
- 2K17 `Session/login` response body
- exact login method/path
- `VCFIELDLIST_SIZE` use in 2K17
- field CRC table
- 2K17 field type IDs
- 2K17 endian/framing proof
- exact WebSocket URL
- WebSocket message schema
- UDP match packet schema
- original service-discovery table
- original manifest schema

Therefore the Granite field-list codec remains `CROSS_VERSION_REFERENCE`.

## Source set

Mission 6 cataloged:

- 2023 Reddit replacement-service developer report
- 2023 Reverse Engineering Stack Exchange server-emulator research
- Plutonium admin 2K17 investigation notes
- THEKINGPATUBOY14 historical private-server repository
- Revival first-party site/status/release material
- Preserve first-party site/repository material
- current community reports
- historical port-forward reference
- 2018-era game HOSTS list

See:

`research/public-source-catalog.json`

## Evidence ledger additions

Added:

- E006 — HTTP API + binary/custom serialization
- E007 — special HTTPS client certificate
- E008 — WebSocket + UDP split
- E009 — HTTP-delivered client cache
- E010 — Revival API/game-wire/Park-server separation
- E011 — Revival playable mode/feature evidence
- E012 — Preserve package/client-distribution context

E001 was strengthened with independent 2018 hostname corroboration.

## Research priority after Mission 6

The public-evidence architecture now points to three distinct technical layers:

```
HTTP / live-service API
        |
        +-- login/session/profile/economy/content
        |
WebSocket world / Park layer
        |
UDP match layer
```

That means the current project ordering remains correct:

1. solve application HTTP request/response contract first;
2. identify Park bootstrap / WebSocket handoff second;
3. only then study match UDP.

## Next best research experiment

### Hypothesis

Historical public material exists that contains a real pre-shutdown NBA 2K17 HTTP request, cached response, request header set, or cache artifact.

### Variable

Public archival corpus only. No client, server, DNS, TLS or local environment changes.

### Procedure

Search for:

- old packet captures
- cached NBA 2K17 HTTP/API files
- forum uploads
- GitHub gists/repos
- archived modding threads
- old support/debug logs
- filenames/cache paths mentioned by users
- exact strings such as `VCFIELDLIST_SIZE`, `SESSION_KEY`, `Session/login`, and the known hostname

Every hit must be source-cataloged before use.

### Supporting result

One public artifact contains a reproducible byte sequence, HTTP header/path, or cache file that is clearly attributable to NBA 2K17.

### Disproving result

No independently attributable artifact is found after broad archival search; exact HTTP contract remains blocked on future authorized-client evidence.

## Mission status

`MISSION_6_COMPLETE`
