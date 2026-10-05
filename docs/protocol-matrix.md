# NBA 2K17 Protocol Matrix

**Status:** Mission 2 — evidence normalization  
**Repository:** `davidolverson/2k17-compat-lab`  
**Working branch:** `work/deepseek-protocol-reconstruction`  
**Date:** 2026-10-04

This file is the protocol source of truth for the clean-room replacement-service effort.

It deliberately distinguishes:

- what is specifically supported by public NBA 2K17 evidence,
- what is only known from the later NBA 2K19 / Granite protocol family,
- what appeared only in disputed-provenance local experiments,
- and what remains unknown.

Nothing in the `2K19 reference` column is automatically an NBA 2K17 fact.

## Evidence classes

| Class | Meaning |
|---|---|
| `OBSERVED_2K17` | Observed from an authorized clean NBA 2K17 client test with preserved evidence. |
| `PUBLIC_2K17_SOURCE` | A public source specifically about NBA 2K17 supports the claim. |
| `CROSS_VERSION_REFERENCE` | Observed in another 2K title/project, primarily NBA 2K19 / Granite. |
| `INFERRED` | Follows from other evidence but was not directly observed. |
| `HYPOTHESIS` | Plausible but unverified. |
| `DISPROVEN` | Contradicted by stronger evidence. |
| `UNKNOWN` | Insufficient evidence. |
| `SPECULATIVE` | Guessed implementation/content with no protocol standing. |

## Confidence scale

- **HIGH** — multiple independent sources or direct authorized-client observation.
- **MEDIUM** — one specific credible source or multiple weaker sources.
- **LOW** — historical implementation/community clue only.
- **UNKNOWN** — no evidence sufficient to score.

---

## Matrix

