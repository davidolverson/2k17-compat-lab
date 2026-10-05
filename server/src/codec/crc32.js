'use strict';

/*
 * Generic CRC-32/IEEE helper.
 *
 * This utility is protocol-neutral. It exists because the public cross-version
 * reference uses CRC32 identifiers, but using CRC32 here is NOT evidence that
 * any particular NBA 2K17 field name or constant is correct.
 */

const TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let bit = 0; bit < 8; bit += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  TABLE[i] = c >>> 0;
}

function crc32(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(String(value), 'utf8');

  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'bigint') return Number(BigInt.asUintN(32, value));
  const text = String(value).trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number(BigInt.asUintN(32, BigInt(text)));
  return Number(text) >>> 0;
}

function hex32(value) {
  return '0x' + u32(value).toString(16).toUpperCase().padStart(8, '0');
}

module.exports = {
  crc32,
  u32,
  hex32,
};
