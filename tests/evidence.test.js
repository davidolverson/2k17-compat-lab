'use strict';

const {
  sanitizeCaptureRecord,
} = require('../server/src/capture/sanitize');
const {
  validateSanitizedCapture,
  assertValidSanitizedCapture,
} = require('../server/src/evidence/validate-sanitized');
const {
  candidateClassFor,
  buildEvidenceCandidate,
  parseSanitizedCaptureText,
} = require('../server/src/evidence/import-capture');
const {
  CANDIDATE_CLASSES,
} = require('../server/src/evidence/constants');

function fixture(overrides = {}) {
  return {
    schema: '2k17-compat-lab.sanitized-request.v2',
    captureId: 'capture_test_100',
    tsUtc: '2026-10-05T00:00:00.000Z',
    source: {
      kind: 'UNVERIFIED_LOCAL',
      runId: 'run-test',
      instrument: 'capture-first-server',
      authorizationStatus: 'UNVERIFIED',
      clientFingerprintSha256: null,
    },
    method: 'POST',
    path: '/synthetic',
    query: null,
    httpVersion: '1.1',
    host: 'example.invalid',
    headers: {
      authorization: '[REDACTED]',
      'content-type': 'application/octet-stream',
    },
    bodyLength: 4,
    bodySha256: 'a'.repeat(64),
    bodyStoredLocally: true,
    bodyTruncated: false,
    contentType: 'application/octet-stream',
    vcFieldListSize: null,
    tls: {
      protocol: 'TLSv1.2',
      cipher: 'SYNTHETIC',
      alpn: null,
      servername: 'example.invalid',
    },
    responseProfile: {
      id: 'CAPTURE_ONLY_404',
      status: 404,
      evidenceClass: 'TEST_ONLY',
      testOnly: true,
    },
    ...overrides,
  };
}

module.exports = function registerEvidenceTests({ test, assert }) {
  test('sanitizer emits provenance-aware v2 fixtures', () => {
    const sanitized = sanitizeCaptureRecord({
      captureId: 'capture_test_101',
      tsUtc: '2026-10-05T00:00:00.000Z',
      method: 'POST',
      path: '/synthetic',
      query: 'x=secret',
      headers: { authorization: 'Bearer abcdefghijklmno' },
      bodyLength: 0,
      bodySha256: '0'.repeat(64),
      bodyPath: 'server/captures/raw-local/x.body.bin',
      bodyTruncated: false,
      contentType: 'application/octet-stream',
      vcFieldListSize: null,
      tls: null,
      responseProfile: null,
      evidenceContext: {
        kind: 'AUTHORIZED_CLIENT_CAPTURE',
        runId: 'run-001',
        instrument: 'capture-first-server',
        authorizationStatus: 'AUTHORIZED',
        clientFingerprintSha256: 'b'.repeat(64),
      },
    });

    assert.equal(
      sanitized.schema,
      '2k17-compat-lab.sanitized-request.v2',
    );
    assert.equal(sanitized.source.kind, 'AUTHORIZED_CLIENT_CAPTURE');
    assert.equal(sanitized.source.authorizationStatus, 'AUTHORIZED');
    assert.equal(sanitized.query, '[REDACTED_QUERY]');
    assert.equal(sanitized.headers.authorization, '[REDACTED]');
  });

  test('validator accepts a conforming sanitized request v2', () => {
    const result = validateSanitizedCapture(fixture());
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  test('validator rejects raw body material and local paths', () => {
    const document = fixture();
    document.bodyPath = 'C:\\secret\\capture.bin';
    document.bodyBase64 = 'AAAA';

    const result = validateSanitizedCapture(document);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.path === 'bodyPath'));
    assert.ok(result.errors.some((e) => e.path === 'bodyBase64'));
  });

  test('validator rejects unredacted sensitive headers', () => {
    const document = fixture({
      headers: {
        authorization: 'Bearer secret',
      },
    });

    const result = validateSanitizedCapture(document);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some((e) => e.path === 'headers.authorization'),
    );
  });

  test('validator rejects an invalid body SHA256', () => {
    const result = validateSanitizedCapture(
      fixture({ bodySha256: 'not-a-sha' }),
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.path === 'bodySha256'));
  });

  test('authorized capture becomes a review candidate, never auto-promoted', () => {
    const document = fixture({
      source: {
        kind: 'AUTHORIZED_CLIENT_CAPTURE',
        runId: 'run-002',
        instrument: 'capture-first-server',
        authorizationStatus: 'AUTHORIZED',
        clientFingerprintSha256: 'c'.repeat(64),
      },
    });

    const candidate = buildEvidenceCandidate(document);

    assert.equal(
      candidate.candidateClass,
      CANDIDATE_CLASSES.OBSERVED_2K17_CANDIDATE,
    );
    assert.equal(candidate.promotionStatus, 'REVIEW_REQUIRED');
    assert.equal(candidate.promotedEvidenceClass, null);
  });

  test('authorized label without fingerprint stays unverified', () => {
    const document = fixture({
      source: {
        kind: 'AUTHORIZED_CLIENT_CAPTURE',
        runId: 'run-003',
        instrument: 'capture-first-server',
        authorizationStatus: 'AUTHORIZED',
        clientFingerprintSha256: null,
      },
    });

    assert.equal(
      candidateClassFor(document),
      CANDIDATE_CLASSES.UNVERIFIED,
    );
  });

  test('lab selftest cannot become observed 2K17 evidence', () => {
    const document = fixture({
      source: {
        kind: 'LAB_SELFTEST',
        runId: 'selftest',
        instrument: 'capture-first-server',
        authorizationStatus: 'NOT_APPLICABLE',
        clientFingerprintSha256: null,
      },
    });

    assert.equal(
      candidateClassFor(document),
      CANDIDATE_CLASSES.INSTRUMENT_SELFTEST,
    );
  });

  test('synthetic tests remain synthetic evidence', () => {
    const document = fixture({
      source: {
        kind: 'SYNTHETIC_TEST',
        runId: 'synthetic',
        instrument: 'unit-test',
        authorizationStatus: 'NOT_APPLICABLE',
        clientFingerprintSha256: null,
      },
    });

    assert.equal(
      candidateClassFor(document),
      CANDIDATE_CLASSES.SYNTHETIC_TEST,
    );
  });

  test('import parser accepts one v2 JSON object', () => {
    const parsed = parseSanitizedCaptureText(
      JSON.stringify(fixture()),
    );
    assert.equal(parsed.captureId, 'capture_test_100');
  });

  test('import parser rejects JSONL event logs', () => {
    let failure = null;
    try {
      parseSanitizedCaptureText(
        JSON.stringify({ kind: 'tcp.connect' }) +
          '\n' +
          JSON.stringify({ kind: 'http.request' }),
      );
    } catch (error) {
      failure = error;
    }

    assert.ok(failure);
    assert.equal(failure.code, 'UNSUPPORTED_CAPTURE_FORMAT');
  });

  test('assertValidSanitizedCapture reports structured validation failure', () => {
    let failure = null;
    try {
      assertValidSanitizedCapture(
        fixture({ query: 'raw=secret' }),
      );
    } catch (error) {
      failure = error;
    }

    assert.ok(failure);
    assert.equal(failure.code, 'INVALID_SANITIZED_CAPTURE');
    assert.ok(Array.isArray(failure.validationErrors));
  });
};
