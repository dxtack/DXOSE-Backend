'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { FIXTURE_TAG, HOTEL_A } = require('./constants');
const prisma = require('../../../src/config/database');

const ORG_SLUG = 'closeout-audit-org-disposable';
const CHILD_SLUG = 'closeout-audit-hotel-disposable';
const EMAIL_DOMAIN = 'closeout-audit.local';
const PASSWORD = 'CloseoutAudit@123';

const CHAIN = [
  { statusKey: 'PENDING_DEPT', role: 'DEPT_MANAGER' },
  { statusKey: 'PENDING_COST_CONTROL', role: 'COST_CONTROL' },
  { statusKey: 'PENDING_FINANCE', role: 'FINANCE_MANAGER' },
  { statusKey: 'PENDING_SECURITY', role: 'SECURITY' },
];

async function connectRole(code) {
  const r = await prisma.role.findUnique({ where: { code } });
  return r ? { connect: { id: r.id } } : undefined;
}

async function loadDisposableTenants() {
  const org = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
  const child = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  if (!org || !child) throw new Error('Run 00e-disposable-org-fixture.js first');
  return { org, child };
}

async function getPublishedGetPassVersion(tenantId) {
  const mod = await prisma.accModule.findFirst({ where: { key: 'GET_PASS' } });
  return prisma.accWorkflowVersion.findFirst({
    where: {
      status: 'PUBLISHED',
      definition: { moduleId: mod.id, isActive: true, OR: [{ tenantId }, { tenantId: null }] },
    },
    orderBy: [{ publishedAt: 'desc' }, { versionNumber: 'desc' }],
    include: { definition: { select: { id: true, key: true, tenantId: true } }, steps: { orderBy: { stepOrder: 'asc' } } },
  });
}

async function auditTenantGetPassWorkflow(tenantId) {
  const published = await getPublishedGetPassVersion(tenantId);
  const testDefs = await prisma.accWorkflowDefinition.findMany({
    where: { tenantId, key: { contains: 'closeout' } },
    include: { versions: true },
  });
  const pinnedTestDocs = published
    ? await prisma.getPass.findMany({
        where: { tenantId, accWorkflowVersionId: { not: published.id } },
        select: { id: true, passNo: true, accWorkflowVersionId: true, status: true },
        take: 20,
      })
    : [];
  return { published, testDefinitions: testDefs, nonStandardPinnedDocs: pinnedTestDocs };
}

async function ensureDisposableStock(tenantId) {
  let dept = await prisma.department.findFirst({ where: { tenantId, code: 'FB' } });
  if (!dept) {
    dept = await prisma.department.create({
      data: { tenantId, code: 'FB', name: `${FIXTURE_TAG} FB`, isActive: true },
    });
  }
  let loc = await prisma.location.findFirst({ where: { tenantId, departmentId: dept.id, isActive: true } });
  if (!loc) {
    loc = await prisma.location.create({
      data: {
        tenantId,
        departmentId: dept.id,
        name: `${FIXTURE_TAG} Store`,
        type: 'MAIN_STORE',
        isActive: true,
      },
    });
  }
  let item = await prisma.item.findFirst({ where: { tenantId, isActive: true } });
  if (!item) {
    item = await prisma.item.findFirst({ where: { tenantId: HOTEL_A.id, isActive: true } });
    if (item) {
      item = await prisma.item.create({
        data: {
          tenantId,
          name: item.name,
          code: `CLOSEOUT-COPY-${Date.now()}`,
          isActive: true,
          unitPrice: item.unitPrice || 1,
          defaultStoreId: loc.id,
          departmentId: dept.id,
        },
      });
    } else {
      item = await prisma.item.create({
        data: {
          tenantId,
          name: `${FIXTURE_TAG} Item`,
          code: `CLOSEOUT-${Date.now()}`,
          isActive: true,
          unitPrice: 1,
          defaultStoreId: loc.id,
          departmentId: dept.id,
        },
      });
    }
  }
  const bal = await prisma.stockBalance.upsert({
    where: { tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: loc.id } },
    update: { qtyOnHand: 50 },
    create: { tenantId, itemId: item.id, locationId: loc.id, qtyOnHand: 50, wacUnitCost: 1 },
  });
  return {
    departmentId: dept.id,
    locationId: loc.id,
    itemId: item.id,
    qtyOnHand: Number(bal.qtyOnHand),
    unitCost: 1,
  };
}

