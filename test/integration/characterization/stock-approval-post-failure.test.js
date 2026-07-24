'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const postingService = require('../../../src/services/posting.service');
const stockReportService = require('../../../src/services/stockReport.service');
const stockCountService = require('../../../src/services/stockCount.service');
const { resolveWorkflowForDocument } = require('../../../src/services/acc-workflow-runtime.service');

const TRANSIENT_FAILURE = 'injected transient posting failure';

function rejectedCount(results) {
    return results.filter((result) => result.status === 'rejected').length;
}

test('final stock approval is restored when posting fails before effects', async () => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    const originalPostStockReport = postingService.postStockReport;
    const originalPostStockCount = postingService.postStockCount;
    const previousLegacyFlag = process.env.ALLOW_LEGACY_STOCK_COUNT_MUTATIONS;
    let tenantId;
    let userId;

    try {
        const tenant = await prisma.tenant.create({
            data: {
                name: `Stock Approval Failure ${runContext.runId}`,
                slug: runContext.tenantSlug,
            },
        });
        tenantId = tenant.id;
        const user = await prisma.user.create({
            data: {
                email: runContext.integrationEmail('stock-approval-failure'),
                passwordHash: 'integration-test-not-used',
                firstName: 'Stock',
                lastName: 'Approver',
            },
        });
        userId = user.id;
        const location = await prisma.location.create({
            data: { tenantId, name: `Stock Approval Location ${runContext.runId}` },
        });

        const reportRequest = await prisma.approvalRequest.create({
            data: {
                tenantId,
                requestType: 'STOCK_REPORT',
                status: 'PENDING',
                currentStep: 1,
                totalSteps: 1,
                createdBy: userId,
            },
        });
        const report = await prisma.savedStockReport.create({
            data: {
                tenantId,
                reportNo: `IT-SR-FAIL-${runContext.runId}`,
                locationId: location.id,
                status: 'PENDING_APPROVAL',
                createdBy: userId,
                approvalRequestId: reportRequest.id,
            },
        });

        const chain = await resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
        const finalChainStep = chain.steps.at(-1);
        const finalRoleCode = finalChainStep?.roleCode;
        const finalStatus = finalChainStep?.statusKey;
        if (!chain.versionId || !finalRoleCode || !finalStatus) {
            throw new Error('Test environment has no complete published STOCK_COUNT workflow.');
        }
        if (!['PENDING_FINANCE', 'PENDING_GM', 'PENDING_APPROVAL', 'FINANCE_APPROVED'].includes(finalStatus)) {
            throw new Error(`Unsupported legacy final count status in test environment: ${finalStatus}`);
        }
        const finalRole = await prisma.role.findFirst({ where: { code: finalRoleCode } });
        if (!finalRole) {
            throw new Error(`Test environment is missing workflow role: ${finalRoleCode}`);
        }

        const countRequest = await prisma.approvalRequest.create({
            data: {
                tenantId,
                requestType: 'COUNT_ADJUSTMENT',
                status: 'PENDING',
                currentStep: 1,
                totalSteps: 1,
                createdBy: userId,
                accWorkflowVersionId: chain.versionId,
                steps: {
                    create: {
                        stepNumber: 1,
                        requiredRoleId: finalRole.id,
                        status: 'PENDING',
                    },
                },
            },
        });
        const session = await prisma.stockCountSession.create({
            data: {
                tenantId,
                locationId: location.id,
                sessionNo: `IT-LC-FAIL-${runContext.runId}`,
                createdBy: userId,
                status: finalStatus,
                approvalRequestId: countRequest.id,
            },
        });

        const observed = {};
        postingService.postStockReport = async () => {
            const [requestState, reportState, ledgerRows] = await Promise.all([
                prisma.approvalRequest.findUnique({ where: { id: reportRequest.id } }),
                prisma.savedStockReport.findUnique({ where: { id: report.id } }),
                prisma.inventoryLedger.count({
                    where: { tenantId, referenceId: report.id },
                }),
            ]);
            observed.report = {
                requestStatus: requestState.status,
                documentStatus: reportState.status,
                ledgerRows,
            };
            throw Object.assign(new Error(TRANSIENT_FAILURE), { code: 'INJECTED_TRANSIENT_DB_FAILURE' });
        };
        postingService.postStockCount = async () => {
            const [requestState, stepState, sessionState, ledgerRows] = await Promise.all([
                prisma.approvalRequest.findUnique({ where: { id: countRequest.id } }),
                prisma.approvalStep.findFirst({ where: { requestId: countRequest.id } }),
                prisma.stockCountSession.findUnique({ where: { id: session.id } }),
                prisma.inventoryLedger.count({
                    where: { tenantId, referenceId: session.id },
                }),
            ]);
            observed.count = {
                requestStatus: requestState.status,
                stepStatus: stepState.status,
                documentStatus: sessionState.status,
                ledgerRows,
            };
            throw Object.assign(new Error(TRANSIENT_FAILURE), { code: 'INJECTED_TRANSIENT_DB_FAILURE' });
        };

        process.env.ALLOW_LEGACY_STOCK_COUNT_MUTATIONS = '1';
        const results = await Promise.allSettled([
            stockReportService.processApproval(report.id, tenantId, userId, 'APPROVE'),
            stockCountService.processApproval(
                session.id,
                tenantId,
                {
                    id: userId,
                    role: finalRoleCode,
                    permissions: ['APPROVE_INVENTORY_COUNT'],
                },
                'final approval',
                true,
            ),
        ]);

        const [reportAfter, reportRequestAfter, countAfter, countRequestAfter, countStepAfter] =
            await Promise.all([
                prisma.savedStockReport.findUnique({ where: { id: report.id } }),
                prisma.approvalRequest.findUnique({ where: { id: reportRequest.id } }),
                prisma.stockCountSession.findUnique({ where: { id: session.id } }),
                prisma.approvalRequest.findUnique({ where: { id: countRequest.id } }),
                prisma.approvalStep.findFirst({ where: { requestId: countRequest.id } }),
            ]);
        const ledgerRows = await prisma.inventoryLedger.count({ where: { tenantId } });
        const proof = {
            rejectedCalls: rejectedCount(results),
            report: {
                observedAtPosting: observed.report,
                requestStatusAfterFailure: reportRequestAfter.status,
                documentStatusAfterFailure: reportAfter.status,
            },
            legacyCount: {
                observedAtPosting: observed.count,
                requestStatusAfterFailure: countRequestAfter.status,
                stepStatusAfterFailure: countStepAfter.status,
                documentStatusAfterFailure: countAfter.status,
            },
            ledgerRows,
        };
        console.log('[proof] approval-post-failure', JSON.stringify(proof));

        assert.equal(proof.rejectedCalls, 2);
        assert.deepEqual(proof.report.observedAtPosting, {
            requestStatus: 'APPROVED',
            documentStatus: 'PENDING_APPROVAL',
            ledgerRows: 0,
        });
        assert.equal(proof.report.requestStatusAfterFailure, 'PENDING');
        assert.equal(proof.report.documentStatusAfterFailure, 'PENDING_APPROVAL');
        assert.deepEqual(proof.legacyCount.observedAtPosting, {
            requestStatus: 'APPROVED',
            stepStatus: 'APPROVED',
            documentStatus: finalStatus,
            ledgerRows: 0,
        });
        assert.equal(proof.legacyCount.requestStatusAfterFailure, 'PENDING');
        assert.equal(proof.legacyCount.stepStatusAfterFailure, 'PENDING');
        assert.equal(proof.legacyCount.documentStatusAfterFailure, finalStatus);
        assert.equal(proof.ledgerRows, 0);
    } finally {
        postingService.postStockReport = originalPostStockReport;
        postingService.postStockCount = originalPostStockCount;
        if (previousLegacyFlag === undefined) {
            delete process.env.ALLOW_LEGACY_STOCK_COUNT_MUTATIONS;
        } else {
            process.env.ALLOW_LEGACY_STOCK_COUNT_MUTATIONS = previousLegacyFlag;
        }
        if (tenantId) {
            await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
            await prisma.auditLog.deleteMany({ where: { tenantId } });
            await prisma.savedStockReport.deleteMany({ where: { tenantId } });
            await prisma.stockCountSession.deleteMany({ where: { tenantId } });
            await prisma.approvalRequest.deleteMany({ where: { tenantId } });
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } });
        }
        if (userId) {
            await prisma.user.delete({ where: { id: userId } });
        }
        await prisma.$disconnect();
    }
});
