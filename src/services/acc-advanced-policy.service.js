'use strict';

/**
 * ACC Advanced Policies — configuration service (Stage S12).
 * Field security, user exceptions, scheduled access. No runtime enforcement.
 */

const prisma = require('../config/database');
const { AuditAction } = require('../engines/ur-audit.logger');

class PolicyConfigError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function _audit(actorId, action, targetEntityId, entityType, newValue, targetUserId = null) {
  if (!actorId) return;
  try {
    await prisma.urAuditEvent.create({
      data: {
        actorId,
        action,
        targetUserId,
        targetEntityId,
        entityType,
        newValue,
      },
    });
  } catch (err) {
    process.stderr.write(`[acc-advanced-policy] audit failed: ${err?.message ?? err}\n`);
  }
}

const listFieldSecurityRules = async ({ tenantId = null, resourceCode = null } = {}) => {
  return prisma.accFieldSecurityRule.findMany({
    where: {
      ...(tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : {}),
      ...(resourceCode ? { resourceCode } : {}),
    },
    orderBy: [{ resourceCode: 'asc' }, { fieldKey: 'asc' }],
    include: {
      role: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
};

const createFieldSecurityRule = async (dto, actorId) => {
  if (!dto.resourceCode?.trim() || !dto.fieldKey?.trim()) {
    throw new PolicyConfigError('resourceCode and fieldKey are required.');
  }
  if (!dto.roleId && !dto.userId) {
    throw new PolicyConfigError('Either roleId or userId is required.');
  }
  const row = await prisma.accFieldSecurityRule.create({
    data: {
      tenantId: dto.tenantId ?? null,
      roleId: dto.roleId ?? null,
      userId: dto.userId ?? null,
      resourceCode: String(dto.resourceCode).trim().toUpperCase(),
      fieldKey: String(dto.fieldKey).trim(),
      accessLevel: dto.accessLevel ?? 'READ_ONLY',
      reason: dto.reason?.trim() || null,
      isActive: dto.isActive !== false,
    },
  });
  await _audit(actorId, AuditAction.FIELD_SECURITY_CONFIGURED, row.id, 'AccFieldSecurityRule', row, dto.userId);
  return row;
};

const updateFieldSecurityRule = async (id, dto, actorId) => {
  const existing = await prisma.accFieldSecurityRule.findUnique({ where: { id } });
  if (!existing) throw new PolicyConfigError('Field security rule not found.', 404);
  const row = await prisma.accFieldSecurityRule.update({
    where: { id },
    data: {
      ...(dto.accessLevel != null ? { accessLevel: dto.accessLevel } : {}),
      ...(dto.reason !== undefined ? { reason: dto.reason?.trim() || null } : {}),
      ...(dto.isActive != null ? { isActive: !!dto.isActive } : {}),
    },
  });
  await _audit(actorId, AuditAction.FIELD_SECURITY_CONFIGURED, row.id, 'AccFieldSecurityRule', row, row.userId);
  return row;
};

const deleteFieldSecurityRule = async (id, actorId) => {
  const existing = await prisma.accFieldSecurityRule.findUnique({ where: { id } });
  if (!existing) throw new PolicyConfigError('Field security rule not found.', 404);
  await prisma.accFieldSecurityRule.delete({ where: { id } });
  await _audit(actorId, AuditAction.FIELD_SECURITY_CONFIGURED, id, 'AccFieldSecurityRule', { deleted: true, id }, existing.userId);
};

const listUserExceptions = async ({ userId = null } = {}) => {
  return prisma.accUserException.findMany({
    where: {
      ...(userId ? { userId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      permission: { select: { id: true, legacyCode: true, name: true } },
    },
  });
};

const createUserException = async (dto, actorId) => {
  if (!dto.userId || !dto.exceptionType) {
    throw new PolicyConfigError('userId and exceptionType are required.');
  }
  const row = await prisma.accUserException.create({
    data: {
      userId: dto.userId,
      assignmentId: dto.assignmentId ?? null,
      exceptionType: dto.exceptionType,
      permissionId: dto.permissionId ?? null,
      resourceCode: dto.resourceCode?.trim() || null,
      fieldKey: dto.fieldKey?.trim() || null,
      payload: dto.payload ?? null,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      reason: dto.reason?.trim() || null,
      isActive: dto.isActive !== false,
    },
  });
  await _audit(actorId, AuditAction.USER_EXCEPTION_CONFIGURED, row.id, 'AccUserException', row, row.userId);
  return row;
};

const updateUserException = async (id, dto, actorId) => {
  const existing = await prisma.accUserException.findUnique({ where: { id } });
  if (!existing) throw new PolicyConfigError('User exception not found.', 404);
  const row = await prisma.accUserException.update({
    where: { id },
    data: {
      ...(dto.reason !== undefined ? { reason: dto.reason?.trim() || null } : {}),
      ...(dto.isActive != null ? { isActive: !!dto.isActive } : {}),
      ...(dto.effectiveFrom !== undefined
        ? { effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null }
        : {}),
      ...(dto.effectiveTo !== undefined
        ? { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }
        : {}),
    },
  });
  await _audit(actorId, AuditAction.USER_EXCEPTION_CONFIGURED, row.id, 'AccUserException', row, row.userId);
  return row;
};

const deleteUserException = async (id, actorId) => {
  const existing = await prisma.accUserException.findUnique({ where: { id } });
  if (!existing) throw new PolicyConfigError('User exception not found.', 404);
  await prisma.accUserException.delete({ where: { id } });
  await _audit(actorId, AuditAction.USER_EXCEPTION_CONFIGURED, id, 'AccUserException', { deleted: true, id }, existing.userId);
};

const listScheduledAccess = async ({ tenantId = null, userId = null } = {}) => {
  return prisma.accScheduledAccess.findMany({
    where: {
      ...(tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: [{ label: 'asc' }],
    include: {
      role: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
};

const createScheduledAccess = async (dto, actorId) => {
  if (!dto.label?.trim()) throw new PolicyConfigError('label is required.');
  if (!Number.isInteger(dto.startMinutes) || !Number.isInteger(dto.endMinutes)) {
    throw new PolicyConfigError('startMinutes and endMinutes are required integers.');
  }
  const row = await prisma.accScheduledAccess.create({
    data: {
      tenantId: dto.tenantId ?? null,
      userId: dto.userId ?? null,
      roleId: dto.roleId ?? null,
      label: String(dto.label).trim(),
      daysOfWeek: Array.isArray(dto.daysOfWeek) ? dto.daysOfWeek : [],
      startMinutes: dto.startMinutes,
      endMinutes: dto.endMinutes,
      timezone: dto.timezone?.trim() || 'UTC',
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      notes: dto.notes?.trim() || null,
      isActive: dto.isActive !== false,
    },
  });
  await _audit(actorId, AuditAction.SCHEDULED_ACCESS_CONFIGURED, row.id, 'AccScheduledAccess', row, row.userId);
  return row;
};

const updateScheduledAccess = async (id, dto, actorId) => {
  const existing = await prisma.accScheduledAccess.findUnique({ where: { id } });
  if (!existing) throw new PolicyConfigError('Scheduled access rule not found.', 404);
  const row = await prisma.accScheduledAccess.update({
    where: { id },
    data: {
      ...(dto.label != null ? { label: String(dto.label).trim() } : {}),
      ...(dto.isActive != null ? { isActive: !!dto.isActive } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      ...(Array.isArray(dto.daysOfWeek) ? { daysOfWeek: dto.daysOfWeek } : {}),
      ...(Number.isInteger(dto.startMinutes) ? { startMinutes: dto.startMinutes } : {}),
      ...(Number.isInteger(dto.endMinutes) ? { endMinutes: dto.endMinutes } : {}),
    },
  });
  await _audit(actorId, AuditAction.SCHEDULED_ACCESS_CONFIGURED, row.id, 'AccScheduledAccess', row, row.userId);
  return row;
};

const deleteScheduledAccess = async (id, actorId) => {
  const existing = await prisma.accScheduledAccess.findUnique({ where: { id } });
  if (!existing) throw new PolicyConfigError('Scheduled access rule not found.', 404);
  await prisma.accScheduledAccess.delete({ where: { id } });
  await _audit(actorId, AuditAction.SCHEDULED_ACCESS_CONFIGURED, id, 'AccScheduledAccess', { deleted: true, id }, existing.userId);
};

const getSummary = async () => {
  const [fieldSecurity, userExceptions, scheduledAccess] = await Promise.all([
    prisma.accFieldSecurityRule.count({ where: { isActive: true } }),
    prisma.accUserException.count({ where: { isActive: true } }),
    prisma.accScheduledAccess.count({ where: { isActive: true } }),
  ]);
  return { fieldSecurity, userExceptions, scheduledAccess };
};

module.exports = {
  PolicyConfigError,
  listFieldSecurityRules,
  createFieldSecurityRule,
  updateFieldSecurityRule,
  deleteFieldSecurityRule,
  listUserExceptions,
  createUserException,
  updateUserException,
  deleteUserException,
  listScheduledAccess,
  createScheduledAccess,
  updateScheduledAccess,
  deleteScheduledAccess,
  getSummary,
};
