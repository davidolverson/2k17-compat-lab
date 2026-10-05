# M001 — Baseline audit, Park ledger and endpoint audit

*Written 2026-10-05 ~06:00 EDT from the offline evidence lane. Times below are UTC unless marked.*

## How to read this

Two sessions were working M001 at the same time. A live-investigation session
owned the running game, the running server and the `granite-2k17` working tree.
This document comes from the other lane: it only **read** the runtime's capture
directory, log and source, and it never contacted the server, the game process,
or wrote into the runtime tree.

Every statement is tagged:

- **OBSERVED** — in a 2K17 capture or attributable runtime evidence cited here.
- **DERIVED** — mechanically reproducible from an observed value (command given).
- **REFERENCE** — comes from 2K19/Granite or another title; a lead only.
- **HYPOTHESIS** — plausible, not evidenced.
- **REPORTED** — stated by the live-investigation session; not re-verified here.

HTTP 200 is never treated as "implemented".

## Tools added (all under `tools/m001/`)

| Command | Purpose |
|---|---|
| `node tools/m001/regress.js --granite <granite-2k17>` | M001.1 single-command regression: login, 2 keep-alives, save upload, read-only Park calls, restart survival. In-process, temp storage, opens no port. |
| `node tools/m001/park-ledger.js --captures <dir> --log <granite.log>` | M001.2 Park dependency ledger + sanitized request/response fixtures. Refuses to write if any private value survives sanitization. |
| `node tools/m001/show-ledger.js <ledger.json>` | Compact table view of a ledger. |
| `node tools/m001/endpoint-id.js --table <Endpoints2K17.json>` | Phase 5 endpoint-id derivation report. No brute force. |
| `node --test tools/m001/m001.test.js` | 10 unit tests for the sanitizer, classifier and id utility. |

The tools load the runtime's codec from the path given on the command line. No
runtime source, endpoint table or raw capture is copied into this repository.

## Phase 1 — baseline snapshot (05:45 EDT)

| Item | State |
|---|---|
| Runtime repo | `granite-2k17`, branch `main`, HEAD `35780de`, local only (no remote) |
| Dirty at first look | `Endpoints2K17.json` (+756 lines of probe rows) |
| Dirty 15 min later | also `Source/Server.js` (+2) and new `Services/Park/ParkMatch2K17.js` — the live session's in-progress Park work |
| Server | one `node Source/Server.js`, listening on `[::]:17217`, started 05:02:49 EDT |
| Game | `NBA2K17.exe` running (started 05:40:42 EDT), window responding |
| Sessions in the log | 9 distinct session ids across the morning's runs |
| Captures | 275 request/response pairs when first counted |

Known-good path, **OBSERVED** in the 09:40 session: `Session/login` →
authenticated calls on the issued key → `Session/update` at 09:42:44 and
09:44:44 on the **same** key (no re-login) → `UserContent/upload` stored a
`BNH!` bundle of ~52 KB.

⚠ The baseline is **not frozen**: the last commit predates the live session's
uncommitted edits, and no tag exists. The regression below was run against the
working tree as it stood, uncommitted edits included.

### Regression result

```
M001 regression: PASS  (26 passed, 0 failed, 0 skipped)
```

What that does and does not show:

- It proves the current source tree still answers login / keep-alive / upload /
  the three read-only Park calls with the **same response shape** the last live
  session received, keeps one session across keep-alives, retains the uploaded
  bundle byte-for-byte, and still knows the session after a handler restart.
- It replays captured requests through the handler in-process. It does not prove
  the real client is satisfied, and it does not cover TLS or the listener.
- "Same shape as last live response" pins today's behaviour. When a Park reply
  is changed on purpose this check will fail for that route, and should: update
  the expectation in the same commit as the change.

## Phase 2 — Park dependency ledger

Ledgers: `evidence/m001/*.ledger.json`. Fixtures: `sanitized-fixtures/m001/<label>/`.

