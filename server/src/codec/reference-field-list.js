'use strict';

const zlib = require('node:zlib');
const { crc32, u32, hex32 } = require('./crc32');

/*
 * IMPORTANT PROVENANCE BOUNDARY
 * -----------------------------
 * This module implements a GENERIC codec for a field-list framing observed in
 * the public NBA 2K19 Granite project. It is a CROSS_VERSION_REFERENCE tool.
 *
 * It is deliberately NOT named "2k17-field-list" and must not be treated as
 * evidence that NBA 2K17 uses this framing, these type identifiers, or these
 * semantics. A future authorized NBA 2K17 capture must independently establish
 * compatibility before any part of this module can be promoted in the protocol
 * matrix.
 */

const PROVENANCE = Object.freeze({
  evidenceClass: 'CROSS_VERSION_REFERENCE',
  referenceProject: 'ztpd/Granite',
  referenceCommit: '20c3d875907498eb9e3780553a45f3c451885777',
  targetClaim: 'NONE',
});

/*
 * Public 2K19 reference type identifiers. These names are intentionally
 * namespaced as REFERENCE_2K19_TYPES so a call site cannot accidentally present
 * them as confirmed NBA 2K17 constants.
 */
const REFERENCE_2K19_TYPES = Object.freeze({
  U32: 0x1423add2,
  U64: 0x3d9e5089,
  PACKED: 0x320b919b,
  BINARY: 0x36182e83,
  VC_DATE: 0x55c05a86,
  BOOL8: 0x6314db26,
  STRING8: 0x6e46752f,
  STRING16: 0x7a4d534c,
  GUID: 0x18271c18,
  F32: 0xb7ea1cd0,
});

const TYPE_NAMES = new Map(
  Object.entries(REFERENCE_2K19_TYPES).map(([name, id]) => [id >>> 0, name]),
);

function isZeroRecord(bytes, offset) {
  for (let i = 0; i < 16; i += 1) {
    if (bytes[offset + i] !== 0) return false;
  }
  return true;
}

function findAlignedTerminator(bytes) {
  for (let offset = 0; offset + 16 <= bytes.length; offset += 16) {
    if (isZeroRecord(bytes, offset)) return offset;
  }
  return -1;
}

function maybeGunzip(bytes, enabled) {
  if (!enabled || bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return { bytes, compressed: false };
  }

  try {
    return {
      bytes: zlib.gunzipSync(bytes),
      compressed: true,
    };
  } catch (error) {
    const wrapped = new Error('gzip field-list decode failed: ' + error.message);
    wrapped.cause = error;
    throw wrapped;
  }
}

function decodeUtf16Be(raw) {
  let result = '';
  for (let offset = 0; offset + 1 < raw.length; offset += 2) {
    const unit = raw.readUInt16BE(offset);
    if (unit === 0) break;
    result += String.fromCharCode(unit);
  }
  return result;
}

function parseU64(high, low) {
  return (BigInt(high >>> 0) << 32n) | BigInt(low >>> 0);
}

function decodeRecord(record, data) {
  const type = record.type >>> 0;

  if (
    type === REFERENCE_2K19_TYPES.STRING8 ||
    type === REFERENCE_2K19_TYPES.STRING16 ||
    type === REFERENCE_2K19_TYPES.BINARY ||
    type === REFERENCE_2K19_TYPES.GUID
  ) {
    const units = record.data2 >>> 0;
    const byteLength =
      type === REFERENCE_2K19_TYPES.STRING16 ? units * 2 : units;
    const start = record.data1 >>> 0;
    const end = start + byteLength;

    record.dataOffset = start;
    record.length = units;

    if (!Number.isSafeInteger(end) || end > data.length) {
      record.status = 'out_of_range';
      record.value = null;
      return record;
    }

    const raw = Buffer.from(data.subarray(start, end));
    record.raw = raw;
    record.rawHex = raw.toString('hex');

    if (type === REFERENCE_2K19_TYPES.STRING8) {
      const nul = raw.indexOf(0);
      record.value = raw.subarray(0, nul >= 0 ? nul : raw.length).toString('utf8');
    } else if (type === REFERENCE_2K19_TYPES.STRING16) {
      record.value = decodeUtf16Be(raw);
    } else {
      record.value = raw;
    }
    return record;
  }

  if (type === REFERENCE_2K19_TYPES.BOOL8) {
    record.value = record.data1 !== 0;
    return record;
  }

  if (type === REFERENCE_2K19_TYPES.F32) {
    const raw = Buffer.allocUnsafe(4);
    raw.writeUInt32BE(record.data1 >>> 0, 0);
    record.value = raw.readFloatBE(0);
    return record;
  }

  if (
    type === REFERENCE_2K19_TYPES.U64 ||
    type === REFERENCE_2K19_TYPES.VC_DATE
  ) {
    record.value = parseU64(record.data1, record.data2);
    record.valueHex =
      '0x' + record.value.toString(16).toUpperCase().padStart(16, '0');
    return record;
  }

  // Unknown/reference scalar: preserve both raw words and expose data1 as a
  // convenience value without asserting semantics.
  record.value = record.data1 >>> 0;
  record.valueHex = hex32(record.data1);
  return record;
}

