# Contributing

Read `docs/UP_NEXT_MASTER_SPEC.md` first. It is the contract; this page is the
short working version for someone about to open a pull request.

There is **no project licence yet** (`docs/license-decision.md`). Until one is
chosen, do not assume your contribution or anyone else's can be reused outside
this repository.

## The clean-room rule

Every contribution must be your own work, derived only from:

- behaviour you observed from a lawfully licensed, unmodified client talking to
  software you control on your own machine;
- public documentation and public, appropriately licensed repositories, cited;
- mechanical derivation from an observed value, with the command that
  reproduces it.

You must not submit, and must not have used to produce your contribution:

- leaked or proprietary source, or code copied or transliterated from a
  decompiler or disassembler;
- commercial game or server binaries, or assets extracted from them;
- private keys, credentials or tokens belonging to anyone;
- a "real response" whose origin you cannot state.

Code adapted from another project keeps that project's licence and notice and
goes in a clearly marked location. Behaviour copied from another title or
version is REFERENCE: a lead, never a fact about this client.

By opening a pull request you declare that the above is true of everything in
it. The pull request template asks you to say so explicitly. Claims generated
by an AI model follow exactly the same rules: a model's confidence is not
evidence.

## Evidence policy

Every protocol statement carries one class:

| Class | Meaning |
|---|---|
| OBSERVED | emitted by the client, or shown by attributable runtime evidence |
| DERIVED | mechanically reproducible from an observed value |
| REFERENCE | from another title, version or project |
| HYPOTHESIS | plausible, not evidenced |
| IMPLEMENTED | code exists; says nothing about correctness |

Rules that reviewers will hold you to:

- HTTP 200 is not correctness. A reply the client tolerated is not a reply the
  original service sent.
- Unknown stays unknown: `null`, `UNKNOWN_*`, never a zero or a guessed name.
- A name is attached to an id only when it reproduces the id (for example
  `CRC32(name)`), and guessing names from a large vocabulary proves nothing.
- A fact promoted from a live experiment needs an experiment manifest
  (`evidence/manifests/TEMPLATE.md`): client hash and supply, both commits,
  config digest, explicit capture range, expected and actual observation,
  verdict, remaining unknowns.
- A dirty or unattributable runtime is fine for discovery and never for proof.
- One experimental variable per experiment, one question per commit. A failed
  experiment with clean evidence is a result; commit it.

## Privacy and redaction

Public evidence must not contain platform ids, session keys, tickets, emails,
account or machine user names, personal paths, certificate material, raw
payloads, or hashes of any of those. Use neutral labels (`S1`, `B1`,
`TOKEN_A`) assigned in order of first appearance.

Raw captures stay outside the repository. Fixtures are produced by the
sanitizer in `tools/m001/lib.js`, which refuses to write if a private value
survives. If you add a field type or a new kind of evidence document, add the
sanitizer case, an adversarial test and a validator entry in the same pull
request.

## Before you push

```
npm test         # unit, gate and sanitizer tests
npm run check    # project state, evidence schema, forbidden artifacts
```

Both must pass with no skips. Then read your own diff. The checks catch
patterns; only you know what the values mean.

If a check blocks something legitimate, add an entry to
`tools/repo/forbidden-allow.json` with the reason. Do not weaken a rule,
lower a threshold or delete a test to get a pull request through.

## Status

Status is stated once, in `project-state.json`. Do not write "current state"
into a README or a doc; change the state file, in the same commit as the
evidence that justifies the change. A condition becomes `MET` only with
committed evidence and a manifest.

## Commits

Conventional prefixes with the milestone in scope, one question each:

```
test(m001): make acceptance fail on skips
privacy(m001): replace raw request fingerprints
evidence(m001): record relay experiment R-004
ci: validate sanitized evidence and forbidden artifacts
docs: make project-state the status source of truth
```

Never amend or rewrite a commit that evidence already cites.
