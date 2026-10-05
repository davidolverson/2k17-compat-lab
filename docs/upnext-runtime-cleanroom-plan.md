# Up Next Runtime — Clean-Room Production Plan

**Status:** DESIGN CONTRACT  
**Purpose:** define how a distributable `upnext-runtime` can be implemented without importing restricted/reference runtime code.

## 1. Boundary

The current research runtime remains research/reference infrastructure.

A production `upnext-runtime` may use only:

- independently authored code;
- sanitized protocol contracts/fixtures/evidence from `2k17-compat-lab`;
- public documentation and public standards;
- third-party dependencies whose licences permit the intended distribution;
- original Up Next schemas, services, assets and tests.

It must not copy or derive implementation text/code from restricted/non-distributable reference implementations.

## 2. Clean-room workflow

Use two logical roles, even if performed by the same small team at different times:

### Evidence role

May inspect:

- qualifying client behavior;
- sanitized captures;
- public references;
- research runtime behavior as a black-box/reference observation only where lawful.

Produces only:

- sanitized fixtures;
- normalized contracts;
- field/type observations;
- state-machine observations;
- experiment manifests;
- expected input/output behavior;
- ambiguity/unknown lists.

### Implementation role

Receives only the sanitized evidence package and public-safe contracts.

Implements:

- codecs;
- handlers;
- session logic;
- relay;
- normalized adapters;
- tests.

The implementation role does not copy code from the research runtime.

## 3. Repository layout

Recommended standalone repository:

```text
upnext-runtime/
├── apps/
│   ├── game-edge/
│   └── relay/
├── packages/
│   ├── protocol-core/
│   ├── legacy-adapter/
│   ├── session-core/
│   ├── match-contracts/
│   ├── telemetry/
│   └── test-fixtures/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── fuzz/
│   └── acceptance/
├── docs/
│   ├── architecture/
│   ├── protocol-support/
│   └── threat-model/
└── infra/
```

## 4. Service boundaries

### Game Edge

Owns:

- one-time game-ticket consumption;
- legacy session admission;
- protocol adapter entrypoint;
- connection/session lifecycle;
- normalized calls into platform/game services.

It does not own:

- user password authentication;
- permanent economy truth;
- ratings;
- admin/moderation.

### Relay

Owns only bounded game-session transport.

It must not become:

- a generic UDP proxy;
- an arbitrary destination forwarder;
- a persistent identity store;
- a source of competitive truth.

### Legacy adapter

Owns:

```text
legacy bytes
  <-> parsed fields
  <-> normalized internal request/response contracts
```

Business logic stays outside the adapter.

## 5. Protocol-support registry

Every supported route/packet has machine-readable metadata:

```json
{
  "key": "park/search",
  "evidence_class": "OBSERVED",
  "confidence": "HIGH",
  "production_approved": false,
  "fixture_set": ["..."],
  "last_verified_client": "...",
  "notes": "..."
}
```

A production build must fail validation if a required route is not `production_approved`.

## 6. Unknown handling

Unknown input is never silently promoted to known semantics.

Use:

- `UNKNOWN_FIELD_0x...`
- `UNKNOWN_PACKET_01`
- `UNSUPPORTED_ROUTE`

rather than guessed business names.

Unknown critical routes must not receive generic success in production.

## 7. Test pyramid

### Codec tests

- known fixture parses;
- encode/decode round trip where applicable;
- truncation;
- duplicate fields;
- unknown field types;
- oversized payloads;
- malformed lengths.

### Contract tests

Each sanitized fixture maps to a documented normalized contract.

### Integration tests

Exercise:

- admission;
- session persistence;
- route handling;
- relay lease lifecycle;
- restart behavior;
- timeout/error behavior.

### Fuzz tests

Parser boundaries must survive malformed/random input without process crash or unbounded allocation.

### Acceptance tests

Require qualifying client + exact experiment manifest.

No acceptance test may run against discovery-only client provenance.

## 8. Security invariants

- strict byte/request limits;
- bounded queues;
- bounded DB/Redis pools;
- per-session rate limits;
- no arbitrary forwarding;
- no secrets in protocol logs;
- structured redacted diagnostics;
- opaque random session/ticket identifiers;
- server-generated canonical IDs;
- no user-controlled filesystem paths;
- no dynamic shell execution.

## 9. Release eligibility

A runtime build is distributable only when:

1. source provenance is clean;
2. dependency licences are compatible;
3. forbidden-artifact scan passes;
4. SBOM is generated;
5. unit/integration/fuzz checks pass;
6. release artifact is signed/attested;
7. no restricted/reference code crossed the boundary;
8. legal/licence review for the intended distribution is complete.

## 10. Migration path from research to production

For each behavior:

1. evidence package is produced in `2k17-compat-lab`;
2. sanitized contract is frozen;
3. independent implementation is written in `upnext-runtime`;
4. contract tests use sanitized fixtures;
5. qualifying acceptance experiment validates behavior;
6. support registry marks behavior production-approved;
7. research runtime remains reference-only.

## 11. M001 relationship

This plan does not waive M001.

The first production-runtime compatibility slice should be built only from M001 evidence that eventually meets the qualifying acceptance bar.

Until then, platform scaffolding can proceed against mock/normalized contracts without claiming legacy compatibility.
