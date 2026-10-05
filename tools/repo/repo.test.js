'use strict';

// node --test tools/repo/repo.test.js
//
// Each check is tested against a planted violation: a check that has only ever
// seen clean input has not been shown to detect anything.

const Test = require('node:test');
const Assert = require('node:assert/strict');
const Forbidden = require('./check-forbidden');
const Evidence = require('./validate-evidence');
const State = require('./check-state');
const Workflows = require('./check-workflows');

const Rules = (Path, Text, Terms) => Forbidden.Inspect(Path, Text === null ? null : Buffer.from(Text), Terms).map((Finding) => Finding.rule);
// Violations are assembled at runtime so this file does not itself trip the scan.
const Join = (...Parts) => Parts.join('');

Test('forbidden: commercial binaries, captures, key material and archives are refused by name', () => {
    for (const Name of ['game/NBA2K17.exe', 'x/steam_api64.dll', 'a.iff', 'cap.pcapng', 'trace.etl', 'ca.key', 'leaf.pfx', 'bundle.zip', 'x.cdx', '.env', '.env.production', 'steam_emu.ini']) {
        Assert.ok(Rules(Name, 'x').some((Rule) => Rule.startsWith('forbidden-')), Name);
    }
    Assert.deepEqual(Rules('docs/notes.md', 'plain text'), []);
});

Test('forbidden: a backup of a key is still caught by its content', () => {
    const Pem = Join('-----BEGIN RSA ', 'PRIVATE KEY-----\nabc\n');
    Assert.deepEqual(Rules('ca.key.bak-20261003.txt', Pem), ['private-key']);
});

Test('forbidden: identifiers, tokens, session keys and personal paths are detected', () => {
    const Cases = {
        steamid64: Join('id 7656119', '8000000001 seen'),
        'session-key-in-url': Join('/nba/2k17/Session/update?x', '=123456789'),
        'windows-user-path': Join('C:', '\\Users\\', 'somebody\\Projects'),
        'unix-home-path': Join('/home', '/somebody/project'),
        'github-token': Join('ghp', '_', 'a'.repeat(36)),
        'aws-access-key': Join('AKIA', 'ABCDEFGHIJKLMNOP'),
        'email-address': Join('contact someone', '@', 'realdomain.io'),
    };
    for (const [Rule, Text] of Object.entries(Cases)) Assert.deepEqual(Rules('docs/x.md', Text), [Rule], Rule);
});

Test('forbidden: placeholders and reserved example values are not findings', () => {
    for (const Text of ['C:\\Users\\<you>\\x', '%USERPROFILE%\\.lab', 'user@example.com', 'a@test.invalid', 'noreply@anthropic.com', 'short 123456', '/home/runner/work']) {
        Assert.deepEqual(Rules('docs/x.md', Text), [], Text);
    }
});

Test('forbidden: a listed private term is found without the list naming it', () => {
    const Terms = new Set([Forbidden.Sha256('privatename')]);
    Assert.deepEqual(Rules('docs/x.md', 'account `PrivateName` logged in', Terms), ['private-term']);
    Assert.deepEqual(Rules('docs/x.md', 'no such term here', Terms), []);
});

Test('forbidden: unreadable and binary files fail instead of passing', () => {
    Assert.deepEqual(Rules('docs/x.md', null), ['unreadable']);
    Assert.deepEqual(Forbidden.Inspect('notes.dat', Buffer.from([1, 2, 0, 3])).map((Finding) => Finding.rule), ['binary-content']);
});

Test('forbidden: a finding never echoes the matched value', () => {
    const Secret = Join('7656119', '8000000001');
    const Findings = Forbidden.Inspect('docs/x.md', Buffer.from(`id ${Secret}`));
    Assert.equal(Findings.length, 1);
    Assert.ok(!JSON.stringify(Findings).includes(Secret));
});

Test('forbidden: allow entries are exact, and a stale one fails', () => {
    const Findings = [{ path: 'a.js', rule: 'steamid64', line: 1, detail: '' }, { path: 'b.js', rule: 'steamid64', line: 1, detail: '' }];
    const Allow = [{ path: 'a.js', rule: 'steamid64', reason: 'synthetic' }];
    Assert.deepEqual(Forbidden.ApplyAllow(Findings, Allow).map((Finding) => Finding.path), ['b.js']);
    Assert.deepEqual(Forbidden.ApplyAllow([], Allow).map((Finding) => Finding.rule), ['stale-allow-entry']);
});

