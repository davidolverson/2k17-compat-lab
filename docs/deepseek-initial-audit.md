# DeepSeek Initial Audit

**Audit target:** remote GitHub snapshot only  
**Repository:** `davidolverson/2k17-compat-lab`  
**Remote branch audited:** `main`  
**Remote main head:** `0c12ec5d5664c1891b2064897e9822d193194fa9`  
**Audit date:** 2026-10-04  

This document is a repository audit, not a protocol finding. It classifies the current remote tree, separates historical claims from current evidence, and identifies the minimum architecture needed for the next phase.

## Evidence classes used here

- **REMOTE_REPO_FACT** — directly visible in the current remote GitHub snapshot.
- **HISTORICAL_COMMIT_CLAIM** — described by an earlier commit or tracked document, but not freshly re-executed during this audit.
- **CROSS_VERSION_REFERENCE** — learned from a different 2K title/project; not a 2K17 fact.
- **PUBLIC_2K17_SOURCE** — public source specifically about NBA 2K17; still distinct from a local authorized-client observation.
- **HYPOTHESIS** — plausible but unverified.
- **STALE_PROJECT_STATUS** — tracked text that no longer represents the current project conversation/state.
- **UNKNOWN** — insufficient evidence.

---

## 1. Repository state

### Remote

| Item | Value | Class |
|---|---|---|
| repository | `davidolverson/2k17-compat-lab` | REMOTE_REPO_FACT |
| audited branch | `main` | REMOTE_REPO_FACT |
| audited head | `0c12ec5d5664c1891b2064897e9822d193194fa9` | REMOTE_REPO_FACT |
| dedicated DeepSeek branch | `work/deepseek-protocol-reconstruction` | REMOTE_REPO_FACT |

### Local machine

| Item | Value | Class |
|---|---|---|
| local current branch | UNKNOWN | UNKNOWN |
| local working-tree status | UNKNOWN | UNKNOWN |
| local unpushed changes | UNKNOWN | UNKNOWN |

GitHub can establish the remote tree, but not the user's current local working tree. No claim about local cleanliness should be made until local shell output is supplied.

---

## 2. Remote tree summary

The current remote `main` contains:

```
.gitignore
README.md

docs/
  environment-audit.md
  live-status.md

probe/
  probe.js
  responses.json

research/
  baseline-network.md
  preserve-client-contract.md
  reference-findings.md
  runtime-comparison.md
  service-map.md
  timeline.md

sanitized-fixtures/
  probe.66686d164ca1.sanitized.jsonl

scripts/
  _common.ps1
  await-client.ps1
  capture.ps1
  cleanup.ps1
  export-sanitized.ps1
  import-client.ps1
  run.ps1
  setup.ps1
  status.ps1
  test-client.ps1
  test-replacement.ps1
  validate-instrument.ps1
  verify.ps1
  watch.ps1
```

There is currently **no `server/` directory** and **no dedicated `tests/` directory** on remote `main`. There is also no root `package.json`, `requirements.txt`, or `pyproject.toml`.

**Class:** REMOTE_REPO_FACT.

---

## 3. Working / substantial components

### 3.1 Diagnostic HTTPS probe

`probe/probe.js` is substantial and should be preserved as the project's diagnostic instrument.

Observed capabilities in the remote source:

- separate logging for `tcp.connect`
- separate logging for `tls.clientError`
- separate logging for `tls.established`
- separate logging for `http.request`
- SNI recording
- TLS protocol/cipher recording
- redacted console output
- gitignored raw JSONL
- request-body preservation
- HTTP metadata capture
- response selection through `responses.json`
- IPv4 loopback listener
- IPv6 loopback listener
- process ownership attribution
- executable path recording
- a persistent PowerShell connection-table poller
- explicit distinction between transport TLS completion and application-level evidence

**Class:** REMOTE_REPO_FACT.

The probe's comments explicitly reject two common overclaims:

1. a completed TLS handshake does not, by itself, prove application-level certificate or pinning acceptance;
2. replacement-endpoint behavior does not establish what the original production service required.

That evidence discipline should remain.

### 3.2 Reversible environment tooling

The repository contains setup, run, status, verification, capture, export, cleanup, and watcher scripts.

Tracked history reports prior controls for:

- exact hosts restoration
- exact certificate cleanup
- idempotent cleanup
- secret redaction
- port-conflict detection
- process attribution
- IPv4/IPv6 handling

These results are useful history but are **not fresh test execution**.

**Class:** HISTORICAL_COMMIT_CLAIM.

### 3.3 Sanitized-output path

The repository has a deliberate split between raw local logs/captures and shareable sanitized fixtures.

The current `.gitignore` blocks:

- raw logs/captures
- packet captures
- executable and DLL artifacts
- private keys/cert bundles
- environment/credential files
- game binaries/assets

and explicitly re-allows sanitized JSONL under `sanitized-fixtures/`.

**Class:** REMOTE_REPO_FACT.

