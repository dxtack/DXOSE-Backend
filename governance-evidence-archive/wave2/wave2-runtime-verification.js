'use strict';

/**
 * Wave 2 — Central User-Facing Statuses (SYS-DEC-02 / BUS-DEC-01 / BUS-DEC-06)
 * Usage: node Governance/wave2/wave2-runtime-verification.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EVIDENCE_PATH = path.join(__dirname, 'WAVE2_RUNTIME_VERIFICATION.json');
const BE_ROOT = path.join(__dirname, '../..');
const FE_ROOT = path.join(__dirname, '../../../OSE-Frontend');
const RUN_ID = `W2-RV-${Date.now()}`;

const {
    mapUserFacingState,
    isEditableUserState,
    appendSendBackNotes,
    SEND_BACK_NOTES_MARKER,
    withUserFacingState,
} = require('../../src/platform/lifecyclePresentation.service');

function scenario(id, fields) {
    return { id, ...fields };
}

function readText(rel) {
    return fs.readFileSync(path.join(FE_ROOT, rel), 'utf8');
}

function readJson(rel) {
    return JSON.parse(readText(rel));
}

function pass(id, name, evidence) {
    return scenario(id, { name, result: 'PASS', ...evidence });
}

function fail(id, name, evidence) {
    return scenario(id, { name, result: 'FAIL', ...evidence });
}

function blocked(id, name, evidence) {
    return scenario(id, { name, result: 'BLOCKED', ...evidence });
}

async function main() {
    const scenarios = [];
    const sendBackNotes = appendSendBackNotes(null, 'Wave 2 verification');

    // --- W2-BE: Central mapper (BUS-DEC-01 / BUS-DEC-06 / SYS-DEC-02) ---
    scenarios.push(
        mapUserFacingState('GRN', 'DRAFT', { notes: sendBackNotes }) === 'Returned'
            ? pass('W2-01', 'Send Back → user-facing Returned (GRN DRAFT + notes marker)', {
                  requirement: 'BUS-DEC-01',
                  expected: 'Returned',
                  actual: 'Returned',
              })
            : fail('W2-01', 'Send Back → user-facing Returned (GRN DRAFT + notes marker)', {
                  requirement: 'BUS-DEC-01',
                  expected: 'Returned',
                  actual: mapUserFacingState('GRN', 'DRAFT', { notes: sendBackNotes }),
              }),
    );

    const returnedModules = ['TRANSFER', 'BREAKAGE', 'LOST', 'GET_PASS'];
    const returnedOk = returnedModules.every(
        (m) => mapUserFacingState(m, 'DRAFT', { notes: sendBackNotes }) === 'Returned',
    );
    scenarios.push(
        returnedOk
            ? pass('W2-02', 'Send Back → Returned across movement modules', {
                  requirement: 'BUS-DEC-01',
                  modules: returnedModules,
                  actual: 'Returned',
              })
            : fail('W2-02', 'Send Back → Returned across movement modules', {
                  requirement: 'BUS-DEC-01',
                  modules: returnedModules.map((m) => ({
                      module: m,
                      actual: mapUserFacingState(m, 'DRAFT', { notes: sendBackNotes }),
                  })),
              }),
    );

    const voidOk =
        mapUserFacingState('BREAKAGE', 'VOID') === 'Voided' &&
        mapUserFacingState('LOST', 'VOID') === 'Voided' &&
        mapUserFacingState('INVENTORY_COUNT', 'VOID') === 'Voided' &&
        mapUserFacingState('COUNT', 'CANCELLED') === 'Voided';
    scenarios.push(
        voidOk
            ? pass('W2-03', 'Void action → user-facing Voided', {
                  requirement: 'BUS-DEC-06',
                  cases: { BREAKAGE_VOID: 'Voided', COUNT_CANCELLED: 'Voided' },
              })
            : fail('W2-03', 'Void action → user-facing Voided', { requirement: 'BUS-DEC-06' }),
    );

    const noRaw =
        mapUserFacingState('GRN', 'PENDING_FINANCE') === 'In Review' &&
        mapUserFacingState('TRANSFER', 'PENDING_DEPT') === 'In Review' &&
        mapUserFacingState('GET_PASS', 'PENDING_GM') === 'In Review';
    scenarios.push(
        noRaw
            ? pass('W2-04', 'Internal pending statuses map to In Review (no raw enum)', {
                  requirement: 'SYS-DEC-02',
                  samples: {
                      GRN_PENDING_FINANCE: 'In Review',
                      TRANSFER_PENDING_DEPT: 'In Review',
                      GET_PASS_PENDING_GM: 'In Review',
                  },
              })
            : fail('W2-04', 'Internal pending statuses map to In Review (no raw enum)', {
                  requirement: 'SYS-DEC-02',
              }),
    );

    scenarios.push(
        isEditableUserState('Draft') &&
        isEditableUserState('Returned') &&
        !isEditableUserState('Sent Back') &&
        !isEditableUserState('In Review')
            ? pass('W2-05', 'Editable user states: Draft and Returned only', {
                  requirement: 'SYS-DEC-02',
                  editable: ['Draft', 'Returned'],
                  notEditable: ['Sent Back', 'In Review'],
              })
            : fail('W2-05', 'Editable user states: Draft and Returned only', { requirement: 'SYS-DEC-02' }),
    );

    const notesLine = appendSendBackNotes('existing', 'reason');
    scenarios.push(
        notesLine.includes(SEND_BACK_NOTES_MARKER) && notesLine.includes('reason')
            ? pass('W2-06', 'Send-back notes marker appended for Returned detection', {
                  requirement: 'BUS-DEC-01',
                  marker: SEND_BACK_NOTES_MARKER,
                  sample: notesLine,
              })
            : fail('W2-06', 'Send-back notes marker appended for Returned detection', {
                  requirement: 'BUS-DEC-01',
                  sample: notesLine,
              }),
    );

    const faced = withUserFacingState('TRANSFER', { status: 'PENDING_FINANCE', notes: null });
    scenarios.push(
        faced.userFacingState === 'In Review'
            ? pass('W2-07', 'API row enrichment via withUserFacingState', {
                  requirement: 'SYS-DEC-02',
                  module: 'TRANSFER',
                  internalStatus: 'PENDING_FINANCE',
                  userFacingState: faced.userFacingState,
              })
            : fail('W2-07', 'API row enrichment via withUserFacingState', {
                  requirement: 'SYS-DEC-02',
                  actual: faced.userFacingState,
              }),
    );

    // --- W2-FE: Static wiring ---
    const feChecks = [
        {
            id: 'W2-08',
            name: 'GRN list/detail use constitution lifecycle labels',
            file: 'src/app/features/grn/grn-list/grn-list.component.ts',
            mustInclude: ['resolveDocumentLifecycleLabel', 'lifecycleStatusLabel'],
        },
        {
            id: 'W2-09',
            name: 'Breakage list/detail use constitution lifecycle labels',
            file: 'src/app/features/breakage/breakage-list/breakage-list.component.ts',
            mustInclude: ['resolveDocumentLifecycleLabel', 'lifecycleStatusLabel'],
        },
        {
            id: 'W2-10',
            name: 'Transfer list uses rowWorkflowLabel (central mapper)',
            file: 'src/app/features/transfers/utils/transfer-status-display.util.ts',
            mustInclude: ['resolveDocumentLifecycleLabel', 'rowWorkflowLabel'],
        },
        {
            id: 'W2-11',
            name: 'Lost items use central lifecycle util',
            file: 'src/app/features/lost-items/utils/lost-items-status-display.util.ts',
            mustInclude: ['resolveDocumentLifecycleLabel', 'lostRowStatusLabel'],
        },
        {
            id: 'W2-12',
            name: 'Inventory count register uses central lifecycle util',
            file: 'src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.ts',
            mustInclude: ['resolveDocumentLifecycleLabel', 'statusLabel'],
        },
        {
            id: 'W2-13',
            name: 'Get Pass list/detail use central lifecycle util',
            file: 'src/app/features/get-pass/utils/get-pass-status-display.util.ts',
            mustInclude: ['resolveDocumentLifecycleLabel', 'getPassRowLifecycleLabel'],
        },
    ];

    for (const check of feChecks) {
        const text = readText(check.file);
        const ok = check.mustInclude.every((needle) => text.includes(needle));
        scenarios.push(
            ok
                ? pass(check.id, check.name, {
                      requirement: 'SYS-DEC-02',
                      file: check.file,
                  })
                : fail(check.id, check.name, {
                      requirement: 'SYS-DEC-02',
                      file: check.file,
                      missing: check.mustInclude.filter((n) => !text.includes(n)),
                  }),
        );
    }

    const gpList = readText('src/app/features/get-pass/get-pass-list/get-pass-list.component.ts');
    const gpDetail = readText('src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts');
    const noRawGetPassBadge =
        !gpList.includes('GET_PASS.STATUS.${') &&
        !gpDetail.includes('GET_PASS.STATUS.${') &&
        gpList.includes('getPassRowLifecycleLabel') &&
        gpDetail.includes('getPassRowLifecycleLabel');
    scenarios.push(
        noRawGetPassBadge
            ? pass('W2-14', 'Get Pass badges avoid raw GET_PASS.STATUS enum interpolation', {
                  requirement: 'SYS-DEC-02',
              })
            : fail('W2-14', 'Get Pass badges avoid raw GET_PASS.STATUS enum interpolation', {
                  requirement: 'SYS-DEC-02',
              }),
    );

    const en = readJson('public/i18n/en.json');
    const voidLabel = en?.COMMON?.LIFECYCLE?.VOID;
    const sendBackAction =
        en?.TIMELINE?.STATUS?.SENT_BACK ?? en?.TIMELINE?.LIFECYCLE?.SEND_BACK;
    scenarios.push(
        voidLabel === 'Voided'
            ? pass('W2-15', 'i18n user-facing Voided label', {
                  requirement: 'BUS-DEC-06',
                  key: 'COMMON.LIFECYCLE.VOID',
                  value: voidLabel,
              })
            : fail('W2-15', 'i18n user-facing Voided label', {
                  requirement: 'BUS-DEC-06',
                  actual: voidLabel,
              }),
    );
    scenarios.push(
        sendBackAction === 'Send Back'
            ? pass('W2-16', 'i18n Send Back action label', {
                  requirement: 'BUS-DEC-01',
                  value: sendBackAction,
              })
            : fail('W2-16', 'i18n Send Back action label', {
                  requirement: 'BUS-DEC-01',
                  actual: sendBackAction,
              }),
    );

    const feUtil = readText('src/app/core/utils/constitution-lifecycle.util.ts');
    const beService = fs.readFileSync(
        path.join(BE_ROOT, 'src/platform/lifecyclePresentation.service.js'),
        'utf8',
    );
    const parity =
        feUtil.includes("SEND_BACK_NOTES_MARKER = '[Send Back]'") &&
        beService.includes("SEND_BACK_NOTES_MARKER = '[Send Back]'") &&
        !feUtil.includes("'Sent Back'") &&
        !beService.includes("'Sent Back'");
    scenarios.push(
        parity
            ? pass('W2-17', 'BE/FE mapper parity (Returned not Sent Back; shared marker)', {
                  requirement: 'SYS-DEC-02',
              })
            : fail('W2-17', 'BE/FE mapper parity (Returned not Sent Back; shared marker)', {
                  requirement: 'SYS-DEC-02',
              }),
    );

    // --- W2-UNIT: Backend jest suite ---
    let jestOutput = '';
    let jestPass = false;
    try {
        jestOutput = execSync(
            'npx jest src/platform/lifecyclePresentation.service.test.js --no-cache 2>&1',
            {
                cwd: BE_ROOT,
                encoding: 'utf8',
                shell: true,
            },
        );
        jestPass = /Tests:\s+\d+ passed,\s+\d+ total/.test(jestOutput);
    } catch (err) {
        jestOutput = `${err.stdout || ''}\n${err.stderr || ''}\n${err.message}`;
        jestPass = /Tests:\s+\d+ passed,\s+\d+ total/.test(jestOutput);
    }
    scenarios.push(
        jestPass
            ? pass('W2-18', 'Backend lifecyclePresentation unit tests', {
                  requirement: 'SYS-DEC-02',
                  suite: 'lifecyclePresentation.service.test.js',
                  outputTail: jestOutput.split('\n').slice(-4).join('\n'),
              })
            : fail('W2-18', 'Backend lifecyclePresentation unit tests', {
                  requirement: 'SYS-DEC-02',
                  outputTail: jestOutput.split('\n').slice(-8).join('\n'),
              }),
    );

    // --- BRK-01 carry-forward (not re-tested) ---
    scenarios.push(
        blocked('BRK-01', 'Breakage create runtime proof (Wave 1 deferred environment blocker)', {
            requirement: 'Wave 1 carry-forward',
            classification: 'Accepted Environment Blocker — Deferred Runtime Proof',
            note: 'Not re-tested in Wave 2. Tenant lacks published ACC Breakage workflow.',
        }),
    );

    // --- Wave 2 Residual Closure (SYS-DEC-02 platform-wide) ---
    const residualChecks = [
        {
            id: 'W2R-01',
            name: 'Movements Register uses constitution lifecycle labels',
            file: 'src/app/features/movements/movement-list/movement-list.component.ts',
            mustInclude: ['movementRegisterLifecycleLabel', 'getRegisterStatusLabel'],
        },
        {
            id: 'W2R-02',
            name: 'Operational Evidence mapper uses central lifecycle labels',
            file: 'src/app/features/reports/operational-evidence-report/operational-evidence.mapper.ts',
            mustInclude: ['resolveDocumentLifecycleLabel', 'evidenceStatusLabel'],
            mustExclude: ['BREAKAGE.STATUS.${', 'GRN.STATUS.${'],
        },
        {
            id: 'W2R-03',
            name: 'Workflow Pipeline status column uses lifecycle labels',
            file: 'src/app/features/workflow-pipeline/workflow-pipeline.component.ts',
            mustInclude: ['lifecycleStatusLabel', 'resolveDocumentLifecycleLabel'],
        },
        {
            id: 'W2R-04',
            name: 'Workflow Pipeline SLA uses i18n not raw codes',
            file: 'src/app/features/workflow-pipeline/workflow-pipeline.component.ts',
            mustInclude: ['slaLabel'],
        },
        {
            id: 'W2R-05',
            name: 'Movement form detail badge uses constitution lifecycle',
            file: 'src/app/features/movements/movement-form/movement-form.component.ts',
            mustInclude: ['movementRegisterLifecycleLabel', 'getRegisterStatusLabel'],
        },
    ];

    for (const check of residualChecks) {
        const text = readText(check.file);
        const includesOk = check.mustInclude.every((n) => text.includes(n));
        const excludesOk = (check.mustExclude || []).every((n) => !text.includes(n));
        scenarios.push(
            includesOk && excludesOk
                ? pass(check.id, check.name, { requirement: 'SYS-DEC-02', file: check.file })
                : fail(check.id, check.name, {
                      requirement: 'SYS-DEC-02',
                      file: check.file,
                      missing: check.mustInclude.filter((n) => !text.includes(n)),
                      forbidden: (check.mustExclude || []).filter((n) => text.includes(n)),
                  }),
        );
    }

    const closurePass = scenarios.filter((s) => s.result === 'PASS').length;
    const closureFail = scenarios.filter((s) => s.result === 'FAIL').length;
    const closureBlocked = scenarios.filter((s) => s.result === 'BLOCKED').length;

    const evidence = {
        generatedAt: new Date().toISOString(),
        classification: 'WAVE2_FINAL_CLOSED',
        runId: RUN_ID,
        wave: 2,
        gate: closureFail === 0 ? 'FINAL_CLOSED' : 'OPEN',
        requirements: ['SYS-DEC-02', 'BUS-DEC-01', 'BUS-DEC-06'],
        decisions: {
            sendBackAction: 'Send Back',
            sendBackUserFacingState: 'Returned',
            voidAction: 'Void',
            voidUserFacingState: 'Voided',
            brk01: 'Accepted Environment Blocker — Deferred Runtime Proof (not PASS)',
        },
        summary: {
            total: scenarios.length,
            pass: closurePass,
            fail: closureFail,
            blocked: closureBlocked,
            gate: closureFail === 0 ? 'FINAL_CLOSED' : 'OPEN',
        },
        scenarios,
    };

    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence.summary, null, 2));
    process.exit(closureFail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