| Component | NBA 2K17 evidence | Source | Evidence class | Confidence | 2K19 / other reference | Implementation status |
|---|---|---|---|---|---|---|
| Primary web-service hostname | `nba2k17-ws.2ksports.com` is named explicitly by a 2023 developer recreating the NBA 2K17 API. Historical host lists also contain it. | Reddit 2023 developer post; historical host list | `PUBLIC_2K17_SOURCE` | MEDIUM | Granite uses a title-specific `nba2k19-ws.2ksports.com` host. | Keep configurable. Do not mark client-observed until authorized capture exists. |
| Primary service port | Historical public NBA 2K17 private-server source binds TCP port `17217`. This corroborates that 17217 was significant in community 2K17 work, but does not by itself prove every retail client directly targets that port. | `THEKINGPATUBOY14/NBA-2k17-Private-Server`, `Server.h` | `PUBLIC_2K17_SOURCE` | LOW–MEDIUM | Granite's 2K19 Session root is on port `19217`; not transferable to 2K17. | Default future 2K17 test profile may expose 17217, but port remains configurable. |
| TLS used for web service | The 2023 developer describes certificate-name validation for `nba2k17-ws.2ksports.com` and reports making a self-signed certificate work on PC after trusting their CA. | Reddit 2023 developer post | `PUBLIC_2K17_SOURCE` | MEDIUM | Granite uses HTTPS/TLS. | Existing probe already supports TLS. |
| PC trust-store compatible certificate path | One public 2K17 developer report says a locally trusted CA/self-signed setup worked on PC. This is evidence for that build/environment, not proof for all builds. | Reddit 2023 developer post | `PUBLIC_2K17_SOURCE` | MEDIUM | Granite ships local TLS certificate infrastructure. | Existing lab CA/leaf flow is the preferred non-bypass test path. |
| Certificate pinning required | No verified 2K17 evidence proves strict pinning. EOF/FIN after certificate delivery is not proof. | Project evidence rule; public discussion leaves pinning/mTLS unresolved | `UNKNOWN` | UNKNOWN | 2K19 behavior cannot settle 2K17. | Never assume; classify exact TLS failure only. |
| mTLS / client certificate required | A 2023 Stack Exchange questioner suspected mTLS, but responders explicitly questioned whether mTLS was actually in use. No conclusive evidence. | Reverse Engineering Stack Exchange Q32011 | `HYPOTHESIS` | LOW | Granite replacement behavior does not establish original production mTLS. | Unknown; do not implement client-cert requirement without evidence. |
| Session service root path | No admissible public 2K17 source currently establishes the exact root path. A disputed local client exposed a `/Session` string, but that cannot be promoted in the clean-room ledger. | disputed local artifact excluded from evidence | `UNKNOWN` | UNKNOWN | Granite 2K19 uses `/Session`. | Not implemented as 2K17 fact. |
| `Session/login` route | No verified public 2K17 source currently establishes the exact route. It appeared in disputed local experiments. | disputed local experiment; excluded from evidence | `HYPOTHESIS` | LOW | Granite 2K19 implements `POST /Session/login`. | No real 2K17 handler. Route may be exposed later only as TEST_ONLY until verified. |
| `Session/update` route | No verified 2K17 evidence currently establishes it. | none | `UNKNOWN` | UNKNOWN | Granite 2K19 implements `/Session/update`. | Not implemented. |
| Login HTTP method | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite uses POST. | Not implemented as a 2K17 fact. |
| Login response HTTP status | Unknown for authentic 2K17. | none | `UNKNOWN` | UNKNOWN | Granite sends HTTP 200 for handled requests. | TEST_ONLY response profiles may use explicit statuses. |
| Login content type | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite sends `application/octet-stream`. | Not implemented as a 2K17 fact. |
| `VCFIELDLIST_SIZE` header | No public 2K17 evidence currently establishes this header. | none | `UNKNOWN` | UNKNOWN | Granite parses/sends `VCFIELDLIST_SIZE`. | Capture it if present; do not require it yet. |
| Binary field-list protocol | No verified 2K17 capture currently establishes the framing. | none | `UNKNOWN` | UNKNOWN | Granite has a VcFieldList codec with 16-byte BE records + zero terminator + data section. | Mission 3 may build a generic/reference codec, explicitly tagged `CROSS_VERSION_REFERENCE`. |
| Field CRC identifiers | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite names CRC-backed fields such as RESULT, SESSION_KEY, SERVICES, PARAMETERS, MANIFEST. | Do not hardcode as 2K17 constants. |
| Field byte order | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite field records are big-endian. | Reference codec only until verified. |
| U32/U64 field types | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite supports U32/U64 and several related types. | Generic codec can support them without claiming 2K17 use. |
| Strings / binary fields | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite supports String8, String16, Binary, Guid, etc. | Generic codec only. |
| Gzip-compressed sub-blobs | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite compresses SERVICES/PARAMETERS/MANIFEST-like blobs. | Generic gzip helpers are safe; field meaning remains unknown. |
| `RESULT = SUCCESS` semantics | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite returns a RESULT field set to a SUCCESS CRC. | Do not copy constants. |
| Session key | Session/authentication is architecturally plausible but no verified 2K17 response field is known. | public replacement-server context only | `HYPOTHESIS` | LOW | Granite issues a nonzero 64-bit SESSION_KEY. | Data model may reserve concept, but protocol mapping is unknown. |
| Server time / issued-at | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite emits server-time and issued-at fields. | Do not implement as 2K17-required fields. |
| Environment echo | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite echoes environment when present. | Unknown. |
| SKU echo | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite echoes SKU when present. | Unknown. |
| Parameters blob | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite sends compressed PARAMETERS. | Unknown. |
| Services / endpoint table | Service discovery is a useful architecture hypothesis, but no verified 2K17 service-table wire format is known. | public 2K17 replacement context; no packet fixture | `HYPOTHESIS` | LOW | Granite sends a compressed SERVICES endpoint table. | Do not copy Granite endpoint table. |
| Manifest blob | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite sends compressed MANIFEST. | Unknown. |
| Account/profile service | Restored 2K17 projects publicly/community-report working MyCAREER/profile-like functionality, but exact route/schema is unknown. | Revival/community reports documented in project research | `PUBLIC_2K17_SOURCE` for feature existence only | LOW–MEDIUM | Granite has Account and UserContent services. | Domain placeholder allowed; protocol UNKNOWN. |
| VC / wallet service | Public/community reports around restored 2K17 projects claim VC earning/store functionality. Exact endpoints, fields and persistence contract are unknown. | Revival/community reports documented in project research | `PUBLIC_2K17_SOURCE` for feature existence only | LOW–MEDIUM | Granite implements VirtualCurrency services. | Domain placeholder allowed; no 2K17 wire contract. |
| Store/catalog service | Public/community reports claim restored store usage. Exact route/schema unknown. | Revival/community reports | `PUBLIC_2K17_SOURCE` for feature existence only | LOW–MEDIUM | Granite implements store/catalog endpoints. | Domain placeholder only. |
| MyCAREER online state | Public/community reports claim restored MyCAREER behavior. Exact service contract unknown. | Revival/community reports | `PUBLIC_2K17_SOURCE` for feature existence only | LOW–MEDIUM | Granite implements multiple MyCareer services. | Domain placeholder only. |
| Park / world bootstrap | Public/community evidence says replacement projects restored Park access. This proves feasibility of some replacement path, not its protocol shape. | Revival / Back2Back community reports | `PUBLIC_2K17_SOURCE` for feature existence only | MEDIUM | Granite splits web services from an Opal world layer. | Architecture placeholder only. |
| Park realtime transport | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite 2K19 uses secure WebSocket + UDP world/game relay concepts. | Do not assume WebSocket or UDP for 2K17. |
| Matchmaking/session assignment | Required conceptually for online multiplayer, but exact 2K17 contract is unknown. | inference from restored Park functionality | `INFERRED` | LOW | Granite has matchmaking/game-session services. | Unknown. |
| CDN/content bootstrap | Unknown for 2K17. | none | `UNKNOWN` | UNKNOWN | Granite implements CDN and content-message services. | Unknown. |
| Client helper process owns traffic | No authorized 2K17 evidence. Existing GTA V instrumentation proved only that commercial games may delegate network traffic to helpers. | own GTA V instrumentation history | `INFERRED` as instrumentation risk, not 2K17 behavior | LOW | n/a | Attribution must remain install-root/path based, not name-only. |
| IPv6 use | No authorized 2K17 evidence. Existing GTA V test demonstrated IPv6 can invalidate IPv4-only instrumentation. | own GTA V instrumentation history | `INFERRED` as instrumentation risk, not 2K17 behavior | LOW | n/a | Keep dual-family instrumentation. |
| Official shutdown | NBA 2K17 online services were announced shut down effective 2018-12-31. | Steam/app metadata recorded in project research | `PUBLIC_2K17_SOURCE` | HIGH | n/a | Background fact; not a protocol detail. |

