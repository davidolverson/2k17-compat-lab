'use strict';

const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { CaptureStore } = require('../capture/capture-store');
const { createCaptureHandler } = require('./http-capture');

function readTlsOptions(config = {}) {
  const tls = config.tls || {};
  const options = {};

  if (tls.pfxPath) {
    options.pfx = fs.readFileSync(path.resolve(tls.pfxPath));

    if (tls.passphrasePath) {
      options.passphrase = fs
        .readFileSync(path.resolve(tls.passphrasePath), 'utf8')
        .trim();
    } else if (tls.passphrase !== undefined) {
      options.passphrase = String(tls.passphrase);
    }
  } else if (tls.certPath && tls.keyPath) {
    options.cert = fs.readFileSync(path.resolve(tls.certPath));
    options.key = fs.readFileSync(path.resolve(tls.keyPath));
  } else {
    throw new Error(
      'TLS configuration requires pfxPath or certPath + keyPath',
    );
  }

  if (tls.caPath) {
    options.ca = fs.readFileSync(path.resolve(tls.caPath));
  }
  if (tls.minVersion) options.minVersion = tls.minVersion;
  if (tls.maxVersion) options.maxVersion = tls.maxVersion;
  if (tls.ciphers) options.ciphers = tls.ciphers;

  options.requestCert = Boolean(tls.requestClientCertificate);
  options.rejectUnauthorized = false;

  return options;
}

function createHttpsCaptureServer(config = {}) {
  const store =
    config.captureStore ||
    new CaptureStore({
      rawDir: config.rawDir,
      sanitizedDir: config.sanitizedDir,
    });

  const handler = createCaptureHandler({
    captureStore: store,
    responseRules: config.responseRules,
    fallbackProfile: config.fallbackProfile,
    maxBodyBytes: config.maxBodyBytes,
    autoExportSanitized: config.autoExportSanitized,
    evidenceContext: config.evidenceContext || null,
    onCapture: config.onCapture,
    onError: config.onError,
  });

  const server = https.createServer(readTlsOptions(config), handler);

  server.on('tlsClientError', (error, socket) => {
    if (typeof config.onTlsClientError === 'function') {
      config.onTlsClientError({
        error,
        remoteAddress: socket ? socket.remoteAddress : null,
        remotePort: socket ? socket.remotePort : null,
      });
    }
  });

  server.on('secureConnection', (socket) => {
    if (typeof config.onTlsEstablished === 'function') {
      const cipher = socket.getCipher ? socket.getCipher() : null;

      config.onTlsEstablished({
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        protocol: socket.getProtocol ? socket.getProtocol() : null,
        cipher: cipher && cipher.name ? cipher.name : null,
        alpn: socket.alpnProtocol || null,
        servername: socket.servername || null,
        meaning:
          'transport handshake completed; application-level acceptance is not implied',
      });
    }
  });

  return {
    server,
    store,

    start() {
      const host = config.host || '127.0.0.1';
      const port =
        config.port === undefined ? 17217 : Number(config.port);

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

        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

module.exports = {
  readTlsOptions,
  createHttpsCaptureServer,
};