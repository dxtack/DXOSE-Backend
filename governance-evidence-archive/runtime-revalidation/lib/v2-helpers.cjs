'use strict';

const fs = require('fs');
const path = require('path');
const { apiRequest, getSession } = require('../../../OSE-backend/scripts/closeout-runtime-audit/lib/http');
const prisma = require('../../../OSE-backend/src/config/database');
const { resolvePublishedWorkflowChain } = require('../../../OSE-backend/src/engines/workflow-resolution.engine');

const TAG = 'HEAD_RT_V2';
const PASS = 'CloseoutAudit@123';
const DISPOSABLE_SLUG = 'closeout-audit-hotel-disposable';

async function tokenFor(email, tenantSlug, password = PASS) {
  const s = await getSession(process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`, { email, password }, tenantSlug);
  return s.ok ? { token: s.token, permissions: s.permissions || s.user?.permissions || [], user: s.user } : null;
}

async function snapshotAssignment(userId, tenantId) {
  const assignments = await prisma.urUserAssignment.findMany({
    where: { userId },
    include: {
      properties: { include: { property: { select: { id: true, slug: true } } } },
      departments: true,
    },
  });
  const member = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { role: { select: { code: true } } },
  });
  return {
    userId,
    tenantId,
    tenantMemberActive: member?.isActive ?? null,
    roleCode: member?.role?.code ?? null,
    assignments: assignments.map((a) => ({
      id: a.id,
      isActive: a.isActive,
      notes: a.notes,
      propertyIds: a.properties.map((p) => p.propertyId),
      propertySlugs: a.properties.map((p) => p.property?.slug),
      departmentIds: a.departments.map((d) => d.departmentId),
    })),
    hasActiveAssignmentForTenant: assignments.some(
      (a) => a.isActive && a.properties.some((p) => p.propertyId === tenantId),
    ),
  };
}

async function createTaggedUser(tenantId, suffix, roleCode, { assignmentActive = null, departmentId = null, propertyId = null } = {}) {
  const email = `${TAG.toLowerCase()}-${suffix}@head-rt-v2.local`;
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Role missing: ${roleCode}`);

  let user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    const bcrypt = require('bcryptjs');
    user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASS, 10), firstName: TAG, lastName: suffix, isActive: true },
    });
  }

  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    create: { tenantId, userId: user.id, roleId: role.id, isActive: true },
    update: { roleId: role.id, isActive: true },
  });

  await prisma.urUserAssignment.deleteMany({ where: { userId: user.id, notes: { startsWith: TAG } } });
  if (assignmentActive !== null) {
    const assignment = await prisma.urUserAssignment.create({
      data: { userId: user.id, roleId: role.id, isActive: assignmentActive, notes: `${TAG} ${suffix}` },
    });
    await prisma.urAssignmentProperty.create({
      data: { assignmentId: assignment.id, propertyId: propertyId || tenantId },
    });
    if (departmentId) {
      await prisma.urAssignmentDepartment.create({ data: { assignmentId: assignment.id, departmentId } });
    }
  }
  return user;
}

async function ensureDisposableStock(tenantId) {
  let dept = await prisma.department.findFirst({ where: { tenantId, code: 'FB' } });
  if (!dept) dept = await prisma.department.create({ data: { tenantId, code: 'FB', name: `${TAG} FB`, isActive: true } });
  let loc = await prisma.location.findFirst({ where: { tenantId, departmentId: dept.id, isActive: true } });
  if (!loc) loc = await prisma.location.create({ data: { tenantId, departmentId: dept.id, name: `${TAG} Store`, type: 'MAIN_STORE', isActive: true } });
  let item = await prisma.item.findFirst({ where: { tenantId, isActive: true } });
  if (!item) item = await prisma.item.create({ data: { tenantId, name: `${TAG} Item`, code: `${TAG}-IT`, isActive: true } });
  let unit = await prisma.unit.findFirst({ where: { tenantId } });
  if (!unit) unit = await prisma.unit.create({ data: { tenantId, name: 'EA', abbreviation: 'EA', isActive: true } });
  let supplier = await prisma.supplier.findFirst({ where: { tenantId } });
  if (!supplier) supplier = await prisma.supplier.create({ data: { tenantId, name: `${TAG} Supplier`, isActive: true } });
  await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand: 200, wacUnitCost: 5 },
    update: { qtyOnHand: 200 },
  });
  return { dept, loc, item, unit, supplier };
}

async function createGpDraft(api, tenant, dept, loc, item, creatorTok, suffix) {
  const body = {
    transferType: 'PERMANENT',
    borrowingEntity: `${TAG} ${suffix}`,
    departmentId: dept.id,
    reason: `${TAG} ${suffix}`,
    lines: [{ itemId: item.id, locationId: loc.id, qty: 1, conditionOut: 'GOOD' }],
  };
  const r = await apiRequest(api, 'POST', '/get-passes', body, creatorTok);
  return { res: r, id: r.data?.data?.id, ver: r.data?.data?.concurrencyVersion, status: r.data?.data?.status };
}

async function resolveEffectiveWorkflow(moduleKey, tenantId) {
  const chain = await resolvePublishedWorkflowChain(moduleKey, tenantId);
  if (!chain) return { tenantId, moduleKey, found: false };
  return {
    tenantId,
    moduleKey,
    found: true,
    versionId: chain.versionId,
    definitionTenantId: chain.tenantId,
    source: chain.tenantId ? 'tenant-specific' : 'global',
    steps: chain.steps.map((s) => s.statusKey || s.status),
    roleCodes: chain.roleCodes,
    hasGM: (chain.steps || []).some((s) => /PENDING_GM|GM/i.test(String(s.statusKey || s.status || ''))),
  };
}

function routeRegistered(res) {
  if (res.status === 404 && typeof res.data === 'string' && /Cannot (GET|POST|PATCH|PUT|DELETE)/i.test(res.data)) return false;
  if (res.status === 404 && res.message && /not found|invalid|uuid|GRN|document|transfer/i.test(String(res.message))) return true;
  return res.status !== 404;
}

module.exports = {
  TAG,
  PASS,
  DISPOSABLE_SLUG,
  tokenFor,
  snapshotAssignment,
  createTaggedUser,
  ensureDisposableStock,
  createGpDraft,
  resolveEffectiveWorkflow,
  routeRegistered,
  prisma,
  apiRequest,
};
