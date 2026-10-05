'use strict';

const crypto = require('node:crypto');
const {
  websocketAccept,
  parseWebSocketFrames,
  sanitizeUpgradeHeaders,
} = require('../server/src/realtime/websocket-capture');
const {
  summarizeDatagram,
} = require('../server/src/realtime/udp-capture');

function maskedTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = Buffer.from([1, 2, 3, 4]);
  const frame = Buffer.alloc(2 + 4 + payload.length);

  frame[0] = 0x81;
  frame[1] = 0x80 | payload.length;
  mask.copy(frame, 2);

  for (let i = 0; i < payload.length; i += 1) {
    frame[6 + i] = payload[i] ^ mask[i % 4];
  }

  return frame;
}

module.exports = function registerRealtimeTests({ test, assert }) {
  test('WebSocket accept matches RFC6455 example vector', () => {
    assert.equal(
      websocketAccept('dGhlIHNhbXBsZSBub25jZQ=='),
      's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
    );
  });

  test('WebSocket frame parser unmasks synthetic client frame', () => {
    const parsed = parseWebSocketFrames(
      maskedTextFrame('hello'),
    );

    assert.equal(parsed.frames.length, 1);
    assert.equal(parsed.remaining.length, 0);
    assert.equal(parsed.frames[0].opcode, 1);
    assert.equal(parsed.frames[0].masked, true);
    assert.equal(parsed.frames[0].payload.toString('utf8'), 'hello');
    assert.match(
      parsed.frames[0].payloadSha256,
      /^[0-9a-f]{64}$/,
    );
  });

  test('WebSocket parser preserves incomplete frame as remaining bytes', () => {
    const frame = maskedTextFrame('hello');
    const partial = frame.subarray(0, frame.length - 2);
    const parsed = parseWebSocketFrames(partial);

    assert.equal(parsed.frames.length, 0);
    assert.deepEqual(parsed.remaining, partial);
  });

  test('WebSocket upgrade sanitizer redacts auth, cookies and subprotocol', () => {
    const headers = sanitizeUpgradeHeaders({
      authorization: 'secret',
      cookie: 'x=y',
      'sec-websocket-protocol': 'private-value',
      host: 'example.invalid',
    });

    assert.equal(headers.authorization, '[REDACTED]');
    assert.equal(headers.cookie, '[REDACTED]');
    assert.equal(
      headers['sec-websocket-protocol'],
      '[REDACTED]',
    );
    assert.equal(headers.host, 'example.invalid');
  });

  test('UDP capture summary records length and hash only', () => {
    const message = Buffer.from([1, 2, 3, 4]);

    const summary = summarizeDatagram(
      message,
      {
        address: '127.0.0.1',
        port: 40000,
        family: 'IPv4',
      },
      {
        address: '127.0.0.1',
        port: 50000,
      },
    );

    assert.equal(summary.byteLength, 4);
    assert.equal(
      summary.sha256,
      crypto.createHash('sha256').update(message).digest('hex'),
    );
    assert.equal(summary.remoteAddress, '127.0.0.1');
    assert.equal(summary.localPort, 50000);
    assert.equal(
      Object.prototype.hasOwnProperty.call(summary, 'payload'),
      false,
    );
  });
};
