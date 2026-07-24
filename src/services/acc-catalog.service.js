'use strict';

/**
 * P21 — ACC Catalog runtime (UrResource / UrAction / UrPermission CRUD).
 */

const prisma = require('../config/database');

class CatalogError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const listResources = async () => prisma.urResource.findMany({
  orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }, { code: 'asc' }],
});

const listActions = async () => prisma.urAction.findMany({
  orderBy: [{ code: 'asc' }],
});

const listPermissions = async () => prisma.urPermission.findMany({
  include: {
    resource: { select: { code: true, name: true, category: true } },
    action: { select: { code: true, name: true } },
  },
  orderBy: [{ legacyCode: 'asc' }],
});

const createPermission = async ({ resourceCode, actionCode, legacyCode, name, description }) => {
  const rc = String(resourceCode || '').trim().toUpperCase();
  const ac = String(actionCode || '').trim().toUpperCase();
  const lc = String(legacyCode || '').trim().toUpperCase();
  if (!rc || !ac || !lc) {
    throw new CatalogError('resourceCode, actionCode, and legacyCode are required.');
  }

  let resource = await prisma.urResource.findUnique({ where: { code: rc } });
  if (!resource) {
    resource = await prisma.urResource.create({
      data: { code: rc, name: rc, category: 'Custom', displayOrder: 999 },
    });
  }

  let action = await prisma.urAction.findUnique({ where: { code: ac } });
  if (!action) {
    action = await prisma.urAction.create({
      data: { code: ac, name: ac },
    });
  }

  const existing = await prisma.urPermission.findUnique({ where: { legacyCode: lc } });
  if (existing) throw new CatalogError(`Permission ${lc} already exists.`, 409);

  return prisma.urPermission.create({
    data: {
      resourceId: resource.id,
      actionId: action.id,
      legacyCode: lc,
      name: name?.trim() || lc,
      description: description?.trim() || null,
    },
    include: {
      resource: { select: { code: true, name: true } },
      action: { select: { code: true, name: true } },
    },
  });
};

module.exports = {
  CatalogError,
  listResources,
  listActions,
  listPermissions,
  createPermission,
};
