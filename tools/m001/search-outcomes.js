#!/usr/bin/env node
'use strict';

// Groups every captured request for one route by the KIND of reply it received
// and reports what the client did next (M001 search-blocker steps 3, 5 and 6).
// Read-only against the runtime; output is sanitized and fails closed.
//
//   node tools/m001/search-outcomes.js --captures <dir> [--route park/search]
//        [--out evidence/m001/park-search.outcome-comparison.json]
//        [--fixtures sanitized-fixtures/m001/park-search-success] [--window-seconds 20]
//
// A "run" is a maximal sequence of requests for the route, in one session, that
// all received the same reply kind (RESULT name + field count).

const Fs = require('node:fs');
const Path = require('node:path');
const Lib = require('./lib');

// Background traffic that is not a Park dependency.
const Noise = new Set(['session/update', 'vcreport/batch']);

const RouteOf = (Capture) => Lib.SplitUrl(Capture.Request.url).Route;
const KeyOf = (Capture) => Lib.SplitUrl(Capture.Request.url).SessionKey;
const TimeOf = (Capture) => Date.parse(Capture.Request.CapturedAt);

function ReplyKind(Capture) {
    const Fields = Lib.FieldsOf(Capture.Response);
    const Result = Fields.find((Field) => (Number(Field.Crc) >>> 0) === Lib.ResultCrc);
    const Name = Result ? Lib.NameOf(Result.value) || Lib.Hex32(Result.value) : 'NO_RESULT';
    return `${Name}/${Fields.length}`;
}

