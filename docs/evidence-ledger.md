# Evidence Ledger and Capture Import Workflow

## Purpose

`evidence/ledger.json` is the machine-readable claim ledger for the project.

`docs/protocol-matrix.md` answers:

> What do we currently think is known about each protocol component?

The evidence ledger answers:

> Which concrete pieces of evidence support those claims, what class are they, and what are they allowed to prove?

These are intentionally separate.

## Evidence lifecycle

A future client capture does **not** go directly from raw bytes to `OBSERVED_2K17`.

The pipeline is:

```
raw-local request
    |
    v
sanitized-request.v2
    |
    v
strict validation
    |
    v
evidence candidate
    |
    v
REVIEW_REQUIRED
    |
    +-- provenance verified
    +-- client fingerprint checked
    +-- capture context checked
    +-- raw bytes locally available
    |
    v
manual promotion of individual claims
```

No importer automatically edits `docs/protocol-matrix.md` or `evidence/ledger.json`.

That is deliberate.

## Sanitized request v2

Schema:

`evidence/schemas/sanitized-request-v2.schema.json`

Runtime validator:

`server/src/evidence/validate-sanitized.js`

Required provenance block:

```json
{
  "source": {
    "kind": "AUTHORIZED_CLIENT_CAPTURE",
    "runId": "run-...",
    "instrument": "capture-first-server",
    "authorizationStatus": "AUTHORIZED",
    "clientFingerprintSha256": "<64 hex characters>"
  }
}
```

Supported source kinds:

- `LAB_SELFTEST`
- `AUTHORIZED_CLIENT_CAPTURE`
- `SYNTHETIC_TEST`
- `UNVERIFIED_LOCAL`

Supported authorization statuses:

- `AUTHORIZED`
- `UNVERIFIED`
- `NOT_APPLICABLE`

## Conservative promotion rule

Even a fixture labeled:

`AUTHORIZED_CLIENT_CAPTURE`

does not automatically become `OBSERVED_2K17`.

To become an `OBSERVED_2K17_CANDIDATE`, the importer requires:

1. source kind = `AUTHORIZED_CLIENT_CAPTURE`
2. authorization status = `AUTHORIZED`
3. a syntactically valid SHA-256 client fingerprint
4. a valid sanitized-request-v2 document

The result still contains:

```
promotionStatus: REVIEW_REQUIRED
promotedEvidenceClass: null
```

A human/project-lead review is mandatory.

This protects against accidentally promoting a mislabeled fixture, synthetic test, renamed process, or stale capture.

## Raw body policy

The sanitized fixture contains:

- body byte length
- body SHA-256
- whether raw bytes remain stored locally

It must not contain:

- raw body bytes
- base64 body
- hex body
- a local raw body path
- raw query values
- unredacted sensitive headers

The raw body stays under:

`server/captures/raw-local/`

which is ignored by Git.

## Import command

```
node scripts/import-sanitized-capture.js <fixture.json>
```

or:

```
npm run import:evidence -- <fixture.json>
```

Default output:

`server/captures/imported-local/CAND-....candidate.json`

That directory is also covered by the existing `server/captures/` ignore rule.

The importer accepts **one sanitized-request-v2 JSON object**.

It intentionally rejects old probe JSONL event logs.

The existing:

`sanitized-fixtures/probe.66686d164ca1.sanitized.jsonl`

is an instrument self-test artifact and is recorded in the ledger as `INSTRUMENT_SELFTEST`. It must not be imported as an NBA 2K17 client request.

## Candidate classes

### OBSERVED_2K17_CANDIDATE

The provenance metadata is structurally sufficient for review as a possible real client observation.

It is **not yet OBSERVED_2K17**.

### INSTRUMENT_SELFTEST

Created by the lab itself. Useful for validating the instrument, never for asserting game behavior.

### SYNTHETIC_TEST

Authored by tests or controlled synthetic clients.

### UNVERIFIED

Origin or authorization cannot be established strongly enough for promotion.

## Promotion granularity

Promotion happens per claim.

For example, one reviewed request might establish:

- hostname
- port
- HTTP method
- request path
- one header
- body length
- perhaps a deterministic framing rule

It does **not** automatically establish:

- every field type
- login response format
- session-key semantics
- service tables
- VC behavior
- Park transport

Each of those needs its own evidence.

## Current ledger

The initial tracked ledger contains:

- E001 — public 2K17 hostname evidence
- E002 — historical 17217 port evidence
- E003 — public PC trusted-certificate feasibility report
- E004 — committed probe fixture classified as self-test only
- E005 — Granite field-list framing classified as cross-version reference

The ledger should be extended only when a concrete source can be named.