---

## Sanitized fixture classification

The only sanitized fixture currently committed on `main`:

`sanitized-fixtures/probe.66686d164ca1.sanitized.jsonl`

contains **lab self-test traffic only**, not NBA 2K17 traffic.

It records:

- loopback TCP to port 443,
- SNI `nba2k17-ws.2ksports.com`,
- TLS 1.2,
- `ECDHE-RSA-AES128-GCM-SHA256`,
- HTTP GET to `/__selftest/66686d164ca1`,
- user-agent `2k17-compat-lab-selftest`,
- empty body,
- 404 response.

Therefore:

```
FIXTURE_SOURCE: LAB_SELFTEST
OBSERVED_2K17_PROTOCOL_VALUE: NONE
FIELD_LIST_BODY_AVAILABLE: NO
SESSION_LOGIN_BODY_AVAILABLE: NO
```

This fixture validates the **instrument**, not the NBA 2K17 protocol.

Do not use its TLS version, cipher, HTTP method, port, or headers as NBA 2K17 client evidence.

---

## Qwen branch contamination review

Branch comparison:

`main...work/qwen-client-first`

shows the branch is four commits ahead of `main`.

Changed/added files are limited to:

- research/playtest/roadmap documentation,
- observer-kit scripts,
- client-state snapshot/compare tooling,
- cleanup/status hardening,
- additions to `research/service-map.md`.

No `spoof_server.py`, guessed VcFieldList codec, fake `Session/login` implementation, or synthetic login payload file appears in the branch diff.

