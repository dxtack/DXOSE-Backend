'use strict';

const { API_BASE, HOTEL_A, FIXTURE_TAG } = require('./constants');
const { getSession, login, apiRequest } = require('./http');
const { loadUserInvestigation, prisma } = require('./investigate-user');

const PASSWORD = 'CloseoutAudit@123';

const USER_BY_CASE = {
  never_assigned: 'never-assigned@closeout-audit.local',
  deleted_assignment: 'deleted-assign@closeout-audit.local',
  no_assign_inactive_ur: 'no-assign@closeout-audit.local',
  inactive_assignment: 'inactive-assign@closeout-audit.local',
  wrong_property: 'wrong-property@closeout-audit.local',
  dept_fb: 'dept-mgr-fb@closeout-audit.local',
};

async function resolveJwtSession(caseKey) {
  const email = USER_BY_CASE[caseKey] || USER_BY_CASE.never_assigned;
  const inv = await loadUserInvestigation(email, HOTEL_A.id);
  let stale = false;
  let refreshRejected = null;
  let token;

  if (caseKey === 'stale_after_deactivate' || caseKey === 'fresh_after_deactivate') {
    token = (await getSession(API_BASE, { email, password: PASSWORD }, HOTEL_A.slug)).token;
    await prisma.urUserAssignment.updateMany({ where: { userId: inv.userId }, data: { isActive: false } });
    await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
    if (caseKey === 'fresh_after_deactivate') {
      const loginRes = await login(API_BASE, email, PASSWORD, HOTEL_A.slug);
      token = loginRes.data?.data?.accessToken;
      stale = false;
    } else stale = true;
  } else if (caseKey === 'stale_after_delete' || caseKey === 'fresh_after_delete') {
    token = (await getSession(API_BASE, { email, password: PASSWORD }, HOTEL_A.slug)).token;
    await prisma.urUserAssignment.deleteMany({ where: { userId: inv.userId, notes: { startsWith: FIXTURE_TAG } } });
    await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
    if (caseKey === 'fresh_after_delete') {
      token = (await login(API_BASE, email, PASSWORD, HOTEL_A.slug)).data?.data?.accessToken;
      stale = false;
    } else stale = true;
  } else if (caseKey === 'stale_after_property_move' || caseKey === 'fresh_after_property_move') {
    token = (await getSession(API_BASE, { email, password: PASSWORD }, HOTEL_A.slug)).token;
    const hotelB = await prisma.tenant.findFirst({ where: { slug: 'dx-airport-hotel' } });
    const a = await prisma.urUserAssignment.findFirst({ where: { userId: inv.userId, notes: { startsWith: FIXTURE_TAG } } });
    if (a && hotelB) {
      await prisma.urAssignmentProperty.deleteMany({ where: { assignmentId: a.id, propertyId: HOTEL_A.id } });
      await prisma.urAssignmentProperty.upsert({
        where: { assignmentId_propertyId: { assignmentId: a.id, propertyId: hotelB.id } },
        update: {},
        create: { assignmentId: a.id, propertyId: hotelB.id },
      });
      await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
    }
    if (caseKey === 'fresh_after_property_move') {
      token = (await login(API_BASE, email, PASSWORD, HOTEL_A.slug)).data?.data?.accessToken;
      stale = false;
    } else stale = true;
  } else if (caseKey === 'refresh_after_bump') {
    token = (await getSession(API_BASE, { email, password: PASSWORD }, HOTEL_A.slug)).token;
    await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
    const refresh = await apiRequest(API_BASE, 'POST', '/auth/refresh', {}, token);
    refreshRejected = refresh.status === 401 || refresh.status === 403;
    stale = true;
  } else if (caseKey === 'tenant_switch_after_removal') {
    token = (await getSession(API_BASE, { email, password: PASSWORD }, HOTEL_A.slug)).token;
    await prisma.urUserAssignment.updateMany({ where: { userId: inv.userId }, data: { isActive: false } });
    await prisma.user.update({ where: { id: inv.userId }, data: { permissionVersion: { increment: 1 } } });
    stale = true;
  } else {
    token = (await getSession(API_BASE, { email, password: PASSWORD }, HOTEL_A.slug)).token;
  }

  const invAfter = await loadUserInvestigation(email, HOTEL_A.id);
  return {
    token,
    stale,
    email,
    refreshRejected,
    permissionVersionBefore: inv.permissionVersion,
    permissionVersionAfter: invAfter.permissionVersion,
    permissionVersionIncremented: invAfter.permissionVersion > inv.permissionVersion,
    activeAssignments: invAfter.assignments || [],
  };
}

function verdictForRead({ http, returnedCount, mutation, expectedDeny }) {
  if (mutation && expectedDeny) return 'FAIL';
  if (http >= 200 && http < 300 && returnedCount > 0 && expectedDeny) return 'FAIL';
  if (http === 403 || http === 401) return 'PASS';
  if (http >= 200 && http < 300 && returnedCount === 0) return 'PASS';
  if (http === 404 && returnedCount === 0) return 'PASS';
  return mutation ? 'FAIL' : 'PASS';
}

function verdictForMutation({ http, mutation, expectedDeny }) {
  if (expectedDeny && mutation) return 'FAIL';
  if (expectedDeny && http === 403 && !mutation) return 'PASS';
  if (expectedDeny && (http === 409 || http === 400 || http === 422) && !mutation) return 'PASS';
  if (!expectedDeny && http >= 200 && http < 300) return 'PASS';
  return expectedDeny ? 'PASS' : 'FAIL';
}

module.exports = { resolveJwtSession, verdictForRead, verdictForMutation, PASSWORD, USER_BY_CASE };
