'use strict';

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
    let total = 0;
    let overflow = false;

    req.on('data', (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBodyBytes) {
        overflow = true;
        return;
      }
      chunks.push(bytes);
    });

    req.on('end', () => {
      if (overflow) {
        const error = new Error('request body exceeds configured limit');
        error.code = 'BODY_TOO_LARGE';
        error.totalBytes = total;
        error.maxBodyBytes = maxBodyBytes;
        reject(error);
        return;
      }

      resolve({
        body: Buffer.concat(chunks),
        totalBytes: total,
        truncated: false,
      });
    });

    req.on('aborted', () => {
      const error = new Error('request aborted by peer');
      error.code = 'REQUEST_ABORTED';
      reject(error);
    });

    req.on('error', reject);
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

  const headers = {
    ...(profile.headers || {}),
    ...extraHeaders,
  };

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
  const rules = Array.isArray(options.responseRules)
    ? options.responseRules
    : [];
  const fallbackProfile = options.fallbackProfile || 'CAPTURE_ONLY_404';
  const maxBodyBytes =
    options.maxBodyBytes === undefined ? 1024 * 1024 : options.maxBodyBytes;
  const autoExportSanitized = Boolean(options.autoExportSanitized);

  return async function captureHandler(req, res) {
    const descriptor = requestDescriptor(req);
    const profile = selectResponseProfile(
      descriptor,
      rules,
      fallbackProfile,
    );

    try {
      const collected = await collectRequestBody(req, { maxBodyBytes });

      const saved = store.persistRequest({
        ...descriptor,
        body: collected.body,
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

      sendResponse(res, profile, {
        'X-Compat-Lab-Profile': profile.id,
      });
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') {
        sendResponse(res, {
          id: 'BODY_TOO_LARGE',
          status: 413,
          headers: { 'Content-Type': 'text/plain' },
          body: Buffer.alloc(0),
        });
        return;
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
        try {
          res.end();
        } catch (_) {
          // Response is already closed.
        }
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