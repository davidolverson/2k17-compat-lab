# Mission 4 — Capture-First Transport Report

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`  
**Mission:** Build the clean replacement-service transport/capture layer without inventing NBA 2K17 protocol behavior.

## Added

- `server/src/capture/sanitize.js`
- `server/src/capture/capture-store.js`
- `server/src/response/profiles.js`
- `server/src/transport/http-capture.js`
- `server/src/transport/https-server.js`
- `server/src/index.js`
- `server/config.example.json`
- `tests/transport.test.js`
- `docs/server-transport.md`

Updated:

- `.gitignore`
- `package.json`
- `tests/run.js`

## Behavior

The server is capture-first.

Default response:

`CAPTURE_ONLY_404`

Incoming application requests are:

1. read with a configured body-size bound,
2. preserved byte-for-byte in `server/captures/raw-local/`,
3. SHA-256 hashed,
4. accompanied by raw local metadata,
5. optionally exported as sanitized metadata,
6. answered using an explicitly test-only response profile.

No guessed `Session/login` payload is active.

## Evidence separation

Raw local evidence:

`server/captures/raw-local/`

is explicitly ignored by Git.

Sanitized exports do not contain the raw body and redact:

- authorization,
- cookies,
- token/session headers,
- Steam-ticket/Steam-ID-like headers,
- API-key-like headers,
- raw query strings.

## Response profiles

Current profiles are experiment controls, not production protocol claims:

- `CAPTURE_ONLY_404`
- `TEST_ONLY_EMPTY_200`
- `TEST_ONLY_EMPTY_BINARY_FIELD_LIST`

The binary field-list profile is explicitly labeled:

`CROSS_VERSION_REFERENCE_TEST_ONLY`

and is not an NBA 2K17 response claim.

## TLS evidence rule

`secureConnection` is recorded as transport-level establishment only.

A TLS EOF/FIN/error after ServerHello/certificate delivery does not establish certificate pinning.

## VCFIELDLIST_SIZE

If present as a non-negative integer header, its value is recorded.

The transport does not require it and does not infer a field-list protocol merely from the header.

## Tests

A separate local Node mirror of the Mission 4 modules was syntax-checked successfully and exercised ten targeted cases covering:

- sensitive-header redaction,
- raw-local capture persistence,
- sanitized metadata export,
- default 404 profile,
- explicit response-rule selection,
- cross-version test-only field-list profile labeling,
- VCFIELDLIST_SIZE parsing,
- invalid VCFIELDLIST_SIZE handling,
- request-body limit acceptance,
- request-body overflow rejection,
- query redaction.

Targeted Mission 4 checks passed.

**Important:** the full GitHub branch `npm test` suite has not been executed from the user's Windows checkout during this mission. The branch contains the combined codec + transport suite, but fresh full-suite status remains `NOT_RUN_ON_USER_CHECKOUT` until actual shell output is supplied.

## Protocol claims added by Mission 4

None.

This mission adds transport, evidence handling, and test-only response controls. It does not promote any 2K17 route, field ID, binary framing, login response, session key, service table, or realtime transport to observed fact.

## Next gate

Mission 5 should standardize the sanitized capture schema and evidence ledger so a future real request can be imported without changing the transport layer.
