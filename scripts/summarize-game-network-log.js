'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function classifyAddress(address) {
  const value = String(address || '').toLowerCase();

  if (!value) return 'unknown';
  if (value === '::1' || value.startsWith('127.')) return 'loopback';
  if (value.startsWith('10.')) return 'private';
  if (value.startsWith('192.168.')) return 'private';
  if (value.startsWith('169.254.')) return 'link-local';
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return 'private';
  if (value.startsWith('fe80:')) return 'link-local';
  if (value.startsWith('fc') || value.startsWith('fd')) return 'private';
  if (value === '0.0.0.0' || value === '::') return 'unspecified';

  return 'public-or-other';
}

function parseJsonl(text) {
  const records = [];
  const errors = [];

  String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        records.push(JSON.parse(trimmed.replace(/^\uFEFF/, '')));
      } catch (error) {
        errors.push({
          line: index + 1,
          byteLength: Buffer.byteLength(line, 'utf8'),
          sha256: sha256Text(line),
          error: error.message,
        });
      }
    });

  return { records, errors };
}

function summarizeNetworkRecords(records) {
  const tcp = new Map();
  const udp = new Map();

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    if (record.kind === 'game.connection') {
      const port = Number(record.remotePort);
      const address = String(record.remoteAddress || '');
      const key =
        String(port) + '|' + classifyAddress(address) + '|' + sha256Text(address);

      if (!tcp.has(key)) {
        tcp.set(key, {
          transport: 'tcp',
          remotePort: Number.isSafeInteger(port) ? port : null,
          remoteAddressClass: classifyAddress(address),
          remoteAddressSha256: address ? sha256Text(address) : null,
          count: 0,
          states: new Set(),
        });
      }

      const item = tcp.get(key);
      item.count += 1;
      if (record.state) item.states.add(String(record.state));
    }

    if (record.kind === 'game.udp.endpoint') {
      const port = Number(record.localPort);
      const address = String(record.localAddress || '');
      const key = String(port) + '|' + classifyAddress(address);

      if (!udp.has(key)) {
        udp.set(key, {
          transport: 'udp',
          localPort: Number.isSafeInteger(port) ? port : null,
          localAddressClass: classifyAddress(address),
          count: 0,
          remotePeerKnown: false,
        });
      }

      udp.get(key).count += 1;
    }
  }

  const tcpConnections = Array.from(tcp.values())
    .map((item) => ({
      ...item,
      states: Array.from(item.states).sort(),
    }))
    .sort((a, b) => (a.remotePort || 0) - (b.remotePort || 0));

  const udpEndpoints = Array.from(udp.values())
    .sort((a, b) => (a.localPort || 0) - (b.localPort || 0));

  return {
    schema: '2k17-compat-lab.game-network-observation.v1',
    evidenceClass: 'LOCAL_LOG_SUMMARY',
    tcpConnections,
    udpEndpoints,
    totals: {
      tcpUniqueRemotePeers: tcpConnections.length,
      udpUniqueLocalEndpoints: udpEndpoints.length,
      nonLoopbackTcpPeers: tcpConnections.filter(
        (item) => item.remoteAddressClass !== 'loopback',
      ).length,
    },
    hypothesisRelevance: {
      H4_TRANSPORT_ACTIVITY:
        tcpConnections.length > 0 || udpEndpoints.length > 0,
      H4_UDP_ACTIVITY_OBSERVED:
        udpEndpoints.length > 0,
    },
    claimsPromoted: [],
    limitations: [
      'UDP remote peers are not available from the Windows UDP endpoint table.',
      'A socket observation does not prove relay semantics or causality.',
      'Raw remote IP addresses are intentionally omitted from this summary.',
    ],
  };
}

function main(argv = process.argv.slice(2)) {
  const input = argv[0];
  const explicitOutput = argv[1];

  if (!input) {
    process.stderr.write(
      'Usage: node scripts/summarize-game-network-log.js <attribution.jsonl> [output.json]\n',
    );
    return 2;
  }

  const absoluteInput = path.resolve(input);
  const parsed = parseJsonl(fs.readFileSync(absoluteInput, 'utf8'));
  const report = summarizeNetworkRecords(parsed.records);
  report.parseErrors = parsed.errors;

  const output = explicitOutput
    ? path.resolve(explicitOutput)
    : path.join(
        process.cwd(),
        'server',
        'captures',
        'network-observation-local',
        path.basename(absoluteInput) + '.summary.json',
      );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');

  process.stdout.write(
    'NETWORK_OBSERVATION_READY\n' +
      'TCP_REMOTE_PEERS ' + report.totals.tcpUniqueRemotePeers + '\n' +
      'UDP_LOCAL_ENDPOINTS ' + report.totals.udpUniqueLocalEndpoints + '\n' +
      'H4_TRANSPORT_ACTIVITY ' + report.hypothesisRelevance.H4_TRANSPORT_ACTIVITY + '\n' +
      'CLAIMS_PROMOTED 0\n' +
      'OUTPUT ' + output + '\n',
  );

  return parsed.errors.length ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(
      (error && error.stack ? error.stack : String(error)) + '\n',
    );
    process.exitCode = 1;
  }
}

module.exports = {
  sha256Text,
  classifyAddress,
  parseJsonl,
  summarizeNetworkRecords,
  main,
};
