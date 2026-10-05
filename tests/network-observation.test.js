'use strict';

const {
  classifyAddress,
  parseJsonl,
  summarizeNetworkRecords,
} = require('../scripts/summarize-game-network-log');

module.exports = function registerNetworkObservationTests({ test, assert }) {
  test('network observer classifies common address classes', () => {
    assert.equal(classifyAddress('127.0.0.1'), 'loopback');
    assert.equal(classifyAddress('::1'), 'loopback');
    assert.equal(classifyAddress('192.168.1.20'), 'private');
    assert.equal(classifyAddress('10.2.3.4'), 'private');
    assert.equal(classifyAddress('169.254.1.1'), 'link-local');
    assert.equal(classifyAddress('203.0.113.10'), 'public-or-other');
  });

  test('network observer summarizes TCP and UDP without exporting raw remote IPs', () => {
    const records = [
      {
        kind: 'game.connection',
        transport: 'tcp',
        remoteAddress: '203.0.113.10',
        remotePort: 17217,
        state: 'Established',
      },
      {
        kind: 'game.udp.endpoint',
        transport: 'udp',
        localAddress: '0.0.0.0',
        localPort: 50000,
        remotePeerKnown: false,
      },
    ];

    const report = summarizeNetworkRecords(records);

    assert.equal(report.totals.tcpUniqueRemotePeers, 1);
    assert.equal(report.totals.udpUniqueLocalEndpoints, 1);
    assert.equal(report.hypothesisRelevance.H4_UDP_ACTIVITY_OBSERVED, true);
    assert.match(report.tcpConnections[0].remoteAddressSha256, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(report).includes('203.0.113.10'), false);
    assert.deepEqual(report.claimsPromoted, []);
  });

  test('network observer reports malformed JSONL without preserving raw line text', () => {
    const parsed = parseJsonl('{"kind":"game.connection"}\n{bad json}\n');

    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].line, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.errors[0], 'text'), false);
  });
};
