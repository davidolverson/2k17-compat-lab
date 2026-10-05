'use strict';

const {
  SECRET_HEADERS,
} = require('../capture/sanitize');
const {
  SOURCE_KINDS,
  AUTHORIZATION_STATUSES,
} = require('./constants');

const SHA256_RE = /^[0-9a-f]{64}$/i;

function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !Buffer.isBuffer(value),
  );
}

function push(errors, path, message) {
  errors.push({ path, message });
}

function validateSource(source, errors) {
  if (!isPlainObject(source)) {
    push(errors, 'source', 'source must be an object');
    return;
  }

  if (!Object.values(SOURCE_KINDS).includes(source.kind)) {
    push(errors, 'source.kind', 'unsupported source kind');
  }

  if (
    !Object.values(AUTHORIZATION_STATUSES).includes(
      source.authorizationStatus,
    )
  ) {
    push(
      errors,
      'source.authorizationStatus',
      'unsupported authorization status',
    );
  }

  if (
    source.clientFingerprintSha256 !== null &&
    source.clientFingerprintSha256 !== undefined &&
    !SHA256_RE.test(String(source.clientFingerprintSha256))
  ) {
    push(
      errors,
      'source.clientFingerprintSha256',
      'client fingerprint must be a SHA-256 hex digest or null',
    );
  }

  for (const key of ['runId', 'instrument']) {
    if (
      source[key] !== null &&
      source[key] !== undefined &&
      typeof source[key] !== 'string'
    ) {
      push(errors, 'source.' + key, key + ' must be a string or null');
    }
  }
}

function validateSanitizedCapture(document) {
  const errors = [];

  if (!isPlainObject(document)) {
    return {
      ok: false,
      errors: [{ path: '$', message: 'document must be an object' }],
    };
  }

  if (document.schema !== '2k17-compat-lab.sanitized-request.v2') {
    push(
      errors,
      'schema',
      'schema must equal 2k17-compat-lab.sanitized-request.v2',
    );
  }

  if (
    typeof document.captureId !== 'string' ||
    !/^[a-zA-Z0-9._-]{6,128}$/.test(document.captureId)
  ) {
    push(errors, 'captureId', 'invalid captureId');
  }

  if (
    typeof document.tsUtc !== 'string' ||
    !Number.isFinite(Date.parse(document.tsUtc))
  ) {
    push(errors, 'tsUtc', 'tsUtc must be an ISO-parseable timestamp');
  }

  validateSource(document.source, errors);

  if (
    document.method !== null &&
    document.method !== undefined &&
    typeof document.method !== 'string'
  ) {
    push(errors, 'method', 'method must be a string or null');
  }

  if (
    document.path !== null &&
    document.path !== undefined &&
    typeof document.path !== 'string'
  ) {
    push(errors, 'path', 'path must be a string or null');
  }

  if (
    document.query !== null &&
    document.query !== '[REDACTED_QUERY]'
  ) {
    push(
      errors,
      'query',
      'sanitized query must be null or [REDACTED_QUERY]',
    );
  }

  if (!isPlainObject(document.headers)) {
    push(errors, 'headers', 'headers must be an object');
  } else {
    for (const [name, value] of Object.entries(document.headers)) {
      if (
        SECRET_HEADERS.has(name.toLowerCase()) &&
        value !== '[REDACTED]'
      ) {
        push(
          errors,
          'headers.' + name,
          'sensitive header must be [REDACTED]',
        );
      }
    }
  }

  if (
    !Number.isSafeInteger(document.bodyLength) ||
    document.bodyLength < 0
  ) {
    push(errors, 'bodyLength', 'bodyLength must be a non-negative integer');
  }

  if (!SHA256_RE.test(String(document.bodySha256 || ''))) {
    push(errors, 'bodySha256', 'bodySha256 must be a SHA-256 hex digest');
  }

  if (
    document.vcFieldListSize !== null &&
    document.vcFieldListSize !== undefined &&
    (!Number.isSafeInteger(document.vcFieldListSize) ||
      document.vcFieldListSize < 0)
  ) {
    push(
      errors,
      'vcFieldListSize',
      'vcFieldListSize must be a non-negative integer or null',
    );
  }

  for (const forbidden of [
    'body',
    'bodyRaw',
    'rawBody',
    'bodyBase64',
    'bodyHex',
    'bodyPath',
  ]) {
    if (Object.prototype.hasOwnProperty.call(document, forbidden)) {
      push(
        errors,
        forbidden,
        'sanitized fixture must not contain raw body material or local body paths',
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function assertValidSanitizedCapture(document) {
  const result = validateSanitizedCapture(document);
  if (!result.ok) {
    const error = new Error(
      'invalid sanitized capture: ' +
        result.errors
          .map((entry) => entry.path + ': ' + entry.message)
          .join('; '),
    );
    error.code = 'INVALID_SANITIZED_CAPTURE';
    error.validationErrors = result.errors;
    throw error;
  }
  return document;
}

module.exports = {
  SHA256_RE,
  validateSanitizedCapture,
  assertValidSanitizedCapture,
};
