# Mission 12 — Systematic Compatibility Program

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Move from ad-hoc endpoint chasing to a repeatable compatibility program that can work multiple fronts in parallel without confusing observed behavior, placeholders, cross-version references, and guesses.

## Added

- `docs/feature-matrix.md`
- `docs/build-in-public-backlog.md`
- `docs/park-investigation.md`
- `scripts/summarize-probe-log.js`
- `tests/probe-summary.test.js`
- `npm run summarize:probe`

## Evidence policy

The operator supplied a long local run log describing a modified-client experiment that reached session, account, VC, UserContent, MyCareer, and Park-related paths.

Those observations are recorded as:

```
USER_REPORTED_MODIFIED_CLIENT_OBSERVATION
```

They are useful for compatibility work, but they are not promoted to the original README's legitimate-client gate.

Cross-version Granite behavior remains:

```
CROSS_VERSION_REFERENCE
```

unless a 2K17 observation independently supports it.

## Workstreams

### A — Core session and service directory
Keep login/update stable, preserve request IDs, and replace inferred service mappings with observed mappings over time.

### B — Stateful progression
Prioritize:
- UserContent persistence;
- MyCareer saves;
- VC balance and transactions;
- attributes;
- account state.

A stateful feature is not considered working until it survives restart and reconciles correctly.

### C — Park / multiplayer
Treat the reported 30% Park stall as a hypothesis-testing problem.

Do not jump directly from a memory string or a 2K19 architecture to a new relay/world server.

### D — Client QoL
Keep features such as Skip All Cutscenes in a separate client-mod lane so they do not contaminate server compatibility work.

No QoL item is allowed to depend on DRM, authentication, anti-cheat, certificate checks, or executable-integrity bypasses.

## Probe route summary

Run:

```
npm run summarize:probe -- <path-to-probe.jsonl>
```

The summary reports:

- unique method/path routes;
- request counts;
- repeated routes;
- observed body lengths;
- unique complete-body hashes without exporting the bodies;
- response labels/statuses;
- attributed PIDs;
- truncation counts;
- heuristic fallback/generic-response flags.

It never exports `bodyRaw`.

Malformed JSONL lines are reported explicitly rather than silently skipped.

## Current priority order

1. Prove save persistence round trip.
2. Remove generic success behavior from P0 stateful routes.
3. Isolate the Park 30% dependency with one-variable experiments.
4. Generate route summaries after every meaningful run.
5. Work low-risk client QoL in parallel, beginning with feasibility research for Skip All Cutscenes.
6. Only after Park session creation works, move into multi-client transport/gameplay networking.

## Mission status

`MISSION_12_ACTIVE_SYSTEMATIC_COMPATIBILITY_PROGRAM`
