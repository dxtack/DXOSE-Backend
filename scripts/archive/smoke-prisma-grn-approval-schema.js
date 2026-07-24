'use strict';

/**
 * Proves generated Prisma Client exposes GRN approval history fields/relations.
 * Run after: npx prisma generate
 */
const { Prisma } = require('@prisma/client');
const assert = require('node:assert/strict');

const dmmf = Prisma.dmmf;
const approval = dmmf.datamodel.models.find((m) => m.name === 'ApprovalRequest');
const grn = dmmf.datamodel.models.find((m) => m.name === 'GrnImport');

assert.ok(approval, 'ApprovalRequest model');
assert.ok(grn, 'GrnImport model');

const fields = new Set(approval.fields.map((f) => f.name));
assert.ok(fields.has('grnImportId'), 'ApprovalRequest.grnImportId');
assert.ok(fields.has('cycleNumber'), 'ApprovalRequest.cycleNumber');

const relNames = approval.fields.filter((f) => f.kind === 'object').map((f) => f.name);
assert.ok(relNames.includes('grnImportHistory'), 'GrnApprovalHistory relation field grnImportHistory');
assert.ok(relNames.includes('grnImportActive'), 'GrnActiveApproval relation field grnImportActive');

const grnRel = grn.fields.filter((f) => f.kind === 'object').map((f) => f.name);
assert.ok(grnRel.includes('approvalRequest'), 'GrnImport.approvalRequest (GrnActiveApproval)');
assert.ok(grnRel.includes('approvalHistory'), 'GrnImport.approvalHistory (GrnApprovalHistory)');

const unique = approval.uniqueFields?.flat?.() || [];
const hasCycleUnique =
    approval.fields.some((f) => f.isUnique && f.name === 'grnImportId') ||
    (approval.uniqueIndexes || []).some(
        (idx) =>
            idx.fields?.length === 2 &&
            idx.fields.some((f) => f.name === 'grnImportId') &&
            idx.fields.some((f) => f.name === 'cycleNumber'),
    ) ||
    dmmf.datamodel.models
        .find((m) => m.name === 'ApprovalRequest')
        ?.uniqueFields?.some?.((group) => group.includes('grnImportId') && group.includes('cycleNumber'));

// Prisma 5 exposes compound uniques on fields with @unique composite
const compound = approval.fields.filter((f) => f.relationName).length;
void compound;
const compositeUnique = (approval.uniqueFields || []).some(
    (g) => Array.isArray(g) && g.includes('grnImportId') && g.includes('cycleNumber'),
);
assert.ok(compositeUnique || hasCycleUnique, '@@unique([grnImportId, cycleNumber])');

console.log('OK: Prisma Client exposes grnImportId, cycleNumber, GrnActiveApproval, GrnApprovalHistory');
