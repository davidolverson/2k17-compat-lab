# Mission 8 — Parallel Reconstruction

**Date:** 2026-10-05  
**Branch:** `work/deepseek-protocol-reconstruction`

## Goal

Stop sequencing independent research lanes unnecessarily. Build one safe workflow that can:

- structurally analyze an authorized historical cache artifact;
- capture loopback WebSocket behavior;
- capture loopback UDP behavior;
- analyze captured HTTP request bodies separately;
- compare multiple artifact structure reports;
- preserve evidence provenance instead of merging guesses.

## Existing lanes confirmed on branch

The branch already contained:

- `scripts/analyze-cache-artifact.js`
- `scripts/analyze-request-capture.js`
- `scripts/start-websocket-capture.js`
- `scripts/start-udp-capture.js`
- `scripts/compare-cache-analysis.js`
- `server/src/artifact/structural-analyzer.js`
- `server/src/protocol/request-analyzer.js`
- `server/src/realtime/websocket-capture.js`
- `server/src/realtime/udp-capture.js`
- tests for artifact, request, realtime, and parallel comparison behavior

## Added in Mission 8

- `scripts/run-parallel-reconstruction.js`
- `server/parallel-reconstruction.example.json`
- `docs/parallel-reconstruction.md`
- `npm run reconstruct:parallel`
- loopback-only tests for the parallel runner

## Parallel behavior

The runner starts WebSocket and UDP capture concurrently and, when an artifact path is supplied, runs the structural artifact analyzer concurrently with listener startup.

This is an execution optimization only. Evidence is kept separated as:

- `TRANSPORT_OBSERVATION`
- `LOCAL_AUTHORIZED_ARTIFACT_ANALYSIS`
- `CROSS_VERSION_REFERENCE`
- `CROSS_VERSION_REFERENCE_CANDIDATE`

No parallel lane automatically promotes another lane's observations.

## Current blocker

The software lanes are ready, but no real NBA 2K17 protocol claim can be promoted without attributable authorized evidence.

That means the next useful inputs are one or both of:

1. an authorized historical `SYNC.BIN` or equivalent cache artifact for read-only analysis;
2. attributable local traffic from a legitimate NBA 2K17 client.

Without one of those inputs, additional server behavior would be invention rather than reconstruction.

## Test status

The new runner has unit-level safety coverage on the branch. At the time this report was written, no GitHub Actions run was attached to the latest Mission 8 commit, so fresh full-suite CI status is **PENDING / NOT YET OBSERVED**.

Do not report the branch as fully green until a real test run provides exact counts.

## Mission status

`MISSION_8_IMPLEMENTED_AWAITING_FRESH_TEST_RUN_AND_REAL_EVIDENCE`
