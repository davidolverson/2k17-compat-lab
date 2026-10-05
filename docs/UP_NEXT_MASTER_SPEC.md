# UP NEXT — Master Technical, Product, Security & Compatibility Specification

**Status:** LOCKED DESIGN / ACTIVE IMPLEMENTATION  
**Primary compatibility milestone:** M001 — Online Foundation  
**Current status, frontier and blockers:** [`project-state.json`](../project-state.json) (the only place they are stated)  
**Scope:** clean-room compatibility research + future Up Next replacement platform  
**Rule:** unknown is valid; guessed protocol behavior is not.

---

## 1. Purpose

Up Next is a replacement online basketball platform designed to sit behind a compatible, legitimately supplied local client while the compatibility layer is reconstructed, then survive the eventual replacement of that legacy client.

The long-term product is not merely a launcher. It is:

- a signed Windows desktop client and bootstrapper;
- account and player identity;
- compatibility/game edge services;
- session and relay infrastructure;
- verified-or-classified match/stat ingestion;
- public player profiles and HiScores;
- Crews, social presence, parties and matchmaking;
- seasons, ratings and earned-only progression;
- first-party companion modules;
- later, a reviewed/sandboxed extension ecosystem;
- eventually, an original basketball game layer that can replace the legacy client without replacing the platform.

The platform must never depend architecturally on a specific commercial brand, executable name, player likeness, proprietary asset, or external platform identifier.

---

## 2. Non-negotiable project invariants

1. **Do not guess protocol semantics.**
2. **HTTP 200 is not semantic correctness.**
3. **A client request proves the client used an endpoint/id, not the original vendor URL or response shape.**
4. **Unknown values remain null/unknown, never fabricated as zero or a guessed enum.**
5. **Legacy-client input is untrusted.**
6. **Client-reported stats are not automatically verified.**
7. **Persistent competitive truth lives server-side.**
8. **Display names are never identity keys.**
9. **Economy balances are derived from a ledger; no naked balance mutation.**
10. **Match/rating/reward effects are idempotent.**
11. **Derived projections must be rebuildable from source truth.**
12. **Compatibility, competitive-platform and original-game work stay separated.**
13. **Production may not depend on piracy, redistributed commercial game files, DRM defeat, anti-cheat bypass, certificate-pinning bypass, Steam ownership spoofing, or other security-boundary circumvention.**
14. **Up Next ships only Up Next-controlled code/assets/configuration and legally reviewed patch data.**
15. **All production changes must be reversible where technically possible.**
16. **No third-party arbitrary-code plugin execution in V1.**
17. **No kernel anti-cheat in early releases.**
18. **No purchasable competitive progression in V1.**
19. **No player-to-player currency transfer, cashout, wagering or marketplace in V1.**
20. **AI/model confidence is never evidence.**

---

## 3. Repository and product boundaries

### 3.1 2k17-compat-lab

Purpose: public-safe, clean-room compatibility research.

Contains only:

- sanitized fixtures;
- evidence ledgers;
- protocol observations;
- research tools;
- evidence policy;
- reproducible fixture/schema tests;
- sanitized experiment manifests.

Must not contain:

- commercial binaries/assets;
- leaked/decompiled proprietary source copied into the project;
- raw private captures;
- private keys/certificates;
- platform credentials;
- release signing material;
- production secrets;
- DRM/security-bypass tooling;
- product account/economy implementation.

### 3.2 upnext-runtime

Future/independent repository.

Owns:

- replacement HTTP/game services;
- Game Edge;
- UDP relay;
- legacy protocol adapters;
- normalized internal game contracts;
- match lifecycle;
- authoritative session infrastructure.

Provenance boundary: the replacement runtime used for research is adapted from third-party code under a noncommercial licence and is not clean-room. It is research and reference infrastructure only and must not become the distributable `upnext-runtime` by default. A distributable `upnext-runtime` is either an independent, original implementation written from this repository's sanitized contracts and evidence, or it uses only code whose licence or written permission covers the intended release. Restricted or reference implementation code is never copied across that boundary. See `docs/license-decision.md`.

### 3.3 upnext

Future/independent repository.

Owns:

- Up Next Bootstrap;
- Up Next Desktop;
- website;
- Platform API;
- workers;
- admin;
- player identity;
- profiles/HiScores;
- Crews/social;
- ratings/seasons;
- economy/progression;
- shared SDK/types/UI.

