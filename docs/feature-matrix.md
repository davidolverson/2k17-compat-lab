# NBA 2K17 Compatibility Feature Matrix

**Updated:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

This matrix separates evidence classes that must not be conflated:

- **LAB_VERIFIED** — verified by tracked lab tests/CI.
- **USER_REPORTED_MODIFIED_CLIENT_OBSERVATION** — observed in the operator's local modified-client compatibility run.
- **CROSS_VERSION_REFERENCE** — behavior or structures inherited from public 2K19-era references.
- **HYPOTHESIS** — plausible, but not yet demonstrated.

A modified-client observation is useful interoperability evidence, but it is **not** promoted to the original README's legitimate-client gate.

## Core session / transport

| Capability | State | Evidence class | Notes |
|---|---|---|---|
| TLS termination on local replacement endpoint | WORKING IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Local replacement service received game-originated HTTPS traffic. |
| `POST /Session/login` request capture | WORKING IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Repeated 504-byte request reported. |
| Login request parses with cross-version reference field-list codec | CANDIDATE MATCH | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION + CROSS_VERSION_REFERENCE_CANDIDATE | Reported as 10 fields with data starting at offset 176. |
| Session success response accepted by client | WORKING IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Client advanced to session update. |
| Session keep-alive | WORKING IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Stable two-minute update cycle reported after the route was corrected. |
| Service directory | PARTIAL / HIGH VALUE | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION + CROSS_VERSION_REFERENCE | A 2K19-derived table caused 2K17 to issue real service calls. Each mapping remains candidate until independently observed. |

## Service coverage observed in the reported run

| Service / path | State | Current priority |
|---|---|---:|
| Accounts/get | REACHED | P0 |
| VirtualCurrency/balance | REACHED | P0 |
| UserContent/list | REACHED | P0 |
| UserContent/upload | REACHED | P0 |
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
| Complete UserContent upload capture | REPORTED WORKING | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Keep complete payloads local and hashed. |
| 2K17 bundle magic `BNH!` | REPORTED OBSERVATION | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Parser regression test now exists using synthetic fixture data. |
| 2K19 bundle magic `BNH"` | CROSS-VERSION REFERENCE | CROSS_VERSION_REFERENCE | Keep both versions explicit. |
| Lab byte-exact store | VERIFIED | LAB_VERIFIED | 97/97 aggregate suite was green before Mission 14; Mission 14 extends this suite. |
| Granite stored upload survives restart | REPORTED WORKING | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Stored copy reportedly matches upload SHA-256 across restarts. |
| Server-side download/return | NOT PROVEN | — | Capture a real returned/downloaded object and compare extracted bundle SHA-256. |
| Client accepts returned save | NOT PROVEN | — | Must demonstrate the client consumes returned bytes and restores expected state. |
| Full MyCareer progression persistence | NOT PROVEN | — | Current operator report says important progress remains local in the client save environment. Do not equate UserContent storage with full MyCareer persistence. |

## MyCareer

| Capability | State | Notes |
|---|---|---|
| Enter MyCareer / local gameplay | REPORTED WORKING | Local save-driven behavior. |
| Attribute price request | REACHED | Needs explicit 2K17-compatible result validation. |
| VC balance | REACHED | Persistence and transaction semantics need controlled tests. |
| MyCareer save call | REACHED | A server call being reached is not proof that all progression is server-authoritative. |
| Attribute purchase | NOT PROVEN | Must survive restart and reconcile balance/state. |
| Consumables / inventory | NOT PROVEN | Track independently. |

## Park / multiplayer

| Capability | State | Evidence class | Current view |
|---|---|---|---|
| Park summary/stat calls | REACHED | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Occur before loading stall. |
| Park loading | BLOCKED AROUND 30% IN REPORTED RUN | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Root cause still unproven. |
| H1-A richer ParkSummary experiment | NO CHANGE | USER_REPORTED_MODIFIED_CLIENT_OBSERVATION | Affiliation/rival/streak/type response did not move the loader. This materially weakens H1 but does not eliminate all response-data deficiencies. |
| Steam lobby involvement | ACTIVE H3 LANE | HYPOTHESIS + LOCAL_LOG_OBSERVATION PENDING | Debug logging is now available; summarize calls before changing behavior. |
| Relay requirement | ACTIVE H4 LANE | HYPOTHESIS | Memory strings reportedly reference relay/session code. Observe before implementing. |
| Missing service-directory entry | OPEN H2 LANE | HYPOTHESIS | Still possible; not disproven by H1-A. |
| 2K19 Opal compatibility | UNKNOWN | CROSS_VERSION_REFERENCE | Do not assume 2K19 Neighborhood architecture equals 2K17 Park. |
| Playable Park session | NOT WORKING | — | Highest-value unresolved gameplay gate. |

## Current execution priorities

1. **P0 — Prove server return path:** upload -> storage -> restart -> list/download -> byte-identical returned bundle -> client acceptance.
2. **P0 — Observe H3:** capture Steam lobby API calls while entering Park before changing lobby behavior.
3. **P0 — Observe H4:** identify relay-related local state or socket activity before implementing a relay component.
4. **P0 — Keep H2 open:** compare service-directory lookup evidence if H3/H4 do not explain the stall.
5. **P1 — Replace generic success fallbacks:** every stateful route should become typed or explicitly unsupported.
6. **P1 — Build deterministic replay fixtures.**
7. **P2/P3 — Menus, notifications, telemetry, polish.**

## Definition of “working”

A feature is not marked **WORKING** merely because the client does not crash.

For stateful features, “working” requires:

1. request observed;
2. response accepted;
3. expected client-side state changes;
4. state persists across server restart;
5. state persists across client restart where applicable;
6. no silent fallback to a generic success handler;
7. returned state matches stored state where applicable;
8. raw/sensitive evidence remains local and sanitized exports contain no credentials or personal data.
