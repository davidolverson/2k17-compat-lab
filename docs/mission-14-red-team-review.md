# Mission 14 Red-Team Review

**Date:** 2026-10-05

## Issues found and fixed

1. **Wrong telemetry source**
   - Problem: Mission 13 summarized probe JSONL while the active run had moved to Granite.
   - Fix: Granite adapter + auto-detect route summarizer.

2. **H1 overclaim**
   - Problem: one richer ParkSummary response was being described as ruling H1 out.
   - Fix: record it as a specific no-change experiment that materially weakens H1.

3. **Persistence overclaim**
   - Problem: byte-identical upload storage was too easy to read as full MyCareer persistence.
   - Fix: separate local store proof, server restart persistence, server return/download, client acceptance, and full progression persistence.

4. **Raw diagnostic leakage**
   - Problem: unparsed Granite lines and Steam debug lines could preserve session/lobby identifiers in shareable summaries.
   - Fix: Granite unknown lines retain only line number, byte length, SHA-256; Steam lobby summaries retain call/callback names and line numbers only.

5. **Route-ordering test assumption**
   - Problem: a regression test assumed a fixed sorted route index.
   - Fix: tests locate routes by method/path identity.

6. **Fake one-variable enforcement**
   - Problem: Park `before`/`after` values could be objects hiding several simultaneous changes.
   - Fix: require scalar string/number/boolean before/after values.

7. **Non-exact server commit**
   - Problem: experiment records accepted arbitrary text for the server commit.
   - Fix: require a 7–40 character hexadecimal commit SHA.

8. **Lobby calls without result visibility**
   - Problem: H3 observer initially tracked API calls only.
   - Fix: also track lobby callbacks such as `LobbyMatchList_t`, `LobbyCreated_t`, and `LobbyEnter_t`.

9. **Cross-version mutation risk**
   - Problem: a 2K19 handler can appear to work while writing incorrect 2K17 state.
   - Fix: mutation-safety policy + hash-verified directory snapshot utility.

## Remaining open risks

- Granite text logs may not include body sizes, response profiles, or process attribution. Unknown stays unknown.
- UserContent server-to-client return has not yet been proven.
- Client acceptance/application of a returned save is not proven.
- H3/H4/H2 remain open; no world/relay implementation is justified yet.
- Full MyCareer authority split between local save and server state is not mapped.
- Cross-version catalog/entitlement behavior must be treated as untrusted until 2K17 evidence exists.
- The active modified-client lane is not promoted to the original legitimate-client gate.

## Current next experiments

1. UserContent return/download proof.
2. Observation-only H3 Steam lobby run.
3. Observation-only H4 relay/socket run.
4. H2 service lookup only if H3/H4 remain non-distinguishing.
5. One behavioral experiment at a time after observation identifies a concrete missing dependency.
