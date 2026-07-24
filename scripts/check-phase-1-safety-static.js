'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.join(__dirname, '..', '..');
const BACKEND = path.join(__dirname, '..');
const FRONTEND = path.join(WORKSPACE, 'OSE-Frontend');

const failures = [];

function fail(message) {
    failures.push(message);
}

function read(relFromRoot) {
    return fs.readFileSync(path.join(WORKSPACE, relFromRoot), 'utf8');
}

function walkFiles(dir, acc = []) {
    if (!fs.existsSync(dir)) {
        return acc;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.angular') {
                continue;
            }
            walkFiles(full, acc);
        } else if (/\.(js|ts|mjs|cjs)$/.test(entry.name)) {
            acc.push(full);
        }
    }
    return acc;
}

function checkProtectedRunnersNoPassWithNoTests() {
    const runnerPaths = [
        path.join(BACKEND, 'scripts/run-unit-tests.js'),
        path.join(BACKEND, 'scripts/run-integration-tests.js'),
        path.join(FRONTEND, 'scripts/run-e2e-critical.js'),
        path.join(FRONTEND, 'e2e/run-critical-browser-tests.js'),
    ];
    for (const filePath of runnerPaths) {
        if (!fs.existsSync(filePath)) {
            fail(`Protected runner missing: ${path.relative(WORKSPACE, filePath)}`);
            continue;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        if (/passWithNoTests/.test(content)) {
            fail(`--passWithNoTests found in ${path.relative(WORKSPACE, filePath)}`);
        }
    }
}

function checkProtectedPathsNoOnlyOrSkip() {
    const protectedDirs = [
        path.join(BACKEND, 'test/integration'),
        path.join(FRONTEND, 'e2e/critical'),
        path.join(FRONTEND, 'src/app/core/services'),
        path.join(FRONTEND, 'src/app/core/guards'),
        path.join(FRONTEND, 'src/app/core/directives'),
    ];
    const onlyPattern = /\b(test|describe|it)\.(only|skip)\b/;
    for (const dir of protectedDirs) {
        for (const filePath of walkFiles(dir)) {
            if (!/\.(js|ts|spec\.ts)$/.test(filePath)) {
                continue;
            }
            const content = fs.readFileSync(filePath, 'utf8');
            if (onlyPattern.test(content)) {
                fail(`.only/.skip found in ${path.relative(WORKSPACE, filePath)}`);
            }
        }
    }
}

function checkIntegrationRunnerExplicitList() {
    const content = read('OSE-backend/scripts/run-integration-tests.js');
    if (!content.includes('integrationTestPaths')) {
        fail('Integration runner must define integrationTestPaths explicit list');
    }
    if (!content.includes('--test-concurrency=1')) {
        fail('Integration runner must keep --test-concurrency=1');
    }
    if (/['"]test\/integration\/\*['"]/.test(content) || /glob/.test(content.toLowerCase())) {
        fail('Integration runner must not use broad globs');
    }
    const matches = content.match(/test\/integration\/[^'"]+\.test\.js/g) || [];
    if (matches.length < 8) {
        fail(`Integration runner explicit file count below 8 (found ${matches.length})`);
    }
}

function checkAuthServicePermissionContract() {
    const content = read('OSE-Frontend/src/app/core/services/auth.service.ts');
    const match = content.match(/hasPermission\(key: string\)[\s\S]*?\n  \}/);
    if (!match) {
        fail('AuthService.hasPermission block not found');
        return;
    }
    const block = match[0];
    if (/ORG_MANAGER/.test(block) || /SUPER_ADMIN/.test(block) || /hasRootOrgManagerMembership/.test(block)) {
        fail('AuthService.hasPermission must not contain role blanket bypass');
    }
    if (!/permissions\.includes\(canonicalKey\)/.test(block)) {
        fail('AuthService.hasPermission must check permissions.includes(canonicalKey)');
    }
}

function checkRolePermissionFallbackUntouched() {
    const fallbackPath = path.join(FRONTEND, 'src/app/core/constants/role-permission-fallback.ts');
    if (!fs.existsSync(fallbackPath)) {
        fail('role-permission-fallback.ts is missing');
    }
}

function checkWave1EffectiveRuntimePermissionsDedup() {
    const utilPath = path.join(BACKEND, 'src/acc-authority/effective-runtime-permissions.util.js');
    const utilTestPath = path.join(BACKEND, 'src/acc-authority/effective-runtime-permissions.util.test.js');
    const consumerTestPath = path.join(BACKEND, 'src/acc-authority/effective-runtime-permissions.consumer.test.js');
    const userRightsPath = path.join(BACKEND, 'src/controllers/userRights.controller.js');
    const diagnosticsPath = path.join(BACKEND, 'src/services/acc-system-diagnostics.service.js');
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');

    for (const filePath of [utilPath, utilTestPath, consumerTestPath]) {
        if (!fs.existsSync(filePath)) {
            fail(`Wave 1 effective-runtime util artifact missing: ${path.relative(WORKSPACE, filePath)}`);
        }
    }

    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');
    if (!unitRunner.includes('src/acc-authority/effective-runtime-permissions.util.test.js')) {
        fail('run-unit-tests.js must register effective-runtime-permissions.util.test.js');
    }
    if (!unitRunner.includes('src/acc-authority/effective-runtime-permissions.consumer.test.js')) {
        fail('run-unit-tests.js must register effective-runtime-permissions.consumer.test.js');
    }

    const utilSrc = fs.readFileSync(utilPath, 'utf8');
    if (!utilSrc.includes('computeEffectiveRuntimePermissionCodes')) {
        fail('effective-runtime-permissions.util.js must export computeEffectiveRuntimePermissionCodes');
    }
    if (!utilSrc.includes("require('./base-role-permissions')")) {
        fail('effective-runtime-permissions.util.js must import from base-role-permissions');
    }

    const consumerPaths = [
        { label: 'userRights.controller.js', filePath: userRightsPath },
        { label: 'acc-system-diagnostics.service.js', filePath: diagnosticsPath },
    ];
    const importPattern = /require\('\.\.\/acc-authority\/effective-runtime-permissions\.util'\)/;
    const callPattern = /computeEffectiveRuntimePermissionCodes\(role\.code,\s*urLegacyCodes,\s*legacyPermissionCodes\)/;
    const forbiddenPatterns = [
        { re: /function _normalizeRoleCode/, msg: 'local _normalizeRoleCode' },
        { re: /function _effectiveRuntimeCodes/, msg: 'local _effectiveRuntimeCodes' },
        { re: /const _normalizeRoleCode/, msg: 'local _normalizeRoleCode' },
        { re: /const _effectiveRuntimeCodes/, msg: 'local _effectiveRuntimeCodes' },
        { re: /applyRolePermissionPolicy/, msg: 'direct applyRolePermissionPolicy import' },
    ];

    for (const { label, filePath } of consumerPaths) {
        const src = fs.readFileSync(filePath, 'utf8');
        if (!importPattern.test(src)) {
            fail(`${label} must import effective-runtime-permissions.util`);
        }
        if (!callPattern.test(src)) {
            fail(`${label} must call computeEffectiveRuntimePermissionCodes(role.code, urLegacyCodes, legacyPermissionCodes)`);
        }
        for (const { re, msg } of forbiddenPatterns) {
            if (re.test(src)) {
                fail(`${label} must not contain ${msg}`);
            }
        }
    }

    const diagnosticsSrc = fs.readFileSync(diagnosticsPath, 'utf8');
    if (!/effectiveRuntimeCount:\s*effectiveRuntimeCodes\.length/.test(diagnosticsSrc)) {
        fail('acc-system-diagnostics.service.js must set effectiveRuntimeCount from effectiveRuntimeCodes.length');
    }
}

function checkBatch2TimelineBuilderTests() {
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');
    const getPassTest = path.join(BACKEND, 'src/platform/timeline/getPassTimeline.builder.test.js');
    const inventoryCountTest = path.join(BACKEND, 'src/platform/timeline/inventoryCountTimeline.builder.test.js');
    const legacyGetPass = path.join(BACKEND, 'scripts/getPassTimeline.builder.test.js');
    const legacyInventory = path.join(BACKEND, 'scripts/inventoryCountTimeline.builder.test.js');

    if (!fs.existsSync(getPassTest) || !fs.existsSync(inventoryCountTest)) {
        fail('Batch 2 timeline builder tests must live under src/platform/timeline/');
    }
    if (fs.existsSync(legacyGetPass) || fs.existsSync(legacyInventory)) {
        fail('Legacy scripts/*Timeline.builder.test.js files must be removed after move');
    }

    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');
    if (!unitRunner.includes('src/platform/timeline/getPassTimeline.builder.test.js')) {
        fail('run-unit-tests.js must register getPassTimeline.builder.test.js');
    }
    if (!unitRunner.includes('src/platform/timeline/inventoryCountTimeline.builder.test.js')) {
        fail('run-unit-tests.js must register inventoryCountTimeline.builder.test.js');
    }
}

function checkBatch2WorkflowParityGuard() {
    const parityTest = path.join(BACKEND, 'src/acc-authority/workflow-step-permissions.parity.test.js');
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');

    if (!fs.existsSync(parityTest)) {
        fail('workflow-step-permissions.parity.test.js is missing');
    }
    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');
    if (!unitRunner.includes('src/acc-authority/workflow-step-permissions.parity.test.js')) {
        fail('run-unit-tests.js must register workflow-step-permissions.parity.test.js');
    }
}

function checkBatch2MappingServiceSharedClient() {
    const servicePath = path.join(BACKEND, 'src/services/mapping.service.js');
    const consumerTest = path.join(BACKEND, 'src/services/mapping.service.consumer.test.js');
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');

    const src = fs.readFileSync(servicePath, 'utf8');
    if (!src.includes("require('../config/database')")) {
        fail('mapping.service.js must import ../config/database');
    }
    if (/new PrismaClient\(\)/.test(src)) {
        fail('mapping.service.js must not instantiate PrismaClient');
    }
    if (!fs.existsSync(consumerTest)) {
        fail('mapping.service.consumer.test.js is missing');
    }
    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');
    if (!unitRunner.includes('src/services/mapping.service.consumer.test.js')) {
        fail('run-unit-tests.js must register mapping.service.consumer.test.js');
    }
}

function checkBatch2GrnIdCleanupPrimitive() {
    const primitivePath = path.join(BACKEND, 'test/harness/grn-id-cleanup.js');
    const wrapperPaths = [
        path.join(BACKEND, 'test/harness/cleanup-grn-fixture.js'),
        path.join(BACKEND, 'test/harness/e2e-permission-cleanup.js'),
        path.join(BACKEND, 'test/harness/purge-phase-1-stale-residuals.js'),
    ];

    if (!fs.existsSync(primitivePath)) {
        fail('test/harness/grn-id-cleanup.js is missing');
    }

    for (const filePath of wrapperPaths) {
        const src = fs.readFileSync(filePath, 'utf8');
        if (!src.includes("require('./grn-id-cleanup')")) {
            fail(`${path.relative(WORKSPACE, filePath)} must import grn-id-cleanup`);
        }
        if (/async function deleteGrnCascade/.test(src)) {
            fail(`${path.relative(WORKSPACE, filePath)} must not define local deleteGrnCascade`);
        }
    }

    const purgeSrc = fs.readFileSync(path.join(BACKEND, 'test/harness/purge-phase-1-stale-residuals.js'), 'utf8');
    if (!purgeSrc.includes('TEST_GRN_PREFIXES') || !purgeSrc.includes('Manual recovery only')) {
        fail('purge-phase-1-stale-residuals.js must remain marker-based manual recovery');
    }
}

function checkBatch3TimelinePresentationDedup() {
    const utilPath = path.join(BACKEND, 'src/utils/timeline-present.util.js');
    const utilTestPath = path.join(BACKEND, 'src/utils/timeline-present.util.test.js');
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');

    if (!fs.existsSync(utilPath) || !fs.existsSync(utilTestPath)) {
        fail('Batch 3 timeline-present.util.js and timeline-present.util.test.js are required');
    }

    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');
    if (!unitRunner.includes('src/utils/timeline-present.util.test.js')) {
        fail('run-unit-tests.js must register timeline-present.util.test.js');
    }

    const utilSrc = fs.readFileSync(utilPath, 'utf8');
    if (!utilSrc.includes('function userDisplayName(user)')) {
        fail('timeline-present.util.js must export userDisplayName');
    }
    if (!utilSrc.includes('function toIso(value)')) {
        fail('timeline-present.util.js must export toIso');
    }
    if (!/module\.exports\s*=\s*\{[\s\S]*userDisplayName[\s\S]*toIso/.test(utilSrc)) {
        fail('timeline-present.util.js must export { userDisplayName, toIso }');
    }

    const timelineConsumers = [
        { rel: 'src/platform/timeline/approvalTimeline.builder.js', needsToIso: true },
        { rel: 'src/platform/timeline/getPassTimeline.builder.js', needsToIso: true },
        { rel: 'src/platform/timeline/grnTimeline.builder.js', needsToIso: true },
        { rel: 'src/platform/timeline/inventoryCountTimeline.builder.js', needsToIso: true },
        { rel: 'src/services/get-pass-workflow-timeline.util.js', needsToIso: true },
        { rel: 'src/services/grn-workflow-presentation.util.js', needsToIso: true },
        { rel: 'src/services/inventory-count-workflow-presentation.util.js', needsToIso: true },
        { rel: 'src/services/inventoryCount.service.js', needsToIso: false },
    ];

    for (const { rel, needsToIso } of timelineConsumers) {
        const filePath = path.join(BACKEND, rel);
        const src = fs.readFileSync(filePath, 'utf8');
        if (!src.includes("require('../utils/timeline-present.util')") && !src.includes("require('../../utils/timeline-present.util')")) {
            fail(`${rel} must import timeline-present.util`);
        }
        if (/function userDisplayName\s*\(/.test(src)) {
            fail(`${rel} must not define local userDisplayName`);
        }
        if (needsToIso && /function toIso\s*\(/.test(src)) {
            fail(`${rel} must not define local toIso`);
        }
    }
}

function checkBatch3SharedDatabaseModules() {
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');
    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');

    const dbModules = [
        {
            rel: 'src/services/unit.service.js',
            consumerTest: 'src/services/unit.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/services/supplier.service.js',
            consumerTest: 'src/services/supplier.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/services/reorder.service.js',
            consumerTest: 'src/services/reorder.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/platform/displayCurrency.service.js',
            consumerTest: 'src/platform/displayCurrency.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/utils/movementLineFinancial.util.js',
            consumerTest: 'src/utils/movementLineFinancial.util.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/services/docNumbering.service.js',
            consumerTest: 'src/services/docNumbering.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
    ];

    for (const { rel, consumerTest, importPattern } of dbModules) {
        const filePath = path.join(BACKEND, rel);
        const src = fs.readFileSync(filePath, 'utf8');
        if (!importPattern.test(src)) {
            fail(`${rel} must import config/database`);
        }
        if (/new PrismaClient\(\)/.test(src)) {
            fail(`${rel} must not instantiate PrismaClient`);
        }
        if (/\$disconnect/.test(src)) {
            fail(`${rel} must not contain local $disconnect lifecycle`);
        }
        const consumerPath = path.join(BACKEND, consumerTest);
        if (!fs.existsSync(consumerPath)) {
            fail(`Batch 3 consumer test missing: ${consumerTest}`);
        }
        if (!unitRunner.includes(consumerTest)) {
            fail(`run-unit-tests.js must register ${consumerTest}`);
        }
    }

    const docSrc = fs.readFileSync(path.join(BACKEND, 'src/services/docNumbering.service.js'), 'utf8');
    if (!/const db = tx \|\| prisma;/.test(docSrc)) {
        fail('docNumbering.service.js must preserve tx || prisma transaction override');
    }
}

function checkFinalBatchEvidenceFormatDedup() {
    const utilPath = path.join(BACKEND, 'src/utils/evidence-format.util.js');
    const utilTestPath = path.join(BACKEND, 'src/utils/evidence-format.util.test.js');
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');

    if (!fs.existsSync(utilPath) || !fs.existsSync(utilTestPath)) {
        fail('Final Batch evidence-format.util.js and evidence-format.util.test.js are required');
    }

    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');
    if (!unitRunner.includes('src/utils/evidence-format.util.test.js')) {
        fail('run-unit-tests.js must register evidence-format.util.test.js');
    }

    const utilSrc = fs.readFileSync(utilPath, 'utf8');
    if (!utilSrc.includes('const userName = (u) =>')) {
        fail('evidence-format.util.js must export userName');
    }
    if (!utilSrc.includes('const num = (v) =>')) {
        fail('evidence-format.util.js must export num');
    }

    const evidenceServices = [
        'src/services/grnEvidence.service.js',
        'src/services/transferEvidence.service.js',
    ];

    for (const rel of evidenceServices) {
        const src = fs.readFileSync(path.join(BACKEND, rel), 'utf8');
        if (!src.includes("require('../utils/evidence-format.util')")) {
            fail(`${rel} must import evidence-format.util`);
        }
        if (/const userName\s*=/.test(src)) {
            fail(`${rel} must not define local userName`);
        }
        if (/const num\s*=/.test(src)) {
            fail(`${rel} must not define local num`);
        }
    }
}

function checkFinalBatchSharedDatabaseModules() {
    const unitRunnerPath = path.join(BACKEND, 'scripts/run-unit-tests.js');
    const unitRunner = fs.readFileSync(unitRunnerPath, 'utf8');

    const dbModules = [
        {
            rel: 'src/services/grnEvidence.service.js',
            consumerTest: 'src/services/grnEvidence.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/services/transferEvidence.service.js',
            consumerTest: 'src/services/transferEvidence.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/services/stockCountEvidence.service.js',
            consumerTest: 'src/services/stockCountEvidence.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
        {
            rel: 'src/services/consumption.service.js',
            consumerTest: 'src/services/consumption.service.consumer.test.js',
            importPattern: /require\('\.\.\/config\/database'\)/,
        },
    ];

    for (const { rel, consumerTest, importPattern } of dbModules) {
        const filePath = path.join(BACKEND, rel);
        const src = fs.readFileSync(filePath, 'utf8');
        if (!importPattern.test(src)) {
            fail(`${rel} must import config/database`);
        }
        if (/new PrismaClient\(\)/.test(src)) {
            fail(`${rel} must not instantiate PrismaClient`);
        }
        if (/\$disconnect/.test(src)) {
            fail(`${rel} must not contain local $disconnect lifecycle`);
        }
        const consumerPath = path.join(BACKEND, consumerTest);
        if (!fs.existsSync(consumerPath)) {
            fail(`Final Batch consumer test missing: ${consumerTest}`);
        }
        if (!unitRunner.includes(consumerTest)) {
            fail(`run-unit-tests.js must register ${consumerTest}`);
        }
    }

    const controllerPath = path.join(BACKEND, 'src/controllers/item.controller.js');
    const controllerSrc = fs.readFileSync(controllerPath, 'utf8');
    const downloadStart = controllerSrc.indexOf('const downloadTemplate = async');
    const downloadEnd = controllerSrc.indexOf('module.exports = {', downloadStart);
    if (downloadStart < 0 || downloadEnd <= downloadStart) {
        fail('item.controller.js downloadTemplate block not found');
    }
    const downloadBlock = controllerSrc.slice(downloadStart, downloadEnd);
    if (!/require\('\.\.\/config\/database'\)/.test(controllerSrc)) {
        fail('item.controller.js must import config/database');
    }
    if (/new PrismaClient\(\)/.test(downloadBlock)) {
        fail('item.controller downloadTemplate must not instantiate PrismaClient');
    }
    if (/\$disconnect/.test(downloadBlock)) {
        fail('item.controller downloadTemplate must not contain $disconnect');
    }
    const itemConsumerTest = path.join(BACKEND, 'src/controllers/item.controller.consumer.test.js');
    if (!fs.existsSync(itemConsumerTest)) {
        fail('item.controller.consumer.test.js is missing');
    }
    if (!unitRunner.includes('src/controllers/item.controller.consumer.test.js')) {
        fail('run-unit-tests.js must register item.controller.consumer.test.js');
    }
}

function main() {
    checkProtectedRunnersNoPassWithNoTests();
    checkProtectedPathsNoOnlyOrSkip();
    checkIntegrationRunnerExplicitList();
    checkAuthServicePermissionContract();
    checkRolePermissionFallbackUntouched();
    checkWave1EffectiveRuntimePermissionsDedup();
    checkBatch2TimelineBuilderTests();
    checkBatch2WorkflowParityGuard();
    checkBatch2MappingServiceSharedClient();
    checkBatch2GrnIdCleanupPrimitive();
    checkBatch3TimelinePresentationDedup();
    checkBatch3SharedDatabaseModules();
    checkFinalBatchEvidenceFormatDedup();
    checkFinalBatchSharedDatabaseModules();

    if (failures.length) {
        console.error('[phase-1-static] FAIL');
        for (const message of failures) {
            console.error(`  - ${message}`);
        }
        process.exit(1);
    }

    console.log('[phase-1-static] PASS — Phase 1 static safety checks green');
    process.exit(0);
}

main();
