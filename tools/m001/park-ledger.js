#!/usr/bin/env node
'use strict';

// Builds the machine-readable Park dependency ledger (M001.2) from the
// replacement runtime's capture directory. Read-only against the runtime.
//
//   node tools/m001/park-ledger.js --captures <dir> [--log <granite.log>]
//        [--out evidence/m001] [--fixtures sanitized-fixtures/m001]
//        [--attempt N] [--from-seq N --to-seq N] [--pid N] [--label name]
//
// Window: by default the LAST Park attempt of the newest session that called
// ParkGameStatsV3 (see SelectWindow). The start is a HEURISTIC and is recorded
// as such; pass --from-seq/--to-seq to pin it by capture sequence number.

const Fs = require('node:fs');
const Path = require('node:path');
const Lib = require('./lib');

const ResponseClasses = ['intentional', 'reference-derived', 'generic-fallback', 'error'];
const EvidenceClasses = ['OBSERVED', 'DERIVED', 'REFERENCE', 'HYPOTHESIS', 'IMPLEMENTED'];

function LoadRules(File) {
    const Document = JSON.parse(Fs.readFileSync(File, 'utf8'));
    for (const Rule of [...Document.rules, Document.default]) {
        if (!ResponseClasses.includes(Rule.response_class)) throw new Error(`bad response_class in ${File}: ${Rule.response_class}`);
        if (!EvidenceClasses.includes(Rule.evidence_class)) throw new Error(`bad evidence_class in ${File}: ${Rule.evidence_class}`);
    }
    return Document;
}

function Classify(Route, Document) {
    for (const Rule of Document.rules) {
        if (Rule.exclude_substring && Route.includes(Rule.exclude_substring)) continue;
        if (Rule.match?.includes(Route)) return Rule;
        if (Rule.prefix?.some((Prefix) => Route.startsWith(Prefix))) return Rule;
    }
    return Document.default;
}

// Server-log annotations keyed by capture base name: which lines the runtime
// printed between capturing a request and the next request.
function LogAnnotations(File) {
    const Notes = new Map();
    if (!File || !Fs.existsSync(File)) return Notes;
    let Current = null;
    for (const Line of Fs.readFileSync(File, 'utf8').split(/\r?\n/)) {
        const Captured = /captured request at .*[\\/]([^\\/]+)\.bin\s*$/.exec(Line);
        if (Captured) {
            Current = Captured[1];
            Notes.set(Current, []);
            continue;
        }
        if (/^@ \S+ \S+ (GET|POST|PUT|DELETE) /.test(Line)) {
            Current = null;
            continue;
        }
        if (!Current) continue;
        const Guard = /2K17 guard ([a-z-]+):/.exec(Line);
        if (Guard) Notes.get(Current).push(`guard:${Guard[1]}`);
        else if (/unmodeled .*returning RESULT=SUCCESS/.test(Line)) Notes.get(Current).push('catch-all');
        else if (/^! /.test(Line)) Notes.get(Current).push('error-logged');
    }
    return Notes;
}

const IsPark = (Capture) => Lib.SplitUrl(Capture.Request.url).Route.startsWith('parkgamestatsv3/');
const TimeOf = (Capture) => Date.parse(Capture.Request.CapturedAt);