Therefore:

```
QWEN_BRANCH_SPECULATIVE_LOGIN_CODE_FOUND: NO
QWEN_BRANCH_REQUIRES_BLANKET_QUARANTINE: NO
QWEN_BRANCH_MERGE_READY: NOT_ASSESSED
```

The branch should still be reviewed file-by-file before merge, but it is **not** currently the source of the ad-hoc guessed login payloads seen in the local Qwen experiment.

---

## Public evidence notes used in this matrix

### P1 — 2023 NBA 2K17 API developer: PC certificate / hostname

Public post:

https://www.reddit.com/r/cryptography/comments/14why8y

The author says they were recreating an API for an offline game and explicitly names the required DNS name:

`nba2k17-ws.2ksports.com`

They report that on the PC version they created a self-signed certificate and made it work after trusting their CA locally. Their problem in that post was reproducing the trust path on PS4.

Classification:

`PUBLIC_2K17_SOURCE`

What it supports:

- hostname,
- TLS/certificate-name relevance,
- feasibility of a locally trusted CA on at least one PC build/environment.

What it does **not** support:

- exact HTTP paths,
- exact binary schema,
- exact port,
- every 2K17 PC build,
- absence/presence of pinning in all configurations.

### P2 — Reverse Engineering Stack Exchange Q32011

https://reverseengineering.stackexchange.com/questions/32011/how-could-i-extract-a-certificate-and-private-key-out-of-a-exe

The questioner explicitly says the target is NBA 2K17 and that they are trying to obtain backend API responses for a server emulator. They suspected mTLS. A responder questioned that assumption and noted ordinary TLS/pinning as alternatives.

Classification:

`PUBLIC_2K17_SOURCE` for the historical research activity; `HYPOTHESIS` for mTLS.

### P3 — Historical public NBA 2K17 private-server source

Repository:

https://github.com/THEKINGPATUBOY14/NBA-2k17-Private-Server

At commit:

`24e52860bdd5ea626604b80ad38358f48b039988`

`NBA 2K17 GameServer/Server.h` contains:

`main.sin_port = htons(17217);`

Classification:

`PUBLIC_2K17_SOURCE` with LOW–MEDIUM confidence for port significance.

It is an incomplete historical implementation and is not proof of the retail client's complete network contract.

### P4 — Granite / NBA 2K19

Repository:

`ztpd/Granite`

Reference commit previously reviewed by this project:

`20c3d875907498eb9e3780553a45f3c451885777`

Classification:

`CROSS_VERSION_REFERENCE`

Useful for:

- codec architecture,
- session/service concepts,
- generic parser/encoder test cases,
- separation of web services and realtime world services.

Not usable as direct proof of NBA 2K17 constants, endpoints, field IDs, or service-table entries.

---

## Mission 2 result

```
PROTOCOL_MATRIX_CREATED: YES

OBSERVED_2K17_ROWS:
0

PUBLIC_2K17_SOURCE_ROWS:
hostname
TLS/certificate behavior on one reported PC environment
historical significance of port 17217
restored-feature feasibility claims
official shutdown

CROSS_VERSION_REFERENCE_ROWS:
VcFieldList framing
Session/login shape
Session/update
field types
session key
parameters/services/manifest
service-domain architecture

SPECULATIVE_ROWS:
disputed local Session/login observations
old guessed binary responses

UNKNOWN_ROWS:
exact 2K17 login method
exact login path
exact response schema
VCFIELDLIST_SIZE
field framing
field CRCs
field endian
session key representation
service-table representation
manifest representation
Park realtime transport
matchmaking wire contract
CDN/content bootstrap

SANITIZED_FIXTURE_RESULT:
self-test only; zero NBA2K17 protocol evidence

QWEN_BRANCH_RESULT:
no guessed login payload implementation found in branch diff
```

## Gate to Mission 3

Mission 3 may now build a **generic, provenance-tagged field-list codec** from the public Granite reference, but it must be named and documented as a cross-version/reference codec until a real 2K17 request proves compatible framing.

The codec must not expose constants or helpers named as confirmed NBA 2K17 fields unless they are independently verified later.
