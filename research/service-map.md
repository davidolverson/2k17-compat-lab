# Service Map

One row per hostname the **client** is observed to contact. A hostname gets a row
only once it appears in a capture or in `logs/attribution.*.jsonl` attributed to
`NBA2K17.exe`.

Status values: `UNKNOWN`, `OBSERVED`, `TARGETED`, `REACHED_LOCAL`, `RESPONDED`,
`CLIENT_ADVANCED`, `BLOCKED`.
Confidence: `CONFIRMED` (observed here), `PROBABLE`, `HYPOTHESIS`.

| hostname | port | transport | first observed action | status | confidence | notes |
|---|---|---|---|---|---|---|
| `nba2k17-ws.2ksports.com` | 443 | TCP/TLS (assumed) | -- | **UNKNOWN** | HYPOTHESIS | From the brief and community reports, not from our client. DNS resolves to `192.81.242.208` as of 2026-10-03. **Never contacted.** Transport is an assumption: 443/TLS is inferred from the `-ws` naming and the era, not observed. |

## Why the table is otherwise empty

NBA 2K17 is not installed on this machine, so no Phase 1 baseline exists. Every
row below the first would be invention.

## Rule for adding rows

A hostname moves from `UNKNOWN` to `OBSERVED` only with a DNS query or TCP
connection **owned by the NBA2K17.exe PID**. A hostname seen in a disassembly,
a strings dump, a forum post or a reference repo is `HYPOTHESIS` and stays
`UNKNOWN` until the process table agrees.
