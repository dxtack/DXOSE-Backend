'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
    'src/platform/concurrency.service.js',
    'src/platform/displayCurrency.service.js',
    'src/platform/lifecyclePresentation.service.js',
    'src/platform/draftGovernance.service.js',
    'src/platform/attachmentGovernance.service.js',
    'src/platform/documentTimeline.service.js',
    'src/platform/periodResolution.service.js',
    'src/platform/errorRegistry.js',
    'src/routes/constitution.routes.js',
    'src/controllers/constitution.controller.js',
    'prisma/migrations/20260626120000_constitution_v2_foundation/migration.sql',
];

let failed = 0;
for (const rel of required) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) {
        console.error('FAIL: missing', rel);
        failed += 1;
    } else {
        console.log('OK:', rel);
    }
}

const grn = fs.readFileSync(path.join(root, 'src/services/grn.service.js'), 'utf8');
if (grn.includes('resubmitRejectedGrn')) {
    console.error('FAIL: resubmitRejectedGrn still present (Ch.2.7)');
    failed += 1;
} else {
    console.log('OK: resubmitRejectedGrn removed');
}

if (!grn.includes('sendBackGrn')) {
    console.error('FAIL: sendBackGrn missing (Ch.3.4)');
    failed += 1;
} else {
    console.log('OK: sendBackGrn present');
}

if (!grn.includes('generateDocNumber')) {
    console.error('FAIL: system GRN numbering missing (Ch.9)');
    failed += 1;
} else {
    console.log('OK: system GRN numbering');
}

const routes = fs.readFileSync(path.join(root, 'src/routes/grn.routes.js'), 'utf8');
if (routes.includes('/resubmit')) {
    console.error('FAIL: /resubmit route still registered');
    failed += 1;
} else {
    console.log('OK: /resubmit route removed');
}

if (!routes.includes('/send-back')) {
    console.error('FAIL: /send-back route missing');
    failed += 1;
} else {
    console.log('OK: /send-back route');
}

const constitutionRoutes = fs.readFileSync(path.join(root, 'src/routes/constitution.routes.js'), 'utf8');
if (!constitutionRoutes.includes("patch('/grn/draft/:id'")) {
    console.error('FAIL: PATCH /constitution/grn/draft/:id missing (A1)');
    failed += 1;
} else {
    console.log('OK: PATCH constitution grn draft route');
}

const lifecycle = fs.readFileSync(path.join(root, 'src/platform/lifecyclePresentation.service.js'), 'utf8');
if (!lifecycle.includes("'Returned'") && !lifecycle.includes('Returned')) {
    console.error('FAIL: Returned user-facing state mapping missing (A3)');
    failed += 1;
} else {
    console.log('OK: Returned lifecycle mapping');
}

const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
if (!schema.includes('SEND_BACK')) {
    console.error('FAIL: SEND_BACK AuditAction missing (A2)');
    failed += 1;
} else {
    console.log('OK: SEND_BACK audit action');
}

if (!grn.includes('assertConcurrencyVersion')) {
    console.error('FAIL: GRN concurrency enforcement missing (A4)');
    failed += 1;
} else {
    console.log('OK: GRN concurrency enforcement');
}

if (!constitutionRoutes.includes("get('/draft-policy'")) {
    console.error('FAIL: GET /constitution/draft-policy missing (Ch.7)');
    failed += 1;
} else {
    console.log('OK: GET constitution draft-policy');
}

if (!constitutionRoutes.includes("get('/drafts/:family'")) {
    console.error('FAIL: GET /constitution/drafts/:family missing (Ch.7)');
    failed += 1;
} else {
    console.log('OK: GET constitution drafts registry');
}

const draftGov = fs.readFileSync(path.join(root, 'src/platform/draftGovernance.service.js'), 'utf8');
if (!draftGov.includes('assertDraftEditable')) {
    console.error('FAIL: draft access policy missing (Ch.7.4)');
    failed += 1;
} else {
    console.log('OK: draft access policy');
}

if (!draftGov.includes('listFamilyDrafts')) {
    console.error('FAIL: draft registry missing (Ch.7.9)');
    failed += 1;
} else {
    console.log('OK: draft registry');
}

if (!draftGov.includes('DEFAULT_DRAFT_RETENTION_DAYS')) {
    console.error('FAIL: draft retention policy missing (Ch.7.9)');
    failed += 1;
} else {
    console.log('OK: draft retention policy');
}

if (failed) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
}
console.log('\nConstitution v2 platform static checks passed.');
