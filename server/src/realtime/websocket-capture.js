'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function websocketAccept(key) {
  return crypto
    .createHash('sha1')
    .update(String(key) + WS_GUID, 'ascii')
    .digest('base64');
}

function parseWebSocketFrames(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('WebSocket frame input must be a Buffer');
  }

  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const start = offset;
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    offset += 2;

    const fin = Boolean(b0 & 0x80);
    const rsv1 = Boolean(b0 & 0x40);
    const rsv2 = Boolean(b0 & 0x20);
    const rsv3 = Boolean(b0 & 0x10);
    const opcode = b0 & 0x0f;
    const masked = Boolean(b1 & 0x80);
    let payloadLength = b1 & 0x7f;

    if (payloadLength === 126) {
      if (offset + 2 > buffer.length) break;
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (offset + 8 > buffer.length) break;
      const length64 = buffer.readBigUInt64BE(offset);
      offset += 8;
      if (length64 > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError('WebSocket frame payload length exceeds safe integer');
      }
      payloadLength = Number(length64);
    }

    let mask = null;
    if (masked) {
      if (offset + 4 > buffer.length) break;
      mask = Buffer.from(buffer.subarray(offset, offset + 4));
      offset += 4;
    }

    if (offset + payloadLength > buffer.length) break;

    const wirePayload = Buffer.from(
      buffer.subarray(offset, offset + payloadLength),
    );
    offset += payloadLength;

    const payload = Buffer.from(wirePayload);
    if (masked && mask) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= mask[i % 4];
      }
    }

    frames.push({
      frameOffset: start,
      wireLength: offset - start,
      fin,
      rsv1,
      rsv2,
      rsv3,
      opcode,
      masked,
      payloadLength,
      payloadSha256: crypto
        .createHash('sha256')
        .update(payload)
        .digest('hex'),
      payload,
    });
  }

  return {
    frames,
    remaining: Buffer.from(buffer.subarray(offset)),
  };
}

function sanitizeUpgradeHeaders(headers = {}) {
  const sensitive = new Set([
    'authorization',
    'cookie',
    'proxy-authorization',
    'sec-websocket-protocol',
  ]);

  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = sensitive.has(name.toLowerCase())
      ? '[REDACTED]'
      : value;
  }
  return out;
}

function createWebSocketCaptureServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port === undefined ? 0 : Number(options.port);
  const acceptUpgrades = Boolean(options.acceptUpgrades);

  const server = http.createServer((req, res) => {
    res.writeHead(426, {
      'Content-Type': 'text/plain',
      'Content-Length': '0',
    });
    res.end();
  });

  server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key'];
    const event = {
      kind: 'websocket.upgrade',
      tsUtc: new Date().toISOString(),
      method: req.method || null,
      path: req.url || null,
      headers: sanitizeUpgradeHeaders(req.headers),
      remoteAddress: socket.remoteAddress || null,
      remotePort: socket.remotePort || null,
      accepted: false,
      evidenceClass: 'TRANSPORT_OBSERVATION',
    };

    if (typeof options.onUpgrade === 'function') {
      options.onUpgrade(event);
    }

    if (!acceptUpgrades || typeof key !== 'string') {
      socket.write(
        'HTTP/1.1 426 Upgrade Required\r\n' +
          'Connection: close\r\n' +
          'Content-Length: 0\r\n' +
          '\r\n',
      );
      socket.end();
      return;
    }

    const accept = websocketAccept(key);

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' +
        accept +
        '\r\n' +
        '\r\n',
    );

    event.accepted = true;
    if (typeof options.onAccepted === 'function') {
      options.onAccepted({ ...event });
    }

    let pending = Buffer.from(head || Buffer.alloc(0));

    function consume() {
      const parsed = parseWebSocketFrames(pending);
      pending = parsed.remaining;

      for (const frame of parsed.frames) {
        const summary = {
          kind: 'websocket.frame',
          tsUtc: new Date().toISOString(),
          opcode: frame.opcode,
          fin: frame.fin,
          masked: frame.masked,
          payloadLength: frame.payloadLength,
          payloadSha256: frame.payloadSha256,
          evidenceClass: 'TRANSPORT_OBSERVATION',
        };

        if (typeof options.onFrame === 'function') {
          options.onFrame(summary, Buffer.from(frame.payload));
        }
      }
    }

    if (pending.length) consume();

    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      consume();
    });

    socket.on('error', (error) => {
      if (typeof options.onError === 'function') options.onError(error);
    });
  });

  return {
    server,
    start() {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve(server.address());
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

module.exports = {
  WS_GUID,
  websocketAccept,
  parseWebSocketFrames,
  sanitizeUpgradeHeaders,
  createWebSocketCaptureServer,
};
