'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const { CaptureStore } = require('../server/src/capture/capture-store');
const {
  redactHeaders,
  sanitizeCaptureRecord,
} = require('../server/src/capture/sanitize');
const {
  getResponseProfile,
  selectResponseProfile,
} = require('../server/src/response/profiles');
const {
  collectRequestBody,
  requestDescriptor,
} = require('../server/src/transport/http-capture');

module.exports = function registerTransportTests({ test, assert }) {
  test('transport sanitizer redacts sensitive headers', () => {
    const headers = redactHeaders({
      Authorization: 'Bearer abcdefghijklmnop',
      Cookie: 'session=secret',
      'X-Test': 'ok',
    });

    assert.equal(headers.Authorization, '[REDACTED]');
    assert.equal(headers.Cookie, '[REDACTED]');
    assert.equal(headers['X-Test'], 'ok');
  });

  test('capture store keeps raw bytes local and exports metadata-only sanitized fixture', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), '2k17-compat-capture-test-'),
    );

    try {
      const rawDir = path.join(root, 'raw');
      const sanitizedDir = path.join(root, 'sanitized');

      const store = new CaptureStore({
        rawDir,
        sanitizedDir,
        idFactory: () => 'capture_test_001',
        now: () => new Date('2026-10-05T00:00:00Z'),
      });

      const body = Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff]);

      const saved = store.persistRequest({
        method: 'POST',
        path: '/synthetic',
        query: 'token=do-not-export',
        headers: {
          authorization: 'secret',
          'content-type': 'application/octet-stream',
        },
        body,
        responseProfile: getResponseProfile('CAPTURE_ONLY_404'),
      });

      assert.deepEqual(fs.readFileSync(saved.bodyPath), body);

      const exported = store.exportSanitized(saved.record);
      const sanitized = JSON.parse(
        fs.readFileSync(exported.filePath, 'utf8'),
      );

      assert.equal(
        sanitized.headers.authorization,
        '[REDACTED]',
      );
      assert.equal(sanitized.query, '[REDACTED_QUERY]');
      assert.equal(sanitized.bodyLength, body.length);
      assert.equal(
        Object.prototype.hasOwnProperty.call(sanitized, 'bodyRaw'),
        false,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(sanitized, 'body'),
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('unknown route selects capture-only 404 by default', () => {
    const profile = selectResponseProfile(
      { method: 'GET', path: '/unknown' },
      [],
    );

    assert.equal(profile.id, 'CAPTURE_ONLY_404');
    assert.equal(profile.status, 404);
    assert.equal(profile.body.length, 0);
  });

  test('response rules select an explicit test-only profile', () => {
    const profile = selectResponseProfile(
      { method: 'POST', path: '/synthetic' },
      [
        {
          method: 'POST',
          pathEquals: '/synthetic',
          profile: 'TEST_ONLY_EMPTY_200',
        },
      ],
    );

    assert.equal(profile.id, 'TEST_ONLY_EMPTY_200');
    assert.equal(profile.testOnly, true);
  });

  test('cross-version empty field-list response is visibly test-only', () => {
    const profile = getResponseProfile(
      'TEST_ONLY_EMPTY_BINARY_FIELD_LIST',
    );

    assert.equal(
      profile.evidenceClass,
      'CROSS_VERSION_REFERENCE_TEST_ONLY',
    );
    assert.equal(profile.testOnly, true);
    assert.equal(profile.body.length, 16);
    assert.deepEqual(profile.body, Buffer.alloc(16));
  });

  test('request descriptor records VCFIELDLIST_SIZE without requiring it', () => {
    const request = {
      method: 'POST',
      url: '/synthetic?a=b',
      httpVersion: '1.1',
      headers: {
        Host: 'example.invalid',
        VCFIELDLIST_SIZE: '32',
      },
      socket: {
        getProtocol: () => 'TLSv1.2',
        getCipher: () => ({ name: 'SYNTHETIC-CIPHER' }),
        servername: 'example.invalid',
        alpnProtocol: null,
      },
    };

    const descriptor = requestDescriptor(request);

    assert.equal(descriptor.path, '/synthetic');
    assert.equal(descriptor.query, 'a=b');
    assert.equal(descriptor.vcFieldListSize, 32);
    assert.equal(descriptor.tls.protocol, 'TLSv1.2');
  });

  test('request descriptor leaves invalid VCFIELDLIST_SIZE unknown', () => {
    const descriptor = requestDescriptor({
      method: 'POST',
      url: '/',
      httpVersion: '1.1',
      headers: {
        vcfieldlist_size: 'not-a-number',
      },
      socket: {},
    });

    assert.equal(descriptor.vcFieldListSize, null);
  });

  test('bounded body collector accepts bytes within limit', async () => {
    const request = Readable.from([
      Buffer.from('abc'),
      Buffer.from('def'),
    ]);

    const collected = await collectRequestBody(request, {
      maxBodyBytes: 6,
    });

    assert.equal(collected.totalBytes, 6);
    assert.deepEqual(collected.body, Buffer.from('abcdef'));
  });

  test('bounded body collector rejects bodies over limit', async () => {
    const request = Readable.from([Buffer.alloc(6)]);

    let failure = null;
    try {
      await collectRequestBody(request, { maxBodyBytes: 5 });
    } catch (error) {
      failure = error;
    }

    assert.ok(failure);
    assert.equal(failure.code, 'BODY_TOO_LARGE');
    assert.equal(failure.totalBytes, 6);
    assert.equal(failure.maxBodyBytes, 5);
  });

  test('sanitized capture never copies a raw query string', () => {
    const sanitized = sanitizeCaptureRecord({
      captureId: 'capture_test_002',
      tsUtc: '2026-10-05T00:00:00.000Z',
      method: 'GET',
      path: '/synthetic',
      query: 'secret=value',
      headers: {},
      bodyLength: 0,
      bodySha256: '0'.repeat(64),
      bodyPath: 'raw-local/file.bin',
      tls: null,
    });

    assert.equal(sanitized.query, '[REDACTED_QUERY]');
  });
};
