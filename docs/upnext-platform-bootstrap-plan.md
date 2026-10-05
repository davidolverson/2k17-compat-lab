# Up Next Platform Bootstrap Plan

**Status:** IMPLEMENTATION-READY SCAFFOLD  
**Goal:** allow product work to begin without depending on the research runtime or unresolved legacy protocol behavior.

## 1. Initial repository

Create a separate `upnext` repository when implementation begins.

Recommended monorepo:

```text
upnext/
├── apps/
│   ├── desktop/
│   ├── bootstrap/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── admin/
├── packages/
│   ├── db/
│   ├── auth/
│   ├── contracts/
│   ├── api-client/
│   ├── telemetry/
│   ├── ui/
│   └── feature-flags/
└── infra/
```

## 2. Stack

Preferred starting stack:

- Desktop: Tauri + React + TypeScript;
- Web: Next.js + TypeScript;
- API/Worker: Node.js + TypeScript;
- DB: PostgreSQL;
- ORM/tooling: Prisma where useful, explicit SQL migrations where needed;
- Redis: ephemeral presence/cache/rate-limit coordination only;
- OpenTelemetry for tracing/metrics/log correlation.

## 3. First vertical slice

The first product slice must work without any legacy game integration:

```text
create account
 -> verify/login
 -> create canonical Player
 -> desktop signs in
 -> desktop requests game ticket
 -> mock Game Edge atomically consumes ticket
 -> session is recorded
 -> desktop shows session/history
```

This proves identity and ticket architecture before wiring an old client into it.

## 4. Canonical data model v1

Minimum entities:

- Account
- Player
- PlayerHandleHistory
- AuthSession
- RefreshCredential
- GameTicket
- GameSession
- AuditEvent
- FeatureFlag

Do not add economy/ratings until the match lifecycle exists.

## 5. Identity rules

- `account_id != player_id != external_subject`;
- canonical IDs are server generated;
- handles are mutable;
- normalized active handle is unique;
- external platform subjects are private;
- public APIs expose player IDs/handles, not raw platform identifiers.

## 6. Auth rules

### Passwords

Use a modern password-hashing scheme such as Argon2id with parameters set from current security guidance.

### Refresh credentials

- opaque random;
- stored hashed;
- rotated;
- replay detectable;
- revocable per device/session.

### Game tickets

- opaque random;
- short-lived;
- hashed at rest;
- one use;
- atomic consume;
- audience-limited;
- never passed in process arguments.

## 7. Desktop V0 screens

Only:

- Login
- Home
- Play
- Status
- Repair placeholder
- Settings

Do not build Crews/HiScores/plugins before the identity/ticket slice is stable.

## 8. Desktop privilege boundary

React/WebView may call only narrow Tauri commands.

Allowed examples:

- `get_launcher_state`
- `verify_installation`
- `request_play`
- `open_logs_folder` with a fixed application-owned path

Never expose:

- arbitrary shell;
- arbitrary process execution;
- arbitrary filesystem path access;
- arbitrary privileged HTTP.

## 9. API v1

Initial endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/me
GET  /api/v1/player/me
POST /api/v1/game-tickets
POST /internal/game-tickets/consume
GET  /api/v1/sessions
```

Internal consume endpoint is service-authenticated and not public-player callable.

## 10. Database invariants v1

At minimum:

- normalized email unique;
- active normalized handle unique;
- game-ticket token hash unique;
- ticket may be consumed only once;
- refresh credential hash unique;
- audit events append-only by application policy;
- timestamps UTC;
- soft/explicit state transitions, not boolean soup.

## 11. CI from day one

Required:

- typecheck;
- unit tests;
- migrations validate;
- forbidden secret/artifact scan;
- dependency lockfile check;
- workflow hygiene;
- build desktop/web/api;
- no production secrets on PR jobs.

## 12. Environments

Keep:

- local;
- test;
- staging;
- production.

Credentials never cross environments.

Staging should support destructive/failure-injection testing.

## 13. Feature flags

Ship the skeleton with feature flags early.

Minimum kill switches:

- PLAY_DISABLED
- MAINTENANCE
- VERSION_BLOCKED

Later:

- RANKED_WRITE_DISABLED
- ECONOMY_DISABLED
- SOCIAL_DISABLED
- PLUGIN_DISABLED

## 14. Observability

Every Play attempt gets a correlation trace:

```text
desktop.play
 -> api.game_ticket.create
 -> mock-edge.ticket.consume
 -> game_session.create
```

Never emit credential values into traces.

## 15. Bootstrap/updater sequence

Do not implement patching first.

Sequence:

1. package desktop;
2. sign development/test artifacts;
3. implement bootstrap verification;
4. implement signed update manifests;
5. staged update;
6. health validation;
7. rollback;
8. later add compatible-game verification/repair.

## 16. Definition of bootstrap milestone P001

P001 is complete when:

1. user can register/login;
2. Player exists with immutable ID;
3. desktop stores refresh credential securely;
4. desktop requests one-time game ticket;
5. mock Game Edge consumes it exactly once;
6. replay fails;
7. GameSession is persisted;
8. logout/revoke prevents refresh;
9. CI is green;
10. no legacy runtime code is required.

This milestone may proceed while M001 acceptance-grade compatibility work is paused.

## 17. What explicitly waits

Do not implement yet:

- public HiScores backed by legacy stats;
- ratings;
- earned currency;
- matchmaking;
- third-party plugins;
- invasive overlay/injection;
- production legacy adapter;
- ranked claims.

Those depend on later compatibility/match truth.
