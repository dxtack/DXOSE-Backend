'use strict';
/**
 * Gate B FINAL — mutating runtime scenarios on Hotel A test tenant only.
 * Output: governance-evidence-archive/gate-b-audit/final/GATE_B_RUNTIME_RESULTS.json
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { API_BASE, HOTEL_A, FIXTURE_TAG } = require('./closeout-runtime-audit/lib/constants');
const { apiRequest } = require('./closeout-runtime-audit/lib/http');
const { sessionForIdentityKey, requireIdentitiesFile } = require('./closeout-runtime-audit/lib/session-resolver');
const prisma = require('../src/config/database');

const OUT = path.join(__dirname, '../governance-evidence-archive/gate-b-audit/final/GATE_B_RUNTIME_RESULTS.json');
const executedAt = new Date().toISOString();
const scenarios = [];
const createdDocs = [];

function add(id, requirementIds, desc, result, detail) {
  scenarios.push({
    scenario_id: id,
    requirement_ids: requirementIds,
    description: desc,
    status: result,
    tenant: HOTEL_A.slug,
    detail,
    executed_at: executedAt,
  });
}

async function main() {
  requireIdentitiesFile();
  const deptFixPath = path.join(__dirname, '../governance-evidence-archive/closeout-runtime-audit/DEPT_STOCK_FIXTURES.json');
  const stock = JSON.parse(fs.readFileSync(deptFixPath, 'utf8')).departmentA;

  const finance = await sessionForIdentityKey('FINANCE');
  const dmFb = await sessionForIdentityKey('DEPT_MANAGER_FB');
  const cc = await sessionForIdentityKey('COST_CONTROL');

  if (finance.ok) {
    const posted = await prisma.grnImport.findFirst({
      where: { tenantId: HOTEL_A.id, status: 'POSTED' },
      select: { id: true, concurrencyVersion: true, grnNumber: true },
    });
    if (posted) {
      const patch = await apiRequest(
        API_BASE,
        'PATCH',
        `/grn/${posted.id}`,
        { notes: `${FIXTURE_TAG} immutability probe`, concurrencyVersion: posted.concurrencyVersion ?? 0 },
        finance.token,
      );
      add(
        'RS-POST-001',
        ['C5-5.1-003', 'C13-13.4-001'],
        'PATCH posted GRN must be rejected',
        [403, 409, 422, 423].includes(patch.status) ? 'Passed' : 'Failed',
        { grnId: posted.id, grnNumber: posted.grnNumber, http: patch.status, body: patch.data },
      );
    } else {
      add('RS-POST-001', ['C5-5.1-003', 'C13-13.4-001'], 'PATCH posted GRN must be rejected', 'Blocked', { reason: 'no_posted_grn_in_hotel_a' });
    }
  } else {
    add('RS-POST-001', ['C5-5.1-003', 'C13-13.4-001'], 'PATCH posted GRN must be rejected', 'Blocked', { reason: 'finance_login_failed' });
  }

  if (dmFb.ok && cc.ok) {
    const create = await apiRequest(
      API_BASE,
      'POST',
      '/breakage',
      {
        reason: `${FIXTURE_TAG} gate-b wf`,
        suggestedAction: 'HOTEL',
        lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, unitCost: 1, totalValue: 1 }],
      },
      dmFb.token,
    );
    const brkId = create.data?.data?.id;
    if (brkId) createdDocs.push({ type: 'breakage', id: brkId });
    add(
      'RS-WF-001',
      ['C3-3.3-002', 'C4-4.3-003'],
      'Breakage create by dept manager',
      create.status === 201 ? 'Passed' : 'Failed',
      { http: create.status, documentId: brkId },
    );
    if (brkId) {
      const sk = await sessionForIdentityKey('STOREKEEPER');
      if (sk.ok) {
        const wrong = await apiRequest(API_BASE, 'POST', `/breakage/${brkId}/approve`, { comment: FIXTURE_TAG }, sk.token);
        add(
          'RS-WF-002',
          ['C3-3.3-002', 'C4-4.3-003'],
          'Wrong role approve breakage must 403',
          wrong.status === 403 ? 'Passed' : 'Failed',
          { http: wrong.status, documentId: brkId },
        );
      }
      const appr = await apiRequest(API_BASE, 'POST', `/breakage/${brkId}/approve`, { comment: FIXTURE_TAG }, cc.token);
      add(
        'RS-WF-003',
        ['C3-3.1-001'],
        'Cost control approve breakage',
        appr.status < 400 ? 'Passed' : 'Failed',
        { http: appr.status, documentId: brkId },
      );
    }
  } else {
    add('RS-WF-001', ['C3-3.3-002', 'C4-4.3-003'], 'Breakage workflow', 'Blocked', { reason: 'identity_login_failed' });
  }

  if (dmFb.ok) {
    const gp = await apiRequest(
      API_BASE,
      'POST',
      '/get-passes',
      {
        transferType: 'PERMANENT',
        borrowingEntity: `${FIXTURE_TAG} gate-b`,
        departmentId: stock.departmentId,
        reason: FIXTURE_TAG,
        lines: [{ itemId: stock.itemId, locationId: stock.locationId, qty: 1, conditionOut: 'GOOD' }],
      },
      dmFb.token,
    );
    const gpId = gp.data?.data?.id;
    const gpVer = gp.data?.data?.concurrencyVersion;
    if (gpId) createdDocs.push({ type: 'getPass', id: gpId });
    add(
      'RS-GP-001',
      ['C3-3.1-001', 'C2-2.8-001'],
      'Get Pass create',
      gp.status === 201 ? 'Passed' : 'Failed',
      { http: gp.status, documentId: gpId },
    );
    if (gpId) {
      const sub = await apiRequest(
        API_BASE,
        'POST',
        `/get-passes/${gpId}/submit`,
        { concurrencyVersion: gpVer ?? 0 },
        dmFb.token,
      );
      add(
        'RS-GP-002',
        ['C3-3.1-001'],
        'Get Pass submit',
        sub.status === 200 ? 'Passed' : 'Failed',
        { http: sub.status, documentId: gpId },
      );
    }
  }

  const tokenA = finance.ok ? finance : await sessionForIdentityKey('FINANCE');
  if (tokenA.ok) {
    const bGp = await prisma.getPass.findFirst({
      where: { tenantId: 'bf7638b8-04db-4051-94d1-0cf039827c00' },
      select: { id: true },
    });
    if (bGp) {
      const cross = await apiRequest(API_BASE, 'GET', `/get-passes/${bGp.id}`, null, tokenA.token);
      add(
        'RS-XT-001',
        ['C23-23.6-002'],
        'Cross-tenant getPass read must not 200',
        cross.status === 200 ? 'Failed' : [403, 404, 422].includes(cross.status) ? 'Passed' : 'Failed',
        { http: cross.status, targetId: bGp.id, note: cross.status === 500 ? 'HTTP 500 tenant isolation defect' : null },
      );
    }
  }

  if (dmFb.ok) {
    const draft = await prisma.getPass.findFirst({
      where: { tenantId: HOTEL_A.id, status: 'DRAFT' },
      select: { id: true, concurrencyVersion: true },
    });
    if (draft) {
      const stale = await apiRequest(
        API_BASE,
        'POST',
        `/get-passes/${draft.id}/submit`,
        { concurrencyVersion: (draft.concurrencyVersion ?? 0) - 1 },
        dmFb.token,
      );
      add(
        'RS-CONC-001',
        ['C8-8.1-001', 'C8-8.2-001'],
        'Stale concurrencyVersion must reject',
        [409, 422].includes(stale.status) ? 'Passed' : 'Failed',
        { http: stale.status, documentId: draft.id },
      );
    } else {
      add('RS-CONC-001', ['C8-8.1-001', 'C8-8.2-001'], 'Stale concurrencyVersion', 'Blocked', { reason: 'no_draft_getpass' });
    }
  }

  const summary = {
    executedAt,
    tenant: HOTEL_A,
    createdDocs,
    cleanupNote: 'Test documents tagged CLOSEOUT_RT_AUDIT; retained for audit trace',
    counts: {
      Passed: scenarios.filter((s) => s.status === 'Passed').length,
      Failed: scenarios.filter((s) => s.status === 'Failed').length,
      Blocked: scenarios.filter((s) => s.status === 'Blocked').length,
    },
    scenarios,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log('Wrote', OUT, summary.counts);
  await prisma.$disconnect();
  process.exit(summary.counts.Failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