`client_stage` is `null` on every row. The server cannot see the loading
percentage, so nothing is written there (unknown is valid; a guess is not).

### Attempt A — 09:42, the silent stall (`attempt-A-0942-silent-stall`)

```
  2   27.5s POST strings/filter              72 ->   64 data reference-derived REFERENCE
  3   27.5s POST strings/filter              72 ->   64 data reference-derived REFERENCE
  4   27.6s POST probe2k17/95c85943        2504 ->   32 ack  generic-fallback  HYPOTHESIS
  5   27.6s POST probe2k17/95c85943        2504 ->   32 ack  generic-fallback  HYPOTHESIS
  6   28.0s POST vcreport/batch             768 ->   32 ack  reference-derived REFERENCE
  7   28.1s POST attributes/get              32 ->   32 ack  intentional       IMPLEMENTED
  8   29.4s POST parkgamestatsv3/toprepplayer 16 ->  32 ack  generic-fallback  HYPOTHESIS
  9   29.4s POST parkgamestatsv3/parksummary  16 ->  32 ack  generic-fallback  IMPLEMENTED
 10   29.4s POST parkgamestatsv3/parkrep      32 ->  32 ack  generic-fallback  HYPOTHESIS
 11   49.4s POST vcreport/batch             980 ->   32 ack  reference-derived REFERENCE
 12   64.6s POST session/update             536 ->   96 data reference-derived REFERENCE
 13  184.7s POST session/update             536 ->   96 data reference-derived REFERENCE
```

**OBSERVED:** after `ParkRep` (row 10) the client sent no service request for
at least 155 seconds other than one telemetry batch and two keep-alives. The
session stayed alive throughout.

### Attempt B — 09:50, after `PARK_MATCH` ids were added to the endpoint table (`attempt-B-0950-park-search`)

```
  1    0.0s POST strings/filter              72 ->   64 data reference-derived REFERENCE
  2    0.0s POST strings/filter              72 ->   64 data reference-derived REFERENCE
  3    0.1s POST probe2k17/95c85943        2504 ->   32 ack  generic-fallback  HYPOTHESIS
  4    0.1s POST probe2k17/95c85943        2504 ->   32 ack  generic-fallback  HYPOTHESIS
  5    0.6s POST attributes/get              32 ->   32 ack  intentional       IMPLEMENTED
  6    2.1s POST parkgamestatsv3/toprepplayer 16 ->  32 ack  generic-fallback  HYPOTHESIS
  7    2.1s POST parkgamestatsv3/parksummary  16 ->  32 ack  generic-fallback  IMPLEMENTED
  8    2.1s POST parkgamestatsv3/parkrep      32 ->  32 ack  generic-fallback  HYPOTHESIS
  9    2.1s POST park/search               2904 ->   32 ack  generic-fallback  HYPOTHESIS
 10    7.9s POST attributes/get              32 ->   32 ack  intentional       IMPLEMENTED
 11    8.0s POST virtualcurrency/get_consumable_info 32 -> 144 data reference-derived REFERENCE
 12    8.1s POST usercontent/upload       52192 ->   32 ack  reference-derived REFERENCE
```

**OBSERVED:**

1. With six `mmg/park/*` rows present in the endpoint table (ids
   `CRC32("PARK_MATCH:<METHOD>")`, absent from the committed table at `35780de`),
   the client sent a **new** request 21 ms after `ParkRep`:
   `POST /nba/2k17/mmg/park/search`, 2904 bytes.
2. The server log confirms that request was answered by the runtime **catch-all**
   with a bare `RESULT=SUCCESS`.
3. 5.8 s later the client issued `attributes/get`, `get_consumable_info` and a
   save upload — the same calls it makes around the MyCareer menu.

**What this supports (inference, stated as such):**

- **H6 (an unmapped service route) is supported for the silent stall.** The only
  server-side difference between A and B that this lane can see is the endpoint
  table; with the ids present the client makes a call it previously did not
  make. That the *missing id* is what blocked the client is the natural reading,
  and the live session REPORTS finding the lookup in the client, but this lane
  did not isolate it as a single-variable experiment (the table gained other
  rows in the same edit).