const Request = (Change = {}) => ({
    schema_version: 0,
    kind: 'sanitized-request',
    path: '/nba/2k17/Example/Route',
    route: 'example/route',
    headers: { 'user-agent': 'EXAMPLE/1.0' },
    fields: [{ crc: '0x2E646054', name: 'TEAM_ID', type_name: 'U64', value: '903' }],
    ...Change,
});

Test('evidence: a clean sanitized request validates', () => {
    Assert.deepEqual(Evidence.ValidateDocument(Request()), []);
});

Test('evidence: an unknown kind fails closed', () => {
    Assert.match(Evidence.ValidateDocument({ schema_version: 0, kind: 'relay-guess' }).join(), /unknown document kind/);
    Assert.deepEqual(Evidence.ValidateDocument([]), ['document is not a JSON object']);
});

Test('evidence: leaks in a fixture are rejected', () => {
    const Bad = [
        [Request({ path: '/nba/2k17/Example/Route?x=1' }), /query string/],
        [Request({ headers: { cookie: 'sid' } }), /whitelisted headers/],
        [Request({ fields: [{ crc: '0x01CAAEE8', name: 'USERID', type_name: 'U64', value: '42' }] }), /identity field USERID/],
        [Request({ fields: [{ crc: '0xAAAA0001', name: null, type_name: 'String8', value: 'text' }] }), /String8 content/],
        [Request({ fields: [{ crc: '0xAAAA0001', name: null, type_name: 'U64', value: '1', redacted: 'opaque' }] }), /redacted field must have value null/],
        [Request({ fields: [{ crc: 'aaaa0001', name: null, type_name: 'U64', value: '1' }] }), /field crc/],
        [Request({ body_digest: 'c4b607c83bc0' }), /fingerprint-like key "body_digest"/],
        [Request({ nested: { raw_sha256: 'x' } }), /fingerprint-like key "raw_sha256"/],
    ];
    for (const [Document, Expected] of Bad) Assert.match(Evidence.ValidateDocument(Document).join(' | '), Expected);
    Assert.deepEqual(Evidence.ValidateDocument(Request({ response_shape: ['0xE3920695:StringCrc'] })), [], 'a key that merely contains "sha" is not a fingerprint');
});

Test('evidence: a ledger entry needs allowed classes, a null client stage and existing fixtures', () => {
    const Entry = (Change = {}) => ({ order: 1, route: '/nba/2k17/Example/Route', session_ref: 'S1', evidence_class: 'HYPOTHESIS', response_class: 'generic-fallback', client_stage: null, request_fixture: 'f/1.json', response_fixture: null, ...Change });
    const Ledger = (Change) => ({ schema_version: 0, kind: 'park-dependency-ledger', label: 'x', window: {}, summary: { classification_mismatches: 0 }, entries: [Entry(Change)] });
    Assert.deepEqual(Evidence.ValidateDocument(Ledger(), () => true), []);
    Assert.match(Evidence.ValidateDocument(Ledger({ evidence_class: 'VERIFIED' }), () => true).join(), /not an allowed class/);
    Assert.match(Evidence.ValidateDocument(Ledger({ response_class: 'ok' }), () => true).join(), /not an allowed class/);
    Assert.match(Evidence.ValidateDocument(Ledger({ client_stage: '30%' }), () => true).join(), /client_stage must stay null/);
    Assert.match(Evidence.ValidateDocument(Ledger({ session_ref: '4242424242' }), () => true).join(), /neutral label/);
    Assert.match(Evidence.ValidateDocument(Ledger(), () => false).join(), /request_fixture does not exist/);
});

Test('evidence: a request comparison must use neutral body variants', () => {
    const Comparison = (Variant) => ({ schema_version: 0, kind: 'request-comparison', requests: 1, distinct_bodies: 1, timeline: [{ n: 1, session_ref: 'S1', body_variant: Variant }] });
    Assert.deepEqual(Evidence.ValidateDocument(Comparison('B1')), []);
    Assert.match(Evidence.ValidateDocument(Comparison('c4b607c83bc0')).join(), /neutral label/);
});

Test('evidence: raw text checks catch long digit runs and session keys', () => {
    Assert.equal(Evidence.ValidateText('{"a":"903","t":"2026-10-05T09:50:21.955Z"}').length, 0);
    Assert.equal(Evidence.ValidateText(Join('{"a":"1234567890', '12345"}')).length, 1);
    Assert.equal(Evidence.ValidateText(Join('{"u":"/Session/update?x', '=5"}')).length, 1);
});