Compatibility adapters must be narrow enough that the legacy client can later disappear without rebuilding the platform.

---

## 4. Trust zones

### Zone A — untrusted

- legacy client;
- player machine;
- local game files;
- plugins;
- user input;
- client timestamps;
- client-reported results;
- external network traffic.

### Zone B — controlled edge

- Up Next Bootstrap;
- Up Next Desktop;
- local adapter/bootstrap channel;
- Game Edge;
- protocol translation;
- relay.

### Zone C — trusted platform

- account authentication;
- canonical player identity;
- game-ticket issuance/consumption;
- match finalization;
- rating;
- reward ledger;
- moderation;
- signing/release infrastructure;
- authoritative Postgres state.

No Zone A claim becomes competitive truth merely because an API accepted it.

---

## 5. Current compatibility milestone: M001

M001 closes only when all are true:

1. known-compatible client establishes and maintains a replacement-service session;
2. client enters interactive Park/world state;
3. result reproduces after clean replacement-service restart;
4. second independent client reaches the same interactive state;
5. two clients receive distinct internal player IDs and session IDs;
6. no critical successful path depends on generic fallback;
7. required behavior is tied to an exact committed runtime source state;
8. explicit experiment manifest identifies client hash/config/source commits;
9. sanitized evidence is committed;
10. acceptance suite passes with zero skips;
11. classification mismatches are zero;
12. current-state documentation is updated from evidence, not memory.

### Current frontier

This specification does not record where the research currently stands. The evidenced chain, the active research question, the status of each condition above and the open blockers live only in [`project-state.json`](../project-state.json), which is changed from evidence and checked in CI. A statement of current progress anywhere else, including here, is out of date by definition.

Two rules about the frontier are permanent and stay here:

- A dependency the client was observed to use (for example a relay address it honoured) proves the client's behavior. It does **not** prove the original service used the same address, value or handshake.
- No World/connect, park/create, relay packet class, or handshake field may be invented because another title/version used it.

### Evidence eligibility

- "Known-compatible client" in the conditions above means a legitimately supplied, unmodified client. Results from any other installation are discovery only: they may guide offline analysis, and they may not become FACT, close a milestone or establish production compatibility.
- A result reported by a live session stays REPORTED_UNPROVEN until it is tied to an exact committed runtime source state, client and configuration through an experiment manifest.
- The second independent client is a hard requirement of M001 and is not waived by progress elsewhere.

---

## 6. Evidence contract

Allowed evidence classes:

- OBSERVED
- DERIVED
- REFERENCE
- HYPOTHESIS
- IMPLEMENTED

Evidence class and confidence are separate concepts.

Recommended confidence:

- HIGH
- MEDIUM
- LOW
- UNKNOWN

### Experiment manifest

Every fact promoted from live experimentation must point to an immutable experiment manifest containing at least:

- experiment_id;
- hypothesis;
- UTC start/end;
- client version and SHA-256;
- compatibility-lab commit;
- replacement-runtime commit;
- config digest;
- explicit capture range/session;
- expected observation;
- actual observation;
- result: SUPPORTED / NOT_SUPPORTED / INCONCLUSIVE;
- fixture references;
- known remaining unknowns.

Dirty working trees are valid for discovery but **not for proof**.

### Public/private evidence

Private evidence may retain raw capture bytes and raw SHA-256 values in a protected vault.

Public evidence must be sanitized and must not expose:

- platform IDs;
- session keys;
- emails;
- access/refresh/game tickets;
- private certificate material;
- usernames/machine paths unless required;
- raw opaque payloads;
- unnecessary fingerprints derived from identity-bearing raw requests.

Public comparisons should use sanitized digests or neutral body variants rather than truncated hashes of unsanitized requests.

---

## 7. Compatibility tooling requirements

Research tooling must fail closed.

### Smoke mode

May allow optional skips while exploring.

### Acceptance mode

Must fail on:

- any skip;
- missing required fixture;
- unknown runtime commit;
- dirty runtime;
- generic fallback on a required route;
- classification mismatch;
- unconfirmed critical handler;
- sanitizer leak;
- missing explicit capture window;
- timeout;
- client/build mismatch.

Acceptance must return non-zero for anything other than full PASS.

Tests must distinguish:

1. structural correctness;
2. semantic invariants;
3. real-client behavioral advancement.

Behavioral evidence is the highest-value proof.