- The bare-ack reply to `park/search` is **not** accepted as a successful
  search: the client does not continue into further Park traffic. Whether it
  returned to the menu or surfaced an error is not captured server-side.
- **H3 (relay/world endpoint) is neither supported nor excluded.** The client
  never called `World/connect` in either attempt, and held no outbound socket
  during stall A (below). It has now shown that Park entry in 2K17 goes through
  a matchmaking search first. What a successful search reply must contain is
  unknown.

### Nothing on the Park path is evidenced end-to-end

Across both attempts, **no row** is `intentional` with `OBSERVED` or `DERIVED`
evidence. Eight of twelve replies in attempt B are a bare `RESULT=SUCCESS`.
Routes that must not be mistaken for implemented:

| Route | Why it is not implemented |
|---|---|
| `ParkGameStatsV3/TopRepPlayer` | named local handler, default branch → bare ack |
| `ParkGameStatsV3/ParkSummary` | safety guard → deliberate data-free ack |
| `ParkGameStatsV3/ParkRep` | named local handler, default branch → bare ack |
| `mmg/park/search` | runtime catch-all → bare ack |
| `Probe2K17/95C85943` | endpoint whose name is unknown, sent twice per attempt with a 153-field body → catch-all |

## Phase 3 — the three observed Park endpoints

Request fixtures are in `sanitized-fixtures/m001/`. There is **no Granite/2K19
handler** for any `ParkGameStatsV3` route: before the local `Park2K17.js` they
fell to the catch-all. So there is no reference reply to compare against, only
our own experimental ones.

### `ParkGameStatsV3/ParkChooseAffiliation`

- **Request (OBSERVED, 08:10):** 32 bytes, one field: `TEAM_ID` (U64) = `903`.
  The name is DERIVED: `CRC32("TEAM_ID") = 0x2E646054`.
- **Proven:** the client sends a single team id. **Unknown:** what `903` denotes
  (which affiliation), whether other fields are sent in other states.
- **Reply at the time:** bare `RESULT=SUCCESS`.
- **Reply in current source:** `Park2K17.Summary` — `RESULT`, `PARK_AFFILIATION`,
  `TEAM_ID`, `PARK_RIVAL_PARK`, `PARK_STREAK`, `PARK_TYPE`. The field *names*
  are strings found in the client; the *shape and every value are invented*.
  Classified `intentional / HYPOTHESIS`, flagged **EXPERIMENTAL**. Not a
  protocol fact. It also persists the chosen id to a state file, so replaying
  this route is a write.
- **Follow-on behaviour:** not isolated. The capture predates the current server
  run and no before/after pair exists.

### `ParkGameStatsV3/ParkSummary`

- **Request (OBSERVED):** 16 bytes, **zero fields**. The client identifies itself
  only through the session.
- **Reply:** `Guard2K17` data-free ack. An earlier experimental reply with
  invented summary fields exists in source but is unreachable while the guard
  lists this route.
- **Follow-on:** the client proceeds to `ParkRep` 6–8 ms later in every attempt,
  so a data-free ack does not stop the sequence. That is not evidence the reply
  is sufficient: REPORTED by the live session, the client parses these replies
  with missing fields defaulting.

### `ParkGameStatsV3/TopRepPlayer`

- **Request (OBSERVED):** 16 bytes, **zero fields**.
- **Reply:** bare ack from `Park2K17`'s default branch.
- **Follow-on:** `ParkSummary` follows within 5–6 ms in every attempt.

### Also on the path: `ParkGameStatsV3/ParkRep`

- **Request (OBSERVED):** 32 bytes, one field: `TEAM_ID` = `903` (same value as
  the affiliation choice).
