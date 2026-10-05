'use strict';

const {
  compareUploadDownload,
} = require('../scripts/verify-user-content-return');

function bundle(magic, text) {
  const payload = Buffer.from(text, 'ascii');
  const header = Buffer.alloc(8);
  header.write(magic, 0, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

module.exports = function registerUserContentReturnTests({ test, assert }) {
  test('user-content return proof passes only on byte-identical bundles', () => {
    const upload = bundle('BNH!', 'same-payload');
    const download = Buffer.concat([
      Buffer.from([1, 2, 3]),
      bundle('BNH!', 'same-payload'),
      Buffer.from([4, 5]),
    ]);

    const report = compareUploadDownload(upload, download);

    assert.equal(report.exactMatch, true);
    assert.equal(report.sha256Match, true);
    assert.deepEqual(report.claimsPromoted, []);
    assert.match(report.note, /does not prove the client accepted/i);
  });

  test('user-content return proof detects changed returned bytes', () => {
    const report = compareUploadDownload(
      bundle('BNH!', 'original'),
      bundle('BNH!', 'changed'),
    );

    assert.equal(report.exactMatch, false);
    assert.equal(report.sha256Match, false);
  });
};
