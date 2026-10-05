'use strict';

const crypto = require('node:crypto');
const { selectResponseProfile } = require('../response/profiles');

function headerValue(headers, name) {
  const wanted = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function parseOptionalInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function collectRequestBody(req, options = {}) {
  const maxBodyBytes =
    options.maxBodyBytes === undefined ? 1024 * 1024 : Number(options.maxBodyBytes);

  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 0) {
    return Promise.reject(
      new RangeError('maxBodyBytes must be a non-negative safe integer'),
    );
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const hash = crypto.createHash('sha256');
    let storedBytes = 0;
    let totalBytes = 0;
    let settled = false;

    function finish(error) {
      if (settled) return;
      settled = true;
      const capture = {
        body: Buffer.concat(chunks, storedBytes),
        totalBytes,
        storedBytes,
        truncated: totalBytes > storedBytes,
        bodySha256: hash.digest('hex'),
      };
      if (error) {
        error.capture = capture;
        reject(error);
      } else {
        resolve(capture);
      }
    }

    req.on('data', (chunk) => {
      if (settled) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bytes.length;
      hash.update(bytes);

      if (storedBytes >= maxBodyBytes) return;
      const room = maxBodyBytes - storedBytes;
      const kept = bytes.length <= room ? bytes : bytes.subarray(0, room);
      if (kept.length) {
        chunks.push(Buffer.from(kept));
        storedBytes += kept.length;
      }
    });

    req.once('end', () => finish(null));
    req.once('aborted', () => {
      const error = new Error('request aborted by peer');
      error.code = 'REQUEST_ABORTED';
      finish(error);
    });
    req.once('error', (error) => finish(error));
    req.once('close', () => {
      if (settled || req.complete === true) return;
      const error = new Error('request closed before completion');
      error.code = 'REQUEST_CLOSED';
      finish(error);
    });
  });
}

function requestDescriptor(req) {
  const rawUrl = req.url || '/';
  const question = rawUrl.indexOf('?');
  const requestPath = question >= 0 ? rawUrl.slice(0, question) : rawUrl;
  const query = question >= 0 ? rawUrl.slice(question + 1) : null;
  const socket = req.socket || {};
  const cipher =
    typeof socket.getCipher === 'function' ? socket.getCipher() : null;

  return {
    method: req.method || null,
    path: requestPath,
    query,
    httpVersion: req.httpVersion || null,
    host: headerValue(req.headers, 'host') || null,
    headers: { ...(req.headers || {}) },
    contentType: headerValue(req.headers, 'content-type') || null,
    vcFieldListSize: parseOptionalInteger(
      headerValue(req.headers, 'vcfieldlist_size'),
    ),
    tls: {
      protocol:
        typeof socket.getProtocol === 'function' ? socket.getProtocol() : null,
      cipher: cipher && cipher.name ? cipher.name : null,
      alpn: socket.alpnProtocol || null,
      servername: socket.servername || null,
    },
  };
}

function sendResponse(res, profile, extraHeaders = {}) {
  const body = Buffer.isBuffer(profile.body)
    ? profile.body
    : Buffer.from(profile.body || '');
  const headers = { ...(profile.headers || {}), ...extraHeaders };

  if (
    !Object.keys(headers).some(
      (name) => name.toLowerCase() === 'content-length',
    )
  ) {
    headers['Content-Length'] = String(body.length);
  }

  res.writeHead(profile.status, headers);
  res.end(body);
}

function createCaptureHandler(options) {
  if (!options || !options.captureStore) {
    throw new Error('createCaptureHandler requires captureStore');
  }

  const store = options.captureStore;
  const rules = Array.isArray(options.responseRules) ? options.responseRules : [];
  const fallbackProfile = options.fallbackProfile || 'CAPTURE_ONLY_404';
  const maxBodyBytes =
    options.maxBodyBytes === undefined ? 1024 * 1024 : options.maxBodyBytes;
  const autoExportSanitized = Boolean(options.autoExportSanitized);

  function persist(descriptor, collected, profile) {
    const saved = store.persistRequest({
      ...descriptor,
      body: collected.body,
      bodyLength: collected.totalBytes,
      bodySha256: collected.bodySha256,
      bodyTruncated: collected.truncated,
      responseProfile: profile,
      evidenceContext: options.evidenceContext || null,
    });

    let sanitizedPath = null;
    if (autoExportSanitized) {
      sanitizedPath = store.exportSanitized(saved.record).filePath;
    }

    if (typeof options.onCapture === 'function') {
      options.onCapture({
        record: saved.record,
        rawMetadataPath: saved.metadataPath,
        rawBodyPath: saved.bodyPath,
        sanitizedPath,
      });
    }
    return saved;
  }

  return async function captureHandler(req, res) {
    const descriptor = requestDescriptor(req);
    const profile = selectResponseProfile(descriptor, rules, fallbackProfile);

    try {
      const collected = await collectRequestBody(req, { maxBodyBytes });
      persist(descriptor, collected, profile);
      sendResponse(res, profile);
    } catch (error) {
      if (error && error.capture) {
        try {
          persist(descriptor, error.capture, null);
        } catch (persistError) {
          if (typeof options.onError === 'function') {
            options.onError(persistError);
          }
        }
      }

      if (typeof options.onError === 'function') options.onError(error);

      if (!res.headersSent) {
        sendResponse(res, {
          id: 'INTERNAL_CAPTURE_ERROR',
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
          body: Buffer.alloc(0),
        });
      } else {
        try { res.end(); } catch (_) {}
      }
    }
  };
}

module.exports = {
  headerValue,
  parseOptionalInteger,
  collectRequestBody,
  requestDescriptor,
  sendResponse,
  createCaptureHandler,
};