function SelectWindow(Captures, Options) {
    let Pool = Captures;
    if (Options.pid) Pool = Pool.filter((Capture) => Capture.Pid === Number(Options.pid));
    const LastPark = [...Pool].reverse().find(IsPark);
    if (!LastPark) throw new Error('no ParkGameStatsV3 request found in the capture directory');
    // With --from-seq the session is the one that capture belongs to (needs --pid
    // when several server runs share the directory); otherwise the newest Park session.
    const Anchor = Options['from-seq'] ? Pool.find((Capture) => Capture.Seq === Number(Options['from-seq'])) : LastPark;
    if (!Anchor) throw new Error('no capture has the requested --from-seq');
    const Key = Lib.SplitUrl(Anchor.Request.url).SessionKey;
    const Session = Pool.filter((Capture) => Capture.Pid === Anchor.Pid && Lib.SplitUrl(Capture.Request.url).SessionKey === Key);
    if (Options['from-seq']) {
        const To = Options['to-seq'] ? Number(Options['to-seq']) : Infinity;
        const Rows = Session.filter((Capture) => Capture.Seq >= Number(Options['from-seq']) && Capture.Seq <= To);
        if (!Rows.length) throw new Error('no captures in the requested sequence range');
        const StartBasis = `operator-supplied sequence range ${Options['from-seq']}..${Options['to-seq'] || 'end'}`;
        return { Rows, StartBasis, Attempt: null, Attempts: null, SessionRequests: Session.length };
    }
    // An attempt is a cluster of Park calls separated from the next cluster by
    // more than attempt-gap seconds. Its window starts at the request burst
    // leading into its first Park call and ends where the next window starts.
    const Gap = Number(Options['gap-seconds'] || 3) * 1000;
    const AttemptGap = Number(Options['attempt-gap-seconds'] || 5) * 1000;
    const Starts = [];
    let Previous = null;
    Session.forEach((Capture, Index) => {
        if (!IsPark(Capture)) return;
        if (Previous === null || TimeOf(Capture) - TimeOf(Session[Previous]) > AttemptGap) {
            let Start = Index;
            const Floor = Previous === null ? 0 : Previous + 1;
            while (Start > Floor && TimeOf(Session[Start]) - TimeOf(Session[Start - 1]) < Gap) Start--;
            Starts.push(Start);
        }
        Previous = Index;
    });
    const Wanted = Options.attempt ? Number(Options.attempt) : Starts.length;
    if (!Number.isInteger(Wanted) || Wanted < 1 || Wanted > Starts.length) throw new Error(`--attempt must be 1..${Starts.length}`);
    const Rows = Session.slice(Starts[Wanted - 1], Wanted < Starts.length ? Starts[Wanted] : Session.length);
    const StartBasis = `heuristic: Park attempt ${Wanted} of ${Starts.length} in this session; starts at the request burst leading into its first Park call (gap >= ${Gap / 1000}s before it)`;
    return { Rows, StartBasis, Attempt: Wanted, Attempts: Starts.length, SessionRequests: Session.length };
}

