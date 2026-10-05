# Experiment manifests

One file per experiment: `evidence/manifests/<experiment_id>.manifest.json`.
A manifest is immutable once another document cites it. A follow-up experiment
gets a new id.

No fact from live experimentation is promoted without one (Master Spec
section 6). The schema is enforced by `tools/m001/gate.js` and checked on every
pull request by `npm run check:evidence`.

```json
{
  "schema_version": 1,
  "kind": "experiment-manifest",
  "experiment_id": "R-004",
  "hypothesis": "one sentence, one variable",
  "started_at_utc": "2026-01-01T00:00:00Z",
  "ended_at_utc": "2026-01-01T00:05:00Z",
  "client": {
    "title": "nba2k17-pc",
    "version": "the build string the client reported; never a guess",
    "sha256": "<64 hex: SHA-256 of the client executable>",
    "supply": "licensed-unmodified",
    "user_agent": "the user-agent header the client sent"
  },
  "compat_lab_commit": "<40 hex>",
  "runtime": {
    "repo": "name of the runtime repository",
    "commit": "<40 hex>",
    "dirty": false
  },
  "config_digest": "<64 hex: SHA-256 of the runtime config with secrets removed>",
  "capture": {
    "server_run_pid": 0,
    "from_seq": 0,
    "to_seq": 0
  },
  "expected_observation": "what the hypothesis predicts",
  "actual_observation": "what happened, including what did not happen",
  "result": "SUPPORTED | NOT_SUPPORTED | INCONCLUSIVE",
  "fixture_refs": ["sanitized-fixtures/..."],
  "remaining_unknowns": ["..."]
}
```

Rules:

- `client.supply` is `licensed-unmodified` only for a lawfully licensed install
  whose files have not been replaced or patched. Anything else is `other`. A
  manifest with `other`, or with `runtime.dirty: true`, is valid as a record of
  discovery and is refused by acceptance mode.
- `runtime.commit` is the commit the running service was **started from**. If
  the service was started before that commit existed, the run is not
  attributable: restart it first.
- `capture` is an explicit range of capture sequence numbers for one server
  run. No "newest" and no time-gap heuristics.
- `client.sha256` and `config_digest` are the only hashes allowed in public
  evidence. Neither is derived from identity-bearing traffic.
- `NOT_SUPPORTED` and `INCONCLUSIVE` manifests are committed like any other.

Acceptance run for a manifest:

```
node tools/m001/regress.js --mode acceptance --granite <runtime checkout> --manifest evidence/manifests/R-004.manifest.json
```
