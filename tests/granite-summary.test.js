'use strict';

const {
  parseGraniteLine,
  parseGraniteLog,
  summarizeGraniteRecords,
} = require('../scripts/summarize-granite-log');

module.exports = function registerGraniteSummaryTests({ test, assert }) {
  test('Granite parser normalizes observed timestamp/method/path/session shape', () => {
    const record = parseGraniteLine(
      '@ 2026-10-05 08:05:22.607 POST /Session/login?x=123 session=456',
      4,
    );

    assert.equal(record.sourceLine, 5);
    assert.equal(record.method, 'POST');
    assert.equal(record.path, '/Session/login');
    assert.equal(record.queryPresent, true);
    assert.equal(record.sessionPresent, true);
  });

  test('Granite summary produces route-compatible shape without inventing unavailable fields', () => {
    const parsed = parseGraniteLog(
      '@ 2026-10-05 08:05:22.607 POST /Session/login?x=1 session=1\n' +
      '@ 2026-10-05 08:07:22.608 POST /nba/2k17/Session/update?x=1 session=1\n' +
      '@ 2026-10-05 08:09:22.622 POST /nba/2k17/Session/update?x=1 session=1\n',
    );

    const summary = summarizeGraniteRecords(parsed.records);

    assert.equal(summary.httpRequests, 3);
    assert.equal(summary.uniqueRoutes, 2);
    assert.equal(summary.gameAttributedRequests, null);
    assert.equal(summary.routes[1].count, 2);
    assert.deepEqual(summary.claimsPromoted, []);
    assert.ok(summary.limitations.length >= 1);
  });

  test('Granite parser surfaces unparsed lines instead of silently treating them as requests', () => {
    const parsed = parseGraniteLog(
      'server booted\n' +
      '@ 2026-10-05 08:05:22.607 POST /Session/login?x=1 session=1\n',
    );

    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.unparsed.length, 1);
    assert.equal(parsed.unparsed[0].line, 1);
  });
};
