# NBA 2K17 Compatibility Feature Matrix

**Updated:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

This matrix separates three things that must not be conflated:

- **LAB_VERIFIED** — verified by tracked lab tests/CI.
- **USER_REPORTED_MODIFIED_CLIENT_OBSERVATION** — observed in the operator's local experiment using a modified client environment and reported back to the project.
- **HYPOTHESIS** — plausible, but not yet demonstrated.

A modified-client observation is useful interoperability evidence, but it is **not** promoted to the original README's legitimate-client gate.

## Core session / transport

| Capability | State | Evidence class | Notes |
|---|---|---|---|
| TLS termination on local replacement endpoint | WORKING | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Local probe accepted real game-originated HTTPS traffic in the reported run. |
| `POST /Session/login` request capture | WORKING | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Repeated 504-byte request reported. |
| Login request parses with cross-version reference field-list codec | CANDIDATE MATCH | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION + CROSS_VERSION_REFERENCE_CANDIDATE | Reported as 10 fields, data starting at offset 176. This does not by itself prove every 2K17 field semantic. |
| Session success response accepted by client | WORKING IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Client advanced to `/Session/update`. |
| Session keep-alive | WORKING IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Stable two-minute update cycle was reported after response correction. |
| Service directory | PARTIAL / HIGH VALUE | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | A 2K19-derived table caused 2K17 to issue real service calls. Treat each endpoint mapping as candidate until independently observed. |

## Service coverage observed in the reported run

| Service / path | State | Current priority |
|---|---|---:|
| Accounts/get | REACHED | P0 |
| VirtualCurrency/balance | REACHED | P0 |
| UserContent/list | REACHED | P0 |
| UserContent/upload | REACHED; storage format differs | P0 |
| Dlc/check_dlc_inventory | REACHED | P1 |
| VCReport/batch | REACHED | P3 |
| PromoV3/get_user_code | REACHED | P2 |
| MyLeagues/get_notification_count | REACHED | P2 |
| MyTeam2k17/get_award_queue_length_main_menu | REACHED | P2 |
| MyCareer/Attributes/price | REACHED | P0 |
| MyCareer/save | REACHED | P0 |
| Strings/filter | REACHED | P1 |
| ParkGameStatsV3/ParkChooseAffiliation | REACHED | P0 |
| ParkGameStatsV3/ParkSummary | REACHED | P0 |
| ParkGameStatsV3/TopRepPlayer | REACHED | P1 |

## Storage / saves

| Capability | State | Evidence class | Next proof |
|---|---|---|---|
| UserContent upload body capture | WORKING | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Preserve full raw payload locally and hash it. |
| 2K17 bundle magic `BNH!` | REPORTED OBSERVATION | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Add fixture-based parser test using sanitized structure metadata, not user save bytes. |
| 2K19 bundle magic `BNH"` | CROSS-VERSION REFERENCE | CROSS_VERSION_REFERENCE | Keep both versions explicit in adapters. |
| Persistent server-side save storage | PARTIAL | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Confirm upload -> restart -> download/restore round trip. |
| Save integrity | NOT PROVEN | HYPOTHESIS | Hash before upload, stored copy, returned copy, and resulting client save state. |

## MyCareer

| Capability | State | Notes |
|---|---|---|
| Enter MyCareer / local gameplay | REPORTED WORKING | Local save-driven behavior. |
| Attribute price request | REACHED | Needs 2K17-compatible reply semantics. |
| VC balance | REACHED | Persistence and transaction semantics need explicit tests. |
| MyCareer save call | REACHED | Must prove server persistence and restore. |
| Attribute purchase | NOT PROVEN | Do not call working until state survives restart and balance reconciliation. |
| Consumables / inventory | NOT PROVEN | Track independently. |

## Park / multiplayer

| Capability | State | Evidence class | Current view |
|---|---|---|---|
| Park summary/stat calls | REACHED | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Occur before loading stall. |
| Park loading | BLOCKED AROUND 30% IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | No single root cause is proven yet. |
| Relay requirement | PLAUSIBLE | HYPOTHESIS | Memory strings reportedly reference relay/session code. |
| Steam lobby involvement | PLAUSIBLE | HYPOTHESIS | Reportedly references Steam matchmaking functions. |
| 2K19 Opal compatibility | UNKNOWN | CROSS_VERSION_REFERENCE | Do not assume 2K19 Neighborhood architecture equals 2K17 Park. |
| Playable Park session | NOT WORKING | — | Highest-value unresolved gameplay gate. |

## Current execution priorities

1. **P0 — Preserve and prove persistence:** UserContent upload/download, MyCareer saves, VC/account state.
2. **P0 — Park dependency isolation:** determine whether 30% stall is missing response data, missing service discovery, lobby state, relay state, or another local dependency.
3. **P1 — Replace generic success fallbacks:** every placeholder must become a typed handler or an explicit unsupported response.
4. **P1 — Build deterministic replay fixtures:** sanitized metadata + synthetic payloads where possible.
5. **P2 — Menus/notifications/content polish.**
6. **P3 — Telemetry and low-value compatibility calls.**

## Definition of “working”

A feature is not marked **WORKING** merely because the client does not crash.

For stateful features, “working” requires:

1. request observed;
2. response accepted;
3. expected client-side state changes;
4. state persists across server restart;
5. state persists across client restart where applicable;
6. no silent fallback to a generic success handler;
7. raw/sensitive evidence remains local and sanitized exports contain no credentials or personal data.
