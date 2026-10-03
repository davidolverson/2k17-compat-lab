# Own NBA 2K17 replacement-service roadmap

Date: 2026-10-03

## Mission

Prove, then incrementally implement, an independently authored replacement service for an authorized NBA 2K17 PC client.

We are not trying to clone every feature before the first proof. The order is:

client identity -> service map -> first request -> first response -> account/session -> VC/profile -> Park bootstrap -> playable session

## Phase 0 — evidence discipline

Every discovered item receives one of:

- VERIFIED_CLIENT_CAPTURE
- VERIFIED_PUBLIC_SOURCE
- COMMUNITY_REPORT
- INFERENCE
- UNKNOWN

Never convert inference into protocol.

Store captures locally. Commit only sanitized schemas/fixtures.

## Phase 1 — compatible-client fingerprint

Required artifacts:

`captures/client/<sha256>/client.json`

Suggested shape:

```json
{
  "exe": "NBA2K17.exe",
  "sha256": "",
  "sha1": "",
  "md5": "",
  "pe_timestamp": "",
  "file_version": "",
  "product_version": "",
  "source": "",
  "install_size_bytes": 0
}
```

Capture the untouched executable before any launcher/setup operation.

If testing Back2Back or another launcher, fingerprint again afterward and diff.

## Phase 2 — service mapper

Reuse the existing mature instrumentation in this repository.

Required output:

`captures/<run-id>/service-map.json`

For each observed connection:

```json
{
  "time": "",
  "process_name": "",
  "pid": 0,
  "process_path": "",
  "parent_pid": 0,
  "address_family": "IPv4|IPv6",
  "hostname": "",
  "remote_address": "",
  "remote_port": 443,
  "protocol": "tcp",
  "attribution": "game-install-root|external-helper|unresolved"
}
```

The first known hostname to test against evidence is:

`nba2k17-ws.2ksports.com`

Do not assume it is the only one.

## Phase 3 — replacement edge

Build a minimal replacement edge that initially does only:

- TLS termination using a user-controlled lab certificate trusted by the user's own machine
- request logging
- exact raw-body capture
- deterministic status responses
- correlation IDs
- no invented game protocol

If the client rejects a normal locally trusted certificate due to certificate pinning or another explicit security control, record:

`BLOCKED_SECURITY_BOUNDARY`

Do not bypass it.

## Phase 4 — protocol notebook

For each request create:

`protocol/<sequence>/<method>-<path>.md`

Record:

- method
- path
- query
- relevant headers
- content type
- body encoding
- body schema if determinable
- response status
- response content type
- next observed client action
- confidence level
- provenance

Sanitized sample fixtures:

`fixtures/<sequence>/request.*`
`fixtures/<sequence>/response.*`

No credentials, tokens or personally identifying data in Git.

## Phase 5 — first deterministic handler

Pick the earliest request with a fully understood response shape.

Implement:

`replacement-server`

Initial functionality:

- health endpoint for operator use
- structured request logger
- SQLite/Postgres persistence abstraction
- protocol handler registry
- unsupported-route recorder
- replay protection for accidental duplicate writes
- deterministic fixture mode

Success gate:

A real NBA 2K17 client receives our independently authored response and predictably advances or changes state.

## Phase 6 — account/session

Only after captures prove the fields.

Target data model:

```
Account
  id
  external_client_identity
  display_name
  created_at

Session
  id
  account_id
  issued_at
  expires_at

PlayerProfile
  account_id
  build/profile state discovered from protocol

Wallet
  account_id
  vc_balance
```

The exact protocol field names must come from our captures, not guesses.

Success gate:

- new local account can be created
- reconnect maps to same local account
- profile persists
- if VC is exposed by the client contract, our wallet value appears consistently

## Phase 7 — MyCAREER/store

Reconstruct only what client requests demonstrate.

Likely domains to test:

- profile/bootstrap
- player build
- inventory/catalog
- wallet
- purchase mutation
- progression

For every mutation:
- server authoritative
- transaction log
- idempotency
- no negative balances
- test admin override separate from player API

## Phase 8 — Park discovery/bootstrap

Do not jump directly to gameplay relay.

First determine how the client learns:
- Park/world availability
- region
- server address
- session ticket
- squad/presence
- matchmaking/game assignment

Success gate:

client reaches a replacement Park bootstrap state using only our services.

## Phase 9 — real-time session layer

Only after observing the actual transport.

Questions to answer:
- TCP/UDP/WebSocket/custom?
- authoritative host or peer-assisted?
- lobby vs game-session split?
- session tickets?
- packet framing?
- heartbeat/timeout?
- player identity mapping?

Build a synthetic test harness before multi-client live tests.

## Phase 10 — second-client proof

A private server is not proven by one client reaching a menu.

Final initial milestone:

CLIENT A
+
CLIENT B
+
our accounts
+
our Park/session bootstrap
+
both clients see one another
+
join the same playable session

Then test:
- reconnect
- duplicate login
- disconnect
- session expiry
- server restart
- persistent VC/profile state

## Back2Back observation plan — 2026-10-04

If their public playtest is available through a lawful compatible client, observe it as a black box.

Before:
- hash game exe
- hash launcher
- snapshot hosts
- snapshot certificates
- snapshot game directory metadata

During:
- process tree
- DNS
- socket ownership
- destinations/ports
- file writes
- registry writes
- launcher HTTP destinations

After:
- rehash game exe
- diff hosts
- diff cert store
- diff game directory
- preserve logs

Questions we should be able to answer without defeating any controls:

1. Does launcher modify NBA2K17.exe?
2. Does it modify hosts/DNS configuration?
3. Does it install a local CA?
4. Does it launch helper/injected processes?
5. What server hostnames does the game contact?
6. What ports/protocols are used?
7. Does the Park server differ from the web-service server?
8. What artifacts identify the exact compatible client build?

## Do not build yet

Until a real client request is captured, do NOT build speculative:
- VC API
- MyCAREER API
- Park packet protocol
- matchmaking schema
- launcher injection
- Steam emulation

The mature probe already gives us the correct first weapon: evidence.
