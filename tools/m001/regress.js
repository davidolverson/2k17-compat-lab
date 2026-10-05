#!/usr/bin/env node
'use strict';

// M001.1 regression check: login -> keep-alive -> keep-alive -> save upload ->
// (read-only) Park calls, against the replacement runtime's CURRENT SOURCE.
//
//   node tools/m001/regress.js --granite <path-to-granite-2k17> [--captures <dir>] [--json]
//
// Non-destructive by construction:
//   * the runtime's request handler is loaded in THIS process; no port is opened
//     and the running server and the game client are never contacted;
//   * every writable path (sessions, user content, captures, career, inventory)
//     points into a throwaway temp directory that is deleted afterwards;
//   * requests are replays of the newest real 2K17 captures, read from the
//     runtime's private capture directory and never copied anywhere;
//   * only Park calls that do not write state are replayed (no affiliation change).
//
// It answers one question: "if the server were restarted on this source tree,
// would the known-good path still behave the way the last live session saw it?"

const Fs = require('node:fs');
const Os = require('node:os');
const Path = require('node:path');
const Zlib = require('node:zlib');
const { Readable } = require('node:stream');
const Lib = require('./lib');

const SessionKeyCrc = Lib.Crc32('SESSION_KEY');
const ServicesCrc = 0xb5017d25;

