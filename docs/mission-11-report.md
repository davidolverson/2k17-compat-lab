# Mission 11 — Offline Local Evidence Discovery

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Remove the remaining manual search step between a Windows checkout and the first real evidence-bearing run.

## Added

- `scripts/discover-local-evidence.ps1`
- `-AutoDiscover` support in `scripts/run-parallel.ps1`
- Windows CI coverage using a synthetic Steam/AppID 385760 fixture

## Discovery behavior

The script is read-only. It checks local Steam roots for:

- `steamapps/appmanifest_385760.acf`
- the manifest's declared install directory
- `NBA2K17.exe` under the corresponding Steam library
- `userdata/*/385760/local/SYNC.BIN`
- `userdata/*/385760/remote/SYNC.BIN`

For each `SYNC.BIN` candidate it records only:

- path
- exact byte size
- SHA-256
- last-write time
- Steam root

It does not copy or modify the artifact.

It writes its machine-local result to:

```
experiment-state/local-evidence-discovery.json
```

That directory is already ignored by Git.

## Network boundary

Discovery does not contact Steam, 2K, or any other network service.

Its output explicitly records:

```
networkContacted: false
claimsPromoted: []
```

## One-command use

Run:

```powershell
.\scripts\run-parallel.ps1 -AutoDiscover
```

Behavior:

- if a legitimate local client is found, its path is reported;
- if exactly one `SYNC.BIN` candidate exists, it is automatically selected for read-only structural analysis;
- if multiple candidates exist, none is silently chosen;
- if no artifact exists, the realtime loopback capture workflow can still start.

The script does **not** automatically launch Steam or the game.

## CI proof

Windows CI builds a synthetic Steam library containing:

- AppID `385760` manifest;
- a synthetic `NBA2K17.exe` placeholder;
- one synthetic `SYNC.BIN`.

It then verifies:

- client discovery succeeds;
- exactly one cache candidate is found;
- discovery remains offline;
- no protocol claim is promoted.

This synthetic fixture proves the instrumentation path only. It is not NBA 2K17 evidence.

## Current real-evidence state

No actual `SYNC.BIN`, NBA 2K17 binary, or attributable client capture is attached to the current project/library context.

The repository therefore cannot honestly promote an `OBSERVED_2K17` protocol claim yet.

## Mission status

`MISSION_11_IMPLEMENTED_REAL_EVIDENCE_REQUIRED`
