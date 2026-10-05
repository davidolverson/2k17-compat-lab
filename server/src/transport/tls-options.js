'use strict';

const PROFILE = Object.freeze({
  minVersion: 'TLSv1',
  maxVersion: 'TLSv1.3',
  evidenceClass: 'OBSERVED',
  targetClaim: 'MATCH_PROBE_PROFILE',
});

function buildTlsOptions({ pfx, passphrase }) {
  if (!Buffer.isBuffer(pfx)) throw new TypeError('pfx must be a Buffer');
  if (typeof passphrase !== 'string' || !passphrase) {
    throw new TypeError('passphrase must be a non-empty string');
  }
  return {
    pfx,
    passphrase,
    minVersion: PROFILE.minVersion,
    maxVersion: PROFILE.maxVersion,
  };
}

module.exports = { PROFILE, buildTlsOptions };
