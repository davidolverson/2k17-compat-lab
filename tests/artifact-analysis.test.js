'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  ReferenceFieldListBuilder,
} = require('../server/src/codec/reference-field-list');
const {
  shannonEntropy,
  scanMagic,
  extractRelevantAsciiStrings,
  analyzeBuffer,
  analyzeFile,
} = require('../server/src/artifact/structural-analyzer');

module.exports = function registerArtifactAnalysisTests({ test, assert }) {
  test('artifact entropy is zero for repeated byte', () => {
    assert.equal(shannonEntropy(Buffer.alloc(4096, 0xaa)), 0);
  });

  test('artifact magic scanner finds gzip and zip signatures', () => {
    const buffer = Buffer.concat([
      Buffer.from([1, 2, 3]),
      Buffer.from([0x1f, 0x8b]),
      Buffer.alloc(8),
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    ]);

    const names = scanMagic(buffer).map((entry) => entry.name);
    assert.ok(names.includes('gzip'));
    assert.ok(names.includes('zip-local-file'));
  });

  test('artifact string scanner keeps protocol-relevant strings only', () => {
    const buffer = Buffer.from(
      'hello world\0https://nba2k17-ws.2ksports.com/Session\0ordinary sentence',
      'ascii',
    );

    const strings = extractRelevantAsciiStrings(buffer);
    assert.equal(strings.length, 1);
    assert.match(strings[0].text, /nba2k17-ws\.2ksports\.com/);
  });

  test('artifact analyzer identifies strict reference field-list candidate without promotion', () => {
    const fieldList = new ReferenceFieldListBuilder()
      .addString8(1, 'https://example.invalid/service')
      .build().fieldList;

    const report = analyzeBuffer(fieldList, {
      maximumCandidates: 8,
    });

    assert.match(report.sha256, /^[0-9a-f]{64}$/);
    assert.ok(report.referenceFieldListCandidates.length >= 1);

    const candidate = report.referenceFieldListCandidates[0];
    assert.equal(
      candidate.evidenceClass,
      'CROSS_VERSION_REFERENCE_CANDIDATE',
    );
    assert.match(candidate.note, /not proof of NBA 2K17/i);
  });

  test('artifact analyzer recognizes gzip material structurally', () => {
    const compressed = zlib.gzipSync(
      Buffer.from('https://example.invalid/manifest', 'ascii'),
    );

    const report = analyzeBuffer(compressed);
    assert.ok(report.magic.some((entry) => entry.name === 'gzip'));
  });

  test('streaming file analyzer produces metadata report without copying content into result', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-structure-test-'),
    );

    try {
      const file = path.join(root, 'SYNC.BIN');
      fs.writeFileSync(
        file,
        Buffer.concat([
          Buffer.alloc(4096, 0x00),
          Buffer.from('https://example.invalid/manifest\0', 'ascii'),
          Buffer.alloc(4096, 0xff),
        ]),
      );

      const report = analyzeFile(file, {
        chunkSize: 4096,
        windowSize: 1024,
      });

      assert.equal(
        report.schema,
        '2k17-compat-lab.cache-structure-report.v1',
      );
      assert.equal(report.basename, 'SYNC.BIN');
      assert.equal(report.analysisMode, 'READ_ONLY_STREAMING');
      assert.match(report.sha256, /^[0-9a-f]{64}$/);
      assert.ok(Array.isArray(report.entropy));
      assert.ok(
        report.relevantStrings.some((entry) =>
          entry.text.includes('manifest'),
        ),
      );

      for (const forbidden of ['raw', 'body', 'bytes', 'base64']) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(report, forbidden),
          false,
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  test('large artifact analysis bounds speculative reference scanning', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-reference-budget-test-'),
    );

    try {
      const file = path.join(root, 'large.bin');
      fs.writeFileSync(file, Buffer.alloc(2 * 1024 * 1024, 0x41));

      const report = analyzeFile(file, {
        chunkSize: 256 * 1024,
        windowSize: 64 * 1024,
        referenceScanBudgetBytes: 512 * 1024,
      });

      assert.equal(report.referenceBytesScanned, 512 * 1024);
      assert.equal(
        report.referenceScanMode,
        'BOUNDED_CROSS_VERSION_REFERENCE_SCAN',
      );
      assert.deepEqual(report.claimsPromoted, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

};
