# Parallel Reconstruction Workflow

This workflow runs three independent evidence lanes concurrently:

1. **Historical artifact analysis** — optional, read-only analysis of an authorized local artifact such as `SYNC.BIN`.
2. **WebSocket capture** — loopback-only listener that records upgrade/frame metadata.
3. **UDP capture** — loopback-only listener that records datagram metadata and optional raw local bytes.

The lanes run together for speed, but their evidence classes remain separate. Parallel execution is not permission to infer one protocol from another.

## Start

Copy the example configuration:

```
server/parallel-reconstruction.example.json
```

Then run:

```
npm run reconstruct:parallel -- server/parallel-reconstruction.example.json
```

To analyze an authorized historical artifact at the same time, set `artifactPath` to its local path. The analyzer is read-only and writes structural metadata only.

## Safety boundaries

- WebSocket and UDP listeners must bind to `127.0.0.1`, `::1`, or `localhost`.
- No live 2K endpoint is contacted.
- No certificate-pinning bypass, DRM defeat, anti-cheat tampering, credential use, or security-verification patching is part of this workflow.
- `acceptUpgrades` defaults to `false`; accepting a WebSocket upgrade is an explicit local experiment control.
- Raw UDP bytes remain local under ignored capture directories.
- Cross-version codec matches remain `CROSS_VERSION_REFERENCE_CANDIDATE`, never an automatic NBA 2K17 protocol claim.
- Real-client attribution remains a separate gate.

## Output

The runner writes a local session manifest plus WebSocket and UDP event summaries under:

```
server/captures/parallel-reconstruction-local/
```

The manifest has `claimsPromoted: []` by default.

The artifact lane records:

- basename
- exact size
- SHA-256
- entropy windows
- standard magic/signature candidates
- protocol-relevant printable strings and offsets
- strict cross-version field-list candidate matches

The realtime lanes record transport metadata and hashes. They do not assign gameplay or service semantics.

## Promotion rule

A claim may move toward `OBSERVED_2K17` only when it is supported by independently attributable, authorized NBA 2K17 evidence. Synthetic tests, another 2K version, generic RFC behavior, or artifact resemblance are not enough.