Every critical handler invocation should be attributable to:

- request fixture;
- handler ID;
- source commit;
- response;
- observed client outcome.

---

## 8. UDP relay security

Relay is hostile-network code.

It must enforce:

- bounded datagram sizes;
- bounded per-session queues;
- packets/sec and bytes/sec quotas;
- relay lease IDs and expiration;
- known session/player association;
- source validation where protocol/evidence allows;
- fixed/bounded destinations, never arbitrary forwarding;
- idle cleanup;
- global abuse ceilings;
- no amplification behavior;
- parser isolation;
- safe metadata logging only;
- no raw production packet dumping by default.

Unknown relay packets remain UNKNOWN_* until evidence establishes meaning.

Relay evidence records:

- wall-clock UTC;
- monotonic timestamp;
- direction;
- session reference;
- size;
- structural fingerprint;
- parse status;
- evidence class;
- notes.

Relay/parser fuzzing is required before wider beta.

---

## 9. Desktop product architecture

V1 target: Windows x64.

User experience is one product: **Up Next Desktop**.

Internally:

```text
UpNextBootstrap
  -> verifies/repairs desktop
  -> starts Up Next Desktop

Up Next Desktop
  -> account login
  -> status/news
  -> verify/repair local compatible install
  -> request one-time game ticket
  -> launch game/bootstrap path
  -> players/HiScores/matches/crews later
```

The loader/bootstrap component may remain mostly invisible to users.

### Desktop security rules

- bundled/local UI only for privileged Tauri WebViews;
- public web links open in system browser;
- capabilities default deny;
- no arbitrary shell command bridge;
- no arbitrary filesystem bridge;
- no arbitrary process execution bridge;
- native commands are narrow operations such as verify_game(), repair_component(), launch_game();
- long-lived credentials go to OS secure credential storage;
- no tokens in localStorage or plaintext JSON;
- no credentials in command-line arguments;
- prefer protected OS-native IPC;
- localhost APIs are avoided; if unavoidable, use random port + random secret + strict origin/CSRF controls.

### Safe mode

Safe mode runs:

- core desktop;
- authentication;
- game launch;

while disabling:

- optional overlays;
- experimental features;
- custom themes;
- future plugins.

### Restore

The application tracks every Up Next-managed file/change and offers Restore Original State where technically possible.

---

## 10. Authentication and session model

Canonical identities are separate:

```text
account_id != player_id != external_platform_subject
```

- Account = login/security identity.
- Player = competitive identity.
- External subject = private linkage only.

Display handles are mutable and have history.

### Web auth

Use protected server sessions / Secure + HttpOnly + SameSite cookies. Do not store session credentials in browser localStorage/sessionStorage.

### Desktop auth

Use short-lived access credentials plus rotating refresh credentials stored in OS secure storage.

### Game ticket

At Play:

1. authenticated desktop requests opaque random one-use game ticket;
2. server stores only ticket hash plus metadata;
3. ticket has short TTL;
4. ticket is scoped to Game Edge/session creation;
5. local controlled adapter/bootstrap presents ticket to Game Edge;
6. Game Edge atomically consumes it once;
7. replay fails;
8. legacy client never receives normal account credentials.

Ticket consumption must be one atomic DB operation.

Password reset/recovery tokens are also random, single-use, short-lived and hashed at rest.

---

## 11. Database truth and invariants

Postgres is authoritative for persistent truth.

Redis may hold ephemeral presence/cache/party state but never be the sole copy of:

- accounts;
- match truth;
- ratings;
- currency ledger;
- punishments.

Critical DB constraints include:

- unique normalized account email;
- unique active normalized handle;
- unique game-ticket hash;
- unique match participant per (match_id, player_id);
- unique reward effect per match/player/type/rule version;
- unique rating effect per match/player/rating pool;
- unique event consumer effect per (event_id, consumer);
- unique achievement grant under its scope;
- canonical unique friendship pair;
- non-zero ledger amount;
- made <= attempted only where stat semantics are actually established.

Prisma may be used, but production integrity may require explicit SQL migrations/constraints.

No `prisma db push` in production.

Use expand -> migrate -> switch -> contract migrations.

Authoritative IDs are server-generated, preferably sortable random IDs such as UUIDv7.

UTC is stored internally.

---

## 12. Match lifecycle

Canonical lifecycle:

```text
CREATED
 -> ASSEMBLING
 -> LOCKED
 -> STARTING
 -> ACTIVE
 -> ENDING
 -> RESULT_PENDING
 -> FINALIZED
```

Alternate terminal paths:

- CANCELLED
- ABANDONED
- VOID
- DISPUTED

Only FINALIZED may trigger permanent rating/reward/leaderboard effects.

One domain owns finalization.

Finalization transaction:

1. lock match;
2. verify current state/evidence;
3. transition to FINALIZED;
4. insert `match.finalized.v1` transactional-outbox event;
5. commit.

Ratings/rewards/leaderboards/achievements run asynchronously and idempotently.

Finalized competitive truth is corrected through compensating/correction records, not silent destructive edits.

---

## 13. Stats, HiScores and trust

Public stats use explicit provenance/trust classes such as:

- TRUSTED_SERVER
- SERVER_OBSERVED
- MULTI_CLIENT_CONFIRMED
- CLIENT_REPORTED
- ADMIN_CORRECTED
- DISPUTED

Do not use one generic “Verified” badge for different concepts.

Possible public concepts:

- Identity Verified
- Match Recorded
- Stat Verified

Every published stat has a versioned definition:

- formula;
- eligible modes;
- sample minimums;
- rounding;
- introduced/retired versions.

Leaderboards are cached/materialized snapshots, not expensive giant live queries.

Tie-breaking is deterministic and versioned.

Historical rank/rating events are preserved.

A player rename never alters historical identity.

Match records may be public before being competitively eligible. Ranked eligibility is separate.

---

## 14. Crews and social

Crew membership uses effective dates and historical snapshots.

Matches store crew-at-match where relevant.

Foundation social controls exist before broad social launch:

- block;
- mute;
- report;
- friend-request permissions;
- party-invite permissions;
- crew-invite permissions;
- presence visibility.

V1 does not require a public direct-message system.

Presence and party state are ephemeral where possible.

---

## 15. Economy/progression

V1 currency/progression is:

- earned;
- non-transferable;
- non-redeemable;
- not purchasable;
- no cash value;
- no wagering.

Ledger is truth.

Example entry carries:

- transaction ID;
- type;
- source/destination;
- amount;
- source match/action;
- rule version;
- timestamp;
- correction linkage where applicable.

Cached balance may exist but must reconcile to ledger.

Duplicate delivery may happen; duplicate effect must not.

Economy can be disabled independently while matches/stats continue and pending events remain durable.

---

## 16. Extensions/plugins

V1: no arbitrary third-party code.

Roadmap:

1. core features;
2. first-party module interfaces;
3. trusted partners;
4. sandboxed reviewed public SDK.

First-party panels should use the future extension interfaces early.

Future permissions default deny, e.g.:

- player.read;
- stats.read;
- match.read;
- overlay.draw;
- notification.create.

Never grant arbitrary process/filesystem/auth/updater access.

Investigate sandboxed WASM/out-of-process execution before public plugin support.

Plugins require remote kill switch and version compatibility.

---

## 17. Staff, admin and moderation security

Privilege domains are separate:

- player;
- support;
- moderator;
- economy operator;
- release operator;
- infrastructure admin.

No shared staff accounts.

Staff/release/admin require phishing-resistant MFA/passkeys where available.

Dangerous actions require recent re-authentication.

Support cannot casually:

- change account email;
- disable MFA;
- grant currency;
- change rating;
- publish releases;
- change DNS.

Moderation actions create immutable audit events containing who/what/when/why/before/after/evidence/case.

Appeal flow exists before serious public enforcement.

No permanent punishment is based solely on one heuristic.

---

## 18. Secret and root-of-trust hierarchy

Tier 0 assets:

- registrar/DNS;
- GitHub owner;
- cloud/root infrastructure;
- email admin;
- release signing/updater keys;
- password manager/recovery material.

Tier 0 requires strongest available MFA/passkeys and separate recovery.

Avoid circular recovery (e.g. registrar recovery solely through the same project domain).

Tier 1:

- production DB admin;
- deploy environment;
- admin identity system;
- secrets manager.

Tier 2:

- service-to-service keys;
- email provider;
- storage;
- analytics.

Staging secrets never work in production.

Production secrets do not live in developer `.env` files.

---

## 19. CI/CD and software supply chain

PR CI:

- minimal permissions, normally contents:read;
- no production secrets;
- no signing key;
- no production DB;
- no DNS/registrar access.

