# Mission 14 Operator Sequence

This sequence is intentionally evidence-first and minimizes client restarts.

## Rule 0 — preserve the current session when useful

Do not restart or close the game merely to collect server-side evidence that can be gathered from existing logs/files.

A restart is justified only when the next experiment specifically requires:

- a different local instrumentation build;
- a clean client-start baseline;
- proving persistence across client restart;
- or replacing a component that cannot be hot-swapped safely.

Record the reason before restarting.

## Lane A — UserContent return proof

Current reported state:

- complete upload captured;
- server-side stored copy reported byte-identical;
- server storage reported to survive restart;
- actual server-to-client download/return not yet observed.

### Next gate

1. Trigger the normal game action that causes a UserContent list/download using the replacement server.
2. Capture the exact returned response body locally.
3. Do not modify the returned bytes for this proof.
4. Compare:

```
npm run verify:user-content-return -- upload.bin returned.bin
```

A green byte comparison is necessary but not sufficient.

Then verify the client actually consumes the object and expected state appears.

Do not claim full MyCareer persistence from UserContent storage alone.

## Lane B — H3 Steam lobby observation

Before changing matchmaking behavior:

1. use the debug log only as an observer;
2. enter the Park flow once;
3. stop at the existing loading barrier;
4. summarize:

```
npm run summarize:steam-lobby -- STEAM_LOG.txt
```

Interpretation:

- `RequestLobbyList` with no relevant callback: request path exists, result flow may be missing.
- `CreateLobby` with no `LobbyCreated_t`: creation result path may be missing.
- `JoinLobby` with no `LobbyEnter_t`: join completion may be missing.
- calls plus callbacks but no Park progress: H3 alone becomes weaker; move attention toward H4/H2/H5.

Do not alter lobby return values in the same run used to establish the baseline.

## Lane C — H4 relay observation

In parallel with H3, observe without implementing a new relay.

Run the existing watcher before the Park transition:

```powershell
.\scripts\watch.ps1 -ProcessName NBA2K17
```

It records outbound TCP peers and local UDP endpoints. Windows does not expose UDP remote peers through the ordinary UDP endpoint table, so a UDP socket is evidence of transport activity only.

Summarize its JSONL output:

```
npm run summarize:network -- logs/attribution.<runId>.jsonl
```

Look for:

- new TCP remote ports/address classes around the Park transition;
- new UDP local sockets;
- relay-related log/state events;
- relay candidate enumeration;
- ping/selection activity.

If no relay activity is initiated, H4 may depend on H2/H3 first.

If transport activity clearly starts and stalls on a missing local service, that becomes the next minimal implementation target.

## Route telemetry

The active server is Granite, so use the auto-detect route summarizer:

```
npm run summarize:routes -- granite.log before.summary.json
npm run summarize:routes -- granite-after.log after.summary.json
npm run diff:routes -- before.summary.json after.summary.json park.diff.json
```

The old `summarize:probe` command remains valid only for old probe JSONL captures.

## Behavioral experiment discipline

Only after observation identifies a candidate behavior change:

1. create a Park experiment spec;
2. set one scalar variable;
3. record the exact server commit SHA;
4. run one attempt;
5. capture before/after route logs;
6. record screen/loading outcome;
7. write the experiment to the ledger.

```
npm run record:park-experiment -- experiment.json before.summary.json after.summary.json
```

Do not change a Park response, lobby behavior, relay config, and service table in one run.

## Stop conditions

Stop an experiment immediately if:

- save integrity changes unexpectedly;
- the session begins relogging repeatedly;
- a returned save hash differs unexpectedly;
- an experiment requires defeating DRM/authentication/anti-cheat/integrity checks;
- the evidence source becomes ambiguous.

A stopped experiment is still useful evidence.
