'use strict';

const crypto = require('node:crypto');
const dgram = require('node:dgram');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { main: runParallel } = require('./run-parallel-reconstruction');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sendUpgrade(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: '127.0.0.1', port },
      () => {
        socket.write(
          'GET /smoke HTTP/1.1\r\n' +
            'Host: 127.0.0.1\r\n' +
            'Connection: Upgrade\r\n' +
            'Upgrade: websocket\r\n' +
            'Sec-WebSocket-Version: 13\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n',
        );
      },
    );

    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      response += chunk;
    });
    socket.on('end', () => {
      if (!response.includes('426 Upgrade Required')) {
        reject(new Error('expected rejected synthetic WebSocket upgrade'));
        return;
      }
      resolve();
    });
    socket.on('error', reject);
  });
}

function sendUdp(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.send(payload, port, '127.0.0.1', (error) => {
      if (error) {
        socket.close();
        reject(error);
        return;
      }
      socket.close();
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function smoke() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), '2k17-parallel-smoke-'),
  );
  const outputDir = path.join(root, 'capture');
  const handoffDir = path.join(root, 'handoff');
  const artifactPath = path.join(root, 'synthetic-sync.dat');
  const configPath = path.join(root, 'config.json');

  const artifactBytes = Buffer.concat([
    Buffer.alloc(1024, 0x00),
    Buffer.from(
      'https://example.invalid/service\0synthetic sync manifest\0',
      'ascii',
    ),
    Buffer.alloc(1024, 0xff),
  ]);
  fs.writeFileSync(artifactPath, artifactBytes);

  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        artifactPath,
        outputDir,
        websocket: {
          host: '127.0.0.1',
          port: 0,
          acceptUpgrades: false,
        },
        udp: {
          host: '127.0.0.1',
          port: 0,
          family: 'udp4',
        },
      },
      null,
      2,
    ),
  );

  let session = null;

  try {
    session = await runParallel([configPath]);

    const wsPort = session.manifest.websocket.address.port;
    const udpPort = session.manifest.udp.address.port;

    await Promise.all([
      sendUpgrade(wsPort),
      sendUdp(udpPort, Buffer.from('synthetic-udp-smoke', 'ascii')),
    ]);

    await delay(150);
    await session.stop();
    session = null;

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, 'session-manifest.json'),
        'utf8',
      ),
    );
    const ws = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, 'websocket-events.json'),
        'utf8',
      ),
    );
    const udp = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, 'udp-events.json'),
        'utf8',
      ),
    );
    const stop = JSON.parse(
      fs.readFileSync(
        path.join(outputDir, 'session-stop.json'),
        'utf8',
      ),
    );

    if (manifest.artifact.sha256 !== sha256(artifactBytes)) {
      throw new Error('synthetic artifact hash mismatch');
    }
    if (!Array.isArray(ws.events) || ws.events.length !== 1) {
      throw new Error(
        'expected exactly one synthetic WebSocket upgrade event',
      );
    }
    if (!Array.isArray(udp.events) || udp.events.length !== 1) {
      throw new Error(
        'expected exactly one synthetic UDP event',
      );
    }
    if (stop.websocketEvents !== 1 || stop.udpEvents !== 1) {
      throw new Error('session stop counts do not match captured events');
    }
    if (
      !Array.isArray(manifest.claimsPromoted) ||
      manifest.claimsPromoted.length !== 0
    ) {
      throw new Error('synthetic smoke run promoted a protocol claim');
    }

    const handoff = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'build-claude-handoff.js'),
        outputDir,
        handoffDir,
      ],
      {
        encoding: 'utf8',
      },
    );

    if (handoff.status !== 0) {
      throw new Error(
        'Claude handoff generation failed: ' +
          (handoff.stderr || handoff.stdout || ''),
      );
    }

    const handoffJson = JSON.parse(
      fs.readFileSync(path.join(handoffDir, 'handoff.json'), 'utf8'),
    );
    const prompt = fs.readFileSync(
      path.join(handoffDir, 'CLAUDE_PROMPT.md'),
      'utf8',
    );

    if (handoffJson.evidenceSummary.websocketEvents !== 1) {
      throw new Error('handoff WebSocket count mismatch');
    }
    if (handoffJson.evidenceSummary.udpEvents !== 1) {
      throw new Error('handoff UDP count mismatch');
    }
    if (handoffJson.evidenceSummary.artifact.sha256 !== sha256(artifactBytes)) {
      throw new Error('handoff artifact hash mismatch');
    }
    if (!prompt.includes('Separate observed facts from hypotheses.')) {
      throw new Error('Claude prompt is missing evidence-boundary instruction');
    }

    process.stdout.write(
      'PARALLEL_SMOKE_PASS\n' +
        'WEBSOCKET_EVENTS 1\n' +
        'UDP_EVENTS 1\n' +
        'ARTIFACT_SHA256 ' +
        sha256(artifactBytes) +
        '\n' +
        'CLAUDE_HANDOFF_READY true\n' +
        'CLAIMS_PROMOTED 0\n',
    );
  } finally {
    if (session) {
      try {
        await session.stop();
      } catch (_) {
        // best-effort local smoke cleanup
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (require.main === module) {
  smoke().catch((error) => {
    process.stderr.write(
      (error && error.stack ? error.stack : String(error)) + '\n',
    );
    process.exitCode = 1;
  });
}

module.exports = {
  smoke,
  sendUpgrade,
  sendUdp,
};
