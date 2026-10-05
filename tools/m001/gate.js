'use strict';

// Gate logic shared by the M001 tools: smoke vs acceptance verdicts, replay
// timeouts, runtime provenance and experiment-manifest validation. Pure where
// possible so the rules can be unit-tested without a runtime checkout.

const ChildProcess = require('node:child_process');

const Modes = ['smoke', 'acceptance'];
const Results = ['SUPPORTED', 'NOT_SUPPORTED', 'INCONCLUSIVE'];
// The Master Spec (invariant 13, M001 "known-compatible client") only accepts
// evidence from a licensed client whose files were not replaced. Anything else
// is still usable for discovery, never for acceptance.
const ClientSupplies = ['licensed-unmodified', 'other'];

// A check is { step, check, pass, detail } with pass true / false / null (skipped).
function Verdict(Checks, Mode) {
    if (!Modes.includes(Mode)) throw new Error(`unknown mode: ${Mode}`);
    const Failed = Checks.filter((Item) => Item.pass === false).length;
    const Skipped = Checks.filter((Item) => Item.pass === null).length;
    const Passed = Checks.filter((Item) => Item.pass === true).length;
    let Result = 'PASS';
    if (Failed) Result = 'FAIL';
    else if (Skipped) Result = Mode === 'acceptance' ? 'FAIL' : 'PASS_WITH_SKIPS';
    else if (!Passed) Result = 'FAIL'; // a run that checked nothing has proven nothing
    // Smoke tolerates skips; acceptance returns non-zero for anything but a full PASS.
    const ExitCode = Result === 'PASS' || (Mode === 'smoke' && Result === 'PASS_WITH_SKIPS') ? 0 : 1;
    return { result: Result, exit_code: ExitCode, passed: Passed, failed: Failed, skipped: Skipped };
}

class TimeoutError extends Error {
    constructor(Label, Ms) {
        super(`timed out after ${Ms} ms: ${Label}`);
        this.code = 'TIMEOUT';
    }
}

function WithTimeout(Work, Ms, Label) {
    let Timer = null;
    const Limit = new Promise((_, Reject) => {
        Timer = setTimeout(() => Reject(new TimeoutError(Label, Ms)), Ms);
    });
    return Promise.race([Promise.resolve(Work), Limit]).finally(() => clearTimeout(Timer));
}

// Exact source state of the runtime checkout. Untracked files count as dirty:
// an untracked handler changes behaviour exactly like an edited one.
function RuntimeProvenance(Repo, Run = ChildProcess.execFileSync) {
    const Git = (...Arguments) => String(Run('git', ['-C', Repo, ...Arguments], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] })).trim();
    try {
        const Commit = Git('rev-parse', 'HEAD');
        const Status = Git('status', '--porcelain');
        return { commit: Commit, dirty: Status.length > 0, dirty_paths: Status ? Status.split(/\r?\n/).length : 0, error: null };
    } catch (Failure) {
        return { commit: null, dirty: null, dirty_paths: null, error: String(Failure.message).split(/\r?\n/)[0] };
    }
}

const IsUtc = (Value) => typeof Value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(Value) && !Number.isNaN(Date.parse(Value));
const IsCommit = (Value) => typeof Value === 'string' && /^[0-9a-f]{40}$/.test(Value);
const IsSha256 = (Value) => typeof Value === 'string' && /^[0-9a-f]{64}$/.test(Value);
const IsText = (Value) => typeof Value === 'string' && Value.trim().length > 0;
const IsCount = (Value) => Number.isInteger(Value) && Value >= 0;

// Master Spec section 6. Returns a list of problems; empty means valid.
function ValidateManifest(Manifest) {
    const Problems = [];
    const Need = (Ok, Message) => {
        if (!Ok) Problems.push(Message);
    };
    if (!Manifest || typeof Manifest !== 'object' || Array.isArray(Manifest)) return ['manifest is not an object'];
    Need(Manifest.schema_version === 1, 'schema_version must be 1');
    Need(Manifest.kind === 'experiment-manifest', 'kind must be "experiment-manifest"');
    Need(typeof Manifest.experiment_id === 'string' && /^[A-Z][A-Z0-9]*-\d{3,}$/.test(Manifest.experiment_id), 'experiment_id must look like R-004');
    Need(IsText(Manifest.hypothesis), 'hypothesis is required');
    Need(IsUtc(Manifest.started_at_utc), 'started_at_utc must be an ISO-8601 UTC timestamp');
    Need(IsUtc(Manifest.ended_at_utc), 'ended_at_utc must be an ISO-8601 UTC timestamp');
    if (IsUtc(Manifest.started_at_utc) && IsUtc(Manifest.ended_at_utc)) Need(Date.parse(Manifest.ended_at_utc) >= Date.parse(Manifest.started_at_utc), 'ended_at_utc is before started_at_utc');
    const Client = Manifest.client || {};
    Need(IsText(Client.title), 'client.title is required');
    Need(IsText(Client.version), 'client.version is required (use the observed build string, never a guess)');
    Need(IsSha256(Client.sha256), 'client.sha256 must be the 64-hex SHA-256 of the client executable');
    Need(ClientSupplies.includes(Client.supply), `client.supply must be one of ${ClientSupplies.join(' / ')}`);
    Need(IsCommit(Manifest.compat_lab_commit), 'compat_lab_commit must be a full 40-hex commit');
    const Runtime = Manifest.runtime || {};
    Need(IsText(Runtime.repo), 'runtime.repo is required');
    Need(IsCommit(Runtime.commit), 'runtime.commit must be a full 40-hex commit');
    Need(Runtime.dirty === false || Runtime.dirty === true, 'runtime.dirty must be recorded as true or false');
    Need(IsSha256(Manifest.config_digest), 'config_digest must be a 64-hex SHA-256 of the sanitized runtime config');
    const Capture = Manifest.capture || {};
    Need(IsCount(Capture.server_run_pid), 'capture.server_run_pid is required');
    Need(IsCount(Capture.from_seq) && IsCount(Capture.to_seq), 'capture.from_seq and capture.to_seq are required (explicit range, no heuristic window)');
    if (IsCount(Capture.from_seq) && IsCount(Capture.to_seq)) Need(Capture.to_seq >= Capture.from_seq, 'capture.to_seq is before capture.from_seq');
    Need(IsText(Manifest.expected_observation), 'expected_observation is required');
    Need(IsText(Manifest.actual_observation), 'actual_observation is required');
    Need(Results.includes(Manifest.result), `result must be one of ${Results.join(' / ')}`);
    Need(Array.isArray(Manifest.fixture_refs) && Manifest.fixture_refs.every(IsText), 'fixture_refs must be a list of repository paths');
    Need(Array.isArray(Manifest.remaining_unknowns) && Manifest.remaining_unknowns.every(IsText), 'remaining_unknowns must be a list (empty is allowed, absent is not)');
    return Problems;
}

// What a manifest must additionally satisfy before it can back an ACCEPTANCE run.
function AcceptanceProblems(Manifest) {
    const Problems = ValidateManifest(Manifest);
    if (Problems.length) return Problems;
    if (Manifest.runtime.dirty !== false) Problems.push('runtime was dirty: valid for discovery, not for proof');
    if (Manifest.client.supply !== 'licensed-unmodified') Problems.push('client.supply is not licensed-unmodified: evidence from this client cannot close a gate');
    return Problems;
}

module.exports = { Modes, Results, ClientSupplies, Verdict, WithTimeout, TimeoutError, RuntimeProvenance, ValidateManifest, AcceptanceProblems };