- The id the client requested is `0x92E77186`, which is
  `CRC32("GAME_STATS:PARK_REP")` (DERIVED, and OBSERVED in use). The URL path
  `ParkGameStatsV3/ParkRep` is **our** label in the table, not an observed
  original URL.

### URL caveat for all of the above

The client asks for an endpoint **id**; the URL it then calls is whatever our
login reply mapped that id to. A path such as `ParkGameStatsV3/ParkSummary` is
therefore evidence that the 2K17 client uses that *id*, not that the original
2K17 service used that *path*.

## Phase 4 — passive observation of stall A (05:46 EDT)

Taken from outside the process while the client sat in the silent stall:

| Signal | OBSERVED |
|---|---|
| TCP owned by the game | listeners on `47584` and `12345`; one established pair `57829 ↔ 47584`, both ends on this machine and in the game process |
| UDP owned by the game | one endpoint, `0.0.0.0:47584` |
| Outbound connections | none to any other host |
| DNS cache | only `nba2k17-ws.2ksports.com` → loopback |
| Process | 94 threads, window responding |
| Timeout | none within 155 s; keep-alives continued |

So during the silent stall the client was not trying to reach a relay or world
host over the network. That is consistent with it waiting on something it could
not even request (H6) and argues against an in-flight relay connection (H3) *at
that moment*. Port `47584` matches the Steam emulation layer's default port;
that attribution is a REFERENCE, not verified here.

REPORTED by the live session, from in-process sampling: the main thread was
blocked in a single wait, not polling, and the Steam-lobby path was ruled out.

Hypothesis board:

| | Status |
|---|---|
| H1 Park reply accepted but incomplete | open — every Park reply is still a bare ack |
| H2 bootstrap value missing from an earlier reply | open — untested |
| H3 relay/world endpoint then a new connection | not supported at stall A; open for after a successful search |
| H4 callback never produced | open |
| H5 client-local dependency, no HTTP | not needed to explain stall A |
| H6 unmapped service route | **supported**: adding `PARK_MATCH` ids made the client issue `mmg/park/search` |

## Phase 5 — endpoint-id derivation

`node tools/m001/endpoint-id.js --table <Endpoints2K17.json>` on the working
table (1977 rows):

- **Validation set** — 152 rows whose id is labelled as read from an executable.
  Name hashing reproduces **37**; **115 are not explained** by any transform
  tried. The label is the table author's claim and was not re-verified here.
- Transforms that hit within that set: `UPPER(Service:Method)` 26,
  `SNAKE(ServiceNoVersion):SNAKE(Method)` 22, `SNAKE(Service):SNAKE(Method)` 16.
  All other transforms tried: 0.
- **1452 rows are circular**: their id was generated *from* a candidate name, so
  name→id agreement is guaranteed and is not evidence.

Conclusion: `id = CRC32("SERVICE:METHOD")` is a real, reproducible rule for a
**minority** of ids. It is **not** a universal rule. A generated row becomes
evidence only when the client is OBSERVED requesting it. Two have crossed that
line so far: `GAME_STATS:PARK_REP` (`0x92E77186`) and `PARK_MATCH:SEARCH`
(`0xE8C1E6A3`). The other 1450 generated rows remain HYPOTHESIS.

## Remaining unknowns

- What a successful `mmg/park/search` reply contains. The 2904-byte request has
  33 fields, 14 of them repeated binary blobs under one id; none are named.
- What `Probe2K17/95C85943` is. It carries 153 mostly-numeric fields and is sent
  twice immediately before every Park attempt.
- Whether `ParkSummary`, `TopRepPlayer` and `ParkRep` replies need data for the
  client to proceed past matchmaking.
- Whether a relay/world service is needed after a search succeeds.
- The original service's URL paths for any of these.

## Not done from this lane

- Phases 6–10 (fix, Park entry acceptance, identity, two clients, closeout).
- Tagging the baseline: the runtime tree had another session's uncommitted
  edits in it.
- Nothing was pushed. Issue #1 and PR #2 are unchanged.
