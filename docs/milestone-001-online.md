# Milestone 001 — ONLINE FOUNDATION

Status: **ACTIVE**  
Branch: `work/m001-online-foundation`  
Date opened: 2026-10-05

## Objective

Move from "the client can authenticate against replacement infrastructure" to a repeatable online foundation that can support real product features.

The milestone is complete only when:

1. A client authenticates and maintains a stable replacement-service session.
2. The client enters the Park/world path without the current ~30% stall.
3. A second independent client can do the same.
4. The replacement infrastructure can distinguish the two players with stable internal player IDs.
5. Required requests on the successful path are handled intentionally; no critical request succeeds only because of a generic catch-all.
6. The working behavior is reproducible after a clean server restart.

## Current local operator evidence

These facts are based on the current local Granite-based runtime and must be promoted to repository FACT only after sanitized evidence is committed.

- NBA 2K17 reaches the replacement HTTPS service on port 17217.
- `/Session/login` works against the replacement service.
- `/nba/2k17/Session/update` has held the same session across repeated two-minute keep-alives.
- 2K17 user-content bundles use a `BNH!` header variant and the local runtime has been adjusted to accept it.
- MyCareer/content requests are reaching the replacement service.
- Park-related calls observed before the stall include:
  - `ParkGameStatsV3/ParkChooseAffiliation`
  - `ParkGameStatsV3/ParkSummary`
  - `ParkGameStatsV3/TopRepPlayer`
- The Park currently stalls at approximately 30%.
- Existing Park handlers are not yet proven to be semantically correct for 2K17.
- A relay/world component is a candidate dependency, not a proven root cause.

## Evidence rule

Do not turn a plausible cross-version implementation into a 2K17 fact.

Every Park dependency must be classified as one of:

- **OBSERVED** — emitted by the 2K17 client or proven by attributable runtime evidence.
- **DERIVED** — mechanically derived from an observed value with a documented transformation.
- **REFERENCE** — found in another title/version/project and useful only as a lead.
- **HYPOTHESIS** — plausible but not yet evidenced.
- **IMPLEMENTED** — code exists, but this label alone does not prove correctness.

A request is not considered solved merely because the client receives HTTP 200.

## Work order

### M001.1 — Freeze the known-working baseline

- Keep the current local Granite baseline commit available and tagged outside generated/session/capture data.
- Preserve a known-good configuration for login, session update, VC/account/content handlers, and 2K17 save parsing.
- Add a single-command regression check that proves login -> two keep-alives -> save/content request without changing gameplay state.

### M001.2 — Build the Park dependency ledger

For every request from selecting Park until the 30% stall:

- timestamp
- route
- request size
- session/player identity
- handler chosen
- response size
- response classification: intentional / cross-version-reference / generic-fallback
- client-visible state before and after
- evidence location

The ledger should make it impossible to confuse "responded" with "implemented correctly."

### M001.3 — Eliminate critical generic fallthrough

Start with the three already-observed Park endpoints.

For each endpoint:

1. Capture a sanitized 2K17 request fixture.
2. Document known fields without inventing meanings.
3. Compare the active handler against any available reference implementation.
4. Replace generic/cross-version behavior only where 2K17 evidence supports the change.
5. Regression-test the preceding working flow after every change.

### M001.4 — Trace the 30% transition

Instrument the client/server boundary around the exact moment the loading percentage stops moving.

Test hypotheses one at a time:

- missing/incorrect Park response content
- session/world bootstrap data
- relay address or world-service configuration
- a local client-side dependency that never generates a request
- a service callback whose prerequisite was never satisfied

Do not start a relay/world server merely because another version used one. First prove that the 2K17 client needs it at this transition.

### M001.5 — Park entry

Acceptance evidence:

- loading advances past the previous stall
- player reaches the interactive Park/world state
- no required request in the successful sequence is served by a generic fallback
- restart the replacement service and reproduce the result

### M001.6 — Two-client identity

Once one client can enter:

- connect a second independently running client
- assign a stable internal `player_id` to each authenticated identity
- maintain independent `session_id` values
- prove requests can be attributed to the correct internal player
- do not expose raw platform identifiers in public-facing features

### M001.7 — Milestone closeout

Produce a sanitized evidence bundle containing:

- successful request sequence
- endpoint ledger
- regression output
- two distinct internal players/sessions
- known remaining unknowns

Then update `docs/live-status.md` from repository evidence, not from recollection.

## Non-goals for M001

Do not block Park reconstruction on:

- Crew UI
- ranked matchmaking
- leaderboards
- Player Passport web UI
- gameplay balance changes
- purchasable/earned economy redesign
- badge rebalance
- cutscene skipping
- custom courts
- arcade mechanics

Those are downstream product work.

## Product invariant

**Legacy behavior stays recoverable.**

Any future gameplay-changing system must have a known baseline and a reversible/feature-flagged path. Reconstruction evidence must never be overwritten by balance experiments.
