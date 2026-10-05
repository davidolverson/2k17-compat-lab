'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildHandoff,
  renderPrompt,
} = require('../scripts/build-claude-handoff');

module.exports = function registerHandoffTests({ test, assert }) {
  test('Claude handoff hashes evidence files and promotes no claims', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-claude-handoff-test-'),
    );

    try {
      fs.writeFileSync(
        path.join(root, 'session-manifest.json'),
        JSON.stringify({
          startedAtUtc: '2026-10-05T00:00:00.000Z',
          mode: 'TEST',
          artifact: {
            basename: 'SYNC.BIN',
            byteSize: 123,
            sha256: 'a'.repeat(64),
            evidenceClass: 'LOCAL_AUTHORIZED_ARTIFACT_ANALYSIS',
          },
        }),
      );
      fs.writeFileSync(
        path.join(root, 'session-stop.json'),
        JSON.stringify({
          stoppedAtUtc: '2026-10-05T00:01:00.000Z',
        }),
      );
      fs.writeFileSync(
        path.join(root, 'websocket-events.json'),
        JSON.stringify({ events: [{ kind: 'websocket.upgrade' }] }),
      );
      fs.writeFileSync(
        path.join(root, 'udp-events.json'),
        JSON.stringify({ events: [{ kind: 'udp.datagram' }, { kind: 'udp.datagram' }] }),
      );

      const pack = buildHandoff(root);

      assert.equal(pack.evidenceSummary.websocketEvents, 1);
      assert.equal(pack.evidenceSummary.udpEvents, 2);
      assert.deepEqual(pack.evidenceSummary.claimsPromoted, []);
      assert.equal(pack.files.length, 4);

      for (const file of pack.files) {
        assert.match(file.sha256, /^[0-9a-f]{64}$/);
        assert.ok(file.byteSize > 0);
      }

      const prompt = renderPrompt(pack);
      assert.match(prompt, /observed facts from hypotheses/i);
      assert.match(prompt, /Do not contact live 2K infrastructure/i);
      assert.match(prompt, /Keep all unverified 2K17 semantics explicitly unverified/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Claude handoff refuses a directory without a session manifest', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-claude-handoff-empty-'),
    );

    try {
      assert.throws(
        () => buildHandoff(root),
        /session-manifest\.json not found/,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
};
