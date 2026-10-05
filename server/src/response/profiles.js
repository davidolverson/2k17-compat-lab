'use strict';

/*
 * Experiment controls only. Nothing here is claimed to reproduce an authentic
 * NBA 2K17 response.
 */

const PROFILES = Object.freeze({
  CAPTURE_ONLY_404: Object.freeze({
    id: 'CAPTURE_ONLY_404',
    evidenceClass: 'TEST_ONLY',
    testOnly: true,
    status: 404,
    headers: Object.freeze({ 'Content-Type': 'text/plain' }),
    body: Buffer.alloc(0),
  }),

  TEST_ONLY_EMPTY_200: Object.freeze({
    id: 'TEST_ONLY_EMPTY_200',
    evidenceClass: 'TEST_ONLY',
    testOnly: true,
    status: 200,
    headers: Object.freeze({ 'Content-Type': 'application/octet-stream' }),
    body: Buffer.alloc(0),
  }),

  TEST_ONLY_EMPTY_BINARY_FIELD_LIST: Object.freeze({
    id: 'TEST_ONLY_EMPTY_BINARY_FIELD_LIST',
    evidenceClass: 'CROSS_VERSION_REFERENCE_TEST_ONLY',
    testOnly: true,
    status: 200,
    headers: Object.freeze({ 'Content-Type': 'application/octet-stream' }),
    // Cross-version reference framing: one 16-byte zero terminator.
    // This is NOT claimed to be a valid NBA 2K17 response.
    body: Buffer.alloc(16),
  }),
});

function getResponseProfile(id) {
  const key = id || 'CAPTURE_ONLY_404';
  const profile = PROFILES[key];
  if (!profile) throw new Error('unknown response profile: ' + key);

  return {
    ...profile,
    headers: { ...profile.headers },
    body: Buffer.from(profile.body),
  };
}

function selectResponseProfile(request, rules = [], fallback = 'CAPTURE_ONLY_404') {
  for (const rule of rules) {
    if (!rule || !rule.profile) continue;

    if (
      rule.method &&
      String(rule.method).toUpperCase() !== String(request.method).toUpperCase()
    ) {
      continue;
    }

    if (rule.pathEquals && request.path !== rule.pathEquals) continue;
    if (
      rule.pathPrefix &&
      !String(request.path || '').startsWith(rule.pathPrefix)
    ) {
      continue;
    }

    return getResponseProfile(rule.profile);
  }

  return getResponseProfile(fallback);
}

module.exports = {
  PROFILES,
  getResponseProfile,
  selectResponseProfile,
};