function parseFieldList(body, options = {}) {
  if (!Buffer.isBuffer(body)) {
    throw new TypeError('field-list input must be a Buffer');
  }

  const declaredSize =
    options.declaredSize === undefined || options.declaredSize === null
      ? 0
      : Number(options.declaredSize);

  if (
    declaredSize !== 0 &&
    (!Number.isSafeInteger(declaredSize) ||
      declaredSize < 16 ||
      declaredSize > body.length)
  ) {
    throw new RangeError(
      'invalid declared field-list size ' +
        String(options.declaredSize) +
        ' for ' +
        body.length +
        '-byte body',
    );
  }

  const wire = declaredSize ? body.subarray(0, declaredSize) : body;
  const trailing = declaredSize
    ? Buffer.from(body.subarray(declaredSize))
    : Buffer.alloc(0);

  const unwrapped = maybeGunzip(wire, options.autoGunzip !== false);
  const bytes = unwrapped.bytes;

  const terminatorOffset = findAlignedTerminator(bytes);
  if (terminatorOffset < 0) {
    throw new Error('aligned 16-byte zero terminator not found');
  }

  const fieldCount = terminatorOffset / 16;
  const maximumFields =
    options.maximumFields === undefined ? 65536 : Number(options.maximumFields);

  if (!Number.isSafeInteger(maximumFields) || maximumFields < 0) {
    throw new RangeError('maximumFields must be a non-negative safe integer');
  }
  if (fieldCount > maximumFields) {
    throw new RangeError(
      'field list contains ' +
        fieldCount +
        ' records, exceeding maximumFields=' +
        maximumFields,
    );
  }

  const dataOffset = terminatorOffset + 16;
  const data = Buffer.from(bytes.subarray(dataOffset));
  const records = [];

  for (let offset = 0, index = 0; offset < terminatorOffset; offset += 16, index += 1) {
    const record = {
      index,
      recordOffset: offset,
      crc: bytes.readUInt32BE(offset),
      type: bytes.readUInt32BE(offset + 4),
      data1: bytes.readUInt32BE(offset + 8),
      data2: bytes.readUInt32BE(offset + 12),
    };

    record.crcHex = hex32(record.crc);
    record.typeHex = hex32(record.type);
    record.typeName = TYPE_NAMES.get(record.type >>> 0) || 'UNKNOWN';
    decodeRecord(record, data);
    records.push(record);
  }

  return {
    provenance: PROVENANCE,
    records,
    fieldCount,
    data,
    dataOffset,
    tableBytes: terminatorOffset + 16,
    decodedSize: bytes.length,
    wireSize: wire.length,
    compressed: unwrapped.compressed,
    trailing,
  };
}

function tryParseFieldList(body, options = {}) {
  try {
    return {
      ok: true,
      parsed: parseFieldList(body, options),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      parsed: null,
      error,
    };
  }
}

function asU64(value) {
  if (typeof value === 'bigint') return BigInt.asUintN(64, value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError('unsafe number passed as u64');
    }
    return BigInt.asUintN(64, BigInt(value));
  }
  return BigInt.asUintN(64, BigInt(String(value)));
}

class ReferenceFieldListBuilder {
  constructor(options = {}) {
    this.alignment =
      options.alignment === undefined ? 8 : Number(options.alignment);
    if (
      !Number.isSafeInteger(this.alignment) ||
      this.alignment < 1 ||
      this.alignment > 4096
    ) {
      throw new RangeError('alignment must be an integer from 1 to 4096');
    }

    this.records = [];
    this.dataChunks = [];
    this.dataLength = 0;
  }

