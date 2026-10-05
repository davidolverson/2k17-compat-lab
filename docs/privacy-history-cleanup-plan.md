# Privacy history cleanup plan (decided: history left intact)

**Decision, 2026-10-05 (owner, recorded on PR #2):** run a full-history scan
first; if it finds only the known account/persona metadata and the truncated
non-secret fingerprints, document them and leave history alone. The scan below
found only those, so **option A applies and no history was rewritten.** Option
B stays documented in case a later scan finds something that grants access.

## Full-history scan result

`node tools/repo/scan-history.js`, 2026-10-05 17:10 UTC, every blob reachable
from the published refs (230 commits, 382 unique blobs), same rules as
`check-forbidden.js` plus the body-digest pattern. Re-run with `--all` (local
refs included): identical result.

| Class | Blobs | Matches | Paths | Assessment |
|---|---|---|---|---|
| account, persona or user name | 6 | 7 | `docs/environment-audit.md`, `docs/live-status.md`, `docs/internal-domain-contracts-v0.md` | known; metadata, grants nothing |
| truncated raw-body digest | 1 | 11 | `evidence/m001/park-search.request-comparison.json` | known; not reversible, sessions expired |
| platform-id pattern | 1 | 1 | `server/tests/gates.test.js` (another work branch) | opened and read: synthetic sample in a redaction test; recorded in `tools/repo/history-reviewed.json` |

Not found anywhere in published history: private keys or certificates, tokens
or bearer credentials, real platform ids, session keys in URLs, personal
filesystem paths, real email addresses, binaries, captures or archives.
Commit messages and author fields were checked separately for the same
patterns: zero matches; the only author addresses are the owner's public
commit address and GitHub's no-reply address.

Limits of this scan: it matches patterns and a hashed list of three private
terms. It cannot recognise a private value that looks like ordinary text and
is not on the list. It reads what is reachable from the fetched refs, not
GitHub's cache of commits that were force-pushed away before today.

Verdict: `ONLY_KNOWN_CLASSES`. Nothing to rotate or revoke.

---

The original plan follows, unchanged, for reference.

Rewriting published history is destructive and needs the owner's explicit
authorization.

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
