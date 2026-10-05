'use strict';

const assert = require('node:assert/strict');
const {
  PROVENANCE,
  REFERENCE_2K19_TYPES,
  ReferenceFieldListBuilder,
  parseFieldList,
  tryParseFieldList,
  gzipFieldList,
  gunzipFieldList,
  crc32,
} = require('../server/src/codec/reference-field-list');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function expectThrows(fn, pattern) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'expected function to throw');
  if (pattern) assert.match(String(thrown.message), pattern);
}

test('provenance is explicitly cross-version, not NBA 2K17', () => {
  assert.equal(PROVENANCE.evidenceClass, 'CROSS_VERSION_REFERENCE');
  assert.equal(PROVENANCE.targetClaim, 'NONE');
});

test('CRC32 matches the standard IEEE test vector', () => {
  assert.equal(crc32('123456789'), 0xcbf43926);
});

test('empty field list is exactly one 16-byte zero terminator', () => {
  const built = new ReferenceFieldListBuilder().build();
  assert.equal(built.fieldList.length, 16);
  assert.deepEqual(built.fieldList, Buffer.alloc(16));

  const parsed = parseFieldList(built.fieldList);
  assert.equal(parsed.fieldCount, 0);
  assert.equal(parsed.data.length, 0);
});

test('u32, bool, float and u64 round-trip', () => {
  const ids = {
    u32: crc32('TEST_U32'),
    bool: crc32('TEST_BOOL'),
    float: crc32('TEST_FLOAT'),
    u64: crc32('TEST_U64'),
  };

  const built = new ReferenceFieldListBuilder()
    .addU32(ids.u32, 0xfedcba98)
    .addBool(ids.bool, true)
    .addF32(ids.float, 12.5)
    .addU64(ids.u64, 0x1122334455667788n)
    .build();

  const parsed = parseFieldList(built.body);
  assert.equal(parsed.fieldCount, 4);
  assert.equal(parsed.records[0].value, 0xfedcba98);
  assert.equal(parsed.records[1].value, true);
  assert.equal(parsed.records[2].value, 12.5);
  assert.equal(parsed.records[3].value, 0x1122334455667788n);
});

test('string8, string16 and binary data round-trip', () => {
  const binary = Buffer.from([0, 1, 2, 0xfe, 0xff]);

  const built = new ReferenceFieldListBuilder()
    .addString8(crc32('TEXT8'), 'hello')
    .addString16(crc32('TEXT16'), 'AΩ')
    .addBinary(crc32('BLOB'), binary)
    .build();

  const parsed = parseFieldList(built.body);

  assert.equal(parsed.records[0].type, REFERENCE_2K19_TYPES.STRING8);
  assert.equal(parsed.records[0].value, 'hello');
  assert.equal(parsed.records[1].value, 'AΩ');
  assert.deepEqual(parsed.records[2].value, binary);
});

test('builder aligns data references deterministically', () => {
  const built = new ReferenceFieldListBuilder({ alignment: 8 })
    .addBinary(1, Buffer.from([1, 2, 3]))
    .addBinary(2, Buffer.from([4]))
    .build();

  assert.equal(built.records[0].data1, 0);
  assert.equal(built.records[1].data1, 8);

  const parsed = parseFieldList(built.body);
  assert.deepEqual(parsed.records[0].value, Buffer.from([1, 2, 3]));
  assert.deepEqual(parsed.records[1].value, Buffer.from([4]));
});

test('declared size preserves trailing bytes outside the field list', () => {
  const trailing = Buffer.from('TAIL', 'ascii');
  const built = new ReferenceFieldListBuilder()
    .addU32(1, 7)
    .build({ trailing });

  const parsed = parseFieldList(built.body, {
    declaredSize: built.fieldListSize,
  });

  assert.equal(parsed.records[0].value, 7);
  assert.deepEqual(parsed.trailing, trailing);
});

test('gzip helper round-trips and parser can auto-detect gzip', () => {
  const built = new ReferenceFieldListBuilder()
    .addString8(1, 'compressed')
    .build();

  const compressed = gzipFieldList(built.fieldList);
  assert.deepEqual(gunzipFieldList(compressed), built.fieldList);

  const parsed = parseFieldList(compressed);
  assert.equal(parsed.compressed, true);
  assert.equal(parsed.records[0].value, 'compressed');
});

test('parser rejects missing aligned zero terminator', () => {
  const bad = Buffer.alloc(32, 0x7f);
  expectThrows(
    () => parseFieldList(bad),
    /terminator not found/,
  );
});

test('parser rejects impossible declared size', () => {
  const body = Buffer.alloc(16);
  expectThrows(
    () => parseFieldList(body, { declaredSize: 17 }),
    /invalid declared field-list size/,
  );
});

test('parser enforces maximumFields', () => {
  const built = new ReferenceFieldListBuilder()
    .addU32(1, 1)
    .addU32(2, 2)
    .build();

  expectThrows(
    () => parseFieldList(built.body, { maximumFields: 1 }),
    /exceeding maximumFields/,
  );
});

test('out-of-range data reference is preserved as evidence, not silently sliced', () => {
  const table = Buffer.alloc(32);
  table.writeUInt32BE(1, 0);
  table.writeUInt32BE(REFERENCE_2K19_TYPES.BINARY, 4);
  table.writeUInt32BE(9999, 8);
  table.writeUInt32BE(8, 12);
  // bytes 16..31 remain the terminator.

  const parsed = parseFieldList(table);
  assert.equal(parsed.records[0].status, 'out_of_range');
  assert.equal(parsed.records[0].value, null);
});

test('unknown type remains parseable without inventing semantics', () => {
  const UNKNOWN_TYPE = 0xdecafbad;
  const built = new ReferenceFieldListBuilder()
    .record(0x11111111, UNKNOWN_TYPE, 0x22222222, 0x33333333)
    .build();

  const parsed = parseFieldList(built.body);
  assert.equal(parsed.records[0].typeName, 'UNKNOWN');
  assert.equal(parsed.records[0].data1, 0x22222222);
  assert.equal(parsed.records[0].data2, 0x33333333);
  assert.equal(parsed.records[0].value, 0x22222222);
});

test('tryParseFieldList returns structured failure instead of throwing', () => {
  const result = tryParseFieldList(Buffer.alloc(15));
  assert.equal(result.ok, false);
  assert.equal(result.parsed, null);
  assert.ok(result.error instanceof Error);
});

require('./transport.test')({ test, assert });
require('./evidence.test')({ test, assert });
require('./public-evidence.test')({ test, assert });
require('./cache-artifact.test')({ test, assert });

async function main() {
  let passed = 0;

  for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    process.stdout.write('PASS ' + name + '\n');
  } catch (error) {
    process.stderr.write('FAIL ' + name + '\n');
    process.stderr.write((error && error.stack ? error.stack : String(error)) + '\n');
  }
  }

  process.stdout.write(
    '\nRESULT ' + passed + '/' + tests.length + ' tests passed\n',
  );

  if (passed !== tests.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    'TEST HARNESS FAILURE\n' +
      (error && error.stack ? error.stack : String(error)) +
      '\n',
  );
  process.exitCode = 1;
});