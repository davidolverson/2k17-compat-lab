#!/usr/bin/env node
'use strict';

// M001.1 regression check: login -> keep-alive -> keep-alive -> save upload ->
// (read-only) Park calls, against the replacement runtime's CURRENT SOURCE.
//
//   smoke (default) - exploration; missing captures are skipped and reported
//     node tools/m001/regress.js --granite <path-to-granite-2k17> [--captures <dir>]
//          [--pid N --from-seq N --to-seq N] [--timeout-ms N] [--json]
//
//   acceptance - the gate; anything other than a full PASS exits non-zero
//     node tools/m001/regress.js --mode acceptance --granite <path> --manifest <experiment-manifest.json>
//
// Acceptance differs from smoke in that it FAILS on: any skip, a missing
// required capture, a capture window that is not the manifest's explicit range,
// an unknown / dirty / mismatching runtime commit, a generic fallback or an
// unconfirmed handler on a required route, a classification mismatch, a
// client mismatch, a timeout, or a private value in its own report.
//
// Non-destructive by construction:
//   * the runtime's request handler is loaded in THIS process; no port is opened
//     and the running server and the game client are never contacted;
//   * every writable path (sessions, user content, captures, career, inventory)
//     points into a throwaway temp directory that is deleted afterwards;
//   * requests are replays of real 2K17 captures, read from the runtime's
//     private capture directory and never copied anywhere;
//   * only Park calls that do not write state are replayed (no affiliation change).
//
// It answers one question: "if the server were restarted on this source tree,
// would the known-good path still behave the way the last live session saw it?"
// Equal response SHAPE is structural evidence only; it is not semantic
// correctness and it is not real-client behaviour.

const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');
const Zlib = require('node:zlib');
const { Readable } = require('node:stream');
const Lib = require('./lib');
const Gate = require('./gate');
const Ledger = require('./park-ledger');

const SessionKeyCrc = Lib.Crc32('SESSION_KEY');
const ServicesCrc = 0xb5017d25;
const ParkRoutes = ['parkgamestatsv3/toprepplayer', 'parkgamestatsv3/parksummary', 'parkgamestatsv3/parkrep'];
const Usage = 'usage: regress.js --granite <path-to-granite-2k17> [--mode smoke|acceptance] [--manifest <file>] [--captures <dir>] [--pid N --from-seq N --to-seq N] [--timeout-ms N] [--json]';

// The runtime logs every request to stdout, including private values. The text
// is held in memory only, to see which handler answered, and never printed.
function Silence() {
    const Out = process.stdout.write;
    const Err = process.stderr.write;
    let Log = '';
    const Collect = (Chunk) => {
        Log += String(Chunk);
        return true;
    };
    process.stdout.write = Collect;
    process.stderr.write = Collect;
    return {
        Take() {
            const Text = Log;
            Log = '';
            return Text;
        },
        Restore() {
            process.stdout.write = Out;
            process.stderr.write = Err;
        },
    };
}

function Call(Handler, Method, Url, Headers, Body) {
    return new Promise((Resolve, Reject) => {
        const Req = Readable.from(Body.length ? [Body] : []);
        Req.method = Method;
        Req.url = Url;
        Req.headers = Headers;
        const Res = {
            headersSent: false,
            Status: 0,
            Headers: {},
            writeHead(Status, Values) {
                this.Status = Status;
                this.Headers = Values || {};
                this.headersSent = true;
            },
            end(Data) {
                Resolve({ Status: this.Status, Headers: this.Headers, Body: Buffer.isBuffer(Data) ? Data : Buffer.alloc(0) });
            },
            destroy: Reject,
        };
        Handler(Req, Res).catch(Reject);
    });
}

