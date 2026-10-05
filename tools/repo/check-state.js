#!/usr/bin/env node
'use strict';

// project-state.json is the single source of truth for status. This check
// validates it and fails when another document starts carrying its own status.
//
//   node tools/repo/check-state.js

const Fs = require('node:fs');
const Path = require('node:path');

const MilestoneStatuses = ['PLANNED', 'ACTIVE', 'COMPLETE'];
const ConditionStatuses = ['MET', 'REPORTED_UNPROVEN', 'NOT_MET'];
const BlockerClasses = ['SECURITY_BOUNDARY', 'PREREQUISITE', 'PROVENANCE', 'DOCUMENTATION', 'LEGAL', 'PRIVACY', 'TECHNICAL'];

// Problems with the state document itself. Exists(path) says whether a
// repository path is present, so evidence references cannot dangle.
function ValidateState(State, Exists = () => true) {
    const Problems = [];
    const Need = (Ok, Message) => {
        if (!Ok) Problems.push(Message);
    };
    if (!State || typeof State !== 'object') return ['project state is not an object'];
    Need(State.schema_version === 1 && State.kind === 'project-state', 'schema_version 1 and kind "project-state" are required');
    Need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(State.updated_at_utc || ''), 'updated_at_utc must be an ISO-8601 UTC timestamp');
    Need(typeof State.updated_from === 'string' && Exists(State.updated_from), 'updated_from must name an existing document');
    const Milestone = State.milestone || {};
    Need(/^M\d{3}$/.test(Milestone.id || ''), 'milestone.id must look like M001');
    Need(MilestoneStatuses.includes(Milestone.status), `milestone.status must be one of ${MilestoneStatuses.join(' / ')}`);
    for (const File of Milestone.contract || []) Need(Exists(File), `milestone.contract names a missing file: ${File}`);
    const Conditions = Array.isArray(State.acceptance) ? State.acceptance : [];
    Need(Conditions.length > 0, 'acceptance conditions are required');
    Conditions.forEach((Condition, Index) => {
        Need(Condition.id === Index + 1, `acceptance[${Index}].id must be ${Index + 1}`);
        Need(typeof Condition.condition === 'string' && Condition.condition.length > 0, `acceptance ${Condition.id}: condition text is required`);
        Need(ConditionStatuses.includes(Condition.status), `acceptance ${Condition.id}: status must be one of ${ConditionStatuses.join(' / ')}`);
        Need(Array.isArray(Condition.evidence), `acceptance ${Condition.id}: evidence must be a list`);
        for (const File of Condition.evidence || []) Need(Exists(File), `acceptance ${Condition.id}: evidence path does not exist: ${File}`);
        // MET is a claim of proof: it needs evidence and at least one manifest in the repository.
        if (Condition.status === 'MET') {
            Need((Condition.evidence || []).length > 0, `acceptance ${Condition.id}: MET without evidence`);
            Need((State.evidence_base?.experiment_manifests || 0) > 0, `acceptance ${Condition.id}: MET while no experiment manifest exists`);
        }
    });
    const Blockers = Array.isArray(State.blockers) ? State.blockers : [];
    for (const Blocker of Blockers) {
        Need(/^B\d+$/.test(Blocker.id || ''), 'blocker id must look like B1');
        Need(BlockerClasses.includes(Blocker.class), `blocker ${Blocker.id}: class must be one of ${BlockerClasses.join(' / ')}`);
        Need(typeof Blocker.detail === 'string' && Blocker.detail.length > 0, `blocker ${Blocker.id}: detail is required`);
    }
    // The milestone cannot be COMPLETE while anything is unmet or a gating blocker is open.
    if (Milestone.status === 'COMPLETE') {
        Need(Conditions.every((Condition) => Condition.status === 'MET'), 'milestone is COMPLETE but not every acceptance condition is MET');
        Need(!Blockers.some((Blocker) => ['SECURITY_BOUNDARY', 'PREREQUISITE', 'PROVENANCE'].includes(Blocker.class)), 'milestone is COMPLETE with an open gating blocker');
    }
    return Problems;
}

// Documents must point at the state file and must not carry a status of their own.
function ValidateDocuments(State, Read) {
    const Problems = [];
    const Readme = Read('README.md');
    if (Readme === null || !Readme.includes('project-state.json')) Problems.push('README.md must reference project-state.json');
    if (Readme !== null && /^\s*Current state:/im.test(Readme)) Problems.push('README.md restates status ("Current state:"); status belongs in project-state.json');
    const Live = Read('docs/live-status.md');
    if (Live !== null && !Live.includes('project-state.json')) Problems.push('docs/live-status.md must point to project-state.json');
    const Milestone = Read('docs/milestone-001-online.md');
    const Declared = Milestone === null ? null : /^Status:\s*\*\*([A-Z_]+)\*\*/m.exec(Milestone)?.[1] ?? null;
    if (State?.milestone?.id === 'M001' && Declared !== null && Declared !== State.milestone.status) {
        Problems.push(`docs/milestone-001-online.md says ${Declared}, project-state.json says ${State.milestone.status}`);
    }
    return Problems;
}

function Main() {
    const Root = Path.resolve(__dirname, '../..');
    const Read = (File) => {
        try {
            return Fs.readFileSync(Path.join(Root, File), 'utf8');
        } catch {
            return null;
        }
    };
    const Text = Read('project-state.json');
    if (Text === null) throw new Error('project-state.json is missing');
    const State = JSON.parse(Text);
    const Manifests = Fs.existsSync(Path.join(Root, 'evidence/manifests')) ? Fs.readdirSync(Path.join(Root, 'evidence/manifests')).filter((Name) => Name.endsWith('.manifest.json')).length : 0;
    const Problems = [...ValidateState(State, (File) => Fs.existsSync(Path.join(Root, File))), ...ValidateDocuments(State, Read)];
    if (State.evidence_base?.experiment_manifests !== Manifests) Problems.push(`evidence_base.experiment_manifests is ${State.evidence_base?.experiment_manifests}, the repository holds ${Manifests}`);
    for (const Problem of Problems) console.log(`FAIL  ${Problem}`);
    const Tally = {};
    for (const Condition of State.acceptance || []) Tally[Condition.status] = (Tally[Condition.status] || 0) + 1;
    console.log(`\nproject state: ${Problems.length ? 'FAIL' : 'PASS'}  (${State.milestone?.id} ${State.milestone?.status}; acceptance ${JSON.stringify(Tally)}; ${(State.blockers || []).length} blockers)`);
    process.exitCode = Problems.length ? 1 : 0;
}

if (require.main === module) {
    try {
        Main();
    } catch (Failure) {
        console.error(`check-state: ${Failure.message}`);
        process.exit(2);
    }
}

module.exports = { ValidateState, ValidateDocuments, ConditionStatuses, MilestoneStatuses };
