'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession, switchTenant } = require('./lib/http');
const {
  loadDisposableTenants,
  ensureDisposableStock,
  ensureDisposableOrgManager,
  seedConstitutionWorkflow,
  cleanupConstitutionWorkflow,
  gpPayload,
  PASSWORD,
} = require('./lib/disposable-fixture');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'DISPOSABLE_ORG_RUNTIME_RESULTS.json');

async function main() {
  const { org, child } = await loadDisposableTenants();
  const orgMgr = await ensureDisposableOrgManager();
  const stock = await ensureDisposableStock(child.id);
  let wf = null;
  const results = { orgSwitch: null, getPassActor: [], legacyProbes: [] };

  try {
    const loginRes = await getSession(API_BASE, { email: orgMgr.email, password: PASSWORD }, org.slug);
    if (!loginRes.ok) {
      results.orgSwitch = { ok: false, phase: 'login', http: loginRes.loginRes?.status };
    } else {
      const sw = await switchTenant(API_BASE, loginRes.token, child.slug);
      const token = sw.status === 200 && sw.data?.data?.accessToken ? sw.data.data.accessToken : loginRes.token;
      const user = sw.data?.data?.user || loginRes.user;
      results.orgSwitch = {
        ok: sw.status === 200 || user?.tenant?.slug === child.slug,
        loginTenant: org.slug,
        switchHttp: sw.status,
        canonicalTenantSlug: user?.tenant?.slug,
        canonicalTenantId: user?.tenant?.id,
        jwtRole: user?.role,
        jwtPermissionsSample: (user?.permissions || []).filter((p) => p.startsWith('GET_PASS')).slice(0, 8),
        permissionVersion: user?.permissionVersion,
        error: sw.message,
      };

      wf = await seedConstitutionWorkflow(child.id);
      const gpCreate = await apiRequest(
        API_BASE,
        'POST',
        '/get-passes',
        gpPayload(stock, stock.departmentId),
        token,
      );
      const gpId = gpCreate.data?.data?.id;
      const ver = gpCreate.data?.data?.concurrencyVersion ?? 0;
      let submitRes = null;
      let after = null;
      if (gpId) {
        submitRes = await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion: ver }, token);
        after = await fetchGetPassEvidence(gpId, child.id);
      }
      results.getPassActor = {
        createHttp: gpCreate.status,
        submitHttp: submitRes?.status,
        statusAfter: after?.status,
        orgManagerOnDisposable: true,
        noOrgSwitchFailed: sw.status === 200,
      };

      const doc = await prisma.movementDocument.create({
        data: {
          tenantId: child.id,
          documentNo: `LOST-DISP-${Date.now()}`,
          movementType: 'LOST',
          sourceType: 'INTERNAL',
          status: 'DRAFT',
          sourceLocationId: stock.locationId,
          reason: FIXTURE_TAG,
          suggestedAction: 'HOTEL',
          createdBy: user.id,
          lines: {
            create: [{ itemId: stock.itemId, locationId: stock.locationId, qtyRequested: 1, qtyInBaseUnit: 1, unitCost: 1, totalValue: 1 }],
          },
        },
      });
      const legacyRes = await apiRequest(
        API_BASE,
        'POST',
        `/lost-items/${doc.id}/approve-dept`,
        { comment: FIXTURE_TAG },
        token,
      );
      const afterDoc = await prisma.movementDocument.findUnique({ where: { id: doc.id }, select: { status: true } });
      results.legacyProbes.push({
        route: 'POST /lost-items/:id/approve-dept',
        fixture: 'INTERNAL_LOST disposable',
        http: legacyRes.status,
        statusAfter: afterDoc?.status,
        tenant: child.slug,
      });
    }
  } finally {
    if (wf?.definitionId) await cleanupConstitutionWorkflow(wf.definitionId);
  }

  const out = {
    executedAt: new Date().toISOString(),
    disposableOrg: org.slug,
    disposableHotel: child.slug,
    grandHorizonNotUsed: true,
    results,
    orgSwitchFailedRemaining: results.orgSwitch?.ok === false,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote DISPOSABLE_ORG_RUNTIME_RESULTS.json', 'orgSwitch ok:', results.orgSwitch?.ok);
  await prisma.$disconnect();
  if (!results.orgSwitch?.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
