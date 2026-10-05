'use strict';

const crypto = require('node:crypto');
const {
  SOURCE_KINDS,
  AUTHORIZATION_STATUSES,
  CANDIDATE_CLASSES,
} = require('./constants');
const {
  assertValidSanitizedCapture,
} = require('./validate-sanitized');

function candidateClassFor(document) {
  const source = document.source;

  if (source.kind === SOURCE_KINDS.LAB_SELFTEST) {
    return CANDIDATE_CLASSES.INSTRUMENT_SELFTEST;
  }

  if (source.kind === SOURCE_KINDS.SYNTHETIC_TEST) {
    return CANDIDATE_CLASSES.SYNTHETIC_TEST;
  }

  if (
    source.kind === SOURCE_KINDS.AUTHORIZED_CLIENT_CAPTURE &&
    source.authorizationStatus === AUTHORIZATION_STATUSES.AUTHORIZED &&
    typeof source.clientFingerprintSha256 === 'string' &&
    /^[0-9a-f]{64}$/i.test(source.clientFingerprintSha256)
  ) {
    return CANDIDATE_CLASSES.OBSERVED_2K17_CANDIDATE;
  }

  return CANDIDATE_CLASSES.UNVERIFIED;
}

function canonicalCandidateHashInput(document) {
  return JSON.stringify({
    schema: document.schema,
    captureId: document.captureId,
    tsUtc: document.tsUtc,
    source: document.source,
    method: document.method,
    path: document.path,
    host: document.host,
    bodyLength: document.bodyLength,
    bodySha256: document.bodySha256,
    vcFieldListSize: document.vcFieldListSize,
  });
}

function buildEvidenceCandidate(document) {
  assertValidSanitizedCapture(document);

  const digest = crypto
    .createHash('sha256')
    .update(canonicalCandidateHashInput(document), 'utf8')
    .digest('hex');

  const candidateClass = candidateClassFor(document);

  return {
    schema: '2k17-compat-lab.evidence-candidate.v1',
    candidateId: 'CAND-' + digest.slice(0, 20).toUpperCase(),
    candidateDigestSha256: digest,
    captureId: document.captureId,
    source: { ...document.source },
    candidateClass,
    promotionStatus: 'REVIEW_REQUIRED',
    promotedEvidenceClass: null,
    summary: {
      tsUtc: document.tsUtc,
      method: document.method,
      path: document.path,
      host: document.host,
      httpVersion: document.httpVersion,
      contentType: document.contentType,
      bodyLength: document.bodyLength,
      bodySha256: document.bodySha256,
      vcFieldListSize: document.vcFieldListSize,
      tls: document.tls || null,
      responseProfile: document.responseProfile || null,
    },
    reviewRules: [
      'This candidate is not automatically OBSERVED_2K17.',
      'A project-lead review must verify provenance, client fingerprint, and capture context.',
      'Protocol fields must be promoted individually; one valid request does not validate unrelated fields.',
      'Cross-version codec compatibility, if any, must be demonstrated against preserved raw bytes.',
    ],
  };
}

function parseSanitizedCaptureText(text) {
  if (typeof text !== 'string') {
    throw new TypeError('sanitized capture input must be text');
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    const wrapped = new Error(
      'sanitized capture must be one JSON object using sanitized-request.v2; JSONL event logs are not accepted by this importer',
    );
    wrapped.code = 'UNSUPPORTED_CAPTURE_FORMAT';
    wrapped.cause = error;
    throw wrapped;
  }

  return assertValidSanitizedCapture(document);
}

module.exports = {
  candidateClassFor,
  canonicalCandidateHashInput,
  buildEvidenceCandidate,
  parseSanitizedCaptureText,
};
