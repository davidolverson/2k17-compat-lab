# Mission 9 — One-Command Operator Flow + Claude Handoff

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Make the parallel reconstruction workflow operable from Windows with minimal manual setup, fail closed on a red test suite, and produce a deterministic Claude-ready evidence package after capture.

## Added

- `scripts/run-parallel.ps1`
- `scripts/build-claude-handoff.js`
- `scripts/build-claude-handoff.ps1`
- `tests/handoff.test.js`
- `.github/workflows/ci.yml`
- `npm run handoff:claude`

Updated:

- `.gitignore`
- `package.json`
- `tests/run.js`

## Windows operator flow

From the repository root:

```powershell
.\scripts\run-parallel.ps1
```

The wrapper:

1. verifies Node.js and npm are available;
2. runs the complete repository test suite by default;
3. refuses to start capture when tests fail;
4. creates `server/parallel-reconstruction.local.json` from the tracked example when needed;
5. optionally writes an authorized artifact path into the local config;
6. starts the loopback-only parallel reconstruction runner.

With an authorized local artifact:

```powershell
.\scripts\run-parallel.ps1 -ArtifactPath "C:\path\to\SYNC.BIN"
```

`-SkipTests` exists for deliberate operator use but is not the default.

## Claude handoff flow

After stopping the parallel runner:

```powershell
.\scripts\build-claude-handoff.ps1
```

or:

```
npm run handoff:claude
```

The generator produces:

- `handoff.json`
- `CLAUDE_PROMPT.md`

under a local ignored `handoffs/claude/<timestamp>/` directory when using the PowerShell wrapper.

## Handoff guarantees

The generator:

- requires a real `session-manifest.json`;
- hashes each evidence summary file with SHA-256;
- records exact byte sizes;
- reports observed WebSocket and UDP event counts;
- carries artifact hash/size/evidence class when present;
- begins with `claimsPromoted: []`;
- instructs the next model to distinguish observations from hypotheses;
- forbids live 2K probing and security-verification bypasses;
- asks for the smallest next experiment with the highest information gain.

It does not bundle raw game assets, raw cache bytes, credentials, keys, or unrelated traffic.

## Git hygiene

The following are now explicitly ignored:

- `server/parallel-reconstruction.local.json`
- `handoffs/`

Raw server captures were already ignored.

## CI

A minimal GitHub Actions workflow now runs `npm test` on push and pull requests using Node 20.

A workflow result must still be observed before calling the head commit green.

## Mission status

`MISSION_9_IMPLEMENTED_AWAITING_CI_RESULT_AND_REAL_EVIDENCE`
