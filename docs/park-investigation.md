# Park Investigation

## Problem statement

In the reported modified-client run, the client reached Park-related service calls and later stalled around **30% loading**.

Known pre-stall calls included:

- `ParkGameStatsV3/ParkChooseAffiliation`
- `ParkGameStatsV3/ParkSummary`
- `ParkGameStatsV3/TopRepPlayer`

The logs also report client-memory strings related to Park sessions, relay handling, and Steam matchmaking.

None of those observations alone proves the root cause.

## Competing hypotheses

### H1 — Response-data deficiency
The Park service replies are structurally accepted but omit required affiliation/rep/session fields.

**Prediction:** a controlled improvement to one Park response changes the load percentage or causes a new request.

### H2 — Missing service-directory entry
The client expects an additional 2K17-specific service that is absent from the cross-version directory.

**Prediction:** the client performs a local lookup for a service identifier and stalls before opening a socket.

### H3 — Lobby-state dependency
The client requires a Steam lobby/session object before Park can continue.

**Prediction:** lobby creation/list/join events correlate with the transition beyond the current state.

### H4 — Relay-state dependency
The client needs relay candidates, relay pings, or a selected relay before Park initialization completes.

**Prediction:** relay state appears in client-local state before any world connection, and providing a valid local candidate changes behavior.

### H5 — Multiple dependencies
The 30% marker may represent a barrier waiting for several asynchronous prerequisites.

**Prediction:** satisfying any single dependency does not advance the loader until the rest are also ready.

## Required method

Change **one variable per run**.

For every experiment record:

- exact server commit;
- exact response profile/fixture;
- request sequence before the change;
- request sequence after the change;
- loading percentage/state transition;
- whether a new socket/request appears;
- whether the session remains stable;
- result: supports / weakens / does not distinguish each hypothesis.

## Experiment order

1. **Response completeness first.** Cheapest and least invasive.
2. **Service-directory lookup instrumentation.**
3. **Lobby lifecycle observation.**
4. **Relay lifecycle observation.**
5. Only then build a new relay/world component.

Do not jump directly to a 2K19 world-server architecture simply because one exists publicly.

## Park response experiment contract

A Park response experiment is successful only if it produces a new deterministic observation:

- loader advances;
- loader fails earlier/later;
- a new request appears;
- a new local lobby/relay state appears;
- or the client emits a distinct error.

“No crash” is not a result.

## Security boundary

Park interoperability work may inspect local program behavior and independently implement compatible services, but this project does not use that work to defeat DRM, authentication, anti-cheat, executable integrity, or other security checks.