function Main() {
    const Options = Lib.Args(process.argv.slice(2));
    if (!Options.captures) throw new Error('usage: search-outcomes.js --captures <dir> [--route park/search] [--out file] [--fixtures dir]');
    const Route = String(Options.route || 'park/search').toLowerCase();
    const Window = Number(Options['window-seconds'] || 20) * 1000;
    const All = Lib.LoadCaptures(Path.resolve(Options.captures));
    const Secrets = Lib.CollectSecrets(All);
    const Sessions = new Map();
    const Ref = (Capture) => {
        const Id = `${Capture.Pid}:${KeyOf(Capture)}`;
        if (!Sessions.has(Id)) Sessions.set(Id, `S${Sessions.size + 1}`);
        return Sessions.get(Id);
    };

    const Runs = [];
    All.forEach((Capture, Index) => {
        if (RouteOf(Capture) !== Route) return;
        const Kind = ReplyKind(Capture);
        const Last = Runs[Runs.length - 1];
        if (Last && Last.Session === Ref(Capture) && Last.Kind === Kind) Last.Items.push({ Capture, Index });
        else Runs.push({ Session: Ref(Capture), Kind, Items: [{ Capture, Index }] });
    });
    if (!Runs.length) throw new Error(`no captured request for route ${Route}`);

    const Report = Runs.map((Run, Number_) => {
        const First = Run.Items[0].Capture;
        const Final = Run.Items[Run.Items.length - 1];
        const Times = Run.Items.map((Item) => TimeOf(Item.Capture));
        const Intervals = Times.slice(1).map((Time, Index) => Number(((Time - Times[Index]) / 1000).toFixed(2)));
        // What the same session sent between the searches, and after the last one.
        const Between = {};
        for (let Index = Run.Items[0].Index + 1; Index < Final.Index; Index++) {
            const Capture = All[Index];
            if (Ref(Capture) !== Run.Session || RouteOf(Capture) === Route || Noise.has(RouteOf(Capture))) continue;
            Between[RouteOf(Capture)] = (Between[RouteOf(Capture)] || 0) + 1;
        }
        const After = [];
        for (let Index = Final.Index + 1; Index < All.length; Index++) {
            const Capture = All[Index];
            if (Capture.Pid !== Final.Capture.Pid) break;
            const Offset = TimeOf(Capture) - TimeOf(Final.Capture);
            if (Offset > Window) break;
            if (Ref(Capture) !== Run.Session) continue;
            After.push({ offset_s: Number((Offset / 1000).toFixed(3)), method: Capture.Request.method, route_key: RouteOf(Capture), noise: Noise.has(RouteOf(Capture)), reply_kind: ReplyKind(Capture) });
        }
        const NextCapture = All.slice(Final.Index + 1).find((Capture) => Capture.Pid === Final.Capture.Pid && Ref(Capture) === Run.Session && !Noise.has(RouteOf(Capture)));
        return {
            run: Number_ + 1,
            session_ref: Run.Session,
            server_run: `pid-${First.Pid}`,
            first_request_at: First.Request.CapturedAt,
            reply_kind: Run.Kind,
            reply_bytes: [...new Set(Run.Items.map((Item) => Item.Capture.Response?.BodyBytes ?? null))],
            reply_shape: Lib.Shape(First.Response),
            search_requests: Run.Items.length,
            seconds_between_searches: Intervals.length > 12 ? { count: Intervals.length, min: Math.min(...Intervals), max: Math.max(...Intervals), first_12: Intervals.slice(0, 12) } : Intervals,
            other_requests_between_searches: Between,
            next_non_noise_request: NextCapture ? { offset_s: Number(((TimeOf(NextCapture) - TimeOf(Final.Capture)) / 1000).toFixed(3)), method: NextCapture.Request.method, route_key: RouteOf(NextCapture) } : null,
            requests_after_last_search: After,
            _first: First,
        };
    });

    const Root = Path.resolve(__dirname, '../..');
    const Writes = [];
    if (Options.fixtures) {
        const Seen = new Set();
        for (const Run of Report) {
            if (!Run.reply_kind.startsWith('SUCCESS/') || Run.reply_shape.length < 3 || Seen.has(Run.reply_shape.join())) continue;
            Seen.add(Run.reply_shape.join());
            const Slug = `run${String(Run.run).padStart(2, '0')}-${Run.reply_shape.length}-fields`;
            Writes.push([Path.resolve(Options.fixtures, `${Slug}.request.json`), Lib.SanitizeRequest(Run._first, Secrets)]);
            Writes.push([Path.resolve(Options.fixtures, `${Slug}.response.json`), Lib.SanitizeResponse(Run._first, Secrets)]);
            Run.fixture = Path.relative(Root, Path.resolve(Options.fixtures, `${Slug}.response.json`)).split(Path.sep).join('/');
        }
    }
    for (const Run of Report) delete Run._first;

    const ByKind = {};
    for (const Run of Report) {
        const Entry = (ByKind[Run.reply_kind] = ByKind[Run.reply_kind] || { runs: 0, search_requests: 0, next_non_noise_routes: {} });
        Entry.runs++;
        Entry.search_requests += Run.search_requests;
        const Next = Run.next_non_noise_request?.route_key || '(none captured)';
        Entry.next_non_noise_routes[Next] = (Entry.next_non_noise_routes[Next] || 0) + 1;
    }
    const Document = {
        schema_version: 0,
        kind: 'route-outcome-comparison',
        route_key: Route,
        generated_by: 'tools/m001/search-outcomes.js',
        noise_routes_ignored_for_next_request: [...Noise],
        scope_note: 'HTTP only. UDP/TCP activity outside the HTTPS service (for example a relay) is not visible in these captures and must be cited from its own log.',
        by_reply_kind: ByKind,
        runs: Report,
    };
    if (Options.out) Writes.push([Path.resolve(Options.out), Document]);
    const Rendered = Writes.map(([File, Value]) => [File, `${JSON.stringify(Value, null, 2)}\n`]);
    for (const [File, Text] of Rendered) Lib.AssertNoSecrets(Text, Secrets, Path.basename(File));
    for (const [File, Text] of Rendered) {
        Fs.mkdirSync(Path.dirname(File), { recursive: true });
        Fs.writeFileSync(File, Text, 'utf8');
    }
    console.log(JSON.stringify(ByKind, null, 2));
    for (const Run of Report) {
        const Gaps = Array.isArray(Run.seconds_between_searches) ? Run.seconds_between_searches.join(',') : `${Run.seconds_between_searches.count} gaps ${Run.seconds_between_searches.min}..${Run.seconds_between_searches.max}s`;
        console.log(`${String(Run.run).padStart(2)} ${Run.first_request_at.slice(11, 23)} ${Run.session_ref.padEnd(3)} ${Run.server_run.padEnd(9)} ${Run.reply_kind.padEnd(13)} x${String(Run.search_requests).padEnd(4)} gaps[${Gaps}] between=${JSON.stringify(Run.other_requests_between_searches)} next=${Run.next_non_noise_request ? `${Run.next_non_noise_request.route_key}@+${Run.next_non_noise_request.offset_s}s` : '-'}`);
    }
}

try {
    Main();
} catch (Failure) {
    console.error(`search-outcomes: ${Failure.message}`);
    process.exit(1);
}