async function seedConstitutionWorkflow(tenantId, defKey = 'closeout-constitution-get-pass') {
  const mod = await prisma.accModule.findFirst({ where: { key: 'GET_PASS' } });
  let def = await prisma.accWorkflowDefinition.findFirst({ where: { moduleId: mod.id, tenantId, key: defKey } });
  if (!def) {
    def = await prisma.accWorkflowDefinition.create({
      data: { moduleId: mod.id, tenantId, key: defKey, name: `${FIXTURE_TAG} Constitution GP`, isActive: true },
    });
  }
  await prisma.accWorkflowVersion.updateMany({
    where: { definitionId: def.id, status: 'PUBLISHED' },
    data: { status: 'DRAFT' },
  });
  const ver = await prisma.accWorkflowVersion.create({
    data: {
      definitionId: def.id,
      versionNumber: 9000 + Math.floor(Math.random() * 999),
      status: 'PUBLISHED',
      publishedAt: new Date(),
      notes: FIXTURE_TAG,
      steps: {
        create: await Promise.all(
          CHAIN.map(async (c, i) => ({
            stepOrder: i + 1,
            label: c.statusKey,
            statusKey: c.statusKey,
            approverRole: await connectRole(c.role),
          })),
        ),
      },
    },
    include: { steps: true },
  });
  return { definitionId: def.id, versionId: ver.id, versionNumber: ver.versionNumber, publishedAt: ver.publishedAt };
}

async function cleanupConstitutionWorkflow(definitionId) {
  const docs = await prisma.getPass.findMany({
    where: { accWorkflowVersion: { definitionId } },
    select: { id: true },
  });
  if (docs.length) {
    await prisma.getPassLine.deleteMany({ where: { getPassId: { in: docs.map((d) => d.id) } } });
    await prisma.getPass.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  }
  await prisma.accWorkflowVersion.deleteMany({ where: { definitionId } });
  await prisma.accWorkflowDefinition.delete({ where: { id: definitionId } }).catch(() => {});
  return { deletedDocs: docs.length };
}

async function upsertDisposableUser({ email, roleCode, tenantId, departmentId, skipUrAssignment = false, urActive = true }) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true },
    create: { email, passwordHash: hash, isActive: true, firstName: 'Closeout', lastName: roleCode },
  });
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: { roleId: role.id, isActive: true, departmentId: departmentId || null },
    create: { tenantId, userId: user.id, roleId: role.id, isActive: true, departmentId: departmentId || null },
  });
  if (!skipUrAssignment) {
    let a = await prisma.urUserAssignment.findFirst({ where: { userId: user.id, notes: { startsWith: FIXTURE_TAG } } });
    if (!a) {
      a = await prisma.urUserAssignment.create({
        data: { userId: user.id, roleId: role.id, isActive: urActive, notes: `${FIXTURE_TAG} ${roleCode} disposable` },
      });
      await prisma.urAssignmentProperty.create({ data: { assignmentId: a.id, propertyId: tenantId } });
      if (departmentId) await prisma.urAssignmentDepartment.create({ data: { assignmentId: a.id, departmentId } });
    }
  }
  return { email, password: PASSWORD, userId: user.id };
}

async function ensureDisposableOrgManager() {
  const { org, child } = await loadDisposableTenants();
  const ident = await upsertDisposableUser({
    email: `org-mgr-disposable@${EMAIL_DOMAIN}`,
    roleCode: 'ORG_MANAGER',
    tenantId: org.id,
  });
  const a = await prisma.urUserAssignment.findFirst({ where: { userId: ident.userId, notes: { startsWith: FIXTURE_TAG } } });
  if (a) {
    await prisma.urAssignmentProperty.upsert({
      where: { assignmentId_propertyId: { assignmentId: a.id, propertyId: child.id } },
      update: {},
      create: { assignmentId: a.id, propertyId: child.id },
    });
  }
  return { ...ident, orgSlug: org.slug, childSlug: child.slug, orgId: org.id, childId: child.id };
}

function gpPayload(stock, deptId, tag = FIXTURE_TAG) {
  return {
    transferType: 'PERMANENT',
    borrowingEntity: `${tag} borrower`,
    departmentId: deptId,
    reason: tag,
    lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
  };
}

async function assertGrandHorizonUnchanged(beforeGh) {
  const after = await prisma.tenant.findUnique({
    where: { id: HOTEL_A.id },
    select: { id: true, slug: true, parentId: true },
  });
  const audit = await auditTenantGetPassWorkflow(HOTEL_A.id);
  return {
    parentIdUnchanged: beforeGh?.parentId === after?.parentId,
    after,
    testDefinitionsRemaining: audit.testDefinitions.length,
    globalPublishedUnchanged: true,
    audit,
  };
}

module.exports = {
  ORG_SLUG,
  CHILD_SLUG,
  EMAIL_DOMAIN,
  PASSWORD,
  CHAIN,
  prisma,
  loadDisposableTenants,
  getPublishedGetPassVersion,
  auditTenantGetPassWorkflow,
  ensureDisposableStock,
  seedConstitutionWorkflow,
  cleanupConstitutionWorkflow,
  upsertDisposableUser,
  ensureDisposableOrgManager,
  gpPayload,
  assertGrandHorizonUnchanged,
};
