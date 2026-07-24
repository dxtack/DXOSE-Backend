'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { acceptReturnIntoDepartment } = require('../../../src/services/getPass.service');

test('inter-hotel return receipt requires integer good, damaged, and lost quantities', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    const tenantIds = [];
    let userId;

    try {
        const sourceTenant = await prisma.tenant.create({
            data: { name: `P12 Source ${runContext.runId}`, slug: runContext.tenantSlug },
        });
        tenantIds.push(sourceTenant.id);
        const targetTenant = await prisma.tenant.create({
            data: {
                name: `P12 Target ${runContext.runId}`,
                slug: `${runContext.tenantSlug}-target`,
            },
        });
        tenantIds.push(targetTenant.id);
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('p12-return'),
                passwordHash: 'integration-test-not-used',
                firstName: 'P12',
                lastName: 'Return',
            },
        });
        userId = user.id;
        const now = new Date();
        for (const tenantId of tenantIds) {
            await prisma.periodClose.upsert({
                where: {
                    tenantId_year_month: {
                        tenantId,
                        year: now.getUTCFullYear(),
                        month: now.getUTCMonth() + 1,
                    },
                },
                update: { status: 'OPEN' },
                create: {
                    tenantId,
                    year: now.getUTCFullYear(),
                    month: now.getUTCMonth() + 1,
                    status: 'OPEN',
                },
            });
        }
        const actingUser = {
            id: userId,
            role: 'DEPT_MANAGER',
            permissions: ['GET_PASS_CONFIRM_DESTINATION'],
        };

        const location = await prisma.location.create({
            data: { tenantId: sourceTenant.id, name: `P12 Return Location ${runContext.runId}` },
        });
        const item = await prisma.item.create({
            data: {
                tenantId: sourceTenant.id,
                name: `P12 Return Item ${runContext.runId}`,
                code: `P12-${runContext.runId}`.slice(0, 60),
                unitPrice: 10,
            },
        });
        const stockKey = {
            tenantId_itemId_locationId: {
                tenantId: sourceTenant.id,
                itemId: item.id,
                locationId: location.id,
            },
        };
        await prisma.stockBalance.create({
            data: {
                tenantId: sourceTenant.id,
                itemId: item.id,
                locationId: location.id,
                qtyOnHand: 100,
                qtyBlocked: 10,
                wacUnitCost: 10,
            },
        });
        const getPass = await prisma.getPass.create({
            data: {
                tenantId: sourceTenant.id,
                targetTenantId: targetTenant.id,
                passNo: `P12-GP-${runContext.runId}`,
                transferType: 'TEMPORARY',
                isInternalTransfer: true,
                borrowingEntity: targetTenant.name,
                status: 'RETURN_RECEIVED_AT_GATE',
                createdBy: userId,
                lines: {
                    create: {
                        itemId: item.id,
                        locationId: location.id,
                        qty: 10,
                        qtyReturned: 1.5,
                        returnedGoodQty: 0.5,
                        returnedDamagedQty: 0.5,
                        returnedLostQty: 0.5,
                        unitCost: 10,
                        status: 'PARTIALLY_RETURNED',
                    },
                },
            },
            include: { lines: true },
        });
        for (const movementType of ['BREAKAGE', 'LOST']) {
            await prisma.movementDocument.create({
                data: {
                    tenantId: sourceTenant.id,
                    documentNo: `P12-${movementType}-${runContext.runId}`,
                    movementType,
                    sourceType: 'GET_PASS_RETURN',
                    getPassId: getPass.id,
                    status: 'DRAFT',
                    sourceLocationId: location.id,
                    reason: 'Existing disposition prevents duplicate workflow fixture creation',
                    createdBy: userId,
                },
            });
        }

        const outcome = await Promise.allSettled([
            acceptReturnIntoDepartment(
                getPass.id,
                sourceTenant.id,
                actingUser,
                {
                    lines: [{
                        lineId: getPass.lines[0].id,
                        goodQty: 0.5,
                        damagedQty: 0.5,
                        lostQty: 0.5,
                        accountability: 'COMPANY_LOSS',
                    }],
                },
            ),
        ]);
        const [storedPass, stock, ledger, returnRows] = await Promise.all([
            prisma.getPass.findUnique({ where: { id: getPass.id } }),
            prisma.stockBalance.findUnique({ where: stockKey }),
            prisma.inventoryLedger.findFirst({
                where: {
                    tenantId: sourceTenant.id,
                    referenceId: getPass.lines[0].id,
                    movementType: 'RETURN',
                },
            }),
            prisma.getPassReturn.findMany({
                where: { getPassLineId: getPass.lines[0].id },
                orderBy: { qtyDamaged: 'desc' },
            }),
        ]);
        const proof = {
            outcome: outcome[0].status,
            errorCode: outcome[0].status === 'rejected' ? outcome[0].reason?.code : null,
            status: storedPass.status,
            qtyBlocked: Number(stock.qtyBlocked),
            ledgerQtyIn: ledger ? Number(ledger.qtyIn) : null,
            damagedQty: returnRows.reduce((sum, row) => sum + Number(row.qtyDamaged), 0),
            lostQty: returnRows.reduce((sum, row) => sum + Number(row.qtyLost), 0),
        };
        console.log('[proof] p12-interhotel-return-fractions', JSON.stringify(proof));

        assert.equal(proof.outcome, 'rejected');
        assert.equal(proof.errorCode, 'NON_INTEGER_QUANTITY');
        assert.equal(proof.status, 'RETURN_RECEIVED_AT_GATE');
        assert.equal(proof.qtyBlocked, 10);
        assert.equal(proof.ledgerQtyIn, null);
        assert.equal(proof.damagedQty, 0);
        assert.equal(proof.lostQty, 0);
    } finally {
        if (tenantIds.length > 0) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.getPassReturn.deleteMany({
                where: { getPassLine: { getPass: { tenantId: { in: tenantIds } } } },
            });
            await prisma.movementDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.getPassLine.deleteMany({
                where: { getPass: { tenantId: { in: tenantIds } } },
            });
            await prisma.getPass.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.stockBalance.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.docSequence.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.periodClose.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.item.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        }
        if (userId) await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    }
});