function Mute(Run) {
    // The runtime logs every request to stdout, including private values.
    const Out = process.stdout.write;
    const Err = process.stderr.write;
    process.stdout.write = () => true;
    process.stderr.write = () => true;
    const Restore = () => {
        process.stdout.write = Out;
        process.stderr.write = Err;
    };
    return Run().finally(Restore);
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
    if (!Options.granite) throw new Error('usage: regress.js --granite <path-to-granite-2k17> [--captures <dir>] [--json]');
    const ServerRoot = Path.join(Path.resolve(Options.granite), 'Granite/Server');
    const CaptureDir = Path.resolve(Options.captures || Path.join(ServerRoot, 'Storage/Captures/Http'));
    const Codec = require(Path.join(ServerRoot, 'Source/Codec/FieldList.js'));
    const { CreateHandler, LoadConfig } = require(Path.join(ServerRoot, 'Source/Server.js'));
    const Live = LoadConfig(Path.join(ServerRoot, 'Config.json'));

    const Captures = Lib.LoadCaptures(CaptureDir);
    const RouteOf = (Capture) => Lib.SplitUrl(Capture.Request.url).Route;
    const LoginIndex = Captures.map(RouteOf).lastIndexOf('session/login');
    if (LoginIndex < 0) throw new Error('no Session/login capture available to replay');
    const Login = Captures[LoginIndex];
    // Follow-up requests are the NEWEST capture of each route from any session:
    // the session key lives only in the URL and is rewritten to the key this run
    // is issued, so a capture from an earlier session replays cleanly.
    const Newest = [...Captures].reverse();
    const Pick = (Route, Count = 1, Extra = () => true) => Newest.filter((Capture) => RouteOf(Capture) === Route && Extra(Capture) && Capture.Response).slice(0, Count).reverse();
    const Plan = {
        Updates: Pick('session/update', 2),
        Upload: Pick('usercontent/upload', 1, (Capture) => Capture.Request.method === 'PUT')[0] || null,
        Park: ['parkgamestatsv3/toprepplayer', 'parkgamestatsv3/parksummary', 'parkgamestatsv3/parkrep'].map((Route) => Pick(Route)[0] || null),
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

    const Checks = [];
    const Check = (Step, Name, Pass, Detail = null) => Checks.push({ step: Step, check: Name, pass: Boolean(Pass), detail: Detail });
    const Skip = (Step, Why) => Checks.push({ step: Step, check: 'replayed', pass: null, detail: `SKIPPED: ${Why}` });
    const Fields = (Reply) => Codec.Parse(Reply.Body).Fields;
    const ShapeOf = (Reply) => Fields(Reply).map((Field) => `${Field.CrcHex}:${Field.TypeName}`);
    const Body = (Capture) => Fs.readFileSync(Path.join(CaptureDir, `${Capture.Base}.bin`));
    const WithKey = (Capture, Key) => Capture.Request.url.replace(/([?&]x=)\d+/, `$1${Key}`);
    const Succeeded = (Reply) => Codec.GetU32(Fields(Reply), Lib.ResultCrc) === Lib.SuccessCrc;
    const SameShape = (Step, Reply, Capture) => {
        const Want = Lib.Shape(Capture.Response);
        const Got = ShapeOf(Reply);
        Check(Step, 'response shape equals the last live response', JSON.stringify(Want) === JSON.stringify(Got), { live_fields: Want.length, now_fields: Got.length });
    };

    return Mute(async () => {
        let Handler = CreateHandler(Config);
        const Replay = (Capture, Key) => Call(Handler, Capture.Request.method, Key ? WithKey(Capture, Key) : Capture.Request.url, Capture.Request.headers, Body(Capture));

        // 1. login
        const LoginReply = await Replay(Login, null);
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
            const Reply = await Replay(Capture, Key);
            Check(Step, 'RESULT=SUCCESS', Succeeded(Reply));
            Check(Step, 'echoes the same session key', Codec.GetU64(Fields(Reply), SessionKeyCrc) === Key);
            SameShape(Step, Reply, Capture);
            Check(Step, 'no additional session created', SessionFiles() === 1);
        }
        if (Plan.Updates.length === 1) {
            // Only one keep-alive captured since the newest login: send it a second time.
            const Reply = await Replay(Plan.Updates[0], Key);
            Check('keep-alive 2', 'RESULT=SUCCESS (same capture replayed again)', Succeeded(Reply));
            Check('keep-alive 2', 'echoes the same session key', Codec.GetU64(Fields(Reply), SessionKeyCrc) === Key);
            Check('keep-alive 2', 'no additional session created', SessionFiles() === 1);
        }
        if (!Plan.Updates.length) for (const Index of [1, 2]) Skip(`keep-alive ${Index}`, 'no Session/update capture available');

        // 4. save / user-content upload is retained
        if (Plan.Upload) {
            const Raw = Body(Plan.Upload);
            const Reply = await Replay(Plan.Upload, Key);
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
        for (const Capture of Plan.Park) {
            if (!Capture) continue;
            const Step = `park ${RouteOf(Capture).split('/')[1]}`;
            const Reply = await Replay(Capture, Key);
            Check(Step, 'HTTP 200 and parseable', Reply.Status === 200 && Fields(Reply).length > 0);
            SameShape(Step, Reply, Capture);
        }
        if (!Plan.Park.some(Boolean)) Skip('park', 'no read-only ParkGameStatsV3 capture available');

        // 6. restart: a fresh handler over the same storage must still know the session
        Handler = CreateHandler(Config);
        if (Plan.Updates[0]) {
            const Reply = await Replay(Plan.Updates[0], Key);
            Check('restart', 'session survives a handler restart', Succeeded(Reply) && Codec.GetU64(Fields(Reply), SessionKeyCrc) === Key);
            Check('restart', 'no additional session created', SessionFiles() === 1);
        } else Skip('restart', 'no Session/update capture to replay');
    })
        .finally(() => Fs.rmSync(Temp, { recursive: true, force: true }))
        .then(() => {
            const Failed = Checks.filter((Item) => Item.pass === false);
            const Skipped = Checks.filter((Item) => Item.pass === null);
            const Report = {
                schema_version: 0,
                kind: 'm001-regression',
                ran_at: new Date().toISOString(),
                target: 'replacement runtime source tree, in-process, isolated temp storage',
                replayed_from: { login_captured_at: Login.Request.CapturedAt, server_run: `pid-${Login.Pid}` },
                result: Failed.length ? 'FAIL' : Skipped.length ? 'PASS_WITH_SKIPS' : 'PASS',
                passed: Checks.filter((Item) => Item.pass === true).length,
                failed: Failed.length,
                skipped: Skipped.length,
                checks: Checks,
            };
            if (Options.json) console.log(JSON.stringify(Report, null, 2));
            else {
                for (const Item of Checks) console.log(`${Item.pass === null ? 'SKIP' : Item.pass ? 'ok  ' : 'FAIL'}  ${Item.step.padEnd(18)} ${Item.check}${Item.pass === false || Item.pass === null ? `  ${JSON.stringify(Item.detail)}` : ''}`);
                console.log(`\nM001 regression: ${Report.result}  (${Report.passed} passed, ${Report.failed} failed, ${Report.skipped} skipped)`);
            }
            process.exitCode = Failed.length ? 1 : 0;
        });
}

Promise.resolve()
    .then(Main)
    .catch((Failure) => {
        console.error(`regress: ${Failure.message}`);
        process.exit(2);
    });
