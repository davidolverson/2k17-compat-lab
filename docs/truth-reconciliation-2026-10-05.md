# Truth reconciliation, 2026-10-05

Phase 0 of `docs/CLAUDE_AUTONOMOUS_EXECUTION.md`: establish what is actually
true across the local worktrees, issue #1, draft PR #2 and the live replacement
runtime, and record every discrepancy before changing anything.

This audit was read-only. It did not contact the running server, the relay or
the game process, and it wrote nothing into the runtime repository.

Classes used below: **OBSERVED** (seen directly in this audit), **REPORTED**
(stated by a live session in issue #1 or a commit message, not re-verified),
**DERIVED** (follows mechanically from observed values).

The outcome of this note is `project-state.json`, which is now the only place
status is stated.

## 1. Repository and worktree state (OBSERVED, 14:40 UTC)

| Worktree | Branch | HEAD | State |
|---|---|---|---|
| control repo, main checkout | `work/qwen-client-first` | `52b84b0` | dirty: 5 modified, 11 untracked paths from an earlier session. Not touched. |
| offline evidence lane | `work/m001-online-foundation` | `a65b77c` (fast-forwarded from `1a8d4a8` to match the remote) | one untracked file, `evidence/m001/relay-session-comparison.json`. Not committed: see 3.5. |
| other agent's lane | `work/deepseek-protocol-reconstruction` | `8c6f03e` | clean, in sync with its remote. Not touched. |
| repository hardening (new) | `work/repo-hardening` | based on `a65b77c` | this work. |
| runtime (separate private repo) | `main` | `dbdf365` | clean, in sync with its remote. Not touched. |
| platform scaffold (separate, local only) | `main` | `2e599f8` | no remote; an API and a launcher process were running from it. Not touched. |

Draft PR #2: open, draft, 10 commits, head `a65b77c`, no checks configured.
Issue #1: six operator comments, the newest describing two-client readiness.

Newest committed compatibility evidence: commit `1a8d4a8`. It ends at "the
client opens a UDP relay session that ends after ten seconds".

## 2. Live runtime (OBSERVED, not touched)

| Process | Started (local) | Runtime commits made after it started |
|---|---|---|
| relay (`Relay2K17.js`) | 06:28:40 | `e84ea28` 06:43, `f849988` 07:06, `dbdf365` 07:44 (the last one changes the relay entry file) |
| server (`Source/Server.js`) | 07:01:47 | `f849988` 07:06, `dbdf365` 07:44 |
| game client | 07:04:17 | n/a |

**DERIVED:** neither running service corresponds to the runtime HEAD. Whatever
the live processes do right now cannot be attributed to an exact committed
source state, so nothing observed from them can be promoted to FACT (Master
Spec section 6: dirty or unattributable state is valid for discovery, not for
proof).

## 3. Discrepancies

### 3.1 The contract documents describe a superseded frontier

`docs/UP_NEXT_MASTER_SPEC.md` section 5 and the "Current known project state"
list in `docs/CLAUDE_AUTONOMOUS_EXECUTION.md` both say: the relay session lasts
about ten seconds, the next dependency is unknown, and the research question is
which side terminates it.

Issue #1 and the runtime history say otherwise (all **REPORTED**):

- the leave is client-driven: the relay logged an explicit disconnect from the
  client after eight data datagrams that had no recipient; the relay's own idle
  timeout (70 s) did not fire;
- an experimental solo-host echo keeps the session alive (runtime `51c078d`);
- with a non-zero relay region in the accepted search reply the client loaded
  into an interactive Park (runtime `da885da`, 10:30 UTC);
- a Got Next spot can be claimed and released (runtime `e84ea28`);
- the open gate is a second independent client (runtime `dbdf365`).

Both documents were committed at 11:45 UTC, after all of the above. They were
written from an older picture.

**Resolution.** The Master Spec is marked LOCKED and was not edited. Proposed
replacement for the section 5 chain, for the owner to apply:

```text
ParkRep
  -> mmg/park/search
  -> successful search response with relay information
  -> client opens a UDP relay session
  -> REPORTED: session persists when datagrams reach the client; client leaves
     after ~10 s when none do
  -> REPORTED: interactive Park as a solo host
  -> second independent participant: not attempted
```

and for the research question: "What does a second real participant change in
the relay exchange and the Park match state, and which of the currently
invented reply fields does the client actually require?"

None of the REPORTED items has committed sanitized evidence or an experiment
manifest. They are recorded in `project-state.json` as `REPORTED_UNPROVEN`,
not as facts.

### 3.2 The client used for the live experiments does not qualify

The Master Spec (invariant 13, section 5 "known-compatible client", section 29)
and the execution contract's absolute constraints rule out a client that depends
on replaced platform libraries or ownership emulation, and section 29 tells an
autonomous agent to stop a protocol path that needs one.

**OBSERVED:** the client install used for every live experiment so far does not
meet that bar. No experiment records a client that is licensed and unmodified.

**Consequences applied in this branch:**

- live relay experimentation was not continued by this agent, and no client
  hash manifest was written for that install;
- the experiment manifest now has a required `client.supply` field, and
  acceptance mode refuses any manifest that is not `licensed-unmodified`;
- every result from the live lane stays discovery-only.

This is blocker B1. It needs the owner, not an agent.

### 3.3 The runtime is not clean-room

The Master Spec describes this repository as "clean-room compatibility
research" and plans a product runtime. The replacement runtime actually in use
is an adaptation of a third-party server written for a later title, under the
PolyForm Noncommercial 1.0.0 licence (**OBSERVED** in the runtime repository's
licence file). The committed ledgers already label its handlers honestly
(`handler_source: granite-2k19`, class REFERENCE).

That is fine for research. It is not a base a product can be built on, and
behaviour inherited from it is REFERENCE, never a 2K17 fact. Blocker B5;
decision record in `docs/license-decision.md`.

### 3.4 README and live-status contradicted everything newer

`README.md` said the project was BLOCKED-PREREQUISITE with no client installed
and named `docs/live-status.md` as the single source of truth. That page is
dated 2026-10-03 and predates all M001 work.

**Resolution.** Neither was deleted. `docs/live-status.md` is now marked as a
historical record, the README points to `project-state.json`, and
`tools/repo/check-state.js` fails if either starts restating status.

### 3.5 The untracked relay comparison is not public-safe as written

`evidence/m001/relay-session-comparison.json` (untracked, offline lane) labels
relay tokens with truncated SHA-256 values of the raw tokens and carries
truncated frame digests. That is the same defect as the request comparison
fixed in this branch. It also has no `schema_version` / `kind`, so the new
evidence validator would reject it. It was left untracked and unmodified; it
needs regenerating with neutral labels before it can be committed.

### 3.6 Public history

This repository is public. Two classes of value were published and are removed
from the tree by this branch but remain in history:

- a Steam account name and persona, in two documents on every published branch
  since 2026-10-03;
- 12-hex prefixes of SHA-256 over raw request bodies, on
  `work/m001-online-foundation` since `4b940e1`.

No history was rewritten. Plan and risk assessment:
`docs/privacy-history-cleanup-plan.md`. Blocker B6.

### 3.7 Smaller items

- `docs/milestone-001-online.md` still lists "the Park currently stalls at
  approximately 30%" under current evidence. Left as written (it is the
  milestone's opening record); the state file supersedes it.
- Issue #1 mentions platform and launcher work. That code is outside this
  repository and outside M001; the execution contract places it in Phase 4,
  after the M001 gate. It is recorded here only so it is not mistaken for
  M001 progress.
- The regression's "26/26" is a structural smoke result. It has been quoted in
  issue #1 next to milestone claims; it does not test Park entry, the relay, or
  a real client.

## 4. What was verified in this audit

| Check | Result |
|---|---|
| `node tools/m001/regress.js --granite <runtime>` (smoke, in-process, runtime `dbdf365`, clean tree) | PASS, 26 passed, 0 failed, 0 skipped, 4 acceptance advisories (heuristic window; three Park routes answered by a generic fallback) |
| same, `--mode acceptance` with a self-test manifest | FAIL, exit 1, as designed (manifest not valid for acceptance; three required captures missing from the explicit window) |

## 5. Not touched, deliberately

- the running game, server, relay, platform API and launcher processes;
- the runtime repository and the platform scaffold;
- the dirty main checkout on `work/qwen-client-first`;
- the other agent's branch and worktree;
- the Master Spec and execution contract text;
- git history on any branch; nothing was pushed.