function Main() {
    const Options = Lib.Args(process.argv.slice(2));
    if (!Options.granite) throw new Error(Usage);
    const Mode = Options.mode === undefined ? 'smoke' : String(Options.mode);
    if (!Gate.Modes.includes(Mode)) throw new Error(`--mode must be one of ${Gate.Modes.join(' / ')}`);
    const Strict = Mode === 'acceptance';
    const TimeoutMs = Options['timeout-ms'] === undefined ? 10000 : Number(Options['timeout-ms']);
    if (!Number.isFinite(TimeoutMs) || TimeoutMs <= 0) throw new Error('--timeout-ms must be a positive number');

    const Checks = [];
    const Advisories = [];
    const Check = (Step, Name, Pass, Detail = null) => Checks.push({ step: Step, check: Name, pass: Boolean(Pass), detail: Detail });
    const Skip = (Step, Why) => Checks.push({ step: Step, check: 'replayed', pass: null, detail: `SKIPPED: ${Why}` });
    // A gate condition fails the run in acceptance and is only reported in smoke.
    const Require = (Step, Name, Pass, Detail = null) => {
        if (Strict) Check(Step, Name, Pass, Detail);
        else if (!Pass) Advisories.push({ step: Step, check: Name, detail: Detail });
    };

    // --- provenance: manifest, runtime commit, explicit capture range ---
    let Manifest = null;
    if (Strict) {
        if (!Options.manifest || Options.manifest === true) throw new Error('acceptance mode needs --manifest <experiment-manifest.json>');
        if (Options.pid || Options['from-seq'] || Options['to-seq'] || Options.captures) throw new Error('acceptance mode takes its capture range from the manifest; --pid/--from-seq/--to-seq/--captures are smoke-only');
        Manifest = JSON.parse(Fs.readFileSync(Path.resolve(Options.manifest), 'utf8'));
        const Problems = Gate.AcceptanceProblems(Manifest);
        Check('provenance', 'experiment manifest is valid for acceptance', Problems.length === 0, Problems.length ? Problems : null);
    }
    const Runtime = Gate.RuntimeProvenance(Path.resolve(Options.granite));
    Require('provenance', 'runtime commit is known', Runtime.commit !== null, Runtime.error);
    Require('provenance', 'runtime working tree is clean', Runtime.dirty === false, { dirty_paths: Runtime.dirty_paths });
    if (Strict) Check('provenance', 'runtime HEAD is the commit named in the manifest', Runtime.commit !== null && Runtime.commit === Manifest?.runtime?.commit, { head: Runtime.commit, manifest: Manifest?.runtime?.commit ?? null });

    const ServerRoot = Path.join(Path.resolve(Options.granite), 'Granite/Server');
    const CaptureDir = Path.resolve(Options.captures || Path.join(ServerRoot, 'Storage/Captures/Http'));
    const Codec = require(Path.join(ServerRoot, 'Source/Codec/FieldList.js'));
    const { CreateHandler, LoadConfig } = require(Path.join(ServerRoot, 'Source/Server.js'));
    const Live = LoadConfig(Path.join(ServerRoot, 'Config.json'));
    const Rules = Ledger.LoadRules(Path.join(__dirname, 'route-classification.json'));

    const Range = Strict
        ? { pid: Manifest?.capture?.server_run_pid, from: Manifest?.capture?.from_seq, to: Manifest?.capture?.to_seq }
        : { pid: Options.pid === undefined ? undefined : Number(Options.pid), from: Options['from-seq'] === undefined ? undefined : Number(Options['from-seq']), to: Options['to-seq'] === undefined ? undefined : Number(Options['to-seq']) };
    const Explicit = Number.isInteger(Range.pid) && Number.isInteger(Range.from) && Number.isInteger(Range.to);
    Require('provenance', 'capture window is an explicit range', Explicit, Explicit ? null : 'no --pid/--from-seq/--to-seq: the newest capture of each route was chosen heuristically');

    const All = Lib.LoadCaptures(CaptureDir);
    const Secrets = Lib.CollectSecrets(All);
    const Captures = All.filter((Capture) => (Range.pid === undefined || Capture.Pid === Range.pid) && (Range.from === undefined || Capture.Seq >= Range.from) && (Range.to === undefined || Capture.Seq <= Range.to));
    const RouteOf = (Capture) => Lib.SplitUrl(Capture.Request.url).Route;
    const LoginIndex = Captures.map(RouteOf).lastIndexOf('session/login');
    if (LoginIndex < 0) throw new Error('no Session/login capture available to replay in the selected window');
    const Login = Captures[LoginIndex];
    if (Strict) Check('provenance', 'client user-agent matches the manifest', Manifest?.client?.user_agent !== undefined && Login.Request.headers?.['user-agent'] === Manifest.client.user_agent, null);
    // Follow-up requests are the NEWEST capture of each route in the window: the
    // session key lives only in the URL and is rewritten to the key this run is
    // issued, so a capture from an earlier session replays cleanly.
    const Newest = [...Captures].reverse();
    const Pick = (Route, Count = 1, Extra = () => true) => Newest.filter((Capture) => RouteOf(Capture) === Route && Extra(Capture) && Capture.Response).slice(0, Count).reverse();
    const Plan = {
        Updates: Pick('session/update', 2),
        Upload: Pick('usercontent/upload', 1, (Capture) => Capture.Request.method === 'PUT')[0] || null,
        Park: ParkRoutes.map((Route) => ({ Route, Capture: Pick(Route)[0] || null })),
    };

    const Temp = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'm001-regress-'));
    const In = (Name) => Path.join(Temp, Name);
    const Config = {
        ...Live,
        CertificateDirectory: In('certificate'),
        CaptureDirectory: In('captures'),
        UserContentDirectory: In('content'),
        SessionDirectory: In('sessions'),
        OwnedItemsFile: In('owned-items.json'),
        AttributeProfiles: In('attribute-profiles.json'),
        CareerAttributes: In('career-attributes.json'),
        CareerOverall: In('career-overall.json'),
        CareerGrind: In('career-grind.json'),
        ArbitrationDirectory: In('arbitration'),
        CdnDirectory: In('cdn'),
    };

    const Fields = (Reply) => Codec.Parse(Reply.Body).Fields;
    const ShapeOf = (Reply) => Fields(Reply).map((Field) => `${Field.CrcHex}:${Field.TypeName}`);
    const Body = (Capture) => Fs.readFileSync(Path.join(CaptureDir, `${Capture.Base}.bin`));
    const WithKey = (Capture, Key) => Capture.Request.url.replace(/([?&]x=)\d+/, `$1${Key}`);
    const Succeeded = (Reply) => Codec.GetU32(Fields(Reply), Lib.ResultCrc) === Lib.SuccessCrc;
    const IsBareAck = (Reply) => {
        const List = Fields(Reply);
        return List.length === 1 && (Number(List[0].Crc) >>> 0) === Lib.ResultCrc && (Number(List[0].value) >>> 0) === Lib.SuccessCrc;
    };
    const SameShape = (Step, Reply, Capture) => {
        const Want = Lib.Shape(Capture.Response);
        const Got = ShapeOf(Reply);
        Check(Step, 'response shape equals the last live response', JSON.stringify(Want) === JSON.stringify(Got), { live_fields: Want.length, now_fields: Got.length });
    };

    const Quiet = Silence();
    const Run = async () => {
        let Handler = CreateHandler(Config);
        // Every replay is bounded, and reports which handler the runtime's own log
        // says answered. A required route must be answered intentionally.
        const Replay = async (Step, Capture, Key) => {
            Quiet.Take();
            const Reply = await Gate.WithTimeout(Call(Handler, Capture.Request.method, Key ? WithKey(Capture, Key) : Capture.Request.url, Capture.Request.headers, Body(Capture)), TimeoutMs, Step);
            const Log = Quiet.Take();
            const Route = RouteOf(Capture);
            const Rule = Ledger.Classify(Route, Rules);
            const CatchAll = /unmodeled .*returning RESULT=SUCCESS/.test(Log);
            Require(Step, 'handler confirmed by the runtime log', Log.trim().length > 0, { route: Route });
            Require(Step, 'not answered by a generic fallback', Rule.response_class !== 'generic-fallback' && !CatchAll, { route: Route, classified: Rule.response_class, handler: Rule.handler, catch_all_logged: CatchAll });
            const Mismatch = [];
            if (CatchAll !== (Rule.handler_source === 'runtime-catch-all')) Mismatch.push('catch-all');
            if (Reply.Status === 200 && typeof Rule.expect_bare_ack === 'boolean' && Rule.expect_bare_ack !== IsBareAck(Reply)) Mismatch.push('bare-ack');
            Require(Step, 'route classification matches observed behaviour', Mismatch.length === 0, { route: Route, mismatch: Mismatch });
            return Reply;
        };

        // 1. login
        const LoginReply = await Replay('login', Login, null);
        Check('login', 'HTTP 200', LoginReply.Status === 200);
        Check('login', 'RESULT=SUCCESS', Succeeded(LoginReply));
        const Key = Codec.GetU64(Fields(LoginReply), SessionKeyCrc);
        Check('login', 'issues a non-zero session key', Key !== null && Key !== 0n);
        const Services = Fields(LoginReply).find((Field) => (Field.Crc >>> 0) === ServicesCrc);
        let Table = null;
        try {
            Table = Codec.Parse(Zlib.gunzipSync(Services.value)).Fields.length;
        } catch {}
        Check('login', 'endpoint table decompresses and parses', Table !== null && Table > 0, { records: Table });
        SameShape('login', LoginReply, Login);
        const SessionFiles = () => Fs.readdirSync(Config.SessionDirectory).filter((Name) => /^\d+\.json$/.test(Name)).length;
        Check('login', 'exactly one session persisted', SessionFiles() === 1);

        // 2-3. two keep-alives on the SAME session
        for (const [Index, Capture] of Plan.Updates.entries()) {
            const Step = `keep-alive ${Index + 1}`;
            const Reply = await Replay(Step, Capture, Key);
            Check(Step, 'RESULT=SUCCESS', Succeeded(Reply));
            Check(Step, 'echoes the same session key', Codec.GetU64(Fields(Reply), SessionKeyCrc) === Key);
            SameShape(Step, Reply, Capture);
            Check(Step, 'no additional session created', SessionFiles() === 1);
        }
        if (Plan.Updates.length === 1) {
            if (Strict) Skip('keep-alive 2', 'only one Session/update capture in the window; acceptance does not replay the same capture twice');
            else {
                // Only one keep-alive captured since the newest login: send it a second time.
                const Reply = await Replay('keep-alive 2', Plan.Updates[0], Key);
                Check('keep-alive 2', 'RESULT=SUCCESS (same capture replayed again)', Succeeded(Reply));
                Check('keep-alive 2', 'echoes the same session key', Codec.GetU64(Fields(Reply), SessionKeyCrc) === Key);
                Check('keep-alive 2', 'no additional session created', SessionFiles() === 1);
            }
        }
        if (!Plan.Updates.length) for (const Index of [1, 2]) Skip(`keep-alive ${Index}`, 'no Session/update capture available');

        // 4. save / user-content upload is retained
        if (Plan.Upload) {
            const Raw = Body(Plan.Upload);
            const Reply = await Replay('save upload', Plan.Upload, Key);
            Check('save upload', 'RESULT=SUCCESS', Succeeded(Reply));
            SameShape('save upload', Reply, Plan.Upload);
            const Stored = Fs.existsSync(Config.UserContentDirectory)
                ? Fs.readdirSync(Config.UserContentDirectory, { recursive: true, withFileTypes: true }).filter((Entry) => Entry.isFile()).map((Entry) => Fs.readFileSync(Path.join(Entry.parentPath || Entry.path, Entry.name)))
                : [];
            const Magic = Buffer.from('BNH!', 'ascii');
            const At = Raw.indexOf(Magic);
            Check('save upload', "request carries the 2K17 'BNH!' bundle", At >= 0);
            const Bundle = At >= 0 ? Raw.subarray(At, At + 8 + Raw.readUInt32LE(At + 4)) : null;
            Check('save upload', 'bundle retained byte-for-byte', Bundle !== null && Stored.some((File) => File.includes(Bundle)), { stored_files: Stored.length, bundle_bytes: Bundle?.length ?? null });
        } else Skip('save upload', 'no UserContent/upload capture available');

        // 5. read-only Park calls: pin today's behaviour so a change is a decision, not an accident
        for (const { Route, Capture } of Plan.Park) {
            const Step = `park ${Route.split('/')[1]}`;
            if (!Capture) {
                Skip(Step, `no ${Route} capture available`);
                continue;
            }
            const Reply = await Replay(Step, Capture, Key);
            Check(Step, 'HTTP 200 and parseable', Reply.Status === 200 && Fields(Reply).length > 0);
            SameShape(Step, Reply, Capture);
        }

        // 6. restart: a fresh handler over the same storage must still know the session
        Handler = CreateHandler(Config);
        if (Plan.Updates[0]) {
            const Reply = await Replay('restart', Plan.Updates[0], Key);
            Check('restart', 'session survives a handler restart', Succeeded(Reply) && Codec.GetU64(Fields(Reply), SessionKeyCrc) === Key);
            Check('restart', 'no additional session created', SessionFiles() === 1);
        } else Skip('restart', 'no Session/update capture to replay');
    };

    return Run()
        .catch((Failure) => {
            if (Failure?.code !== 'TIMEOUT') throw Failure;
            Check('timeout', Failure.message, false);
        })
        .finally(() => {
            Quiet.Restore();
            Fs.rmSync(Temp, { recursive: true, force: true });
        })
        .then(() => {
            const Report = {
                schema_version: 1,
                kind: 'm001-regression',
                mode: Mode,
                ran_at: new Date().toISOString(),
                target: 'replacement runtime source tree, in-process, isolated temp storage',
                experiment_id: Manifest?.experiment_id ?? null,
                runtime: { commit: Runtime.commit, dirty: Runtime.dirty },
                capture_window: Explicit ? { server_run: `pid-${Range.pid}`, from_seq: Range.from, to_seq: Range.to } : { heuristic: 'newest capture of each route' },
                replayed_from: { login_captured_at: Login.Request.CapturedAt, server_run: `pid-${Login.Pid}` },
                timeout_ms: TimeoutMs,
                proves: 'structural: response shape and session/storage invariants. Not semantic correctness, not real-client behaviour.',
                result: null,
                passed: 0,
                failed: 0,
                skipped: 0,
                advisories: Advisories,
                checks: Checks,
            };
            // The report must be publishable: fail closed if a private value reached it.
            try {
                Lib.AssertNoSecrets(JSON.stringify(Report).replace(/"(ran_at|login_captured_at)":"[^"]*",?/g, ''), Secrets, 'regression report');
                if (Strict) Check('privacy', 'report carries no private value', true);
            } catch (Failure) {
                Check('privacy', 'report carries no private value', false, Failure.message);
            }
            const Outcome = Gate.Verdict(Checks, Mode);
            Object.assign(Report, { result: Outcome.result, passed: Outcome.passed, failed: Outcome.failed, skipped: Outcome.skipped });
            if (Options.json) console.log(JSON.stringify(Report, null, 2));
            else {
                for (const Item of Checks) console.log(`${Item.pass === null ? 'SKIP' : Item.pass ? 'ok  ' : 'FAIL'}  ${Item.step.padEnd(18)} ${Item.check}${Item.pass === false || Item.pass === null ? `  ${JSON.stringify(Item.detail)}` : ''}`);
                for (const Item of Advisories) console.log(`note  ${Item.step.padEnd(18)} would fail acceptance: ${Item.check}  ${JSON.stringify(Item.detail)}`);
                console.log(`\nM001 regression [${Mode}]: ${Report.result}  (${Report.passed} passed, ${Report.failed} failed, ${Report.skipped} skipped${Strict ? '' : `, ${Advisories.length} acceptance advisories`})`);
            }
            process.exitCode = Outcome.exit_code;
        });
}

Promise.resolve()
    .then(Main)
    .catch((Failure) => {
        console.error(`regress: ${Failure.message}`);
        process.exit(2);
    });
