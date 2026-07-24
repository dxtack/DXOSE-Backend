'use strict';

/**
 * Shared ApprovalRequest factory — ACC workflow steps from published/pinned chain.
 */

const prisma = require('../config/database');
const { approvalRequestVersionPin } = require('./acc-workflow-runtime.service');

async function connectRole(roleCode) {
  const code = String(roleCode || '').trim().toUpperCase();
  const role = await prisma.role.findUnique({ where: { code } });
  if (!role) {
    const err = new Error(`Role not found: ${code}`);
    err.statusCode = 422;
    throw err;
  }
  return { connect: { id: role.id } };
}

async function createAccApprovalRequestInTx(tx, {
  tenantId,
  requestType,
  createdBy,
  chain,
  totalSteps,
  currentStep = 1,
  extraData = {},
}) {
  const roleCodes = chain.roleCodes || [];
  const steps = chain.steps || [];

  return tx.approvalRequest.create({
    data: {
      tenantId,
      requestType,
      status: 'PENDING',
      currentStep,
      totalSteps: totalSteps ?? roleCodes.length,
      createdBy,
      ...approvalRequestVersionPin(chain),
      ...extraData,
      steps: {
        create: await Promise.all(
          roleCodes.map(async (roleCode, index) => ({
            stepNumber: index + 1,
            requiredRole: await connectRole(roleCode),
            status: index + 1 < currentStep ? 'APPROVED' : 'PENDING',
          })),
        ),
      },
    },
    include: { steps: { include: { requiredRole: { select: { code: true } } } } },
  });
}

module.exports = {
  connectRole,
  createAccApprovalRequestInTx,
};