Use exact lockfiles and deterministic install commands such as `npm ci`.

Pin GitHub Actions to immutable full commit SHAs for hardened workflows.

Release flow:

```text
PR CI
 -> main build
 -> unsigned artifact
 -> protected release environment
 -> sign
 -> attest
 -> publish
```

Prefer short-lived OIDC cloud deployment credentials.

Every release should record:

- source commit;
- build workflow/run;
- artifact SHA-256;
- SBOM;
- signature;
- provenance/attestation;
- release channel.

Update signing and OS code signing are separate concerns.

Private signing keys are crown-jewel assets and never belong on an ordinary developer laptop.

---

## 20. Updater and release safety

Channels:

- stable;
- beta;
- canary/internal.

Manifest carries:

- issued_at;
- expires_at;
- channel;
- minimum supported version;
- latest version;
- protocol compatibility;
- signed metadata.

Client verifies:

- publisher/code signature where applicable;
- update signature;
- artifact hash;
- supported install hash;
- path/root safety;
- disk capacity.

Use staged download -> verify -> journal -> backup -> atomic apply -> validate -> mark healthy.

Do not patch while game process is running.

Rollback is explicit and signed. Old vulnerable but validly signed releases cannot be silently served as a downgrade.

Bootstrap is deliberately tiny and can restore the previous desktop build.

---

## 21. Domain, DNS, email and web security

Domain/registrar is Tier 0.

Use:

- auto-renew;
- transfer lock / registry lock where practical;
- DNS change alerts;
- DNSSEC once stable;
- no dangling DNS records;
- TLS automation;
- certificate monitoring/CAA as appropriate.

Email authentication:

- SPF;
- DKIM;
- DMARC rollout, ultimately enforcing once all senders are known.

Separate transactional/security email from marketing where practical.

Public web security includes:

- strict CSP;
- no unnecessary unsafe-inline/eval;
- Secure/HttpOnly/SameSite cookies;
- CSRF defenses;
- frame-ancestors policy;
- rate limiting;
- account enumeration resistance.

---

## 22. Observability and privacy

Use structured logs, metrics and distributed traces.

A Play flow should correlate launcher -> auth -> ticket -> Game Edge -> legacy session -> Park -> relay.

Trace IDs supplement, not replace, domain IDs.

Do not put secrets, raw tickets, passwords, emails, opaque packet payloads or unnecessary PII into telemetry.

Metrics must avoid unbounded cardinality (do not label by player_id/match_id/session_id).

Diagnostics export should include redacted:

- desktop version;
- adapter version;
- game hash;
- recent stable error codes;
- connectivity checks;
- safe logs.

Research raw capture mode is separate from production mode.

Production must refuse secret-heavy/raw protocol logging by default.

---

## 23. Reliability targets and load shedding

Initial alpha targets may include:

- auth/API availability around 99.9%;
- ticket creation p95 < 500 ms;
- profile reads p95 < 500 ms;
- match finalization processing p95 < 5 sec;
- stats visible p95 < 30 sec;
- duplicate reward effects = 0;
- duplicate rating effects = 0;
- lost finalized matches = 0;
- corrupt accepted update = 0.

Protect, in order:

1. active matches;
2. authentication/session refresh;
3. new match admission;
4. profiles/rankings/social;
5. notifications/analytics.

Clients use randomized jitter/backoff to avoid patch-day thundering herds.

DB pools and queues are bounded.

Cache rebuilds use single-flight/stale-while-revalidate patterns where appropriate.

---

## 24. Incident response and kill switches

Required independent controls:

- MAINTENANCE;
- PLAY_DISABLED;
- RANKED_WRITE_DISABLED;
- ECONOMY_DISABLED;
- SOCIAL_DISABLED;
- PLUGIN_DISABLED;
- PATCH_BLOCKED;
- VERSION_BLOCKED;
- RELEASES_FROZEN.

Incident sequence:

```text
CONTAIN
 -> PRESERVE EVIDENCE
 -> REVOKE/ROTATE
 -> RECOVER
 -> COMMUNICATE
 -> POSTMORTEM
```

SEV-0 examples:

- signing-key compromise;
- malicious official release;
- domain takeover;
- GitHub owner compromise;
- cloud-root compromise;
- active mass account takeover.

Recovery drills must actually be performed before broad launch.