  record(crc, type, data1 = 0, data2 = 0) {
    this.records.push({
      crc: u32(crc),
      type: u32(type),
      data1: u32(data1),
      data2: u32(data2),
    });
    return this;
  }

  addU32(crc, value) {
    return this.record(crc, REFERENCE_2K19_TYPES.U32, value, 0);
  }

  addPacked(crc, value, data2 = 0) {
    return this.record(crc, REFERENCE_2K19_TYPES.PACKED, value, data2);
  }

  addBool(crc, value) {
    return this.record(crc, REFERENCE_2K19_TYPES.BOOL8, value ? 1 : 0, 0);
  }

  addF32(crc, value) {
    const raw = Buffer.allocUnsafe(4);
    raw.writeFloatBE(Number(value), 0);
    return this.record(
      crc,
      REFERENCE_2K19_TYPES.F32,
      raw.readUInt32BE(0),
      0,
    );
  }

  addU64(crc, value, type = REFERENCE_2K19_TYPES.U64) {
    const n = asU64(value);
    const high = Number((n >> 32n) & 0xffffffffn);
    const low = Number(n & 0xffffffffn);
    return this.record(crc, type, high, low);
  }

  appendData(value, alignment = this.alignment) {
    const bytes = Buffer.isBuffer(value)
      ? Buffer.from(value)
      : Buffer.from(value || []);

    const align = Number(alignment);
    if (!Number.isSafeInteger(align) || align < 1 || align > 4096) {
      throw new RangeError('data alignment must be an integer from 1 to 4096');
    }

    const padding = (align - (this.dataLength % align)) % align;
    if (padding) {
      this.dataChunks.push(Buffer.alloc(padding));
      this.dataLength += padding;
    }

    const offset = this.dataLength;
    this.dataChunks.push(bytes);
    this.dataLength += bytes.length;

    return {
      offset,
      length: bytes.length,
    };
  }

  addString8(crc, value) {
    const ref = this.appendData(Buffer.from(String(value) + '\0', 'utf8'));
    return this.record(
      crc,
      REFERENCE_2K19_TYPES.STRING8,
      ref.offset,
      ref.length,
    );
  }

  addString16(crc, value) {
    const text = String(value);
    const raw = Buffer.alloc((text.length + 1) * 2);
    for (let i = 0; i < text.length; i += 1) {
      raw.writeUInt16BE(text.charCodeAt(i), i * 2);
    }
    const ref = this.appendData(raw);
    return this.record(
      crc,
      REFERENCE_2K19_TYPES.STRING16,
      ref.offset,
      text.length + 1,
    );
  }

  addBinary(crc, value, type = REFERENCE_2K19_TYPES.BINARY) {
    const ref = this.appendData(value);
    return this.record(crc, type, ref.offset, ref.length);
  }

  build(options = {}) {
    const table = Buffer.alloc((this.records.length + 1) * 16);

    this.records.forEach((record, index) => {
      const offset = index * 16;
      table.writeUInt32BE(record.crc >>> 0, offset);
      table.writeUInt32BE(record.type >>> 0, offset + 4);
      table.writeUInt32BE(record.data1 >>> 0, offset + 8);
      table.writeUInt32BE(record.data2 >>> 0, offset + 12);
    });

    const fieldList = Buffer.concat([table, ...this.dataChunks]);
    const trailing = Buffer.isBuffer(options.trailing)
      ? Buffer.from(options.trailing)
      : Buffer.alloc(0);
    const body = trailing.length
      ? Buffer.concat([fieldList, trailing])
      : fieldList;

    return {
      provenance: PROVENANCE,
      fieldList,
      fieldListSize: fieldList.length,
      body,
      records: this.records.map((record) => ({ ...record })),
    };
  }
}

function gzipFieldList(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('gzipFieldList input must be a Buffer');
  }
  return zlib.gzipSync(buffer, {
    level: options.level === undefined ? 9 : options.level,
  });
}

function gunzipFieldList(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('gunzipFieldList input must be a Buffer');
  }
  return zlib.gunzipSync(buffer);
}

module.exports = {
  PROVENANCE,
  REFERENCE_2K19_TYPES,
  TYPE_NAMES,
  ReferenceFieldListBuilder,
  parseFieldList,
  tryParseFieldList,
  gzipFieldList,
  gunzipFieldList,
  crc32,
  u32,
  hex32,
};
