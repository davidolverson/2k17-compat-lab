# Product Roadmap — Revival to Platform

This roadmap separates **service reconstruction** from **new product development** so new features do not corrupt the known-working compatibility baseline.

## Operating rule

Every new behavior belongs to one of three layers:

1. **Compatibility** — reproduce enough expected behavior for the client to function.
2. **Competitive Platform** — our accounts, profiles, Crews, match history, matchmaking, rankings, seasons.
3. **Original Game Layer** — optional gameplay/UX changes and original modes.

Do not hide a compatibility fix inside a gameplay experiment.

---

## M001 — ONLINE FOUNDATION

**Goal:** Park/world entry and two-client identity.

Deliver:
- stable login/session/update
- intentional Park bootstrap path
- Park loads beyond current ~30% stall
- two independent clients
- stable internal `player_id`
- independent `session_id`
- sanitized endpoint/evidence ledger
- reproducible restart test

Exit gate: two clients can be independently identified in an interactive online state.

---

## M002 — PLAYER FOUNDATION

**Goal:** Turn authenticated users into persistent platform players.

Deliver:
- player repository using internal IDs
- mutable display name
- first/last seen
- session history
- privacy boundary around platform identifiers
- basic internal admin/debug lookup
- feature flags

No public profile UI yet.

---

## M003 — MATCH OBSERVATION

**Goal:** Find and persist the real match lifecycle.

Deliver:
- identify match-created / match-started / match-ended boundaries from evidence
- distinguish game modes without guessing
- persist match IDs
- participant attribution
- raw/sanitized evidence refs
- first trustworthy box score fields
- explicit NULL for unavailable stats

Exit gate: one completed game becomes one reproducible internal Match record.

---

## M004 — PLAYER PASSPORT

**Goal:** Make the first feature that clearly goes beyond revival.

Deliver:
- public-safe player profile
- record
- recent games
- verified captured stats
- build snapshot where evidenced
- streaks
- awards framework
- shareable profile URL

Do not fabricate stats the protocol does not expose.

---

## M005 — CREWS

**Goal:** Persistent competitive identity.

Deliver:
- create Crew
- owner / captain / manager / member / prospect roles
- invites and membership
- Crew profile
- roster
- Crew record
- Crew match history
- opponent history
- recruiting status

Later additions:
- custom visual identity
- custom courts
- rivalries
- Crew awards

---

## M006 — MATCHMAKING

**Goal:** Remove mandatory waiting without removing the social world.

Queues:
- Open Run: 1v1 / 2v2 / 3v3 / 5v5
- Ranked: solo / squad / Crew
- Private: join code

Player may remain in the social space while queued where technically feasible.

Track:
- region
- latency
- queue time
- skill window
- abandon/cancel events

---

## M007 — RANKED + SEASONS

Deliver:
- rating model
- divisions
- seasonal standings
- Crew standings
- individual leaderboards
- playoffs/tournaments
- seasonal awards
- historical season archive

Rating and matchmaking logic must be transparent enough to debug.

---

## M008 — GAMEPLAY TELEMETRY

Before changing gameplay, measure it.

Candidate events:
- shot location/distance
- contest
- timing result
- screen contact / stumble / knockdown
- steal attempt / success
- dribble sequence
- stamina delta
- possession time
- pass count
- turnover type

Telemetry is for aggregate balance analysis, not invasive player surveillance.

---

## M009 — 2K17+ GAMEPLAY PROFILE

Keep a reversible legacy baseline.

Profiles:
- `LEGACY`
- `COMPETITIVE`
- later `ARCADE`

Initial competitive targets to investigate with telemetry:
- repeated Brick Wall knockdowns
- magnetic screen interactions
- teleport-like interceptions
- steal spam
- repeated dribble spam without meaningful stamina cost
- unnecessary animation locks
- low-quality contested-shot outcomes
- insufficient reward for ball movement/team play

No balance change ships solely because it "feels wrong."

---

## M010 — PROGRESSION + UX

Candidate improvements:
- visible badge progress
- per-game badge progress recap
- action-earned progression
- anti-farming diminishing returns
- no purchasable competitive progression
- fewer unnecessary menus/waits
- optional Skip All Supported Cutscenes feature if implemented through a lawful, reversible client-side mechanism

Do not make progression changes depend on monetization.

---

## M011 — ORIGINAL ARCADE LAYER

Separate from ranked basketball.

Explore an original style/energy mechanic built from our own terminology, visuals, rules, and assets.

Possible charge events:
- alley-oops
- clean blocks
- putbacks
- ankle-break style plays
- perfect releases
- multi-pass team sequences
- defensive stops

The mechanic should not copy another game's protected presentation or assets.

---

## Build-in-public sequence

Show milestones, not promises:

1. **ONLINE** — successful replacement-service session.
2. **PARK** — interactive online world.
3. **TWO PLAYERS** — independently identified clients.
4. **PERSISTENCE** — player survives restart.
5. **MATCH #000001** — first saved match.
6. **PASSPORT** — shareable player profile.
7. **CREWS** — persistent roster and history.
8. **INSTANT QUEUE** — matchmaking without mandatory Got Next waiting.
9. **RANKED** — rating/season system.
10. **2K17+** — telemetry-backed gameplay experiment.
11. **ORIGINAL MODE** — first clearly original gameplay layer.

## Core message

**Preserve the feel. Remove the friction. Build the competitive infrastructure players kept asking for.**
