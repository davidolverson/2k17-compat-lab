# Build-in-Public Backlog

This is the public-facing feature backlog. It deliberately separates **server compatibility**, **multiplayer infrastructure**, and **client QoL/modding**.

## Server compatibility

### P0 — Make progression trustworthy
- Persistent MyCareer cloud-save round trip.
- VC balance persistence.
- Attribute price retrieval.
- Attribute purchase transaction with balance reconciliation.
- Account identity/profile state.
- UserContent list/upload/download lifecycle.
- Explicit unsupported responses instead of generic success fallbacks.

### P1 — Make the menus feel alive
- DLC inventory.
- Strings/filter.
- Promo/user-code surfaces.
- MyLeague notifications.
- MyTeam menu queues.
- Consumables/inventory where observed.

## Park / multiplayer

### P0 — Get past the Park loading gate
Work this as a dependency-isolation problem, not a guessing problem.

Track each candidate independently:

- Park summary / affiliation response completeness.
- Park session state.
- Lobby discovery/join behavior.
- Relay discovery/ping/selection.
- Missing service-directory entries.
- Local client state transitions after each response.

**Success criterion:** client advances beyond the reported 30% stall due to one controlled, repeatable change.

### P1 — Session lifecycle
- Create/join/leave Park session.
- Player presence.
- Court/session assignment.
- Reconnect.
- Clean session teardown.

### P2 — Gameplay networking
Only after session creation works:
- peer discovery / relay selection;
- gameplay transport;
- state sync;
- disconnect/rejoin;
- multi-client test harness.

## Client QoL / Build-in-Public ideas

These are **not server features** and should live in a separate client-mod lane.

### Skip All Cutscenes
**Idea:** one toggle that automatically skips every supported cutscene rather than requiring manual skips.

Public poll copy:

> **Skip All Cutscenes**
>
> Would you like the project to include a **Skip All Cutscenes** option?
>
> When enabled, supported cutscenes would be skipped automatically so you can get straight into gameplay.
>
> **Yes — Add it**  
> **No — Keep cutscenes as-is**

Engineering constraints:
- Prefer supported game settings, scripts, data/config hooks, or ordinary mod interfaces.
- Do not couple this feature to authentication, DRM, anti-cheat, executable integrity checks, or security bypasses.
- Maintain a compatibility list because some cutscenes may carry required state transitions.
- The default should remain off until every skipped sequence is regression-tested.

### Other QoL candidates
- Faster boot / intro-skip where safely moddable.
- Borderless-windowed preset for development/testing.
- Server status indicator.
- Local save backup/restore UI.
- Compatibility diagnostics screen.
- One-click log bundle with automatic redaction.
- “Offline-safe mode” that disables server-dependent actions when a handler is not ready.

## Public development rule

Do not announce a feature as “working” just because a request is received.

Use these labels publicly:

- **Observed** — the client asked for it.
- **In progress** — handler exists but behavior is incomplete.
- **Functional** — expected behavior works in one controlled run.
- **Persistent** — survives restart and state reconciliation.
- **Stable** — repeatable across multiple clean runs.
