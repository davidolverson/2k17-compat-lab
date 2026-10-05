# Parallel Missions 8–12

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

The project is now executing the next workstreams in parallel instead of waiting for each research layer to finish before preparing the next one.

The critical rule remains:

> Infrastructure may be built ahead of evidence. Protocol claims may not.

---

# Mission 8 — Historical cache structural analyzer

**Status:** IMPLEMENTED

Added:

- `server/src/artifact/structural-analyzer.js`
- `scripts/analyze-cache-artifact.js`
- `tests/artifact-analysis.test.js`

Capabilities:

- streaming SHA-256
- coarse entropy windows
- gzip signature detection
- zlib-candidate detection
- ZIP / 7z / XZ signature detection
- protocol-relevant ASCII strings with offsets
- strict cross-version field-list candidate probing
- no mutation of the artifact
- no raw artifact data in the JSON report
- no automatic evidence promotion

Command:

```
npm run analyze:artifact -- <authorized-artifact>
```

Default reports stay in the gitignored local capture tree.

A strict reference-codec match is reported only as:

`CROSS_VERSION_REFERENCE_CANDIDATE`

It is not proof of 2K17 framing.

---

# Mission 9 — Real historical artifact analysis + version diff

**Status:** TOOLING READY / DATA BLOCKED

No authorized historical `SYNC.BIN` has been supplied to this branch.

Therefore no real artifact result exists yet.

Prepared in parallel:

- metadata-only artifact hashing
- structural analysis
- report-to-report comparison
- shared/changed magic markers
- shared/changed protocol strings
- entropy-window comparison
- reference-codec candidate count comparison

Added:

- `server/src/artifact/compare-structure.js`
- `scripts/compare-cache-analysis.js`

Workflow when one artifact exists:

```
npm run hash:artifact -- SYNC.BIN AUTHORIZED "source description"
npm run analyze:artifact -- SYNC.BIN
```

Workflow when two historical versions exist:

```
npm run analyze:artifact -- SYNC-A.BIN report-a.json
npm run analyze:artifact -- SYNC-B.BIN report-b.json
npm run compare:artifact -- report-a.json report-b.json comparison.json
```

Blocked datum:

`AUTHORIZED_HISTORICAL_SYNC_BIN`

No attempt is made to substitute an unverified third-party game distribution.

---

# Mission 10 — HTTP/session reconstruction workstream

**Status:** ANALYSIS PIPELINE IMPLEMENTED / REAL CONTRACT BLOCKED

Added:

- `server/src/protocol/request-analyzer.js`
- `scripts/analyze-request-capture.js`

The pipeline can take a locally preserved raw HTTP request body plus its capture metadata and produce:

- method/path metadata
- body byte size
- SHA-256
- gzip/zlib detection
- strict cross-version codec compatibility result
- zero automatic protocol promotions

Command:

```
npm run analyze:request -- <request-metadata.json> <request-body.bin>
```

Existing Mission 4 response profiles remain test-only.

Still blocked on evidence:

- exact 2K17 login route
- method
- body framing
- field IDs
- response fields
- session-key semantics
- service table
- manifest schema

No fake login response is being introduced to solve those unknowns.

---

# Mission 11 — Park / WebSocket workstream

**Status:** GENERIC CAPTURE HARNESS IMPLEMENTED / 2K17 ENDPOINT UNKNOWN

Added:

- `server/src/realtime/websocket-capture.js`
- `scripts/start-websocket-capture.js`
- `server/realtime.websocket.example.json`
- `tests/realtime.test.js`

Capabilities:

- generic RFC6455 upgrade handling
- safe default: upgrade rejection unless explicitly enabled
- handshake metadata capture
- sensitive upgrade-header redaction
- masked client-frame parsing
- opcode / FIN / length / SHA-256 capture
- payload delivered only to local callback
- no 2K17 message semantics
- no guessed endpoint

Safe default:

```json
{
  "host": "127.0.0.1",
  "port": 0,
  "acceptUpgrades": false
}
```

The harness is ready for a future authorized observation without presuming the Park URL or frame schema.

---

# Mission 12 — Match / UDP workstream

**Status:** GENERIC CAPTURE HARNESS IMPLEMENTED / 2K17 PORT & PACKETS UNKNOWN

Added:

- `server/src/realtime/udp-capture.js`
- `scripts/start-udp-capture.js`
- `server/realtime.udp.example.json`

Capabilities:

- loopback-default UDP listener
- IPv4 or IPv6
- configurable ephemeral or fixed local port
- datagram length
- SHA-256
- source/destination metadata
- optional raw-local datagram storage
- no automatic response packets
- no packet-format assumptions

Safe default:

```json
{
  "host": "127.0.0.1",
  "port": 0,
  "family": "udp4",
  "rawDir": "server/captures/udp-raw-local"
}
```

The harness is intentionally passive.

---

# What is now parallelized

```
                 PUBLIC / HISTORICAL EVIDENCE
                          |
          +---------------+---------------+
          |               |               |
          v               v               v
    SYNC.BIN          HTTP requests    realtime evidence
       |                  |               |
       v                  v          +----+----+
 structural          request/body     |         |
 analysis            analysis         v         v
       |                  |           WS        UDP
       v                  v        capture    capture
 version diff        response          |         |
                  experiments          |         |
                       |               |         |
                       +-------+-------+---------+
                               |
                               v
                        protocol promotion
                         only after review
```

Nothing waits for another layer merely to prepare tools.

What still must wait for actual evidence is interpretation.

---

# Parallel blockers

## Mission 8

No blocker for tooling.

Real result requires a legitimately sourced historical artifact.

## Mission 9

Blocked on at least one authorized historical `SYNC.BIN`.

Two versions are preferable for differential analysis.

## Mission 10

Blocked on a genuine authorized-client HTTP request or an attributable historical request/cache artifact.

## Mission 11

Blocked on a genuine Park/WebSocket endpoint and handshake observation.

## Mission 12

Blocked on a genuine match UDP destination/packet observation.

---

# Do not collapse these blockers

A result from one layer cannot be silently used to invent another.

Examples:

- finding `Session` inside `SYNC.BIN` would not prove the live HTTP route;
- a WebSocket handshake would not establish UDP packet framing;
- a UDP packet would not establish matchmaking/session semantics;
- a reference-codec match would not establish 2K17 field names;
- Revival architecture does not establish stock 2K17 endpoints.

---

# Current engineering position

The repository is now prepared to ingest evidence from all four useful fronts simultaneously:

1. historical cache artifacts,
2. HTTP application requests,
3. WebSocket/Park traffic,
4. UDP/match traffic.

The next actual protocol promotion should come from whichever front produces attributable evidence first.
