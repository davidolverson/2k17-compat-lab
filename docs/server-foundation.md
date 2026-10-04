# NBA 2K17 Server Foundation

Date: 2026-10-03

## Decision

Stop treating the project as only a feasibility lab.

Work now proceeds on two parallel tracks:

1. **Compatibility Lab** — observe real NBA 2K17 client behavior, launcher behavior, service endpoints, and protocol.
2. **Server Foundation** — build the generic account/profile/wallet/import infrastructure that does not require guessing the proprietary wire protocol.

No speculative 2K endpoint schemas are allowed. The foundation is intentionally protocol-agnostic until captures exist.

## Immediate build target

Create a local workflow that can:

1. discover NBA 2K17 Steam save locations
2. inventory candidate MyPLAYER / MyCAREER files without modifying originals
3. hash and stage copies for analysis/import
4. create a local account
5. attach one imported player profile to that account
6. persist a local wallet / VC balance
7. expose an operator/admin interface for test-only account state
8. keep an auditable import log
9. later adapt the real 2K17 request/response contract onto these services once captured

## Known local paths

Windows save root:

`<Steam>\userdata\<SteamUserId>\385760\remote\`

Known historical MyCAREER filename example:

`MyCareer0001`

Settings/config evidence:

`%APPDATA%\2K Sports\NBA 2K17\VideoSettings.cfg`

These paths are discovery hints, not a complete format specification.

## Importer design

The importer MUST be source-preserving.

It may:
- enumerate files
- read metadata
- hash files
- copy files into a staging directory
- parse copies
- produce manifests

It MUST NOT:
- mutate the original NBA 2K17 save directory
- rewrite MyCAREER files
- inject modified saves back into the game
- claim a file is legitimate/modified without evidence

### Import pipeline

```
Steam userdata scan
    ->
find app 385760
    ->
inventory remote/
    ->
classify candidate files by name/size/type
    ->
SHA-256 each source file
    ->
copy to staging/<import-id>/
    ->
parse with versioned parsers
    ->
normalize supported fields
    ->
review
    ->
attach to local account
```

## Initial data model

### Account

- id
- display_name
- created_at
- updated_at

### ExternalIdentity

- id
- account_id
- provider
- provider_user_id
- metadata
- created_at

### PlayerProfile

- id
- account_id
- source
- source_import_id
- display_name
- position
- archetype
- height
- weight
- wingspan
- overall
- raw_supported_fields
- created_at
- updated_at

All basketball-specific fields remain nullable until proven parsable.

### Wallet

- account_id
- vc_balance
- updated_at

VC here is **our local test wallet**, not 2K's live economy.

### ImportRecord

- id
- account_id
- source_path
- source_sha256
- source_size
- source_mtime
- staged_path
- parser_version
- parse_status
- warnings
- created_at

### ImportFile

- id
- import_record_id
- filename
- sha256
- size
- role
- parse_status

## First implementation gates

### Gate S1 — discovery

On a machine with no 2K17 installed:
- scanner exits cleanly
- reports zero candidates
- does not invent paths

On a fixture directory:
- finds app 385760-like structure
- detects MyCareer-style filenames
- hashes every file

### Gate S2 — source preservation

Before/after hash of source directory must be identical.

Any source mutation is a test failure.

### Gate S3 — staging

- every imported source copied to an immutable staging folder
- manifest contains hash, size, mtime, relative path
- duplicate import with same hashes is idempotent

### Gate S4 — account/profile

- create local account
- create empty player profile
- attach import record
- unsupported fields remain unknown, not guessed

### Gate S5 — wallet

- set local VC
- read local VC
- transaction history records changes
- no negative balance unless explicitly allowed by test admin path

### Gate S6 — protocol adapter boundary

Server foundation must expose an internal service interface that future captured 2K17 protocol handlers can call:

```
AccountService
ProfileService
WalletService
ImportService
SessionService
```

Wire-protocol handlers stay separate from these domain services.

## PlayMP clue

The 2026-10-03 PlayMP UI publicly shown by KLAW indicates a workflow that:

- detects compatible NBA 2K17 MyPLAYER / MyCAREER data
- offers "bring over" or "start fresh"
- identifies MyPLAYER character / MyCAREER save / controls & settings
- claims originals remain untouched
- performs file checks before import

We should treat that as product/architecture inspiration only, not copy their UI or hidden implementation.

## Work that starts now

1. Build save discovery/import CLI.
2. Build local persistence and account/profile/wallet domain.
3. Build operator CLI/admin endpoints.
4. Build versioned parser interface with an initial opaque/metadata parser.
5. Create fixtures/tests for discovery, immutability, duplicate import, and corrupt files.
6. Keep compatibility lab capture work running in parallel.
7. When a real client request is captured, connect the first protocol handler to these existing services rather than inventing the backend then.

## Do not wait for the client to build this layer

The client is required for:
- proprietary request/response schemas
- exact account bootstrap
- exact VC payload
- MyCAREER protocol mapping
- Park bootstrap
- real-time transport

The client is NOT required for:
- account persistence
- local wallet semantics
- importer architecture
- file discovery
- source integrity
- staging
- audit logging
- protocol adapter boundary