Backups are not considered valid until restore and domain reconciliation tests pass.

---

## 25. Data retention and deletion

Classify retention separately for:

- account/PII;
- application logs;
- security/audit;
- protocol research;
- crash diagnostics;
- moderation/support;
- network abuse signals.

Do not retain unnecessary IP/device data indefinitely.

Account deletion separates removable PII from shared competitive history. Historical matches may use de-identified tombstones where legally appropriate rather than corrupting every other participant’s record.

Exact legal retention policy requires legal review.

---

## 26. Open-source / contribution policy

Before inviting code contributions, add:

- SECURITY.md;
- CONTRIBUTING.md;
- CODE_OF_CONDUCT.md;
- PR template;
- evidence policy;
- privacy/redaction policy;
- clean-room contribution declaration;
- deliberate project license decision.

Contributors must not submit:

- leaked proprietary source;
- commercial game/server binaries;
- copied decompiled proprietary code;
- private keys/credentials;
- commercial assets;
- unexplained “real response” code without provenance.

AI-generated claims follow the same evidence rules.

---

## 27. Rollout gates

### Local/operator

Packaged artifact must prove:

- install;
- login;
- verify/repair;
- Play;
- session;
- interactive online path;
- exit/relaunch;
- restore;
- updater;
- rollback.

### Two-client / two-environment

Two independent clients/environments:

- authenticate;
- connect;
- receive distinct player/session IDs;
- interact online;
- disconnect/reconnect.

### Internal alpha

Requires:

- signed installer/updater;
- diagnostics/crash capture;
- account recovery;
- kill switches;
- status;
- admin lookup;
- backup + tested restore.

### Invite alpha

Adds:

- rate limits;
- abuse/moderation;
- privacy/terms;
- account deletion;
- release channels;
- staged rollout;
- telemetry dashboards;
- capacity testing.

### Closed beta

Adds:

- trustworthy match lifecycle;
- ranking/reward idempotency;
- disputes;
- anti-farming;
- season archive;
- runbooks;
- restore drill;
- updater rollback drill;
- Game Edge/relay load and abuse testing.

### Open beta

Requires operational headroom, public status/download, known-issues process and stable recovery practices.

---

## 28. Implementation order

### Track A — Compatibility

1. finish M001 relay investigation;
2. reach interactive Park;
3. reproduce cleanly;
4. prove second independent client;
5. close/tag M001;
6. persistent Player foundation;
7. observe and persist real match lifecycle;
8. first trustworthy match record;
9. only then promote competitive stats.

### Track B — Repository hardening

Implement:

- single machine-readable project state;
- CI;
- branch/rules protections;
- strict acceptance mode;
- public privacy cleanup;
- sanitized digest/body-variant fix;
- explicit experiment manifests;
- governance/security/contribution docs.

### Track C — Up Next product

After sufficient compatibility confidence:

1. Bootstrap/Desktop skeleton;
2. platform auth and player identity;
3. game-ticket flow;
4. Game Edge integration;
5. player/match/profile APIs;
6. HiScores;
7. match finalization/outbox;
8. ratings/rewards;
9. Crews/social;
10. matchmaking/seasons;
11. first-party companion modules;
12. sandboxed extensions much later.

---

## 29. Stop conditions for autonomous agents

An agent must stop a protocol implementation path and document the blocker rather than invent behavior when:

- evidence is absent or contradictory;
- progress requires piracy/unlicensed client distribution;
- progress requires DRM/security-boundary circumvention;
- the only source is leaked/proprietary material;
- the live experiment cannot be attributed to a clean committed runtime;
- sanitizer cannot prove an artifact is public-safe;
- an action could expose credentials/private data;
- a destructive production action is not explicitly authorized;
- a release/signing/domain/Tier-0 operation would be required without an approved human-controlled path.

For ordinary implementation bugs, the agent should fix/test autonomously rather than repeatedly ask for confirmation.

---

## 30. Definition of “locked”

Architecture is locked when future unknowns can be resolved inside these boundaries without redesigning identity, trust, persistence, release or product ownership.

Protocol values are **not** locked until evidence proves them.

What is locked:

- product vision: LOCKED;
- trust/security model: LOCKED;
- platform architecture: LOCKED;
- M001 research methodology: LOCKED.

What is not stated here: milestone progress, the current blocker and release readiness. Those change, so they live only in [`project-state.json`](../project-state.json).