Test('workflows: unpinned actions, write permissions, secrets and privileged triggers are refused', () => {
    const Sha = 'a'.repeat(40);
    const Clean = `on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${Sha} # v4\n      - uses: ./local-action\n`;
    Assert.deepEqual(Workflows.InspectWorkflow(Clean), []);
    const Cases = [
        [Clean.replace(`@${Sha}`, '@v4'), /not pinned to a full commit SHA/],
        [Clean.replace(`@${Sha}`, '@main'), /not pinned/],
        [Clean.replace(`@${Sha}`, `@${Sha.slice(0, 12)}`), /not pinned/],
        [Clean.replace('permissions:\n  contents: read\n', ''), /no top-level permissions block/],
        [Clean.replace('contents: read', 'contents: write'), /write permission/],
        [Clean.replace('pull_request:', 'pull_request_target:'), /pull_request_target/],
        [`${Clean}      - run: echo \${{ secrets.TOKEN }}\n`, /secret is referenced/],
        [`${Clean}      - run: echo "\${{ github.event.pull_request.title }}"\n`, /script-injection/],
    ];
    for (const [Text, Expected] of Cases) Assert.match(Workflows.InspectWorkflow(Text).join(' | '), Expected);
});

const Good = () => ({
    schema_version: 1,
    kind: 'project-state',
    updated_at_utc: '2026-10-05T14:00:00Z',
    updated_from: 'docs/note.md',
    milestone: { id: 'M001', status: 'ACTIVE', contract: [] },
    acceptance: [{ id: 1, condition: 'c', status: 'NOT_MET', evidence: [] }],
    blockers: [{ id: 'B1', class: 'PREREQUISITE', detail: 'd' }],
    evidence_base: { experiment_manifests: 0 },
});

Test('state: a consistent state validates', () => {
    Assert.deepEqual(State.ValidateState(Good()), []);
});

Test('state: MET needs evidence and a manifest, and COMPLETE needs everything MET', () => {
    const Met = Good();
    Met.acceptance[0].status = 'MET';
    Assert.match(State.ValidateState(Met).join(' | '), /MET without evidence.*MET while no experiment manifest/);
    const Complete = Good();
    Complete.milestone.status = 'COMPLETE';
    Assert.match(State.ValidateState(Complete).join(' | '), /not every acceptance condition is MET.*open gating blocker/);
    const Invented = Good();
    Invented.acceptance[0].status = 'DONE';
    Assert.match(State.ValidateState(Invented).join(), /status must be one of/);
    const Dangling = Good();
    Dangling.acceptance[0].evidence = ['evidence/missing.json'];
    Assert.match(State.ValidateState(Dangling, (File) => File === 'docs/note.md').join(), /evidence path does not exist/);
});

Test('state: documents must point at the state file and not restate status', () => {
    const Read = (Files) => (Name) => Files[Name] ?? null;
    const Clean = { 'README.md': 'see project-state.json', 'docs/live-status.md': 'historical; see project-state.json', 'docs/milestone-001-online.md': 'Status: **ACTIVE**  ' };
    Assert.deepEqual(State.ValidateDocuments(Good(), Read(Clean)), []);
    Assert.match(State.ValidateDocuments(Good(), Read({ ...Clean, 'README.md': 'Current state: **BLOCKED**' })).join(' | '), /must reference project-state.json.*restates status/);
    Assert.match(State.ValidateDocuments(Good(), Read({ ...Clean, 'docs/live-status.md': '# Live Status' })).join(), /must point to project-state.json/);
    Assert.match(State.ValidateDocuments(Good(), Read({ ...Clean, 'docs/milestone-001-online.md': 'Status: **COMPLETE**' })).join(), /says COMPLETE, project-state.json says ACTIVE/);
    const Spec = 'docs/UP_NEXT_MASTER_SPEC.md';
    Assert.deepEqual(State.ValidateDocuments(Good(), Read({ ...Clean, [Spec]: 'status: see project-state.json' })), []);
    Assert.match(State.ValidateDocuments(Good(), Read({ ...Clean, [Spec]: 'locked' })).join(), /must reference project-state.json/);
    for (const Stale of ['- current blocker: UDP RELAY SESSION/HANDSHAKE;', '**Current technical unknown:** relay', '### Current evidenced chain']) {
        Assert.match(State.ValidateDocuments(Good(), Read({ ...Clean, [Spec]: `see project-state.json\n${Stale}` })).join(), /states a current blocker or frontier/, Stale);
    }
});
