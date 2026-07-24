'use strict';

/**
 * Wave 3 — Workflow Behavior Runtime Verification
 * Wave 2 Residual re-check + Wave 3A (GRN Draft First) + Wave 3B (autoApprove removal)
 * Usage: node Governance/wave3/wave3-runtime-verification.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

delete process.env.DATABASE_URL;
require('../../test/harness/preload');

const { PrismaClient } = require('@prisma/client');
const grnService = require('../../src/services/grn.service');
const breakageService = require('../../src/services/breakage.service');
const lostItemsService = require('../../src/services/lostItems.service');
const { mapUserFacingState } = require('../../src/platform/lifecyclePresentation.service');
const { hashPassword } = require('../../src/utils/password');
const {
    ensureRole,
    linkRolePermission,
    ensurePublishedAccWorkflow,
} = require('./wave3-test-helpers');

const BE_ROOT = path.join(__dirname, '../..');
const FE_ROOT = path.join(__dirname, '../../../OSE-Frontend');
const W2_EVIDENCE = path.join(__dirname, '../wave2/WAVE2_RUNTIME_VERIFICATION.json');
const EVIDENCE_PATH = path.join(__dirname, 'WAVE3_RUNTIME_VERIFICATION.json');
const RUN_ID = `W3-RV-${Date.now()}`;

function readText(rel) {
    return fs.readFileSync(path.join(FE_ROOT, rel), 'utf8');
}

function readBe(rel) {
    return fs.readFileSync(path.join(BE_ROOT, rel), 'utf8');
}

function scenario(id, fields) {
    return { id, ...fields };
}

function pass(id, name, extra = {}) {
    return scenario(id, { name, result: 'PASS', ...extra });
}

function fail(id, name, extra = {}) {
    return scenario(id, { name, result: 'FAIL', ...extra });
}

function blocked(id, name, extra = {}) {
    return scenario(id, { name, result: 'BLOCKED', ...extra });
}

async function createUser(prisma, { email, tenantId, roleCode, roleId }) {
    const passwordHash = await hashPassword('w3-test-password');
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            firstName: 'W3',
            lastName: roleCode,
            isActive: true,
        },
    });
    await prisma.tenantMember.create({
        data: { tenantId, userId: user.id, roleId, isActive: true },
    });
    await prisma.urUserAssignment.create({
        data: {
            userId: user.id,
            roleId,
            isActive: true,
            properties: { create: [{ propertyId: tenantId }] },
        },
    });
    return { ...user, role: roleCode };
}

async function seedTenant(prisma) {
    const slug = `w3-rv-${RUN_ID}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 36);
    const tenant = await prisma.tenant.create({
        data: { name: `W3 RV ${RUN_ID}`, slug, isActive: true },
    });
    const dept = await prisma.department.create({
        data: { tenantId: tenant.id, code: `W3D-${RUN_ID}`, name: 'W3 Dept', isActive: true },
    });
    const location = await prisma.location.create({
        data: { tenantId: tenant.id, departmentId: dept.id, name: `W3LOC-${RUN_ID}`, isActive: true },
    });
    const supplier = await prisma.supplier.create({
        data: { tenantId: tenant.id, name: `W3 Supplier ${RUN_ID}`, isActive: true },
    });
    const uom = await prisma.unit.create({
        data: { tenantId: tenant.id, name: 'Each', abbreviation: 'EA', isActive: true },
    });
    const item = await prisma.item.create({
        data: {
            tenantId: tenant.id,
            code: `W3-ITEM-${RUN_ID}`,
            name: `W3 Item ${RUN_ID}`,
            isActive: true,
            unitPrice: 5,
        },
    });
    await prisma.itemUnit.create({
        data: {
            tenantId: tenant.id,
            itemId: item.id,
            unitId: uom.id,
            unitType: 'BASE',
            conversionRate: 1,
            isDefault: true,
        },
    });
    await prisma.stockBalance.create({
        data: {
            tenantId: tenant.id,
            itemId: item.id,
            locationId: location.id,
            qtyOnHand: 100,
            wacUnitCost: 5,
        },
    });
    return { tenant, location, supplier, item, uom, dept };
}

async function main() {
    const scenarios = [];
    const prisma = new PrismaClient();
    const cleanup = [];

    try {
        // --- Wave 2 Final Closed gate ---
        let w2Gate = 'UNKNOWN';
        if (fs.existsSync(W2_EVIDENCE)) {
            const w2 = JSON.parse(fs.readFileSync(W2_EVIDENCE, 'utf8'));
            w2Gate = w2.summary?.gate ?? w2.gate ?? 'UNKNOWN';
        }
        scenarios.push(
            w2Gate === 'FINAL_CLOSED'
                ? pass('W2-GATE', 'Wave 2 Final Closed prerequisite', { gate: w2Gate })
                : fail('W2-GATE', 'Wave 2 Final Closed prerequisite', { gate: w2Gate, note: 'Run wave2-runtime-verification.js first' }),
        );

        // --- Static: GRN draft-first ---
        const grnServiceSrc = readBe('src/services/grn.service.js');
        scenarios.push(
            grnServiceSrc.includes("status: 'DRAFT'") &&
            !grnServiceSrc.includes('always enters Cost Control queue as VALIDATED')
                ? pass('W3A-01', 'GRN create persists DRAFT status', { requirement: 'BUS-DEC-02' })
                : fail('W3A-01', 'GRN create persists DRAFT status', { requirement: 'BUS-DEC-02' }),
        );
        scenarios.push(
            grnServiceSrc.includes('GRN must be submitted for approval before workflow actions')
                ? pass('W3A-02', 'Approve blocked until Submit (no lazy workflow start)', { requirement: 'BUS-DEC-02' })
                : fail('W3A-02', 'Approve blocked until Submit (no lazy workflow start)', { requirement: 'BUS-DEC-02' }),
        );

        const grnCreateFe = readText('src/app/features/grn/grn-create/grn-create.component.ts');
        scenarios.push(
            grnCreateFe.includes('CREATE_SUCCESS_DRAFT') && grnCreateFe.includes("navigate(['/grn', result.id]")
                ? pass('W3A-03', 'FE create navigates to draft detail', { requirement: 'BUS-DEC-02' })
                : fail('W3A-03', 'FE create navigates to draft detail', { requirement: 'BUS-DEC-02' }),
        );

        // --- Static: autoApprove removal ---
        const breakageSrc = readBe('src/services/breakage.service.js');
        const lostSrc = readBe('src/services/lostItems.service.js');
        const noAutoBreakage =
            !breakageSrc.includes('autoApproveOnCreate') &&
            breakageSrc.includes("status: 'DRAFT'") &&
            !breakageSrc.includes('autoApproveAllSteps: autoApproveOnCreate');
        const noAutoLost =
            !lostSrc.includes('autoApproveOnCreate') &&
            lostSrc.includes("status: 'DRAFT'") &&
            !lostSrc.includes('autoApproveAllSteps: autoApproveOnCreate');
        scenarios.push(
            noAutoBreakage && !breakageSrc.includes('HIGH_LEVEL_AUTO_APPROVAL_ROLES')
                ? pass('W3B-01', 'Breakage create removes autoApproveOnCreate', { requirement: 'BUS-DEC-03' })
                : fail('W3B-01', 'Breakage create removes autoApproveOnCreate', { requirement: 'BUS-DEC-03' }),
        );
        scenarios.push(
            noAutoLost && !lostSrc.includes('HIGH_LEVEL_AUTO_APPROVAL_ROLES')
                ? pass('W3B-02', 'Lost Items create removes autoApproveOnCreate', { requirement: 'BUS-DEC-03' })
                : fail('W3B-02', 'Lost Items create removes autoApproveOnCreate', { requirement: 'BUS-DEC-03' }),
        );

        // --- Runtime integration (test DB) ---
        let dbAvailable = true;
        try {
            await prisma.$queryRaw`SELECT 1`;
        } catch {
            dbAvailable = false;
            scenarios.push(blocked('W3-DB', 'Integration DB available', {
                note: 'Database unreachable — runtime integration scenarios deferred',
            }));
        }

        if (dbAvailable) {
        const { tenant, location, supplier, item, uom } = await seedTenant(prisma);
        cleanup.push(async () => {
            await prisma.approvalStep.deleteMany({
                where: { approvalRequest: { tenantId: tenant.id } },
            });
            await prisma.approvalRequest.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.grnLine.deleteMany({ where: { grnImport: { tenantId: tenant.id } } });
            await prisma.grnImport.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.movementLine.deleteMany({ where: { document: { tenantId: tenant.id } } });
            await prisma.movementDocument.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.stockBalance.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.itemUnit.deleteMany({ where: { itemId: item.id } });
            await prisma.item.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.unit.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.supplier.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.location.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.department.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.tenantMember.deleteMany({ where: { tenantId: tenant.id } });
            await prisma.user.deleteMany({
                where: { email: { in: [`w3-sk-${RUN_ID}@test.local`, `w3-gm-${RUN_ID}@test.local`] } },
            });
            await prisma.tenant.deleteMany({ where: { id: tenant.id } });
        });

        await ensurePublishedAccWorkflow(prisma, 'GRN', { grnStyle: true });
        await ensurePublishedAccWorkflow(prisma, 'BREAKAGE');

        const storekeeperRole = await ensureRole(prisma, 'STOREKEEPER');
        const gmRole = await ensureRole(prisma, 'GENERAL_MANAGER');
        await linkRolePermission(prisma, gmRole.id, 'BREAKAGE_CREATE', RUN_ID);
        await linkRolePermission(prisma, gmRole.id, 'LOST_CREATE', RUN_ID);
        await linkRolePermission(prisma, storekeeperRole.id, 'GRN_MANAGE', RUN_ID);

        const storekeeper = await createUser(prisma, {
            email: `w3-sk-${RUN_ID}@test.local`,
            tenantId: tenant.id,
            roleCode: 'STOREKEEPER',
            roleId: storekeeperRole.id,
        });
        const gmUser = await createUser(prisma, {
            email: `w3-gm-${RUN_ID}@test.local`,
            tenantId: tenant.id,
            roleCode: 'GENERAL_MANAGER',
            roleId: gmRole.id,
        });

        const { resolveWorkflowForDocument } = require('../../src/services/acc-workflow-runtime.service');
        let grnWorkflowReady = false;
        let breakageWorkflowReady = false;
        try {
            await resolveWorkflowForDocument({ moduleKey: 'GRN', tenantId: tenant.id });
            grnWorkflowReady = true;
        } catch {
            grnWorkflowReady = false;
        }
        try {
            await resolveWorkflowForDocument({ moduleKey: 'BREAKAGE', tenantId: tenant.id });
            breakageWorkflowReady = true;
        } catch {
            breakageWorkflowReady = false;
        }

        let createdGrn = null;
        try {
            createdGrn = await grnService.createGrn({
                supplierId: supplier.id,
                locationId: location.id,
                supplierInvoiceNumber: `INV-${RUN_ID}`,
                receivingDate: new Date(),
                invoiceUrl: '/tmp/w3-invoice.pdf',
                notes: 'W3 draft test',
                lines: [{
                    itemId: item.id,
                    uomId: uom.id,
                    orderedQty: 2,
                    receivedQty: 2,
                    unitPrice: 5,
                }],
                tenantId: tenant.id,
                userId: storekeeper.id,
                creatorRole: 'STOREKEEPER',
            });
        } catch (err) {
            scenarios.push(fail('W3A-04', 'GRN create → Draft runtime', {
                requirement: 'BUS-DEC-02',
                error: err.message,
            }));
        }

        if (createdGrn) {
            scenarios.push(
                createdGrn.status === 'DRAFT'
                    ? pass('W3A-04', 'GRN create → Draft runtime', {
                          requirement: 'BUS-DEC-02',
                          grnNumber: createdGrn.grnNumber,
                          status: createdGrn.status,
                      })
                    : fail('W3A-04', 'GRN create → Draft runtime', {
                          requirement: 'BUS-DEC-02',
                          status: createdGrn.status,
                      }),
            );
            scenarios.push(
                mapUserFacingState('GRN', createdGrn.status) === 'Draft'
                    ? pass('W3A-05', 'Draft GRN user-facing state = Draft', { requirement: 'BUS-DEC-02' })
                    : fail('W3A-05', 'Draft GRN user-facing state = Draft', { requirement: 'BUS-DEC-02' }),
            );

            try {
                const updated = await grnService.updateGrn(
                    createdGrn.id,
                    tenant.id,
                    {
                        notes: 'W3 edited draft notes',
                        lines: [{
                            itemId: item.id,
                            uomId: uom.id,
                            orderedQty: 3,
                            receivedQty: 3,
                            unitPrice: 5,
                        }],
                    },
                    storekeeper.id,
                    createdGrn.concurrencyVersion ?? 0,
                );
                const lineOk = updated?.lines?.length === 1 && Number(updated.lines[0].receivedQty) === 3;
                scenarios.push(
                    updated?.notes === 'W3 edited draft notes' && lineOk
                        ? pass('W3A-08', 'Edit Draft GRN header and lines', { requirement: 'BUS-DEC-02' })
                        : fail('W3A-08', 'Edit Draft GRN header and lines', {
                              requirement: 'BUS-DEC-02',
                              notes: updated?.notes,
                              receivedQty: updated?.lines?.[0]?.receivedQty,
                          }),
                );
                createdGrn = updated;
            } catch (err) {
                scenarios.push(fail('W3A-08', 'Edit Draft GRN header and lines', {
                    requirement: 'BUS-DEC-02',
                    error: err.message,
                }));
            }

            const freshForDelete = await prisma.grnImport.findFirst({ where: { id: createdGrn.id } });
            await grnService.deleteGrn(
                createdGrn.id,
                tenant.id,
                storekeeper.id,
                freshForDelete?.concurrencyVersion ?? createdGrn.concurrencyVersion ?? 0,
            );
            const deleted = await prisma.grnImport.findFirst({ where: { id: createdGrn.id } });
            scenarios.push(
                !deleted
                    ? pass('W3A-06', 'Delete Draft GRN', { requirement: 'BUS-DEC-02' })
                    : fail('W3A-06', 'Delete Draft GRN', { requirement: 'BUS-DEC-02' }),
            );

            const draft2 = await grnService.createGrn({
                supplierId: supplier.id,
                locationId: location.id,
                supplierInvoiceNumber: `INV2-${RUN_ID}`,
                receivingDate: new Date(),
                invoiceUrl: '/tmp/w3-invoice2.pdf',
                lines: [{
                    itemId: item.id,
                    uomId: uom.id,
                    orderedQty: 1,
                    receivedQty: 1,
                    unitPrice: 5,
                }],
                tenantId: tenant.id,
                userId: storekeeper.id,
                creatorRole: 'STOREKEEPER',
            });

            if (grnWorkflowReady) {
                try {
                    await grnService.submitForApproval(draft2.id, tenant.id, storekeeper.id, 0);
                    const submitted = await prisma.grnImport.findFirst({ where: { id: draft2.id } });
                    scenarios.push(
                        submitted?.approvalRequestId && submitted.status !== 'DRAFT'
                            ? pass('W3A-07', 'Submit Draft starts workflow (approvalRequest created)', {
                                  requirement: 'BUS-DEC-02',
                                  status: submitted.status,
                              })
                            : fail('W3A-07', 'Submit Draft starts workflow (approvalRequest created)', {
                                  requirement: 'BUS-DEC-02',
                                  status: submitted?.status,
                                  approvalRequestId: submitted?.approvalRequestId,
                              }),
                    );
                } catch (err) {
                    scenarios.push(fail('W3A-07', 'Submit Draft starts workflow (approvalRequest created)', {
                        requirement: 'BUS-DEC-02',
                        error: err.message,
                    }));
                }
            } else {
                scenarios.push(fail('W3A-07', 'Submit Draft starts workflow (approvalRequest created)', {
                    requirement: 'BUS-DEC-02',
                    note: 'Published ACC GRN workflow missing after seed',
                }));
            }
        }

        let breakageDoc = null;
        try {
            breakageDoc = await breakageService.createBreakage(
                {
                    reason: 'W3 test breakage',
                    suggestedAction: 'HOTEL',
                    lines: [{
                        itemId: item.id,
                        locationId: location.id,
                        qty: 1,
                        unitCost: 5,
                        totalValue: 5,
                    }],
                },
                tenant.id,
                gmUser,
            );
        } catch (err) {
            scenarios.push(fail('W3B-03', 'GM Breakage create stays Draft (not Approved)', {
                requirement: 'BUS-DEC-03',
                error: err.message,
            }));
        }
        if (breakageDoc) {
            const approval = breakageDoc.approvalRequests;
            scenarios.push(
                breakageDoc.status === 'DRAFT' && !breakageDoc.postedAt
                    ? pass('W3B-03', 'GM Breakage create stays Draft (not Approved)', {
                          requirement: 'BUS-DEC-03',
                          status: breakageDoc.status,
                      })
                    : fail('W3B-03', 'GM Breakage create stays Draft (not Approved)', {
                          requirement: 'BUS-DEC-03',
                          status: breakageDoc.status,
                          postedAt: breakageDoc.postedAt,
                      }),
            );
            scenarios.push(
                approval?.status !== 'APPROVED' && breakageDoc.status !== 'APPROVED'
                    ? pass('W3B-05', 'No posting / full auto-approve on Breakage create', {
                          requirement: 'BUS-DEC-03',
                          approvalStatus: approval?.status,
                          docStatus: breakageDoc.status,
                          postedAt: breakageDoc.postedAt,
                      })
                    : fail('W3B-05', 'No posting / full auto-approve on Breakage create', {
                          requirement: 'BUS-DEC-03',
                          approvalStatus: approval?.status,
                          docStatus: breakageDoc.status,
                          postedAt: breakageDoc.postedAt,
                      }),
            );
        }

        let lostDoc = null;
        try {
            lostDoc = await lostItemsService.createLost(
                tenant.id,
                gmUser,
                {
                    reason: 'W3 test lost',
                    suggestedAction: 'HOTEL',
                    lines: [{
                        itemId: item.id,
                        locationId: location.id,
                        qty: 1,
                        unitCost: 5,
                        totalValue: 5,
                    }],
                },
            );
        } catch (err) {
            scenarios.push(fail('W3B-04', 'GM Lost create stays Draft (not Approved)', {
                requirement: 'BUS-DEC-03',
                error: err.message,
            }));
        }
        if (lostDoc) {
            scenarios.push(
                lostDoc.status === 'DRAFT' && !lostDoc.postedAt
                    ? pass('W3B-04', 'GM Lost create stays Draft (not Approved)', {
                          requirement: 'BUS-DEC-03',
                          status: lostDoc.status,
                      })
                    : fail('W3B-04', 'GM Lost create stays Draft (not Approved)', {
                          requirement: 'BUS-DEC-03',
                          status: lostDoc.status,
                          postedAt: lostDoc.postedAt,
                      }),
            );
        }

        if (breakageWorkflowReady && breakageDoc) {
            scenarios.push(
                pass('BRK-01', 'Breakage ACC workflow environment proof', {
                    requirement: 'Wave 1 carry-forward',
                    note: 'Published BREAKAGE workflow + GM create runtime proof',
                    documentNo: breakageDoc.documentNo,
                }),
            );
        } else {
            scenarios.push(
                blocked('BRK-01', 'Breakage ACC workflow environment proof', {
                    requirement: 'Wave 1 carry-forward',
                    classification: 'Accepted Environment Blocker — Deferred Runtime Proof',
                    note: breakageWorkflowReady
                        ? 'Workflow published but breakage create failed'
                        : 'No published ACC Breakage workflow on test tenant',
                }),
            );
        }

        } else {
            for (const id of ['W3A-04', 'W3A-05', 'W3A-06', 'W3A-07', 'W3A-08', 'W3B-03', 'W3B-04', 'W3B-05', 'BRK-01']) {
                scenarios.push(blocked(id, `${id} integration (DB unavailable)`, {
                    requirement: id.startsWith('W3A') ? 'BUS-DEC-02' : 'BUS-DEC-03',
                }));
            }
        }

        let jestOut = '';
        try {
            jestOut = execSync(
                'npx jest src/platform/lifecyclePresentation.service.test.js --no-cache 2>&1',
                { cwd: BE_ROOT, encoding: 'utf8', shell: true },
            );
        } catch (e) {
            jestOut = `${e.stdout || ''}\n${e.message}`;
        }
        scenarios.push(
            /Tests:\s+\d+ passed,\s+\d+ total/.test(jestOut)
                ? pass('W3-UNIT-01', 'lifecyclePresentation unit tests', { requirement: 'SYS-DEC-02' })
                : fail('W3-UNIT-01', 'lifecyclePresentation unit tests', { requirement: 'SYS-DEC-02' }),
        );
    } finally {
        for (const fn of cleanup.reverse()) {
            try { await fn(); } catch { /* ignore */ }
        }
        await prisma.$disconnect();
    }

    const passCount = scenarios.filter((s) => s.result === 'PASS').length;
    const failCount = scenarios.filter((s) => s.result === 'FAIL').length;
    const blockedCount = scenarios.filter((s) => s.result === 'BLOCKED').length;
    const dbBlocked = scenarios.some((s) => s.id === 'W3-DB' && s.result === 'BLOCKED');
    const gateClosed = failCount === 0 && blockedCount === 0;

    const evidence = {
        generatedAt: new Date().toISOString(),
        classification: 'WAVE3_RUNTIME_VERIFICATION',
        runId: RUN_ID,
        wave: 3,
        requirements: ['BUS-DEC-02', 'BUS-DEC-03', 'SYS-DEC-02'],
        summary: {
            total: scenarios.length,
            pass: passCount,
            fail: failCount,
            blocked: blockedCount,
            gate: gateClosed ? 'CLOSED' : failCount > 0 ? 'FAIL' : 'OPEN',
            dbAvailable: !dbBlocked,
        },
        scenarios,
    };

    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence.summary, null, 2));
    process.exit(gateClosed ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
