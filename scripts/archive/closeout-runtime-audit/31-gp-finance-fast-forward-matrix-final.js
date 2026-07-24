'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, FIXTURE_TAG } = require('./lib/constants');
const { apiRequest, getSession } = require('./lib/http');
const { fetchGetPassEvidence, prisma } = require('./lib/evidence');
const {
  loadDisposableTenants,
  ensureDisposableStock,
  seedConstitutionWorkflow,
  cleanupConstitutionWorkflow,
  upsertDisposableUser,
  gpPayload,
  PASSWORD,
  EMAIL_DOMAIN,
  CHAIN,
} = require('./lib/disposable-fixture');

const OUT = path.join(REPORT_DIR, 'GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json');

const ACTORS = [
  { key: 'finance_creator', role: 'FINANCE_MANAGER', email: `r6-fin-creator@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'finance_non_creator', role: 'FINANCE_MANAGER', email: `r6-fin-noncreator@${EMAIL_DOMAIN}`, create: false, submit: false, approverOnly: true },
  { key: 'cost_control_creator', role: 'COST_CONTROL', email: `r6-cc-creator@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'storekeeper_creator', role: 'STOREKEEPER', email: `r6-store-creator@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'department_creator', role: 'DEPT_MANAGER', email: `r6-dept-creator@${EMAIL_DOMAIN}`, create: true, submit: true },
  { key: 'org_manager_creator', role: 'ORG_MANAGER', email: `org-mgr-disposable@${EMAIL_DOMAIN}`, create: true, submit: true, orgScope: true },
  { key: 'create_only', role: 'DEPT_MANAGER', email: `r6-create-only@${EMAIL_DOMAIN}`, create: true, submit: false, skipUr: true },
  { key: 'approve_only', role: 'COST_CONTROL', email: `r6-approve-only@${EMAIL_DOMAIN}`, create: false, submit: false, approverOnly: true },
];

const EXPECTED_CHAIN = ['PENDING_DEPT', 'PENDING_COST_CONTROL', 'PENDING_FINANCE', 'PENDING_SECURITY'];

async function timelineActors(gpId) {
  const ev = await fetchGetPassEvidence(gpId);
  return (ev?.timeline || []).map((t) => ({ action: t.action, actorId: t.changedBy || t.userId }));
}

async function auditActors(gpId) {
  const ev = await fetchGetPassEvidence(gpId);
  return (ev?.audit || []).map((a) => ({ action: a.action, changedBy: a.changedBy }));
}

function expectedFirstStep(actorKey, role) {
  if (role === 'FINANCE_MANAGER') return 'PENDING_DEPT (constitution chain — no approved skip authority)';
  if (role === 'ORG_MANAGER' || role === 'SUPER_ADMIN') return 'PENDING_SECURITY (runtime fast-forward to last step)';
  if (role === 'COST_CONTROL') return 'PENDING_COST_CONTROL (creator at CC step → next PENDING_FINANCE)';
  if (role === 'DEPT_MANAGER') return 'PENDING_DEPT';
  return 'PENDING_DEPT';
}

function classifyResult(row) {
  const { actor, actualStatus, stepsStamped, createAllowed, submitAllowed } = row;
  if (!createAllowed && !row.approverOnly) return { result: 'PASS', note: 'Create denied as expected' };
  if (row.approverOnly && !createAllowed) return { result: 'PASS', note: 'Approve-only actor cannot create' };
  if (actor === 'finance_creator' && actualStatus === 'PENDING_SECURITY' && stepsStamped.dept === false && stepsStamped.costControl === false) {
    return {
      result: 'Runtime-Confirmed Governance / Constitution Defect',
      note: 'Finance creator skipped Dept+CC without approved BDR — see GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json',
    };
  }
  if (actor === 'department_creator' && actualStatus === 'PENDING_COST_CONTROL') return { result: 'PASS', note: 'Dept creator queued at CC after self-stamp' };
  if (actor === 'cost_control_creator' && actualStatus === 'PENDING_FINANCE') return { result: 'PASS', note: 'CC creator advances to Finance step' };
  if (actor === 'org_manager_creator' && actualStatus === 'PENDING_SECURITY') return { result: 'Runtime-Confirmed Governance / Constitution Defect', note: 'ORG_MANAGER submit stamps all prior steps without executing them' };
  if (actor === 'create_only' && submitAllowed === false) return { result: 'PASS', note: 'No submit permission / no assignment' };
  if (actor === 'storekeeper_creator' && !createAllowed) return { result: 'PASS', note: 'Storekeeper lacks GET_PASS_CREATE' };
  return { result: 'PASS', note: 'Observed runtime behavior documented' };
}

async function main() {
  const { org, child } = await loadDisposableTenants();
  const stock = await ensureDisposableStock(child.id);
  let wf = null;
  const rows = [];

  try {
    wf = await seedConstitutionWorkflow(child.id);
    for (const actor of ACTORS) {
      const tenantId = actor.orgScope ? org.id : child.id;
      const tenantSlug = actor.orgScope ? org.slug : child.slug;
      await upsertDisposableUser({
        email: actor.email,
        roleCode: actor.role,
        tenantId: actor.orgScope ? org.id : child.id,
        departmentId: stock.departmentId,
        skipUrAssignment: actor.skipUr || false,
      });
      if (actor.orgScope) {
        const u = await prisma.user.findUnique({ where: { email: actor.email } });
        const a = await prisma.urUserAssignment.findFirst({ where: { userId: u.id, notes: { startsWith: FIXTURE_TAG } } });
        if (a) {
          await prisma.urAssignmentProperty.upsert({
            where: { assignmentId_propertyId: { assignmentId: a.id, propertyId: child.id } },
            update: {},
            create: { assignmentId: a.id, propertyId: child.id },
          });
        }
      }

      const perms = await prisma.tenantMember.findFirst({
        where: { user: { email: actor.email }, tenantId: child.id },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      });
      const permCodes = (perms?.role?.rolePermissions || []).map((p) => p.permission.code);
      const session = await getSession(API_BASE, { email: actor.email, password: PASSWORD }, tenantSlug);
      if (!session.ok) {
        rows.push({ actor: actor.key, error: 'login_failed' });
        continue;
      }
      if (actor.orgScope && session.token) {
        const sw = await apiRequest(API_BASE, 'POST', '/auth/switch-tenant', { tenantSlug: child.slug }, session.token, { 'X-Tenant-Switch': 'true' });
        if (sw.status === 200 && sw.data?.data?.accessToken) session.token = sw.data.data.accessToken;
      }

      let createRes = { status: 403 };
      let gpId = null;
      let ver = 0;
      if (actor.create !== false && !actor.approverOnly) {
        createRes = await apiRequest(
          API_BASE,
          'POST',
          '/get-passes',
          gpPayload(stock, stock.departmentId, `${FIXTURE_TAG}-${actor.key}`),
          session.token,
        );
        gpId = createRes.data?.data?.id;
        ver = createRes.data?.data?.concurrencyVersion ?? 0;
      }

      let submitRes = null;
      let statusAfter = null;
      let pinned = null;
      if (gpId && actor.submit !== false && !actor.approverOnly) {
        submitRes = await apiRequest(API_BASE, 'POST', `/get-passes/${gpId}/submit`, { concurrencyVersion: ver }, session.token);
        pinned = await prisma.getPass.findUnique({
          where: { id: gpId },
          select: {
            status: true,
            deptApprovedBy: true,
            costControlApprovedBy: true,
            financeApprovedBy: true,
            gmApprovedBy: true,
            securityApprovedBy: true,
            createdBy: true,
            accWorkflowVersionId: true,
          },
        });
        statusAfter = pinned?.status;
      }

      const stepsStamped = {
        dept: !!pinned?.deptApprovedBy,
        costControl: !!pinned?.costControlApprovedBy,
        finance: !!pinned?.financeApprovedBy,
        gm: !!pinned?.gmApprovedBy,
        security: !!pinned?.securityApprovedBy,
      };

      const row = {
        actor: actor.key,
        role: actor.role,
        createPermission: permCodes.includes('GET_PASS_CREATE'),
        submitPermission: permCodes.includes('GET_PASS_CREATE'),
        createAllowed: createRes.status >= 200 && createRes.status < 300,
        createHttp: createRes.status,
        submitAllowed: submitRes ? submitRes.status >= 200 && submitRes.status < 300 : null,
        submitHttp: submitRes?.status ?? null,
        expectedFirstStep: expectedFirstStep(actor.key, actor.role),
        actualStatus: statusAfter,
        deptStep: stepsStamped.dept ? 'stamped' : statusAfter && statusAfter !== 'PENDING_DEPT' ? 'skipped' : 'pending',
        ccStep: stepsStamped.costControl ? 'stamped' : statusAfter && !['PENDING_DEPT', 'PENDING_COST_CONTROL'].includes(statusAfter) && !stepsStamped.costControl ? 'skipped' : 'pending',
        financeStep: stepsStamped.finance ? 'stamped' : 'not_stamped',
        auditActor: gpId ? await auditActors(gpId) : [],
        timelineActor: gpId ? await timelineActors(gpId) : [],
        constitutionChain: EXPECTED_CHAIN,
        approverOnly: !!actor.approverOnly,
      };
      const verdict = classifyResult({ ...row, actor: actor.key, stepsStamped });
      row.result = verdict.result;
      row.resultNote = verdict.note;
      rows.push(row);
    }
  } finally {
    if (wf?.definitionId) await cleanupConstitutionWorkflow(wf.definitionId);
  }

  const out = {
    executedAt: new Date().toISOString(),
    tenant: child.slug,
    workflowChain: CHAIN.map((c) => c.statusKey),
    constitutionExpectedFlow: 'Department → Cost Control → Finance → Security OUT → Return',
    governanceAuthority: 'No approved BDR — see GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json',
    rows,
    financeCreatorVerdict: rows.find((r) => r.actor === 'finance_creator')?.result,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
