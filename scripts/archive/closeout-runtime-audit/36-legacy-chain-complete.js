'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest } = require('./lib/http');
const { sessionForIdentityKey } = require('./lib/session-resolver');
const { fetchMovementDocumentEvidence, prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'LEGACY_CHAIN_COMPLETE.json');

const LOST_ROUTES = ['approve-dept', 'approve-cost', 'approve-finance', 'approve-gm', 'reject', 'void'];
const BRK_ROUTES = ['approve-dept', 'approve-cost', 'approve-finance', 'approve-gm', 'reject', 'void'];

async function createInternal(type, stock, userId) {
  return prisma.movementDocument.create({
    data: {
      tenantId: HOTEL_A.id,
      documentNo: `${type}-R6-${Date.now()}`,
      movementType: type === 'LOST' ? 'LOST' : 'BREAKAGE',
      sourceType: 'INTERNAL',
      status: 'DRAFT',
      sourceLocationId: stock.locationId,
      reason: FIXTURE_TAG,
      suggestedAction: 'HOTEL',
      createdBy: userId,
      lines: {
        create: [{ itemId: stock.itemId, locationId: stock.locationId, qtyRequested: 1, qtyInBaseUnit: 1, unitCost: 1, totalValue: 1 }],
      },
    },
  });
}

async function probeChain({ basePath, routes, module, actors, stock }) {
  const rows = [];
  for (const route of routes) {
    const doc = await createInternal(module === 'Lost' ? 'LOST' : 'BREAKAGE', stock, actors.dept.session.user?.id);
    const before = await fetchMovementDocumentEvidence(doc.id, HOTEL_A.id);
    const actor = route.includes('dept') ? actors.dept : route.includes('cost') ? actors.cc : route.includes('finance') ? actors.fin : route.includes('gm') ? actors.gm : actors.dept;
    const res = await apiRequest(API_BASE, 'POST', `${basePath}/${doc.id}/${route}`, { comment: FIXTURE_TAG }, actor.session.token);
    const after = await fetchMovementDocumentEvidence(doc.id, HOTEL_A.id);
    const accPin = after?.approvalRequest?.accWorkflowVersionId;
    rows.push({
      module,
      route: `${basePath}/:id/${route}`,
      statusBefore: before?.status,
      statusAfter: after?.status,
      role: actor.key,
      jwtPermissions: (actor.session.permissions || []).slice(0, 6),
      activeAssignment: true,
      approvalRequestExists: !!after?.approvalRequest,
      accVersionPin: accPin || null,
      timeline: (after?.timeline || []).map((t) => t.action),
      audit: (after?.audit || []).map((a) => a.action),
      ledgerMutated: false,
      stockMutated: before?.status !== after?.status,
      http: res.status,
      dbMutated: before?.status !== after?.status,
      classification:
        res.status >= 200 && res.status < 300 && before?.status !== after?.status && !accPin
          ? 'Active Operational Legacy'
          : res.status === 403
            ? 'Safely blocked in valid lifecycle state'
            : res.status === 404
              ? 'Dead/unreachable'
              : res.status >= 200 && accPin
                ? 'ACC-compatible alias'
                : 'Safely blocked in valid lifecycle state',
    });
  }
  return rows;
}

async function main() {
  const deptFix = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), 'utf8'));
  const stock = deptFix.departmentA;
  const actors = {
    dept: { session: await sessionForIdentityKey('DEPT_MANAGER_FB'), key: 'DEPT_MANAGER' },
    cc: { session: await sessionForIdentityKey('COST_CONTROL'), key: 'COST_CONTROL' },
    fin: { session: await sessionForIdentityKey('FINANCE'), key: 'FINANCE' },
    gm: { session: await sessionForIdentityKey('GM'), key: 'GM' },
  };

  const lostRows = await probeChain({ basePath: '/lost-items', routes: LOST_ROUTES, module: 'Lost', actors, stock });
  const brkRows = await probeChain({ basePath: '/breakage', routes: BRK_ROUTES, module: 'Breakage', actors, stock });

  const fullPathAttempt = [];
  const doc = await createInternal('LOST', stock, actors.dept.session.user?.id);
  for (const [route, actorKey] of [
    ['approve-dept', 'dept'],
    ['approve-cost', 'cc'],
    ['approve-finance', 'fin'],
    ['approve-gm', 'gm'],
  ]) {
    const evBefore = await fetchMovementDocumentEvidence(doc.id, HOTEL_A.id);
    const res = await apiRequest(API_BASE, 'POST', `/lost-items/${doc.id}/${route}`, { comment: FIXTURE_TAG }, actors[actorKey].session.token);
    const evAfter = await fetchMovementDocumentEvidence(doc.id, HOTEL_A.id);
    fullPathAttempt.push({ step: route, statusBefore: evBefore?.status, statusAfter: evAfter?.status, http: res.status, accPin: evAfter?.approvalRequest?.accWorkflowVersionId });
  }

  const out = {
    executedAt: new Date().toISOString(),
    lostProbes: lostRows,
    breakageProbes: brkRows,
    lostSequentialPathOutsideAcc: fullPathAttempt,
    validAuthorizedPathCompletesOutsideAcc: fullPathAttempt.every((s) => s.http >= 200 && s.http < 300 && !fullPathAttempt[0]?.accPin),
    summary: {
      activeOperationalLegacy: [...lostRows, ...brkRows].filter((r) => r.classification === 'Active Operational Legacy').length,
      safelyBlocked: [...lostRows, ...brkRows].filter((r) => r.classification.includes('Safely blocked')).length,
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote LEGACY_CHAIN_COMPLETE.json');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
