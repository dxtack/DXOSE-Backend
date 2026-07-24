'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const inventoryCountService = require('../../../src/services/inventoryCount.service');
const { openPeriod } = require('../../../src/services/periodClose.service');
const { tenantPeriodYearMonth } = require('../../../src/utils/tenant-calendar.util');

test('canonical inventory count completes approval and posting with ledger effect', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    let tenantId;
    const userIds = [];

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Inventory Count Cycle ${runContext.runId}`,
                slug: runContext.tenantSlug,
                timezone: 'Asia/Riyadh',
            },
        });
        tenantId = tenant.id;
        const department = await prisma.department.create({
            data: { tenantId, name: `Count Department ${runContext.runId}`, code: `IC-${runContext.runId}`.slice(0, 30) },
        });
        const location = await prisma.location.create({
            data: {
                tenantId,
                departmentId: department.id,
                name: `Count Location ${runContext.runId}`,
            },
        });
        const item = await prisma.item.create({
            data: {
                tenantId,
                departmentId: department.id,
                name: `Count Item ${runContext.runId}`,
                code: `ICI-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });

        const actorSpecs = [
            ['COST_CONTROL', ['STOCK_COUNT_CREATE', 'STOCK_COUNT_EXECUTE', 'STOCK_COUNT_CANCEL', 'STOCK_COUNT_RECOUNT', 'STOCK_COUNT_SUBMIT', 'STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT']],
            ['DEPT_MANAGER', ['APPROVE_INVENTORY_COUNT']],
            ['FINANCE_MANAGER', ['APPROVE_INVENTORY_COUNT']],
            ['GENERAL_MANAGER', ['APPROVE_INVENTORY_COUNT']],
        ];
        const actors = {};
        for (const [roleCode, permissions] of actorSpecs) {
            const role = await prisma.role.findUnique({ where: { code: roleCode } });
            assert.ok(role, `Missing role ${roleCode}`);
            const user = await prisma.user.create({
                data: {
                    email: runContext.integrationEmail(roleCode.toLowerCase()),
                    passwordHash: 'integration-test-not-used',
                    firstName: roleCode,
                    lastName: 'Actor',
                },
            });
            userIds.push(user.id);
            await prisma.tenantMember.create({
                data: {
                    tenantId,
                    userId: user.id,
                    roleId: role.id,
                    departmentId: roleCode === 'DEPT_MANAGER' ? department.id : null,
                    canViewAllDepartments: false,
                    canViewAllLocations: roleCode !== 'DEPT_MANAGER',
                    isActive: true,
                },
            });
            if (roleCode === 'DEPT_MANAGER') {
                await prisma.urUserAssignment.create({
                    data: {
                        userId: user.id,
                        roleId: role.id,
                        isActive: true,
                        notes: 'Canonical inventory-count integration scope',
                        properties: { create: { propertyId: tenantId } },
                        departments: { create: { departmentId: department.id } },
                    },
                });
            }
            actors[roleCode] = {
                id: user.id,
                tenantId,
                role: roleCode,
                permissions,
                departmentId: roleCode === 'DEPT_MANAGER' ? department.id : null,
            };
        }

        // P1 #16 — accepted opening continuity evidence before any posting-gated write.
        // Bootstrap while still zero-state (no stock / ledger / prior periods).
        const current = tenantPeriodYearMonth(new Date(), tenant.timezone);
        await openPeriod(
            tenantId,
            {
                year: current.year,
                month: current.month,
                reason: 'Inventory count full-cycle fixture open',
                bootstrapApproval: {
                    approvedBy: actors.COST_CONTROL.id,
                    reason: 'Explicit zero-state integration bootstrap for inventory-count-full-cycle',
                    source: 'INVENTORY_COUNT_FULL_CYCLE_TEST',
                },
            },
            actors.COST_CONTROL.id,
        );

        await prisma.stockBalance.create({
            data: {
                tenantId,
                itemId: item.id,
                locationId: location.id,
                qtyOnHand: 100,
                qtyBlocked: 0,
                wacUnitCost: 10,
            },
        });
        await prisma.tenantSetting.createMany({
            data: [
                { tenantId, key: 'allowOpeningBalance', value: 'LOCKED' },
                {
                    tenantId,
                    key: 'obFinalizeSnapshot',
                    value: JSON.stringify({ finalizedAt: new Date().toISOString() }),
                },
            ],
        });

        const created = await inventoryCountService.createSession(tenantId, actors.COST_CONTROL, {
            departmentId: department.id,
            locationIds: [location.id],
            blindMode: false,
            notes: 'P0 #7 full-cycle proof',
        });
        console.log('[cycle] create', JSON.stringify(created));

        const started = await inventoryCountService.startSession(
            tenantId,
            actors.COST_CONTROL,
            created.id,
            { concurrencyVersion: created.concurrencyVersion },
        );
        console.log('[cycle] start', JSON.stringify(started));

        const counted = await inventoryCountService.updateCountedQty(
            tenantId,
            actors.COST_CONTROL,
            created.id,
            location.id,
            item.id,
            {
                countedQty: 40,
                roundNo: 1,
                concurrencyVersion: started.concurrencyVersion,
            },
        );
        console.log('[cycle] count', JSON.stringify(counted));

        const countsSubmitted = await inventoryCountService.submitCounts(
            tenantId,
            actors.COST_CONTROL,
            created.id,
            { concurrencyVersion: counted.concurrencyVersion },
        );
        console.log('[cycle] submit-counts', JSON.stringify(countsSubmitted));

        const approvalSubmitted = await inventoryCountService.submitForApproval(
            tenantId,
            actors.COST_CONTROL,
            created.id,
            { concurrencyVersion: countsSubmitted.concurrencyVersion },
        );
        console.log('[cycle] submit-approval', JSON.stringify(approvalSubmitted));

        const deptApproval = await inventoryCountService.approve(
            tenantId,
            actors.DEPT_MANAGER.id,
            actors.DEPT_MANAGER,
            created.id,
            { concurrencyVersion: approvalSubmitted.concurrencyVersion },
        );
        console.log('[cycle] dept-approve', JSON.stringify(deptApproval));

        let currentSession = await prisma.stockCountSession.findUnique({ where: { id: created.id } });
        const financeApproval = await inventoryCountService.approve(
            tenantId,
            actors.FINANCE_MANAGER.id,
            actors.FINANCE_MANAGER,
            created.id,
            { concurrencyVersion: currentSession.concurrencyVersion },
        );
        console.log('[cycle] finance-approve', JSON.stringify(financeApproval));

        currentSession = await prisma.stockCountSession.findUnique({ where: { id: created.id } });
        const gmApproval = await inventoryCountService.approve(
            tenantId,
            actors.GENERAL_MANAGER.id,
            actors.GENERAL_MANAGER,
            created.id,
            { concurrencyVersion: currentSession.concurrencyVersion },
        );
        console.log('[cycle] gm-approve-post', JSON.stringify(gmApproval));

        const [sessionAfter, stockAfter, ledgerRows, requestAfter] = await Promise.all([
            prisma.stockCountSession.findUnique({ where: { id: created.id } }),
            prisma.stockBalance.findUnique({
                where: {
                    tenantId_itemId_locationId: {
                        tenantId,
                        itemId: item.id,
                        locationId: location.id,
                    },
                },
            }),
            prisma.inventoryLedger.findMany({
                where: { tenantId, referenceType: 'COUNT_SESSION', referenceId: created.id },
            }),
            prisma.approvalRequest.findFirst({
                where: { tenantId, StockCountSession: { id: created.id } },
                include: { steps: { orderBy: { stepNumber: 'asc' } } },
            }),
        ]);
        const final = {
            sessionStatus: sessionAfter.status,
            approvalStatus: requestAfter.status,
            approvalSteps: requestAfter.steps.map((step) => ({
                stepNumber: step.stepNumber,
                status: step.status,
            })),
            qtyOnHand: Number(stockAfter.qtyOnHand),
            ledgerRows: ledgerRows.map((row) => ({
                movementType: row.movementType,
                qtyIn: Number(row.qtyIn),
                qtyOut: Number(row.qtyOut),
                balanceAfter: Number(row.balanceAfter),
            })),
        };
        console.log('[cycle] final', JSON.stringify(final));

        assert.equal(final.sessionStatus, 'POSTED');
        assert.equal(final.approvalStatus, 'APPROVED');
        assert.deepEqual(final.approvalSteps.map((step) => step.status), [
            'APPROVED',
            'APPROVED',
            'APPROVED',
            'APPROVED',
        ]);
        assert.equal(final.qtyOnHand, 40);
        assert.deepEqual(final.ledgerRows, [
            {
                movementType: 'COUNT_ADJUSTMENT',
                qtyIn: 0,
                qtyOut: 60,
                balanceAfter: 40,
            },
        ]);
    } finally {
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.stockCountSession.deleteMany({ where: { tenantId } });
            await prisma.approvalRequest.deleteMany({ where: { tenantId } });
            await prisma.stockBalance.deleteMany({ where: { tenantId } });
            await prisma.tenantSetting.deleteMany({ where: { tenantId } });
            await prisma.periodClose.updateMany({ where: { tenantId }, data: { openingVerificationId: null } });
            await prisma.periodOpeningVerificationLine.deleteMany({
                where: { verification: { tenantId } },
            });
            await prisma.periodOpeningVerification.deleteMany({ where: { tenantId } });
            await prisma.periodClose.deleteMany({ where: { tenantId } });
            await prisma.tenantMember.deleteMany({ where: { tenantId } });
            await prisma.item.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.department.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userIds.length) {
            await prisma.urUserAssignment.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
            await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
        await prisma.$disconnect();
    }
});
