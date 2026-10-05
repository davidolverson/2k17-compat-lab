'use strict';

const {
  detectFormat,
  summarizeText,
} = require('../scripts/summarize-route-log');

module.exports = function registerRouteSummaryTests({ test, assert }) {
  test('route summarizer auto-detects probe JSONL', () => {
    const text =
      JSON.stringify({
        kind: 'http.request',
        method: 'POST',
        path: '/Session/login',
        bodyLength: 16,
        bodyTruncated: false,
        respondedWith: { label: 'login', status: 200 },
      }) + '\n';

    assert.equal(detectFormat(text), 'probe-jsonl');
    const result = summarizeText(text);
    assert.equal(result.summary.sourceFormat, 'PROBE_JSONL');
    assert.equal(result.summary.uniqueRoutes, 1);
  });

  test('route summarizer auto-detects Granite text log', () => {
    const text =
      '@ 2026-10-05 08:05:22.607 POST /Session/login?x=1 session=1\n';

    assert.equal(detectFormat(text), 'granite');
    const result = summarizeText(text);
    assert.equal(result.summary.sourceFormat, 'GRANITE_TEXT_LOG');
    assert.equal(result.summary.uniqueRoutes, 1);
  });

  test('route summarizer refuses unknown log formats', () => {
    assert.throws(
      () => summarizeText('totally unrelated log line\n'),
      /unable to detect route log format/,
    );
  });
};
