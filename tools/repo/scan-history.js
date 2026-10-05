#!/usr/bin/env node
'use strict';

// Full-history privacy and secret scan: every blob reachable from the
// published (remote) refs, checked with the same rules as check-forbidden.js.
// Read-only. Matched values are never printed.
//
//   node tools/repo/scan-history.js [--all] [--json]
//
// --all also covers local-only refs. The default scope is what is public.
// Exits 0 only when every finding belongs to a class listed in Known below;
// anything else exits 1 so a rewrite decision is never made on a partial read.

const ChildProcess = require('node:child_process');
const Fs = require('node:fs');
const Path = require('node:path');
const Forbidden = require('./check-forbidden');

// Classes already assessed in docs/privacy-history-cleanup-plan.md as
// non-secret. A finding outside these needs a human before anything else.
const Known = {
    'private-term': 'account, persona or user name (metadata, grants nothing)',
    'truncated-body-digest': '12-hex prefix of a hash over a raw request body (not reversible, sessions expired)',
};
const BodyDigest = /"body_digest":\s*"[0-9a-f]{6,}"/;

function Git(Root, Arguments, Options = {}) {
    return ChildProcess.execFileSync('git', ['-C', Root, ...Arguments], { maxBuffer: 512 * 1024 * 1024, timeout: 120000, ...Options });
}

// Unique blobs with every path they were ever published under.
function ListBlobs(Root, Scope) {
    const Blobs = new Map();
    const Objects = Git(Root, ['rev-list', '--objects', Scope], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const Types = Git(Root, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], { encoding: 'utf8', input: Objects.map((Line) => Line.split(' ')[0]).join('\n') }).split('\n');
    const IsBlob = new Set(Types.filter((Line) => Line.endsWith(' blob')).map((Line) => Line.split(' ')[0]));
    for (const Line of Objects) {
        const Space = Line.indexOf(' ');
        if (Space < 0) continue;
        const Id = Line.slice(0, Space);
        if (!IsBlob.has(Id)) continue;
        if (!Blobs.has(Id)) Blobs.set(Id, new Set());
        Blobs.get(Id).add(Line.slice(Space + 1));
    }
    return Blobs;
}

function InspectBlob(RelativePath, Content, PrivateTerms) {
    const Findings = Forbidden.Inspect(RelativePath, Content, PrivateTerms);
    if (Content && !Content.subarray(0, 8000).includes(0)) {
        Content.toString('utf8').split(/\r?\n/).forEach((Text, Index) => {
            if (BodyDigest.test(Text)) Findings.push({ path: RelativePath, rule: 'truncated-body-digest', line: Index + 1, detail: 'pattern matched (value not shown)' });
        });
    }
    return Findings;
}

function Main() {
    const Root = Path.resolve(__dirname, '../..');
    const Scope = process.argv.includes('--all') ? '--all' : '--remotes';
    const PrivateTerms = Forbidden.LoadPrivateTerms(Path.join(__dirname, 'private-terms.sha256'));
    if (!PrivateTerms.size) throw new Error('private-term list is empty: the scan would miss the known class and report it clean');
    const Reviewed = JSON.parse(Fs.readFileSync(Path.join(__dirname, 'history-reviewed.json'), 'utf8')).reviewed;
    for (const Entry of Reviewed) if (!Entry.path || !Entry.rule || !Entry.finding) throw new Error('history-reviewed.json: every entry needs path, rule and finding');
    const Allow = [...Forbidden.LoadAllow(Path.join(__dirname, 'forbidden-allow.json')), ...Reviewed];
    const Blobs = ListBlobs(Root, Scope);
    if (!Blobs.size) throw new Error('no blobs listed: refusing to report a clean result for an empty scan');
    const Commits = Git(Root, ['rev-list', '--count', Scope], { encoding: 'utf8' }).trim();
    const Rows = [];
    for (const [Id, Paths] of Blobs) {
        const Content = Git(Root, ['cat-file', 'blob', Id]);
        const First = [...Paths].sort()[0];
        const Findings = InspectBlob(First, Content, PrivateTerms).filter((Finding) => !Allow.some((Entry) => Paths.has(Entry.path) && Entry.rule === Finding.rule));
        const ByRule = new Map();
        for (const Finding of Findings) ByRule.set(Finding.rule, (ByRule.get(Finding.rule) || 0) + 1);
        for (const [Rule, Count] of ByRule) Rows.push({ blob: Id.slice(0, 10), paths: [...Paths].sort(), rule: Rule, matches: Count, known: Rule in Known });
    }
    const Summary = {};
    for (const Row of Rows) {
        Summary[Row.rule] ||= { blobs: 0, matches: 0, known: Row.known, paths: new Set() };
        Summary[Row.rule].blobs += 1;
        Summary[Row.rule].matches += Row.matches;
        for (const File of Row.paths) Summary[Row.rule].paths.add(File);
    }
    const Unknown = Rows.filter((Row) => !Row.known);
    const Report = {
        scope: Scope === '--all' ? 'all refs, local and remote' : 'remote refs (published history)',
        commits: Number(Commits),
        blobs: Blobs.size,
        by_rule: Object.fromEntries(Object.entries(Summary).map(([Rule, Item]) => [Rule, { blobs: Item.blobs, matches: Item.matches, known_class: Item.known ? Known[Rule] : null, paths: [...Item.paths].sort() }])),
        findings_outside_known_classes: Unknown.length,
        verdict: Unknown.length ? 'REVIEW_REQUIRED' : 'ONLY_KNOWN_CLASSES',
    };
    if (process.argv.includes('--json')) console.log(JSON.stringify(Report, null, 2));
    else {
        for (const [Rule, Item] of Object.entries(Report.by_rule)) {
            console.log(`${Item.known_class ? 'known ' : 'REVIEW'}  ${Rule.padEnd(22)} ${String(Item.blobs).padStart(4)} blobs ${String(Item.matches).padStart(5)} matches`);
            for (const File of Item.paths) console.log(`          ${File}`);
        }
        console.log(`\nhistory scan: ${Report.verdict}  (${Report.scope}; ${Report.commits} commits, ${Report.blobs} blobs, ${Unknown.length} finding groups outside known classes)`);
    }
    process.exitCode = Unknown.length ? 1 : 0;
}

if (require.main === module) {
    try {
        Main();
    } catch (Failure) {
        console.error(`scan-history: ${Failure.message}`);
        process.exit(2);
    }
}

module.exports = { InspectBlob, Known };
