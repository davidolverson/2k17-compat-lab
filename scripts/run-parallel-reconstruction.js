'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  analyzeFile,
} = require('../server/src/artifact/structural-analyzer');
const {
  createWebSocketCaptureServer,
} = require('../server/src/realtime/websocket-capture');
const {
  createUdpCaptureServer,
} = require('../server/src/realtime/udp-capture');

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

function normalizeConfig(input = {}) {
  const websocket = {
    host: '127.0.0.1',
    port: 0,
    acceptUpgrades: false,
    ...(input.websocket || {}),
  };
  const udp = {
    host: '127.0.0.1',
    port: 0,
    family: 'udp4',
    ...(input.udp || {}),
  };

  if (!isLoopbackHost(websocket.host)) {
    throw new Error('parallel reconstruction WebSocket host must be loopback-only');
  }
  if (!isLoopbackHost(udp.host)) {
    throw new Error('parallel reconstruction UDP host must be loopback-only');
  }

  return {
    artifactPath: input.artifactPath ? path.resolve(input.artifactPath) : null,
    outputDir: path.resolve(
      input.outputDir ||
        path.join('server', 'captures', 'parallel-reconstruction-local'),
    ),
    websocket,
    udp,
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function main(argv = process.argv.slice(2)) {
  const configPath = argv[0];
  const rawConfig = configPath
    ? JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'))
    : {};
  const config = normalizeConfig(rawConfig);
  const startedAtUtc = new Date().toISOString();

  const wsEvents = [];
  const udpEvents = [];

  const ws = createWebSocketCaptureServer({
    ...config.websocket,
    onUpgrade: (event) => {
      wsEvents.push(event);
      process.stdout.write(
        '[parallel/ws] upgrade ' +
          (event.path || '') +
          ' accepted=' +
          event.accepted +
          '\n',
      );
    },
    onAccepted: (event) => {
      wsEvents.push(event);
      process.stdout.write('[parallel/ws] accepted ' + (event.path || '') + '\n');
    },
    onFrame: (summary) => {
      wsEvents.push(summary);
      process.stdout.write(
        '[parallel/ws] frame opcode=' +
          summary.opcode +
          ' bytes=' +
          summary.payloadLength +
          ' sha256=' +
          summary.payloadSha256 +
          '\n',
      );
    },
  });

  const udp = createUdpCaptureServer({
    ...config.udp,
    rawDir:
      config.udp.rawDir ||
      path.join(config.outputDir, 'udp-raw-local'),
    onDatagram: ({ summary }) => {
      udpEvents.push(summary);
      process.stdout.write(
        '[parallel/udp] bytes=' +
          summary.byteLength +
          ' from=' +
          summary.remoteAddress +
          ':' +
          summary.remotePort +
          ' sha256=' +
          summary.sha256 +
          '\n',
      );
    },
  });

  const artifactPromise = config.artifactPath
    ? Promise.resolve().then(() => analyzeFile(config.artifactPath))
    : Promise.resolve(null);

  const [wsAddress, udpAddress, artifact] = await Promise.all([
    ws.start(),
    udp.start(),
    artifactPromise,
  ]);

  const manifest = {
    schema: '2k17-compat-lab.parallel-reconstruction-session.v1',
    startedAtUtc,
    mode: 'LOOPBACK_CAPTURE_AND_READ_ONLY_ANALYSIS',
    websocket: {
      address: wsAddress,
      acceptUpgrades: Boolean(config.websocket.acceptUpgrades),
      evidenceClass: 'TRANSPORT_OBSERVATION',
    },
    udp: {
      address: udpAddress,
      evidenceClass: 'TRANSPORT_OBSERVATION',
    },
    artifact: artifact
      ? {
          basename: artifact.basename,
          byteSize: artifact.byteSize,
          sha256: artifact.sha256,
          report: artifact,
          evidenceClass: 'LOCAL_AUTHORIZED_ARTIFACT_ANALYSIS',
        }
      : null,
    claimsPromoted: [],
    note:
      'Parallel execution does not merge evidence classes or promote protocol claims. Real client attribution remains a separate gate.',
  };

  writeJson(path.join(config.outputDir, 'session-manifest.json'), manifest);

  process.stdout.write(
    '[parallel] websocket=' +
      wsAddress.address +
      ':' +
      wsAddress.port +
      ' udp=' +
      udpAddress.address +
      ':' +
      udpAddress.port +
      (artifact ? ' artifact=' + artifact.sha256 : ' artifact=none') +
      '\n',
  );
  process.stdout.write('[parallel] press Ctrl+C to stop capture listeners\n');

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;

    const stoppedAtUtc = new Date().toISOString();
    await Promise.all([ws.stop(), udp.stop()]);

    writeJson(path.join(config.outputDir, 'websocket-events.json'), {
      evidenceClass: 'TRANSPORT_OBSERVATION',
      events: wsEvents,
    });
    writeJson(path.join(config.outputDir, 'udp-events.json'), {
      evidenceClass: 'TRANSPORT_OBSERVATION',
      events: udpEvents,
    });
    writeJson(path.join(config.outputDir, 'session-stop.json'), {
      stoppedAtUtc,
      websocketEvents: wsEvents.length,
      udpEvents: udpEvents.length,
      claimsPromoted: [],
    });
  };

  process.on('SIGINT', () => {
    stop().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    stop().then(() => process.exit(0));
  });

  return { ws, udp, manifest, stop };
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      (error && error.stack ? error.stack : String(error)) + '\n',
    );
    process.exitCode = 1;
  });
}

module.exports = {
  isLoopbackHost,
  normalizeConfig,
  main,
};
