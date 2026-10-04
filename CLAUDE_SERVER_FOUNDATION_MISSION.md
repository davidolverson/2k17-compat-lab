# Claude mission — build the NBA 2K17 server foundation now

Branch: `build/2k17-server-foundation`

Read:
- `docs/server-foundation.md`
- `docs/own-server-roadmap.md`
- `docs/revival-preserve-back2back-teardown.md`
- existing lab scripts and README

## Why this starts now

A current PlayMP preview publicly shows an NBA 2K17 player-import workflow that detects MyPLAYER/MyCAREER data, offers bring-over vs start-fresh, checks files, and leaves originals untouched.

Independent public documentation confirms the Steam save root:
`<Steam>\userdata\<SteamUserId>\385760\remote\`

Historical Steam community evidence identifies MyCAREER save names such as:
`MyCareer0001`

We do NOT need the proprietary online protocol to build the local account/import/domain foundation.

## Mission

Implement and test a real local foundation, not another strategy document.

### 1. Save discovery CLI

Create a cross-checking scanner that:
- enumerates all Steam library/userdata roots visible on the machine
- finds every `385760\remote` candidate
- never assumes the Steam root is C:\Program Files (x86)\Steam
- recognizes MyCareer-style candidate names case-insensitively
- inventories every file in the target remote folder
- records size, mtime, SHA-256, relative path
- performs READ ONLY access to source files
- handles zero installs cleanly

Allow a `-FixtureRoot` or equivalent so tests do not require NBA 2K17.

### 2. Immutable import staging

Implement:
`imports/<import-id>/source/`
`imports/<import-id>/manifest.json`

Rules:
- copy only; never modify source
- source hashes before and after must match
- duplicate identical imports are idempotent
- interrupted import does not leave a valid completed manifest
- corrupt/unreadable file is reported, not silently skipped

### 3. Versioned parser interface

Do NOT reverse-engineer fields by guessing.

Implement a parser contract such as:
- detector
- parser version
- confidence
- supported fields
- unsupported/opaque sections
- warnings

Initial parser should be METADATA/OPAQUE only:
- filename
- hash
- size
- timestamps
- candidate role from filename evidence

Do not claim position/archetype/OVR etc. until proven from legitimate sample files.

### 4. Local backend domain

Build protocol-agnostic services:

`AccountService`
`SessionService`
`ProfileService`
`WalletService`
`ImportService`

Use a local persistence layer suitable for development. SQLite is preferred if straightforward in the current stack.

Required behavior:
- create account
- get account
- create/link empty player profile
- attach import record
- get wallet
- admin set wallet
- wallet transaction history
- no negative wallet balance through player-facing operations
- test/admin override clearly separated

This wallet is OUR local test VC ledger. It is not 2K live VC.

### 5. Operator API/CLI

Provide enough operator surface to prove:

- create local user
- import fixture player data
- show imported manifest
- attach import to profile
- set VC to 100000
- read it back
- show transaction history

No polished dashboard yet.

### 6. Protocol adapter boundary

Create an adapter interface where captured NBA 2K17 protocol handlers will later call the domain services.

Do not invent proprietary endpoints.

Example conceptual boundary:

`protocol handler -> domain service -> database`

Keep:
`replacement-server/protocol/`
separate from:
`replacement-server/domain/`

### 7. Tests

Prove at minimum:

A. no installed 2K17 -> scanner exits cleanly
B. fixture tree with MyCareer0001 -> discovered
C. multiple Steam user IDs -> discovered independently
D. source files byte-identical before/after import
E. staging hash matches source hash
F. duplicate import -> idempotent
G. unreadable/corrupt fixture -> explicit error
H. account persists after restart
I. wallet persists after restart
J. wallet admin set 100000 -> reads 100000
K. transaction audit exists
L. unsupported player fields remain null/unknown
M. no source write handles are opened by importer if testable

### 8. Security / trust

Never execute imported files.
Never deserialize arbitrary native objects from a save.
Treat filenames/paths as untrusted.
Prevent path traversal during staging.
Limit file sizes reasonably and report oversized candidates.
Do not put raw personal Steam IDs or full local paths into committed fixtures.

### 9. Existing compatibility lab stays intact

Do not break the existing probe, cleanup, certificate, hosts, or Back2Back observation tooling.

Run its existing verification/control suite after changes where practical.

## Deliverable

Do not return until you have:

- implementation
- tests
- actual test output
- example local account
- example staged fixture
- example local profile linked to import
- wallet set to 100000 and read back
- transaction history proof
- source-preservation proof
- branch pushed
- commit SHA

Then report:

1. architecture actually built
2. files changed
3. commands/tests run
4. exact results
5. bugs found/fixed
6. what still requires a real NBA 2K17 client
7. next smallest feature we can build without guessing the wire protocol

Do not pause for the missing client. Build everything above first.
