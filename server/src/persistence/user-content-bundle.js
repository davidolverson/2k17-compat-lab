'use strict';

const MAGIC = Object.freeze({
  'BNH!': {
    ascii: 'BNH!',
    evidenceClass: 'USER_REPORTED_MODIFIED_CLIENT_OBSERVATION',
    note:
      'Reported from a local modified-client NBA 2K17 compatibility run; not promoted to the legitimate-client gate.',
  },
  'BNH"': {
    ascii: 'BNH"',
    evidenceClass: 'CROSS_VERSION_REFERENCE',
    note:
      'Known from the public cross-version Granite reference implementation.',
  },
});

function findBundle(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('bundle input must be a Buffer');
  }

  const accepted = Array.isArray(options.acceptedMagic)
    ? options.acceptedMagic
    : Object.keys(MAGIC);

  let best = null;

  for (const magicText of accepted) {
    if (!Object.prototype.hasOwnProperty.call(MAGIC, magicText)) {
      throw new Error('unsupported bundle magic selector: ' + magicText);
    }

    const magic = Buffer.from(magicText, 'ascii');
    const at = buffer.indexOf(magic);
    if (at < 0) continue;

    if (!best || at < best.offset) {
      best = {
        offset: at,
        magic: magicText,
        provenance: MAGIC[magicText],
      };
    }
  }

  if (!best) {
    return {
      found: false,
      offset: null,
      magic: null,
      payloadLength: null,
      totalLength: null,
      complete: false,
      provenance: null,
      claimsPromoted: [],
    };
  }

  if (best.offset + 8 > buffer.length) {
    return {
      found: true,
      offset: best.offset,
      magic: best.magic,
      payloadLength: null,
      totalLength: null,
      complete: false,
      error: 'bundle header is truncated before 32-bit length field',
      provenance: best.provenance,
      claimsPromoted: [],
    };
  }

  const payloadLength = buffer.readUInt32LE(best.offset + 4);
  const totalLength = 8 + payloadLength;
  const complete = best.offset + totalLength <= buffer.length;

  return {
    found: true,
    offset: best.offset,
    magic: best.magic,
    payloadLength,
    totalLength,
    complete,
    trailingBytes: complete
      ? buffer.length - (best.offset + totalLength)
      : null,
    provenance: best.provenance,
    claimsPromoted: [],
  };
}

function extractExactBundle(buffer, options = {}) {
  const info = findBundle(buffer, options);

  if (!info.found) {
    throw new Error('supported user-content bundle magic not found');
  }
  if (!info.complete) {
    throw new Error(
      info.error ||
        'declared user-content bundle length exceeds available bytes',
    );
  }
  if (info.totalLength <= 8) {
    throw new Error('declared user-content bundle length is empty');
  }

  return {
    info,
    bytes: Buffer.from(
      buffer.subarray(info.offset, info.offset + info.totalLength),
    ),
  };
}

module.exports = {
  MAGIC,
  findBundle,
  extractExactBundle,
};
