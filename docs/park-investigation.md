# Park Investigation

## Problem statement

In the reported modified-client run, the client reached Park-related service calls and later stalled around **30% loading**.

Known pre-stall calls included:

- `ParkGameStatsV3/ParkChooseAffiliation`
- `ParkGameStatsV3/ParkSummary`
- `ParkGameStatsV3/TopRepPlayer`

The operator also reported client-memory strings related to Park sessions, relay handling, and Steam matchmaking.

None of those observations alone proves the root cause.

## Experiment history

### H1-A — richer ParkSummary response

**Variable changed:** Park summary response completeness.

The reported candidate response included affiliation, rival park, streak, and park type.

**Observed outcome:** loader remained at the same reported 30% point.

**Interpretation:** this specific response change did not unlock the Park. It **weakens H1**, but does not prove every Park response is complete and does not rule out another missing response field or another Park-related service response.

Do not record this as “H1 disproven.”

## Competing hypotheses

### H1 — Response-data deficiency — WEAKENED
One richer ParkSummary candidate did not change the loader.

**Remaining prediction:** some other required Park response field/service response could still gate progression.

### H2 — Missing service-directory entry — OPEN
The client expects an additional 2K17-specific service absent from the cross-version directory.

**Prediction:** a local service lookup fails before a socket/request is opened.

### H3 — Lobby-state dependency — NEXT OBSERVATION LANE
The client requires a Steam lobby/session object before Park can continue.

**Prediction:** `RequestLobbyList`, `CreateLobby`, `JoinLobby`, or related lobby calls correlate with the Park transition/stall.

**Method:** observe the debug Steam log first. Do not change lobby return behavior until the call sequence is known.

### H4 — Relay-state dependency — OPEN / PARALLEL OBSERVATION
The client needs relay candidates, relay pings, or a selected relay before Park initialization completes.

**Prediction:** relay state appears locally or a new socket is attempted around the 30% barrier.

### H5 — Multiple dependencies — OPEN
The 30% marker may be a barrier waiting for several asynchronous prerequisites.

**Prediction:** satisfying one prerequisite alone causes no progress until another is also present.

## Required method

Change **one variable per behavioral experiment**.

Observation-only instrumentation is allowed in parallel because it does not alter client/server behavior.

For every behavioral experiment record:

- exact server commit;
- exact response profile/fixture;
- exact one variable changed;
- route summary before/after;
- Steam lobby-call summary if relevant;
- loading percentage/state transition;
- new socket/request if any;
- session stability;
- outcome: supports / weakens / does not distinguish.

## Current order

1. **Observe H3** using the Steam debug log.
2. **Observe H4** using existing local transport/process instrumentation.
3. **Keep H2 open** and investigate service lookup if H3/H4 remain negative.
4. Revisit H1 only when a new concrete missing field/response is observed.
5. Build relay/world infrastructure only if evidence points there.

## Security boundary

Park interoperability work may inspect local program behavior and independently implement compatible services, but this project does not use that work to defeat DRM, authentication, anti-cheat, executable integrity, ownership checks, or other security mechanisms.
