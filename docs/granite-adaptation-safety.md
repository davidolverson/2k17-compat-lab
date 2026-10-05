# Granite Adaptation Safety Policy

Granite is a valuable cross-version reference, but it was built around a later game generation. The compatibility project has already observed at least one structural difference between reported 2K17 data and the 2K19 reference.

Therefore **a handler existing in Granite is not sufficient evidence that it is safe to mutate 2K17 state**.

## State-mutating routes

Treat these categories as high risk until individually validated:

- VC credit/debit/purchase;
- attribute upgrades;
- inventory/consumable changes;
- entitlement/ownership grants;
- UserContent upload/delete/overwrite;
- MyCareer progression writes;
- roster/settings cloud writes;
- MyTeam economy/progression;
- any endpoint that returns a new authoritative state blob.

## Before a mutating experiment

1. Snapshot the relevant local save directory.
2. Record the exact Granite adaptation commit.
3. Record current VC/attributes/inventory/state.
4. Capture the request and response metadata.
5. Change one behavior only.
6. Perform the smallest possible mutation.
7. Re-read state from the client.
8. Restart the server and verify state.
9. Restart the client only if persistence across client restart is the target.
10. Compare hashes/state against the pre-experiment snapshot.

## Snapshot command

Use:

```powershell
.\scripts\snapshot-directory.ps1 -SourceDir "C:\path\to\save-folder" -Label "before-vc-test"
```

Snapshots are written under ignored `experiment-state/snapshots/` by default.

The tool copies files, verifies SHA-256 equality between source and copy, and writes a manifest.

It does **not** restore files automatically. Restoration is intentionally manual so an experiment cannot silently overwrite newer progress.

## Cross-version handler rules

### Allowed without extra proof
- read-only parsing;
- metadata capture;
- list/query handlers that do not mutate persistent state;
- deterministic synthetic fixtures;
- local logging/diagnostics.

### Requires 2K17-specific proof before trusting
- field defaults;
- catalog ownership;
- prices;
- balances;
- progression formulas;
- save bundle parsing/writing;
- inventory mutation;
- matchmaking/world-state data.

### Explicit red flag
A broad “own everything” or “grant all catalog items” behavior must not be treated as compatibility. It can hide missing entitlement semantics and contaminate later tests.

## Success standard

A state-mutating handler is only promoted from **candidate** to **functional** after:

- expected state changes;
- no unrelated state changes;
- state survives the required restart boundary;
- server and client agree on resulting state;
- backup/snapshot remains available;
- the test is repeatable.
