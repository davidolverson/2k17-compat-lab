# Privacy history cleanup plan (not executed)

**Nothing in this plan has been run.** Rewriting published history is
destructive and needs the owner's explicit authorization. This page exists so
the decision can be made with the facts in front of it.

## What is in public history

Measured on 2026-10-05 against the remote branches:

| Value | Where | Since | Current tree |
|---|---|---|---|
| A Steam account name and persona name | `docs/environment-audit.md`, `docs/live-status.md` on all six published branches | `3f98298`, 2026-10-03 | redacted on `work/repo-hardening` |
| A Windows user name used as an example display name | `docs/internal-domain-contracts-v0.md` on `work/m001-online-foundation` | `5255e86` | replaced on `work/repo-hardening` |
| 12-hex prefixes of SHA-256 over raw request bodies (7 distinct) | `evidence/m001/park-search.request-comparison.json` on `work/m001-online-foundation` | `4b940e1` | replaced with neutral labels on `work/repo-hardening` |

Not found in history by the forbidden-artifact scan of the current tree: key
material, tokens, full platform ids, session keys, raw captures, binaries.
That scan covers the tree, not every historical blob; step 1 below closes that
gap before anything is decided.

## Risk assessment

- **Account and persona names.** Low sensitivity, already public for two days,
  and the repository owner's GitHub handle is public anyway. They link a
  platform account to this project. Cleanup is optional.
- **Truncated body digests.** A 48-bit prefix of a hash over a body that
  contains a session key and platform ids. It cannot be reversed in practice
  without already knowing the body. Its only use is confirming a guess. Low
  sensitivity; the session keys involved belong to a local replacement service
  and are long expired. Cleanup is optional.

Neither class grants access to anything, so there is nothing to rotate.

## Options

### A. Leave history as it is (recommended unless step 1 finds more)

Merge the tree fixes. History keeps the old values. Cost: none. Evidence
commits already cited in issue #1 and PR #2 (`1a8d4a8`, `4b940e1`, ...) stay
valid.

### B. Rewrite history

1. **Scan every historical blob first**, on a fresh mirror clone, with the same
   rules as `tools/repo/check-forbidden.js`, so the rewrite is done once and
   covers everything.
2. Announce a freeze; every other worktree and agent stops pushing.
3. On the mirror, run `git filter-repo --replace-text <rules>` with the exact
   strings and digest values, replacing each with a neutral token.
4. Verify on the mirror: re-run the blob scan (zero findings), run `npm test`
   and `npm run check` on every rewritten branch tip.
5. Force-push all branches and tags. This needs branch protection lifted for
   the push and restored after.
6. Ask GitHub Support to purge cached views and dangling commits; until they
   do, the old commits stay reachable by SHA.
7. Re-clone every local worktree. Old clones must not be pushed again.
8. Record the old-to-new commit map in the repository, because every commit id
   cited in issue #1, PR #2 and the audit documents changes.

Costs: every cited evidence commit id is invalidated; open PR #2 is rewritten;
any fork or clone made before the rewrite still has the values, and nothing can
change that.

## Decision needed

Owner chooses A or B. If B, authorize it explicitly and name the freeze
window. Until then this stays open as blocker B6 in `project-state.json`.
