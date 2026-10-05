'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { CaptureStore } = require('../capture/capture-store');
const { createCaptureHandler } = require('./http-capture');
const { PROFILE, buildTlsOptions } = require('./tls-options');

function readTlsMaterial(config = {}) {
  if (Buffer.isBuffer(config.pfx)) {
    return { pfx: config.pfx, passphrase: String(config.passphrase || '') };
  }

  const tls = config.tls || {};
  if (!tls.pfxPath) throw new Error('TLS configuration requires tls.pfxPath');

  const pfx = fs.readFileSync(path.resolve(tls.pfxPath));
  let passphrase = '';
  if (tls.passphrasePath) {
    passphrase = fs.readFileSync(path.resolve(tls.passphrasePath), 'utf8').trim();
  } else if (tls.passphrase !== undefined) {
    passphrase = String(tls.passphrase);
  }
  return { pfx, passphrase };
}

function createHttpsCaptureServer(config = {}) {
  const store = config.captureStore || new CaptureStore({
    rawDir: config.rawDir,
    sanitizedDir: config.sanitizedDir,
  });

  const handler = config.handler || createCaptureHandler({
    captureStore: store,
    responseRules: config.responseRules,
    fallbackProfile: config.fallbackProfile,
    maxBodyBytes: config.maxBodyBytes,
    autoExportSanitized: config.autoExportSanitized,
    evidenceContext: config.evidenceContext || null,
    onCapture: config.onCapture,
    onError: config.onError,
  });

  const tlsOptions = buildTlsOptions(readTlsMaterial(config));
  const listeners = [];
  const events = [];
  const addresses = { ipv4: null, ipv6: null };
  let primaryServer = null;
  let started = false;

  function emit(kind, data = {}) {
    const event = { kind, ...data };
    events.push(event);
    if (typeof config.onEvent === 'function') config.onEvent(kind, data);
    return event;
  }

  function attachDiagnostics(server) {
    server.on('tlsClientError', (error, socket) => {
      const data = {
        error,
        code: error.code || null,
        message: error.message || null,
        remoteAddress: socket ? socket.remoteAddress : null,
        remotePort: socket ? socket.remotePort : null,
      };
      emit('tls.clientError', data);
      if (typeof config.onTlsClientError === 'function') {
        config.onTlsClientError(data);
      }
    });

    server.on('secureConnection', (socket) => {
      const cipher = socket.getCipher ? socket.getCipher() : null;
      const data = {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        protocol: socket.getProtocol ? socket.getProtocol() : null,
        cipher: cipher && cipher.name ? cipher.name : null,
        alpn: socket.alpnProtocol || null,
        servername: socket.servername || null,
        meaning:
          'transport handshake completed; application-level acceptance is not implied',
      };
      emit('tls.established', data);
      if (typeof config.onTlsEstablished === 'function') {
        config.onTlsEstablished(data);
      }
    });
  }

  function makeServer() {
    const server = https.createServer(tlsOptions, handler);
    attachDiagnostics(server);
    return server;
  }

  function listen(server, port, host) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        listeners.push(server);
        resolve(server.address());
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  async function start() {
    if (started) throw new Error('HTTPS capture server already started');
    started = true;

    const host = config.host || '127.0.0.1';
    const port = config.port === undefined ? 17217 : Number(config.port);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
      throw new RangeError('port must be an integer from 0 to 65535');
    }

    const isLoopback =
      host === '127.0.0.1' || host === '::1' || host === 'localhost';

    primaryServer = makeServer();

    if (isLoopback) {
      addresses.ipv4 = await listen(primaryServer, port, '127.0.0.1');
      emit('transport.listening', {
        family: 'ipv4',
        address: addresses.ipv4.address,
        port: addresses.ipv4.port,
      });

      const v6 = makeServer();
      try {
        addresses.ipv6 = await listen(v6, port, '::1');
        emit('transport.listening', {
          family: 'ipv6',
          address: addresses.ipv6.address,
          port: addresses.ipv6.port,
        });
      } catch (error) {
        emit('ipv6.bind.failed', {
          code: error.code || null,
          message: error.message || null,
        });
        try { v6.close(); } catch (_) {}
      }
    } else {
      const address = await listen(primaryServer, port, host);
      emit('transport.listening', {
        family: 'configured',
        address: address.address,
        port: address.port,
      });
      if (String(address.family).toLowerCase().includes('6')) {
        addresses.ipv6 = address;
      } else {
        addresses.ipv4 = address;
      }
    }

    const primary = addresses.ipv4 || addresses.ipv6;
    return {
      address: primary.address,
      port: primary.port,
      family: primary.family,
      ipv4: addresses.ipv4,
      ipv6: addresses.ipv6,
      events,
      tlsProfile: PROFILE,
    };
  }

  async function stop() {
    await Promise.all(
      listeners.map((server) => new Promise((resolve) => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
      })),
    );
  }

  return {
    get server() { return primaryServer; },
    store,
    listeners,
    events,
    addresses,
    start,
    stop,
  };
}

module.exports = { readTlsMaterial, createHttpsCaptureServer };