### 3.4 Research discipline

`research/reference-findings.md`, `runtime-comparison.md`, `baseline-network.md`, `service-map.md`, and `timeline.md` already show a useful separation between:

- architecture ideas
- historical/community claims
- local observations
- cross-version references

This should be retained and normalized into a single protocol/evidence matrix in the next mission.

**Class:** REMOTE_REPO_FACT.

---

## 4. Speculative components / claims

### 4.1 Granite / NBA 2K19 behavior

Granite is useful as a protocol-family and architecture reference, but nothing from Granite should be promoted to NBA 2K17 behavior without independent 2K17 evidence.

Examples that must remain **CROSS_VERSION_REFERENCE** unless separately verified:

- VcFieldList framing details
- login field CRCs
- `SESSION_KEY`
- `SERVICES`
- `PARAMETERS`
- `MANIFEST`
- endpoint-table structure
- session-update behavior
- store / VC / MyCareer / matchmaking route shapes

**Class:** CROSS_VERSION_REFERENCE.

### 4.2 Guessed local VcFieldList/login responses

Later ad-hoc local experiments outside the remote repository produced guessed binary responses. They are not present in current remote `main` and must not be imported as protocol evidence.

If retained for forensic comparison, classify them only as:

`SPECULATIVE / HYPOTHESIS / OBSOLETE_EXPERIMENT`

They must never become fixtures labeled as real NBA 2K17 responses.

### 4.3 Current response ladder

`probe/responses.json` currently contains only small controlled response profiles such as empty 404 / empty 200 / minimal JSON experiments.

This is acceptable experiment-control infrastructure because it does not claim protocol authenticity.

**Class:** REMOTE_REPO_FACT.

---

## 5. Stale project-status documents

Several tracked files contain accurate historical work but stale current-state language.

### 5.1 README.md

The README says:

- the project is a feasibility experiment, not a server;
- NBA 2K17 is not installed on the machine;
- the gate cannot be attempted.

The methodological rules are still useful. The client-state sentence is stale relative to the broader project conversation, but the disputed provenance of later client files means it should **not** simply be rewritten as "client available."

Recommended classification:

`STALE_PROJECT_STATUS`

Recommended future replacement wording:

> Authorized clean-client validation is currently unresolved. The clean-room repository does not depend on third-party game binaries.

### 5.2 docs/live-status.md

This document is heavily tied to the 2026-10-03 ownership/install audit and is no longer a reliable single source of truth for the whole project.

It should be retained as historical evidence, but no longer advertised as the current project status without a dated status header or archival label.

**Class:** STALE_PROJECT_STATUS.

### 5.3 research/baseline-network.md

The procedure is useful, but its opening statement that NBA 2K17 is not installed is historical.

Keep the methodology; update the status language only when an authorized client-validation state is available.

**Class:** STALE_PROJECT_STATUS.

### 5.4 research/service-map.md

The current only row lists:

`nba2k17-ws.2ksports.com : 443`

with transport/port treated as assumed.

That is intentionally conservative, but the table is incomplete relative to later public/historical evidence. It must not be updated from disputed local-client observations alone.

The next mission should add an explicit "evidence source" column so public 2K17 evidence can coexist with authorized-client observations without being conflated.

**Class:** STALE_PROJECT_STATUS / INCOMPLETE.

---

## 6. Missing architecture

The current remote repository is an instrumentation lab, not yet a replacement-service implementation.

Missing components:

### 6.1 Reusable protocol codec

No dedicated, reusable module currently exists for:

- field-list parsing
- field-list encoding
- CRC helpers
- u32/u64 handling
- binary/string field types
- gzip sub-blobs
- malformed-input validation
- round-trip tests

**Status:** MISSING.

### 6.2 Server architecture

There is no `server/` tree containing separated layers for:

- transport
- capture
- codec
- session
- response profiles
- fixtures

**Status:** MISSING.

### 6.3 Dedicated automated tests

There is no dedicated root test tree for protocol/server code.

Existing PowerShell verification scripts are valuable instrumentation tests, but they are not a replacement for deterministic unit tests for codec and server behavior.

**Status:** MISSING.

### 6.4 Real Session/login implementation

There is no evidence-backed NBA 2K17 `Session/login` implementation in remote `main`.

**Status:** MISSING / BLOCKED_ON_EVIDENCE.

### 6.5 Real Session/update implementation

There is no evidence-backed NBA 2K17 `Session/update` implementation in remote `main`.

**Status:** MISSING / BLOCKED_ON_EVIDENCE.

### 6.6 Evidence ledger / protocol matrix

Evidence is currently spread across several documents with slightly different tag systems.

A normalized ledger/matrix is needed.

**Status:** MISSING.

---

## 7. Security / provenance audit

### 7.1 Repository boundary

The remote repository currently demonstrates a strong boundary against game/distribution artifacts via `.gitignore`.

No game executable, DLL tree, private key, or raw memory dump is visible in the audited remote root/tree.

