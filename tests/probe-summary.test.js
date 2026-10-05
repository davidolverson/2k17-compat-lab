'use strict';

const {
  parseJsonl,
  summarizeRecords,
} = require('../scripts/summarize-probe-log');

module.exports = function registerProbeSummaryTests({ test, assert }) {
  test('probe summary groups routes without exporting raw bodies', () => {
    const body = Buffer.from('abc', 'ascii').toString('base64');
    const records = [
      {
        seq: 10,
        kind: 'http.request',
        levelBEvidence: true,
        attributedTo: 'NBA2K17',
        clientPid: 123,
        method: 'POST',
        path: '/Session/login',
        bodyLength: 3,
        bodyTruncated: false,
        bodyEncoding: 'base64',
        bodyRaw: body,
        respondedWith: { label: 'login-v1', status: 200 },
      },
      {
        seq: 11,
        kind: 'http.request',
        levelBEvidence: true,
        attributedTo: 'NBA2K17',
        clientPid: 123,
        method: 'POST',
        path: '/Session/login',
        bodyLength: 3,
        bodyTruncated: false,
        bodyEncoding: 'base64',
        bodyRaw: body,
        respondedWith: { label: 'login-v1', status: 200 },
      },
      {
        seq: 12,
        kind: 'http.request',
        levelBEvidence: true,
        attributedTo: 'NBA2K17',
        clientPid: 123,
        method: 'PUT',
        path: '/nba/2k17/UserContent/upload',
        bodyLength: 999999,
        bodyTruncated: true,
        bodyEncoding: 'base64',
        bodyRaw: 'AA==',
        respondedWith: { label: 'ack-success-catchall', status: 200 },
      },
    ];

    const summary = summarizeRecords(records);

    assert.equal(summary.httpRequests, 3);
    assert.equal(summary.gameAttributedRequests, 3);
    assert.equal(summary.uniqueRoutes, 2);
    assert.deepEqual(summary.claimsPromoted, []);

    const login = summary.routes.find(
      (row) => row.path === '/Session/login',
    );
    assert.equal(login.count, 2);
    assert.equal(login.repeated, true);
    assert.equal(login.uniqueCompleteBodyHashes, 1);
    assert.equal(login.needsHandlerReview, false);

    const upload = summary.routes.find(
      (row) => row.path === '/nba/2k17/UserContent/upload',
    );
    assert.equal(upload.truncatedBodies, 1);
    assert.equal(upload.fallbackLikeResponses, 1);
    assert.equal(upload.needsHandlerReview, true);

    assert.equal(
      JSON.stringify(summary).includes('bodyRaw'),
      false,
    );
  });

  test('probe summary parser reports malformed JSONL instead of skipping silently', () => {
    const parsed = parseJsonl(
      '{"kind":"http.request","method":"GET","path":"/ok"}\n' +
        '{not json}\n',
    );

    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].line, 2);
  });
};