function Main() {
    const Options = Lib.Args(process.argv.slice(2));
    if (!Options.captures) throw new Error('usage: park-ledger.js --captures <dir> [--log <file>] [--out dir] [--fixtures dir]');
    const Root = Path.resolve(__dirname, '../..');
    const OutDir = Path.resolve(Options.out || Path.join(Root, 'evidence/m001'));
    const FixtureDir = Path.resolve(Options.fixtures || Path.join(Root, 'sanitized-fixtures/m001'));
    const Rules = LoadRules(Path.join(__dirname, 'route-classification.json'));
    const Captures = Lib.LoadCaptures(Path.resolve(Options.captures));
    const Secrets = Lib.CollectSecrets(Captures);
    const Annotations = LogAnnotations(Options.log && Path.resolve(Options.log));
    const Window = SelectWindow(Captures, Options);
    const Label = String(Options.label || `park-${Window.Rows[0].Stamp.slice(0, 14)}`).replace(/[^a-z0-9-]+/gi, '-');
    const LastParkIndex = Window.Rows.map(IsPark).lastIndexOf(true);
    const T0 = TimeOf(Window.Rows[0]);

    const Writes = [];
    const Entries = Window.Rows.map((Capture, Index) => {
        const { Route, Pathname } = Lib.SplitUrl(Capture.Request.url);
        const Rule = Classify(Route, Rules);
        const Bare = Lib.IsBareAck(Capture.Response);
        const Logged = Annotations.get(Capture.Base) || [];
        const Notes = [];
        if (Rule.notes) Notes.push(Rule.notes);
        let ResponseClass = Rule.response_class;
        if (!Capture.Response || Capture.Response.Parse?.Status === 'error' || Logged.includes('error-logged')) {
            ResponseClass = 'error';
            Notes.push('Response missing, unparseable, or an error was logged while handling it.');
        }
        if (Rule.expect_bare_ack === true && !Bare) Notes.push('CLASSIFICATION_MISMATCH: rule expects a bare ack but the response carries other fields.');
        if (Rule.expect_bare_ack !== true && Bare) Notes.push('Response is a bare RESULT=SUCCESS (no data fields).');
        if (Logged.includes('catch-all') && Rule.handler_source !== 'runtime-catch-all') Notes.push('CLASSIFICATION_MISMATCH: server log shows the catch-all handled this request.');
        if (Logged.some((Item) => Item.startsWith('guard:')) && !Rule.handler.startsWith('Guard2K17')) Notes.push('CLASSIFICATION_MISMATCH: server log shows Guard2K17 handled this request.');
        const Order = Index + 1;
        const Slug = `${String(Order).padStart(3, '0')}-${Route.replace(/[^a-z0-9]+/g, '_')}`;
        const RequestFixture = Path.join(FixtureDir, Label, `${Slug}.request.json`);
        const ResponseFixture = Path.join(FixtureDir, Label, `${Slug}.response.json`);
        Writes.push([RequestFixture, Lib.SanitizeRequest(Capture, Secrets)]);
        if (Capture.Response) Writes.push([ResponseFixture, Lib.SanitizeResponse(Capture, Secrets)]);
        const Relative = (File) => Path.relative(Root, File).split(Path.sep).join('/');
        return {
            order: Order,
            timestamp: Capture.Request.CapturedAt,
            offset_ms: TimeOf(Capture) - T0,
            method: Capture.Request.method,
            route: Pathname,
            route_key: Route,
            session_ref: 'S1',
            request_bytes: Capture.Request.BodyBytes,
            request_field_count: Lib.FieldsOf(Capture.Request).length,
            request_fixture: Relative(RequestFixture),
            handler: Rule.handler,
            handler_source: Rule.handler_source,
            handler_confirmed_by_log: Logged.length ? Logged : null,
            response_bytes: Capture.Response?.BodyBytes ?? null,
            response_shape: Lib.Shape(Capture.Response),
            response_bare_ack: Bare,
            response_fixture: Capture.Response ? Relative(ResponseFixture) : null,
            response_class: ResponseClass,
            evidence_class: Rule.evidence_class,
            experimental: Rule.experimental === true,
            client_stage: null,
            position: Index <= LastParkIndex ? 'through-last-park-call' : 'after-last-park-call',
            notes: Notes.join(' ') || null,
        };
    });

    const Unproven = Entries.filter((Entry) => Entry.response_class === 'generic-fallback' || Entry.response_class === 'error' || Entry.evidence_class === 'HYPOTHESIS');
    const Ledger = {
        schema_version: 0,
        kind: 'park-dependency-ledger',
        label: Label,
        generated_by: 'tools/m001/park-ledger.js',
        title: 'nba2k17-pc',
        environment: 'replacement',
        window: {
            start_basis: Window.StartBasis,
            attempt: Window.Attempt,
            attempts_in_session: Window.Attempts,
            first_request_at: Entries[0].timestamp,
            last_request_at: Entries[Entries.length - 1].timestamp,
            last_park_call_order: LastParkIndex + 1,
            session_requests_total: Window.SessionRequests,
            client_stage_note: 'client_stage is null on every row: no client-side stage signal is captured by the server. Loading-percentage observations belong in docs with their own source, not in this ledger.',
        },
        summary: {
            requests: Entries.length,
            by_response_class: Count(Entries, 'response_class'),
            by_evidence_class: Count(Entries, 'evidence_class'),
            bare_ack_responses: Entries.filter((Entry) => Entry.response_bare_ack).length,
            classification_mismatches: Entries.filter((Entry) => /CLASSIFICATION_MISMATCH/.test(Entry.notes || '')).length,
            distinct_routes_not_intentionally_evidenced: [...new Set(Unproven.map((Entry) => Entry.route_key))],
        },
        rule: 'HTTP 200 does not mean implemented. A row is only trustworthy when response_class is intentional AND evidence_class is OBSERVED or DERIVED.',
        entries: Entries,
    };

    const LedgerFile = Path.join(OutDir, `${Label}.ledger.json`);
    Writes.push([LedgerFile, Ledger]);
    const Rendered = Writes.map(([File, Value]) => [File, `${JSON.stringify(Value, null, 2)}\n`]);
    for (const [File, Text] of Rendered) Lib.AssertNoSecrets(Text, Secrets, Path.basename(File));
    for (const [File, Text] of Rendered) {
        Fs.mkdirSync(Path.dirname(File), { recursive: true });
        Fs.writeFileSync(File, Text, 'utf8');
    }
    console.log(JSON.stringify({ ledger: Path.relative(Root, LedgerFile), files_written: Rendered.length, window: Ledger.window, summary: Ledger.summary }, null, 2));
}

function Count(Entries, Key) {
    const Out = {};
    for (const Entry of Entries) Out[Entry[Key]] = (Out[Entry[Key]] || 0) + 1;
    return Out;
}

if (require.main === module) {
    try {
        Main();
    } catch (Failure) {
        console.error(`park-ledger: ${Failure.message}`);
        process.exit(1);
    }
}

module.exports = { Classify, LoadRules, LogAnnotations, SelectWindow };
