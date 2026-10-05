# Reference Field-List Codec

## Status

`server/src/codec/reference-field-list.js` is a **CROSS_VERSION_REFERENCE** implementation.

It is based on the framing behavior documented in the public NBA 2K19 Granite project at reference commit:

`20c3d875907498eb9e3780553a45f3c451885777`

It is **not evidence that NBA 2K17 uses this framing**.

## Why this exists before a real 2K17 request

The project needs a deterministic parser/encoder ready for the moment a real authorized 2K17 request is captured. Building the generic mechanism now is useful because it lets the first future capture be tested against a bounded parser immediately without inventing 2K17-specific field names, routes, or responses.

The module therefore exposes only:

- generic record parsing,
- generic record building,
- public 2K19 reference type IDs under the explicit name `REFERENCE_2K19_TYPES`,
- CRC32 tooling,
- gzip helpers,
- malformed-input checks,
- trailing-data preservation.

It does **not** contain:

- NBA 2K17 login constants,
- NBA 2K17 field CRCs,
- NBA 2K17 service URLs,
- NBA 2K17 endpoint tables,
- NBA 2K17 response fixtures,
- dummy tokens,
- guessed VC/account/Park data.

## Reference framing implemented

The cross-version reference format is:

```
repeated 16-byte records:
  u32 BE field id / CRC
  u32 BE type id
  u32 BE data1
  u32 BE data2

16-byte all-zero terminator

data section
```

The parser does not require field IDs to be known. Unknown type IDs remain parseable and preserve both raw data words.

## Safety / correctness behavior

The parser:

- requires a `Buffer`,
- validates optional declared size,
- finds only an aligned 16-byte zero terminator,
- enforces a configurable maximum field count,
- bounds-checks data references,
- records out-of-range references instead of silently slicing them,
- optionally recognizes gzip by its wire header,
- preserves trailing bytes when a declared field-list size is supplied.

The builder:

- uses big-endian 32-bit record words,
- supports generic scalar/reference types,
- aligns variable data deterministically,
- always emits an explicit zero terminator,
- can append opaque trailing bytes.

## Promotion gate

This codec remains `CROSS_VERSION_REFERENCE` until an authorized NBA 2K17 capture satisfies all of the following:

1. a genuine client request body is preserved byte-for-byte locally;
2. the record table parses without relaxing alignment/bounds checks;
3. the terminator/data boundary is deterministic across repeated requests;
4. multiple observed fields resolve consistently under the framing;
5. changing no parser assumptions yields repeatable decoding.

Only then may the protocol matrix promote **framing compatibility** to `OBSERVED_2K17`.

Even after that, individual field type IDs and field-name CRCs remain independently unverified until evidence supports each one.

## Tests

The repository test harness is intentionally dependency-free:

```
npm test
```

It covers:

- provenance labeling,
- standard CRC32 vector,
- empty list,
- u32/bool/f32/u64 round-trip,
- string8/string16/binary round-trip,
- deterministic data alignment,
- declared-size trailing data,
- gzip round-trip / auto-detection,
- missing terminator rejection,
- invalid declared size rejection,
- maximum-field limit,
- out-of-range data references,
- unknown types,
- structured parse failure.

Fresh test results must come from an actual execution environment. A committed test file is not itself evidence that the tests pass.
