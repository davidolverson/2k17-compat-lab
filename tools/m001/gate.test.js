'use strict';

// node --test tools/m001/gate.test.js

const Test = require('node:test');
const Assert = require('node:assert/strict');
const Gate = require('./gate');

const Ok = { step: 's', check: 'c', pass: true, detail: null };
const Bad = { ...Ok, pass: false };
const Skipped = { ...Ok, pass: null };

const Manifest = (Change = {}) => ({
    schema_version: 1,
    kind: 'experiment-manifest',
    experiment_id: 'R-004',
    hypothesis: 'the client leaves the relay when no datagram reaches it',
    started_at_utc: '2026-10-05T10:00:00Z',
    ended_at_utc: '2026-10-05T10:05:00.250Z',
    client: { title: 'example-client', version: '17.0', sha256: 'a'.repeat(64), supply: 'licensed-unmodified' },
    compat_lab_commit: 'b'.repeat(40),
    runtime: { repo: 'runtime', commit: 'c'.repeat(40), dirty: false },
    config_digest: 'd'.repeat(64),
    capture: { server_run_pid: 100, from_seq: 1, to_seq: 9 },
    expected_observation: 'session persists past ten seconds',
    actual_observation: 'session persisted for sixty seconds',
    result: 'SUPPORTED',
    fixture_refs: ['sanitized-fixtures/m001/example/001.request.json'],
    remaining_unknowns: [],
    ...Change,
});

Test('smoke: skips are tolerated and reported, failures are not', () => {
    Assert.deepEqual(Gate.Verdict([Ok, Ok], 'smoke'), { result: 'PASS', exit_code: 0, passed: 2, failed: 0, skipped: 0 });
    Assert.equal(Gate.Verdict([Ok, Skipped], 'smoke').result, 'PASS_WITH_SKIPS');
    Assert.equal(Gate.Verdict([Ok, Skipped], 'smoke').exit_code, 0);
    Assert.equal(Gate.Verdict([Ok, Bad, Skipped], 'smoke').exit_code, 1);
});

Test('acceptance: any skip fails and only a full PASS exits zero', () => {
    Assert.equal(Gate.Verdict([Ok, Ok], 'acceptance').exit_code, 0);
    const WithSkip = Gate.Verdict([Ok, Skipped], 'acceptance');
    Assert.equal(WithSkip.result, 'FAIL');
    Assert.equal(WithSkip.exit_code, 1);
    Assert.equal(Gate.Verdict([Ok, Bad], 'acceptance').exit_code, 1);
    for (const Mode of Gate.Modes) {
        for (const Checks of [[Ok], [Ok, Skipped], [Bad], [Skipped], []]) {
            const Outcome = Gate.Verdict(Checks, Mode);
            if (Mode === 'acceptance') Assert.equal(Outcome.exit_code === 0, Outcome.result === 'PASS');
            Assert.notEqual(Outcome.result === 'PASS' && Checks.some((Item) => Item.pass !== true), true);
        }
    }
});

Test('a run that checked nothing does not pass in either mode', () => {
    Assert.equal(Gate.Verdict([], 'smoke').exit_code, 1);
    Assert.equal(Gate.Verdict([], 'acceptance').exit_code, 1);
    Assert.throws(() => Gate.Verdict([Ok], 'strict'), /unknown mode/);
});

Test('replays are bounded by a timeout', async () => {
    await Assert.rejects(Gate.WithTimeout(new Promise(() => {}), 20, 'never answers'), (Failure) => Failure.code === 'TIMEOUT' && /never answers/.test(Failure.message));
    Assert.equal(await Gate.WithTimeout(Promise.resolve(7), 1000, 'fast'), 7);
    await Assert.rejects(Gate.WithTimeout(Promise.reject(new Error('boom')), 1000, 'fails'), /boom/);
});

Test('runtime provenance: clean, dirty, untracked and unreadable are distinguished', () => {
    const Fake = (Status) => (_, Arguments) => (Arguments.includes('rev-parse') ? `${'e'.repeat(40)}\n` : Status);
    Assert.deepEqual(Gate.RuntimeProvenance('x', Fake('')), { commit: 'e'.repeat(40), dirty: false, dirty_paths: 0, error: null });
    Assert.equal(Gate.RuntimeProvenance('x', Fake(' M Source/Server.js\n')).dirty, true);
    Assert.equal(Gate.RuntimeProvenance('x', Fake('?? Services/Park/New.js\n M a.js\n')).dirty_paths, 2);
    const Broken = Gate.RuntimeProvenance('x', () => {
        throw new Error('fatal: not a git repository\nmore');
    });
    Assert.equal(Broken.commit, null);
    Assert.equal(Broken.dirty, null);
    Assert.equal(Broken.error, 'fatal: not a git repository');
});

Test('a complete manifest validates', () => {
    Assert.deepEqual(Gate.ValidateManifest(Manifest()), []);
    Assert.deepEqual(Gate.AcceptanceProblems(Manifest()), []);
});

Test('every required manifest field is enforced', () => {
    const Cases = [
        [{ experiment_id: 'relay test' }, /experiment_id/],
        [{ hypothesis: ' ' }, /hypothesis/],
        [{ started_at_utc: '2026-10-05 06:00 EDT' }, /started_at_utc/],
        [{ ended_at_utc: '2026-10-05T09:00:00Z' }, /before started_at_utc/],
        [{ client: { title: 'x', version: '17.0', sha256: 'abc123', supply: 'licensed-unmodified' } }, /client\.sha256/],
        [{ client: { title: 'x', version: '17.0', sha256: 'a'.repeat(64) } }, /client\.supply/],
        [{ compat_lab_commit: 'a65b77c' }, /compat_lab_commit/],
        [{ runtime: { repo: 'r', commit: 'dbdf365', dirty: false } }, /runtime\.commit/],
        [{ runtime: { repo: 'r', commit: 'c'.repeat(40) } }, /runtime\.dirty/],
        [{ config_digest: null }, /config_digest/],
        [{ capture: { server_run_pid: 1 } }, /explicit range/],
        [{ capture: { server_run_pid: 1, from_seq: 9, to_seq: 2 } }, /to_seq is before/],
        [{ result: 'PASS' }, /result must be/],
        [{ fixture_refs: 'none' }, /fixture_refs/],
        [{ remaining_unknowns: undefined }, /remaining_unknowns/],
    ];
    for (const [Change, Expected] of Cases) {
        const Problems = Gate.ValidateManifest(Manifest(Change));
        Assert.ok(Problems.some((Problem) => Expected.test(Problem)), `${JSON.stringify(Change)} -> ${JSON.stringify(Problems)}`);
    }
    Assert.deepEqual(Gate.ValidateManifest(null), ['manifest is not an object']);
});

Test('a dirty runtime or a non-licensed client can inform discovery but never acceptance', () => {
    const Dirty = Manifest({ runtime: { repo: 'r', commit: 'c'.repeat(40), dirty: true } });
    Assert.deepEqual(Gate.ValidateManifest(Dirty), []);
    Assert.match(Gate.AcceptanceProblems(Dirty).join(), /not for proof/);
    const Other = Manifest({ client: { title: 'x', version: '17.0', sha256: 'a'.repeat(64), supply: 'other' } });
    Assert.deepEqual(Gate.ValidateManifest(Other), []);
    Assert.match(Gate.AcceptanceProblems(Other).join(), /cannot close a gate/);
});
