# Mission 5 — Evidence Schema, Ledger, and Import Pipeline

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Make future request captures ingestible without changing the transport layer, while preventing a mislabeled or synthetic fixture from silently becoming `OBSERVED_2K17`.

## Added

### Runtime evidence modules

- `server/src/evidence/constants.js`
- `server/src/evidence/validate-sanitized.js`
- `server/src/evidence/import-capture.js`

### Import CLI

- `scripts/import-sanitized-capture.js`

### Schemas

- `evidence/schemas/sanitized-request-v2.schema.json`
- `evidence/schemas/evidence-candidate-v1.schema.json`

### Ledger

- `evidence/ledger.json`
- `docs/evidence-ledger.md`

### Tests

- `tests/evidence.test.js`

### CI

- `.github/workflows/test.yml`

## Sanitized-request v2

Mission 5 upgrades sanitized capture output from v1 to:

`2k17-compat-lab.sanitized-request.v2`

The new format adds a mandatory provenance block:

```json
{
  "source": {
    "kind": "UNVERIFIED_LOCAL",
    "runId": "replace-with-run-id",
    "instrument": "capture-first-server",
    "authorizationStatus": "UNVERIFIED",
    "clientFingerprintSha256": null
  }
}
```

Supported source kinds:

- `LAB_SELFTEST`
- `AUTHORIZED_CLIENT_CAPTURE`
- `SYNTHETIC_TEST`
- `UNVERIFIED_LOCAL`

## Promotion gate

The import pipeline never outputs `OBSERVED_2K17`.

The strongest automatic classification is:

`OBSERVED_2K17_CANDIDATE`

and only when all of these are true:

1. the fixture validates as sanitized-request-v2;
2. source kind is `AUTHORIZED_CLIENT_CAPTURE`;
3. authorization status is `AUTHORIZED`;
4. a syntactically valid SHA-256 client fingerprint is present.

Even then:

```
promotionStatus: REVIEW_REQUIRED
promotedEvidenceClass: null
```

A project-lead review must promote individual claims manually.

## Raw-data exclusion

The v2 validator rejects sanitized fixtures containing:

- `body`
- `bodyRaw`
- `rawBody`
- `bodyBase64`
- `bodyHex`
- `bodyPath`

It also requires sensitive headers to be redacted and raw query strings to be absent.

The body hash and size are retained so a sanitized fixture can be correlated with raw local evidence without committing the bytes.

## Import command

```
npm run import:evidence -- <sanitized-request-v2.json>
```

Default candidate output:

`server/captures/imported-local/CAND-....candidate.json`

This path is covered by the existing `server/captures/` Git ignore.

## Old probe fixture

The historical committed JSONL fixture is intentionally **not** accepted by this importer.

It is a lab self-test event log, not a sanitized-request-v2 client request.

It remains ledger entry `E004` with class:

`INSTRUMENT_SELFTEST`

## Initial evidence ledger

`evidence/ledger.json` starts with five reviewed claims:

- E001 — public 2K17 hostname evidence
- E002 — historical port 17217 evidence
- E003 — public PC trusted-certificate feasibility report
- E004 — committed probe fixture is self-test only
- E005 — Granite field-list framing is cross-version reference only

## Tests added

Mission 5 covers:

- provenance-aware v2 sanitization
- valid v2 validation
- raw-body/path rejection
- unredacted secret rejection
- SHA-256 validation
- authorized capture candidate creation
- no-fingerprint downgrade to UNVERIFIED
- self-test isolation
- synthetic-test isolation
- JSON import
- JSONL rejection
- structured validation failures

## CI status

A GitHub Actions workflow has been added to run:

`npm test`

on the working branch, main, and pull requests.

At the time this report was authored, no completed workflow result had yet been observed for the new workflow. Do not report CI green until GitHub returns an actual run result.

## Protocol claims added by Mission 5

None.

Mission 5 changes evidence handling, not the NBA 2K17 protocol model.

## Next gate

Mission 6 can now focus on verified public-source research and convert each finding into a concrete ledger entry without weakening the capture-evidence rules.
