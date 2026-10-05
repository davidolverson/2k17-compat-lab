'use strict';

const crypto = require('node:crypto');
const dgram = require('node:dgram');
const fs = require('node:fs');
const path = require('node:path');

function summarizeDatagram(message, remote, local = null) {
  if (!Buffer.isBuffer(message)) {
    throw new TypeError('datagram message must be a Buffer');
  }

  return {
    kind: 'udp.datagram',
    tsUtc: new Date().toISOString(),
    byteLength: message.length,
    sha256: crypto
      .createHash('sha256')
      .update(message)
      .digest('hex'),
    remoteAddress: remote && remote.address ? remote.address : null,
    remotePort: remote && remote.port ? remote.port : null,
    remoteFamily: remote && remote.family ? remote.family : null,
    localAddress: local && local.address ? local.address : null,
    localPort: local && local.port ? local.port : null,
    evidenceClass: 'TRANSPORT_OBSERVATION',
  };
}

function persistRawDatagram(directory, summary, message) {
  const dir = path.resolve(directory);
  fs.mkdirSync(dir, { recursive: true });

  const fileName =
    summary.tsUtc.replace(/[:.]/g, '-') +
    '-' +
    summary.sha256.slice(0, 16) +
    '.udp.bin';

  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, message);
  return filePath;
}

function createUdpCaptureServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port === undefined ? 0 : Number(options.port);
  const family = options.family || 'udp4';

  if (!['udp4', 'udp6'].includes(family)) {
    throw new Error('UDP family must be udp4 or udp6');
  }

  const socket = dgram.createSocket(family);

  socket.on('message', (message, remote) => {
    const local = socket.address();
    const summary = summarizeDatagram(message, remote, local);

    let rawPath = null;
    if (options.rawDir) {
      rawPath = persistRawDatagram(options.rawDir, summary, message);
    }

    if (typeof options.onDatagram === 'function') {
      options.onDatagram({
        summary,
        rawPath,
      });
    }
  });

  socket.on('error', (error) => {
    if (typeof options.onError === 'function') options.onError(error);
  });

  return {
    socket,
    start() {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          socket.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          socket.off('error', onError);
          resolve(socket.address());
        };
        socket.once('error', onError);
        socket.once('listening', onListening);
        socket.bind(port, host);
      });
    },
    stop() {
      return new Promise((resolve) => {
        try {
          socket.close(() => resolve());
        } catch (_) {
          resolve();
        }
      });
    },
  };
}

module.exports = {
  summarizeDatagram,
  persistRawDatagram,
  createUdpCaptureServer,
};
