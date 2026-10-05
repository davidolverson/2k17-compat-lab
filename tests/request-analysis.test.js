'use strict';

const zlib = require('node:zlib');
const {
  ReferenceFieldListBuilder,
} = require('../server/src/codec/reference-field-list');
const {
  detectCompression,
  analyzeApplicationRequest,
} = require('../server/src/protocol/request-analyzer');

module.exports = function registerRequestAnalysisTests({ test, assert }) {
  test('request analyzer detects gzip without claiming protocol semantics', () => {
    const body = zlib.gzipSync(Buffer.from('synthetic', 'ascii'));
    const result = detectCompression(body);
    assert.equal(result.kind, 'gzip');
    assert.equal(result.confidence, 'HIGH');
  });

  test('request analyzer reports strict reference-codec compatibility as candidate only', () => {
    const body = new ReferenceFieldListBuilder()
      .addU32(1, 42)
      .build().fieldList;

    const report = analyzeApplicationRequest({
      method: 'POST',
      path: '/synthetic',
      contentType: 'application/octet-stream',
      body,
    });

    assert.equal(report.referenceFieldList.compatible, true);
    assert.equal(
      report.referenceFieldList.evidenceClass,
      'CROSS_VERSION_REFERENCE_CANDIDATE',
    );
    assert.deepEqual(report.promotedClaims, []);
  });

  test('request analyzer preserves incompatible body as negative evidence without throwing', () => {
    const report = analyzeApplicationRequest({
      method: 'POST',
      path: '/synthetic',
      body: Buffer.from('not-a-field-list', 'ascii'),
    });

    assert.equal(report.referenceFieldList.compatible, false);
    assert.equal(
      report.referenceFieldList.evidenceClass,
      'CROSS_VERSION_REFERENCE',
    );
    assert.match(report.body.sha256, /^[0-9a-f]{64}$/);
  });
};
