# Capture-First Replacement Transport

Mission 4 is a capture-first replacement-service transport. It does not claim any unverified NBA 2K17 route, response, field ID, or body schema is authentic.

## Controls

- Default response: `CAPTURE_ONLY_404`.
- TLS is frozen in `server/src/transport/tls-options.js` to `TLSv1` through `TLSv1.3`, matching the probe control profile. Configuration cannot override it.
- Loopback starts both `127.0.0.1` and `::1` with the same TLS options and HTTP handler. IPv6 bind failure is explicit and nonfatal.
- `secureConnection` emits `tls.established` and means transport handshake completion only.
- The replacement server contains no OS process-attribution poller.

## Bounded capture

Every received body byte contributes to total length and SHA-256. Only the first `maxBodyBytes` bytes are retained locally.

Raw metadata records:

- `bodyLength`: total received bytes,
- `storedBodyLength`: retained prefix bytes,
- `bodyTruncated`: whether bytes exceeded the local storage cap,
- `bodySha256`: SHA-256 of the full received stream.

Crossing the cap does not turn the request into HTTP 413 and does not discard the observation.

Sanitized exports never contain body bytes or local body paths. Sensitive headers and token-like text, including long hexadecimal values, are redacted. Query strings are replaced with a redacted marker.

## Response profiles

`CAPTURE_ONLY_404`, `TEST_ONLY_EMPTY_200`, and `TEST_ONLY_EMPTY_BINARY_FIELD_LIST` remain experiment controls only. The binary profile remains `CROSS_VERSION_REFERENCE_TEST_ONLY`.

Profile identifiers are recorded locally and are not injected into client-visible HTTP headers.

## TLS evidence boundary

A successful TLS transport handshake is logged as `tls.established`. That means transport establishment only; it does not prove application-level certificate acceptance or the absence of certificate pinning.

The historical committed self-test fixture retains its original `tls.handshake` event name. Sanitization does not normalize that historical evidence.

## Running and tests

From `server/`, copy `config.example.json` to ignored `config.local.json`, point it at developer-controlled PFX/passphrase material, and run `npm start`.

Run Mission 4 tests with:

```
npm test
```

from `server/`. The repository-root `npm test` remains the aggregate regression suite and also includes the Mission 4 gates.

This transport establishes lab capability only. It adds no new `OBSERVED_2K17` protocol claim.
