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

---

## Record schema (adopted 2026-10-03)

Richer than the original table, so a capture can carry attribution and provenance
together. One record per observed endpoint.

```json
{
  "hostname": "",
  "remoteAddress": "",
  "remotePort": 443,
  "protocol": "tcp|udp",
  "addressFamily": "IPv4|IPv6",
  "pid": 0,
  "processName": "",
  "processPath": "",
  "parentPid": 0,
  "firstSeenUtc": "",
  "lastSeenUtc": "",
  "role": "web-api|world|park|matchmaking|cdn|telemetry|unknown",
  "attribution": "game-install-root|launcher|external-helper|unresolved",
  "confidence": "VERIFIED_CLIENT_CAPTURE|VERIFIED_PUBLIC_SOURCE|COMMUNITY_REPORT|INFERENCE|UNKNOWN",
  "notes": ""
}
```

### Rules

- `attribution: unresolved` can **never** support a claim about who contacted a host.
  An unattributed connection is an instrument gap, not a finding.
- `role` starts at `unknown`. Port 443 does not make something a web API, and a
  high UDP port does not make something a game relay.
- `processPath` is **required** for any `game-install-root` attribution. A process
  *name* is not an identity -- a binary named `NBA2K17.exe` in a temp directory
  satisfied an earlier version of our own Level B check, and only the path exposed it.
- A hostname seen in a blocklist, a forum post or a disassembly is
  `COMMUNITY_REPORT` or `INFERENCE`. It becomes `VERIFIED_CLIENT_CAPTURE` only when
  our own capture shows our own client contacting it.
- Absence of a record is **not** evidence of absence. A point-in-time socket table
  misses short-lived connections by construction; that is what the pktmon capture
  is for.
