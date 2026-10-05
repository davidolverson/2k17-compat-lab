'use strict';

const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-auth-token',
  'x-session-token',
  'x-api-key',
  'x-access-token',
  'x-steam-ticket',
  'x-steamid',
  'x-2k-token',
  'session',
  'sessionid',
]);

const TEXT_PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}=*/gi, 'Bearer [REDACTED]'],
  [/\b7656119\d{10}\b/g, '[STEAMID64_REDACTED]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]'],
  [/\b[0-9a-f]{32,}\b/gi, '[HEX_REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[JWT_REDACTED]'],
];

function redactString(value) {
  if (value === null || value === undefined) return value;
  let out = String(value);
  for (const [pattern, replacement] of TEXT_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function redactHeaders(headers = {}) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    out[name] = SECRET_HEADERS.has(lower)
      ? '[REDACTED]'
      : Array.isArray(value)
        ? value.map(redactString)
        : redactString(value);
  }
  return out;
}

function sanitizeSource(source = {}) {
  return {
    kind: source.kind || 'UNVERIFIED_LOCAL',
    runId: source.runId ? redactString(source.runId) : null,
    instrument: source.instrument ? redactString(source.instrument) : null,
    authorizationStatus: source.authorizationStatus || 'UNVERIFIED',
    clientFingerprintSha256: source.clientFingerprintSha256 || null,
  };
}

function sanitizeCaptureRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('capture record must be an object');
  }

  return {
    schema: '2k17-compat-lab.sanitized-request.v2',
    captureId: record.captureId,
    tsUtc: record.tsUtc,
    source: sanitizeSource(record.evidenceContext),
    method: record.method,
    path: redactString(record.path),
    query: record.query ? '[REDACTED_QUERY]' : null,
    httpVersion: record.httpVersion,
    host: redactString(record.host),
    headers: redactHeaders(record.headers || {}),
    bodyLength: record.bodyLength,
    bodySha256: record.bodySha256,
    bodyStoredLocally: Boolean(record.bodyPath),
    bodyTruncated: Boolean(record.bodyTruncated),
    contentType: redactString(record.contentType),
    vcFieldListSize: record.vcFieldListSize,
    tls: record.tls
      ? {
          protocol: record.tls.protocol || null,
          cipher: record.tls.cipher || null,
          alpn: record.tls.alpn || null,
          servername: redactString(record.tls.servername),
        }
      : null,
    responseProfile: record.responseProfile
      ? {
          id: record.responseProfile.id,
          status: record.responseProfile.status,
          evidenceClass: record.responseProfile.evidenceClass,
          testOnly: Boolean(record.responseProfile.testOnly),
        }
      : null,
  };
}

module.exports = {
  SECRET_HEADERS,
  redactString,
  redactHeaders,
  sanitizeSource,
  sanitizeCaptureRecord,
};