**Class:** REMOTE_REPO_FACT for the audited paths.

This is not proof that the entire git history contains no sensitive object; a separate history/blob audit would be required for that claim.

### 7.2 Private certificate material

The repository design stores private certificate material outside the repo and ignores key/cert container formats.

No private certificate material was identified in the audited visible tree.

**Class:** REMOTE_REPO_FACT for visible tree only.

### 7.3 Sanitized fixture

A sanitized JSONL fixture exists under `sanitized-fixtures/`.

Its presence proves the export path exists, not that every historical capture was safely sanitized.

**Class:** REMOTE_REPO_FACT.

### 7.4 Provenance claims

The repository should not claim that external test binaries are official, licensed, clean, or authorized unless independently established.

Likewise, files from disputed third-party distributions must not be copied into or normalized as part of the clean-room repo.

**Status:** POLICY REQUIREMENT.

### 7.5 Live 2K infrastructure

Tracked policy says live 2K/Take-Two infrastructure is not to be probed.

That rule should remain.

---

## 8. Fresh test status

No tests were freshly executed as part of this remote GitHub audit.

Historical commits report successful verification runs, including 14/14 checks after IPv6 hardening, but these are not current-run test results.

```
FRESH_TEST_STATUS: NOT_RUN
HISTORICAL_TEST_EVIDENCE: PRESENT
```

Do not report historical passes as current CI health.

---

## 9. Initial component classification

| Component | State | Evidence class |
|---|---|---|
| HTTPS diagnostic probe | substantial | REMOTE_REPO_FACT |
| IPv4 loopback support | present | REMOTE_REPO_FACT |
| IPv6 loopback support | present | REMOTE_REPO_FACT |
| process attribution | present | REMOTE_REPO_FACT |
| executable-path recording | present | REMOTE_REPO_FACT |
| sanitized export path | present | REMOTE_REPO_FACT |
| reversible setup/cleanup tooling | present | REMOTE_REPO_FACT |
| historical verification | present | HISTORICAL_COMMIT_CLAIM |
| reusable protocol codec | missing | REMOTE_REPO_FACT |
| server architecture | missing | REMOTE_REPO_FACT |
| dedicated protocol tests | missing | REMOTE_REPO_FACT |
| evidence-backed 2K17 login | missing | REMOTE_REPO_FACT |
| evidence-backed 2K17 session update | missing | REMOTE_REPO_FACT |
| Granite login behavior | reference only | CROSS_VERSION_REFERENCE |
| Granite endpoint table | reference only / do not promote | CROSS_VERSION_REFERENCE |
| later guessed local login payloads | unsupported | HYPOTHESIS / OBSOLETE_EXPERIMENT |
| README current client status | stale | STALE_PROJECT_STATUS |
| live-status current client status | stale | STALE_PROJECT_STATUS |
| service-map | incomplete | STALE_PROJECT_STATUS |

---

## 10. Recommended Mission 2 scope

The next repository task should be **evidence normalization**, not protocol implementation.

Create:

`docs/protocol-matrix.md`

with columns:

- Component
- NBA 2K17 evidence
- Source
- Evidence class
- Confidence
- 2K19/other reference
- Implementation status

Initial rows:

- service hostname
- service port
- TLS
- Session/login
- Session/update
- HTTP method
- content type
- VCFIELDLIST_SIZE
- field framing
- session key
- parameters blob
- services table
- manifest
- environment
- SKU
- account
- VC
- content services
- MyCareer
- matchmaking
- world/Park services

Unknown values must remain `UNKNOWN`.

---

## 11. Mission 1 result

```
REMOTE_REPOSITORY_AUDITED: YES
REMOTE_MAIN_HEAD: 0c12ec5d5664c1891b2064897e9822d193194fa9

LOCAL_BRANCH: UNKNOWN
LOCAL_WORKING_TREE: UNKNOWN
LOCAL_UNPUSHED_CHANGES: UNKNOWN

WORKING_COMPONENTS:
- diagnostic HTTPS probe
- reversible environment scripts
- IPv4/IPv6 loopback support
- process attribution
- redaction / sanitized export
- research documentation

SPECULATIVE_COMPONENTS:
- cross-version Granite assumptions if promoted to 2K17
- guessed local binary login payloads
- any unverified endpoint table

STALE_DOCS:
- README.md current client-state statement
- docs/live-status.md
- research/baseline-network.md status header
- research/service-map.md current assumptions/incompleteness

MISSING_ARCHITECTURE:
- reusable protocol codec
- server/ tree
- dedicated unit/integration tests
- evidence-backed Session/login
- evidence-backed Session/update
- unified protocol/evidence matrix

SECURITY_OR_PROVENANCE_PROBLEMS:
- none identified in the visible remote tree
- full git-history blob audit not yet performed
- external disputed-provenance client material must stay outside repository

FRESH_TEST_STATUS:
NOT_RUN
```

**MISSION 1 COMPLETE.**
