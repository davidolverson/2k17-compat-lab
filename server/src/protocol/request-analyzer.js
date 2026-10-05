'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {
  tryParseFieldList,
} = require('../codec/reference-field-list');

function bodySha256(body) {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function detectCompression(body) {
  if (!Buffer.isBuffer(body)) throw new TypeError('body must be a Buffer');

  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) {
    return { kind: 'gzip', confidence: 'HIGH' };
  }

  if (body.length >= 2) {
    const cmf = body[0];
    const flg = body[1];
    if (
      (cmf & 0x0f) === 8 &&
      ((cmf << 8) + flg) % 31 === 0 &&
      (cmf >> 4) <= 7
    ) {
      return { kind: 'zlib-candidate', confidence: 'MEDIUM' };
    }
  }

  return { kind: 'none-detected', confidence: 'HIGH' };
}

function tryGunzip(body) {
  try {
    return {
      ok: true,
      body: zlib.gunzipSync(body),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      body: null,
      error: error.message,
    };
  }
}

function analyzeApplicationRequest(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('request analysis input must be an object');
  }
  if (!Buffer.isBuffer(input.body)) {
    throw new TypeError('request analysis body must be a Buffer');
  }

  const body = input.body;
  const compression = detectCompression(body);

  const reference = tryParseFieldList(body, {
    maximumFields: 4096,
    autoGunzip: true,
  });

  return {
    schema: '2k17-compat-lab.request-analysis.v1',
    request: {
      method: input.method || null,
      path: input.path || null,
      contentType: input.contentType || null,
      vcFieldListSize:
        input.vcFieldListSize === undefined
          ? null
          : input.vcFieldListSize,
    },
    body: {
      byteSize: body.length,
      sha256: bodySha256(body),
      compression,
    },
    referenceFieldList: reference.ok
      ? {
          compatible: true,
          evidenceClass: 'CROSS_VERSION_REFERENCE_CANDIDATE',
          fieldCount: reference.parsed.fieldCount,
          dataOffset: reference.parsed.dataOffset,
          compressed: reference.parsed.compressed,
          knownReferenceTypes: reference.parsed.records.filter(
            (record) => record.typeName !== 'UNKNOWN',
          ).length,
          note:
            'Strict compatibility with the 2K19 reference codec is not proof of NBA 2K17 framing.',
        }
      : {
          compatible: false,
          evidenceClass: 'CROSS_VERSION_REFERENCE',
          error: reference.error.message,
        },
    promotedClaims: [],
  };
}

module.exports = {
  bodySha256,
  detectCompression,
  tryGunzip,
  analyzeApplicationRequest,
};
