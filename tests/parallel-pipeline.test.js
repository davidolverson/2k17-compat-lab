'use strict';

const {
  compareStructureReports,
} = require('../server/src/artifact/compare-structure');
const {
  parseJsonFile,
  isLoopbackHost,
  normalizeConfig,
} = require('../scripts/run-parallel-reconstruction');

module.exports = function registerParallelPipelineTests({ test, assert }) {
  test('structure comparator separates shared and changed protocol strings', () => {
    const left = {
      basename: 'SYNC-A.BIN',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      magic: [
        { name: 'gzip', offset: 10 },
        { name: 'zip-local-file', offset: 50 },
      ],
      relevantStrings: [
        { text: 'https://example.invalid/service', offset: 20 },
        { text: 'version=1', offset: 40 },
      ],
      entropy: [
        { offset: 0, entropy: 1.0 },
        { offset: 64, entropy: 7.0 },
      ],
      referenceFieldListCandidates: [],
    };

    const right = {
      basename: 'SYNC-B.BIN',
      byteSize: 120,
      sha256: 'b'.repeat(64),
      magic: [
        { name: 'gzip', offset: 10 },
        { name: '7z', offset: 80 },
      ],
      relevantStrings: [
        { text: 'https://example.invalid/service', offset: 24 },
        { text: 'version=2', offset: 48 },
      ],
      entropy: [
        { offset: 0, entropy: 1.25 },
        { offset: 64, entropy: 6.5 },
      ],
      referenceFieldListCandidates: [{}],
    };

    const comparison = compareStructureReports(left, right);

    assert.equal(comparison.sizeDelta, 20);
    assert.equal(comparison.sha256Equal, false);
    assert.equal(comparison.magic.shared.length, 1);
    assert.equal(comparison.magic.leftOnly.length, 1);
    assert.equal(comparison.magic.rightOnly.length, 1);
    assert.equal(comparison.protocolStrings.shared.length, 1);
    assert.equal(comparison.protocolStrings.leftOnly.length, 1);
    assert.equal(comparison.protocolStrings.rightOnly.length, 1);
    assert.equal(
      comparison.referenceCodecCandidateCounts.right,
      1,
    );
    assert.deepEqual(comparison.claimsPromoted, []);
  });

  test('structure comparator does not infer protocol semantics from differences', () => {
    const report = {
      basename: 'A',
      byteSize: 1,
      sha256: 'c'.repeat(64),
      magic: [],
      relevantStrings: [],
      entropy: [],
      referenceFieldListCandidates: [],
    };

    const comparison = compareStructureReports(report, {
      ...report,
      basename: 'B',
      sha256: 'd'.repeat(64),
    });

    assert.deepEqual(comparison.claimsPromoted, []);
    assert.match(
      comparison.note,
      /do not identify protocol semantics/i,
    );
  });
  test('parallel reconstruction runner is loopback-only and claim-neutral', () => {
    assert.equal(isLoopbackHost('127.0.0.1'), true);
    assert.equal(isLoopbackHost('::1'), true);
    assert.equal(isLoopbackHost('localhost'), true);
    assert.equal(isLoopbackHost('0.0.0.0'), false);

    const config = normalizeConfig({
      websocket: { host: '127.0.0.1', port: 0 },
      udp: { host: '::1', port: 0, family: 'udp6' },
    });

    assert.equal(config.websocket.host, '127.0.0.1');
    assert.equal(config.udp.host, '::1');

    assert.throws(
      () => normalizeConfig({ websocket: { host: '0.0.0.0' } }),
      /loopback-only/,
    );
    assert.throws(
      () => normalizeConfig({ udp: { host: '192.0.2.1' } }),
      /loopback-only/,
    );
  });

  test('parallel config reader tolerates UTF-8 BOM written by PowerShell', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), '2k17-bom-config-'));

    try {
      const file = path.join(root, 'config.json');
      fs.writeFileSync(
        file,
        '\ufeff' + JSON.stringify({
          websocket: { host: '127.0.0.1', port: 0 },
          udp: { host: '127.0.0.1', port: 0, family: 'udp4' },
        }),
        'utf8',
      );

      const parsed = parseJsonFile(file);
      assert.equal(parsed.websocket.host, '127.0.0.1');
      assert.equal(parsed.udp.family, 'udp4');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

};
