'use strict';

const prisma = require('../../../src/config/database');
const { resolveScopeContext } = require('../../../src/services/scope/scopeContext');

async function loadUserInvestigation(email, tenantId) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      isActive: true,
      permissionVersion: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!user) return { email, error: 'user_not_found' };

  const tenantMembers = await prisma.tenantMember.findMany({
    where: { userId: user.id },
    include: {
      role: { select: { code: true, name: true } },
      tenant: { select: { id: true, slug: true } },
      department: { select: { id: true, code: true } },
    },
  });

  const assignments = await prisma.urUserAssignment.findMany({
    where: { userId: user.id },
    include: {
      role: { select: { code: true } },
      properties: { include: { property: { select: { id: true, slug: true } } } },
      departments: { include: { department: { select: { id: true, code: true } } } },
    },
  });

  const tmForTenant = tenantMembers.find((m) => m.tenantId === tenantId && m.isActive);

  let scope = null;
  if (tmForTenant) {
    const scopeUser = {
      id: user.id,
      role: tmForTenant.role?.code,
      departmentId: tmForTenant.departmentId,
    };
    scope = await resolveScopeContext(scopeUser, tenantId);
  }

  return {
    userId: user.id,
    email: user.email,
    isActive: user.isActive,
    permissionVersion: user.permissionVersion,
    tenantMemberForTenant: tmForTenant
      ? {
          id: tmForTenant.id,
          tenantId: tmForTenant.tenantId,
          roleCode: tmForTenant.role?.code,
          departmentId: tmForTenant.departmentId,
          isActive: tmForTenant.isActive,
        }
      : null,
    allTenantMembers: tenantMembers.map((m) => ({
      tenantSlug: m.tenant?.slug,
      roleCode: m.role?.code,
      isActive: m.isActive,
      departmentId: m.departmentId,
    })),
    urUserAssignments: assignments.map((a) => ({
      id: a.id,
      isActive: a.isActive,
      roleCode: a.role?.code,
      notes: a.notes,
      properties: a.properties.map((p) => p.property?.slug || p.propertyId),
      departments: a.departments.map((d) => d.department?.code || d.departmentId),
    })),
    resolveScopeContext: scope,
    emptyAssignmentScopeUsed:
      scope?.scopeLabel === 'No ACC scope assignment' ||
      scope?.allowedLocationIds?.length === 0 && !scope?.isTenantWide,
  };
}

module.exports = { loadUserInvestigation, prisma };
