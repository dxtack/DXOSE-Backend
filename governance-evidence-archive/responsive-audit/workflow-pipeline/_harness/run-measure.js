'use strict';

/**
 * Workflow Pipeline (/workflow-pipeline) — Browser Runtime Measurement.
 *
 * READ-ONLY. Real Playwright + getBoundingClientRect().
 * Writes evidence ONLY under Governance/responsive-audit/workflow-pipeline/.
 *
 * Usage:
 *   node run-measure.js --phase before|after
 *   PHASE=before node run-measure.js
 *
 * Env:
 *   PILOT_FRONTEND_URL (default http://127.0.0.1:4200)
 *   PILOT_API_URL (default http://127.0.0.1:4000/api)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { generateAccessToken, generateRefreshToken } = require('../../../../src/utils/jwt');
const { resolveAccPermissionsForMembership } = require('../../../../src/acc-runtime/resolvePermissions');
const { membershipRoleCode, getRoleIdByCode } = require('../../../../src/services/rbac.service');
const { hasActiveAssignmentForProperty } = require('../../../../src/services/scope/assignment-mutation.guard');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const API_BASE = process.env.PILOT_API_URL || 'http://127.0.0.1:4000/api';

const phaseArgIdx = process.argv.indexOf('--phase');
const PHASE = phaseArgIdx >= 0 ? process.argv[phaseArgIdx + 1] : (process.env.PHASE || 'before').toLowerCase();

const OUT_DIR = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots', PHASE);
const VIEWPORTS = [
  { label: '1366x768', width: 1366, height: 768, dpr: 1 },
  { label: '1536x864', width: 1536, height: 864, dpr: 1 },
  { label: '1920x1080', width: 1920, height: 1080, dpr: 1 },
];
const ZOOM_DIAG = [0.9, 1.0, 1.1, 1.25];

async function resolvePerms(prisma, m) {
  const roleCode = membershipRoleCode(m) || m.role || null;
  let roleId = m.roleId || null;
  if (!roleId && roleCode) {
    try {
      roleId = await getRoleIdByCode(roleCode);
    } catch {
      /* ignore */
    }
  }
  const perms = await resolveAccPermissionsForMembership({
    userId: m.userId,
    membership: m,
    roleId,
    roleCode,
  });
  return { roleCode, roleId, perms: Array.isArray(perms) ? perms : [] };
}

async function discoverWfpContext() {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true, adminStatus: { not: 'SUSPENDED' } },
      select: { id: true, slug: true, name: true, parentId: true },
      orderBy: { name: 'asc' },
    });

    let best = null;
    let bestScore = -1;

    for (const t of tenants) {
      const members = await prisma.tenantMember.findMany({
        where: { tenantId: t.id, isActive: true },
        include: {
          user: { select: { id: true, email: true, permissionVersion: true, isActive: true } },
          role: true,
        },
      });

      for (const m of members) {
        if (!m.user?.isActive) continue;
        const { roleCode, roleId, perms } = await resolvePerms(prisma, m);
        if (!perms.includes('WORKFLOW_PIPELINE_VIEW')) continue;

        const userCtx = { id: m.userId, role: roleCode, permissions: perms };
        const hasAssignment = await hasActiveAssignmentForProperty(userCtx, t.id);
        if (!hasAssignment) continue;

        const score = perms.length + (roleCode === 'FINANCE_MANAGER' ? 50 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { tenant: t, member: m, roleCode, roleId, perms };
        }
      }
    }

    if (!best) throw new Error('NO_WFP_USER: no member with WORKFLOW_PIPELINE_VIEW + active assignment');

    const t = best.tenant;
    const u = best.member.user;
    const tokenPayload = {
      userId: u.id,
      tenantId: t.id,
      email: u.email,
      role: best.roleCode,
      roleId: best.roleId,
      permissions: best.perms,
      permissionVersion: u.permissionVersion,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ userId: u.id, tenantId: t.id });

    let pipelineProbe = { status: 'n/a', total: null, limit: null, page: null, url: null };
    try {
      const url = `${API_BASE}/workflow-pipeline?page=1&limit=20`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      pipelineProbe.status = res.status;
      pipelineProbe.url = url;
      if (res.ok) {
        const body = await res.json();
        const data = body?.data || body;
        pipelineProbe.total = data?.meta?.total ?? data?.items?.length ?? null;
        pipelineProbe.limit = data?.meta?.limit ?? null;
        pipelineProbe.page = data?.meta?.page ?? null;
        pipelineProbe.itemCount = Array.isArray(data?.items) ? data.items.length : null;
      }
    } catch (e) {
      pipelineProbe.status = `ERR ${e.message}`;
    }

    const memberships = (
      await prisma.tenantMember.findMany({
        where: { userId: u.id, isActive: true },
        include: { tenant: { select: { id: true, slug: true, name: true, parentId: true } }, role: true },
      })
    ).map((m) => ({
      tenantId: m.tenantId,
      tenantSlug: m.tenant?.slug || null,
      tenantName: m.tenant?.name || null,
      parentId: m.tenant?.parentId || null,
      roleCode: membershipRoleCode(m) || null,
    }));

    return {
      api: API_BASE,
      tenant: { id: t.id, slug: t.slug, name: t.name, parentId: t.parentId },
      user: { id: u.id, email: u.email, role: best.roleCode },
      permissions: best.perms.slice().sort(),
      memberships,
      tokens: { accessToken, refreshToken },
      pipelineProbe,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function measureInPage() {
  const px = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
  const q = (sel) => document.querySelector(sel);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: px(r.x),
      y: px(r.y),
      width: px(r.width),
      height: px(r.height),
      right: px(r.right),
      bottom: px(r.bottom),
      overflowY: cs.overflowY,
      overflowX: cs.overflowX,
      maxHeight: cs.maxHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docEl = document.scrollingElement || document.documentElement;

  const shell = q('.main-shell.ant-layout') || q('.main-shell');
  const header = q('.main-shell__header') || q('.ant-layout-header');
  const content = q('.main-shell__content') || q('.ant-layout-content');
  const canvas = q('app-workflow-pipeline');
  const opsPage = q('app-workflow-pipeline .workbench-ops-page');
  const pageHeader = q('app-workflow-pipeline .wfp-page__header');
  const kpis = q('app-workflow-pipeline .wfp-kpis');
  const filters = q('app-workflow-pipeline .wfp-query-band');
  const card = q('app-workflow-pipeline .workbench-work-card');
  const scrollShell = q('app-workflow-pipeline .workbench-work-card__scroll');
  const footer = q('app-workflow-pipeline .workbench-work-card__footer');
  const pagination = q(
    'app-workflow-pipeline .workbench-work-card__footer .ant-pagination, app-workflow-pipeline .ant-pagination',
  );

  const table = q('app-workflow-pipeline .ant-table');
  const tContainer = table ? table.querySelector('.ant-table-container') : null;
  const tHeader = table ? table.querySelector('.ant-table-header') : null;
  const tBody = table ? table.querySelector('.ant-table-body') : null;
  const ths = table
    ? Array.from(table.querySelectorAll('.ant-table-thead th')).map((th) => th.innerText.trim())
    : [];
  const dataRows = table
    ? table.querySelectorAll('.ant-table-tbody tr:not(.ant-table-measure-row)').length
    : 0;

  let visibleRows = 0;
  if (tBody) {
    for (const tr of tBody.querySelectorAll('tr:not(.ant-table-measure-row)')) {
      const r = tr.getBoundingClientRect();
      if (r.height > 0 && r.bottom > 0 && r.top < vh) visibleRows += 1;
    }
  }

  let blankInsideBody = null;
  if (tBody) {
    blankInsideBody = px(Math.max(0, tBody.clientHeight - tBody.scrollHeight));
  }

  let blankBelowTable = null;
  if (card && (tBody || footer)) {
    const cardBottom = card.getBoundingClientRect().bottom;
    const anchor = footer ? footer.getBoundingClientRect().bottom : tBody.getBoundingClientRect().bottom;
    blankBelowTable = px(cardBottom - anchor);
  }

  let blankBelowCard = null;
  if (canvas && card) {
    blankBelowCard = px(canvas.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom);
  }

  const owners = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    if (el.scrollHeight - el.clientHeight <= 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    let name = el.tagName.toLowerCase();
    if (typeof el.className === 'string' && el.className.trim()) {
      name += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    owners.push({
      selector: name,
      overflowY: cs.overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      delta: el.scrollHeight - el.clientHeight,
    });
  }
  owners.sort((a, b) => b.delta - a.delta);

  const dataScrollOwners = owners.filter(
    (o) =>
      /ant-table-body|workbench-work-card__scroll|workbench-ops-page__grid-region/.test(o.selector) ||
      o.selector.includes('ant-table-body'),
  );

  const errorOverlay =
    !!document.querySelector('vite-error-overlay') ||
    /compilation error|failed to compile|overlay/i.test(
      document.querySelector('vite-error-overlay')?.textContent || '',
    );

  return {
    url: location.pathname + location.search,
    heading: (q('.wfp-page__title')?.innerText || q('h1')?.innerText || '').trim(),
    errorOverlay,
    viewport: { width: vw, height: vh, dpr: window.devicePixelRatio },
    document: {
      scrollHeight: docEl.scrollHeight,
      clientHeight: docEl.clientHeight,
      scrollWidth: docEl.scrollWidth,
      clientWidth: docEl.clientWidth,
      pageVerticalScroll: docEl.scrollHeight > docEl.clientHeight + 2,
      pageHorizontalScroll: docEl.scrollWidth > docEl.clientWidth + 2,
    },
    shell: rect(shell),
    header: rect(header),
    content: rect(content),
    canvas: rect(canvas),
    opsPage: rect(opsPage),
    pageHeader: rect(pageHeader),
    kpis: rect(kpis),
    filters: rect(filters),
    card: rect(card),
    scrollShell: rect(scrollShell),
    table: {
      container: rect(tContainer),
      header: rect(tHeader),
      body: rect(tBody),
      columns: ths.map((c) => (c === '' ? '(blank)' : c)),
      columnCount: ths.length,
      dataRows,
      visibleRows,
      bodyHorizontalScroll: tBody ? tBody.scrollWidth > tBody.clientWidth + 2 : null,
      bodyVerticalScroll: tBody ? tBody.scrollHeight > tBody.clientHeight + 2 : null,
    },
    footer: footer
      ? { ...rect(footer), visibleInViewport: footer.getBoundingClientRect().bottom <= vh + 1 }
      : null,
    pagination: pagination
      ? { ...rect(pagination), visibleInViewport: pagination.getBoundingClientRect().bottom <= vh + 1 }
      : null,
    scroll: {
      verticalOwners: owners.slice(0, 8),
      verticalOwnerCount: owners.length,
      dataScrollOwners: dataScrollOwners.slice(0, 4),
      doubleScroll:
        docEl.scrollHeight > docEl.clientHeight + 2 &&
        (dataScrollOwners.length >= 1 || owners.some((o) => o.selector.includes('ant-table-body'))),
    },
    blankInsideBody,
    blankBelowTable,
    blankBelowCard,
  };
}

async function gotoPipeline(page) {
  const apiCalls = [];
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/workflow-pipeline') && !u.includes('/alerts')) {
      apiCalls.push({ method: req.method(), url: u });
    }
  });

  await page.goto(`${FRONTEND_URL}/workflow-pipeline`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page
    .waitForSelector('app-workflow-pipeline .ant-table, app-workflow-pipeline .wfp-board--empty', {
      timeout: 30000,
    })
    .catch(() => {});
  await page.waitForTimeout(1500);

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  return { apiCalls, consoleErrors };
}

async function runViewport(ctx, vp, zoom, labelSuffix) {
  const context = await chromium.launch({ headless: true }).then(async (browser) => {
    const bctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      baseURL: FRONTEND_URL,
    });
    return { browser, bctx };
  });

  const { browser, bctx } = context;
  const authState = {
    state: {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        tenantId: ctx.tenant.id,
        role: ctx.user.role,
        permissions: ctx.permissions,
        tenant: ctx.tenant,
        memberships: ctx.memberships,
      },
      accessToken: ctx.tokens.accessToken,
      refreshToken: ctx.tokens.refreshToken,
      currentTenant: ctx.tenant,
      isAuthenticated: true,
    },
  };

  await bctx.addInitScript(
    ([st, slug, z]) => {
      localStorage.setItem('ose-auth', st);
      localStorage.setItem('ose-last-property-slug', slug);
      if (z && z !== 1) {
        document.documentElement.style.zoom = String(z);
      }
    },
    [JSON.stringify(authState), ctx.tenant.slug, zoom],
  );

  const page = await bctx.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err.message || err)));

  await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(500);

  const { apiCalls } = await gotoPipeline(page);
  const m = await page.evaluate(measureInPage);

  const label = `${vp.label}${labelSuffix || ''}`;
  const shotView = path.join(SHOT_DIR, `WFP__${label}__viewport.png`);
  const shotFull = path.join(SHOT_DIR, `WFP__${label}__fullpage.png`);
  await page.screenshot({ path: shotView, fullPage: false }).catch(() => {});
  await page.screenshot({ path: shotFull, fullPage: true }).catch(() => {});

  await browser.close();

  const pipelineApi = apiCalls.find((c) => c.url.includes('workflow-pipeline') && !c.url.includes('/alerts'));

  return {
    screenId: 'WFP',
    phase: PHASE,
    viewport: label,
    viewportSize: { ...vp, browserZoom: zoom },
    zoomNote:
      zoom !== 1
        ? 'Diagnostic only: zoom applied via document.documentElement.style.zoom in init script (not OS display scaling).'
        : 'Browser zoom 100%; deviceScaleFactor=1 (not Windows OS display scaling 125%).',
    landedUrl: m.url,
    measurement: m,
    apiEvidence: {
      pipelineRequest: pipelineApi || null,
      hasPage1Limit20: pipelineApi
        ? /[?&]page=1(?:&|$)/.test(pipelineApi.url) && /[?&]limit=20(?:&|$)/.test(pipelineApi.url)
        : false,
      preRunProbe: ctx.pipelineProbe,
    },
    consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
    screenshots: {
      viewport: path.relative(OUT_DIR, shotView).replace(/\\/g, '/'),
      fullPage: path.relative(OUT_DIR, shotFull).replace(/\\/g, '/'),
    },
  };
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`[wfp-measure] PHASE=${PHASE} discovering WFP context…`);
  const ctx = await discoverWfpContext();
  console.log(
    `[wfp-measure] tenant=${ctx.tenant.slug} user=${ctx.user.email} role=${ctx.user.role} pipelineTotal=${ctx.pipelineProbe.total} probeStatus=${ctx.pipelineProbe.status}`,
  );
  if (ctx.pipelineProbe.status !== 200) {
    throw new Error(`Pipeline API probe failed: ${ctx.pipelineProbe.status}`);
  }

  const results = [];
  for (const vp of VIEWPORTS) {
    const r = await runViewport(ctx, vp, 1.0, '');
    results.push(r);
    console.log(
      `[wfp-measure] ${vp.label} pageScroll=${r.measurement.document.pageVerticalScroll} bodyH=${r.measurement.table.body?.clientHeight} visibleRows=${r.measurement.table.visibleRows} pagVisible=${r.measurement.pagination?.visibleInViewport} blankBelow=${r.measurement.blankBelowTable} owners=${r.measurement.scroll.verticalOwnerCount} apiLimit20=${r.apiEvidence.hasPage1Limit20}`,
    );
  }

  for (const z of ZOOM_DIAG.filter((x) => x !== 1.0)) {
    const r = await runViewport(ctx, VIEWPORTS[0], z, `@zoom${Math.round(z * 100)}`);
    results.push(r);
    console.log(
      `[wfp-measure] 1366x768@zoom${Math.round(z * 100)} pageScroll=${r.measurement.document.pageVerticalScroll} visibleRows=${r.measurement.table.visibleRows}`,
    );
  }

  const payload = {
    runInfo: {
      runAt: new Date().toISOString(),
      phase: PHASE,
      frontendUrl: FRONTEND_URL,
      apiUrl: API_BASE,
      screen: {
        id: 'WFP',
        name: 'Workflow Pipeline',
        route: '/workflow-pipeline',
        component: 'WorkflowPipelineComponent',
      },
      tenant: ctx.tenant,
      account: { email: ctx.user.email, role: ctx.user.role, permissionCount: ctx.permissions.length },
      pipelineProbe: ctx.pipelineProbe,
      viewports: VIEWPORTS,
      zoomDiagnostics: ZOOM_DIAG,
      scalingNote:
        'Primary matrix uses browser viewport sizes at deviceScaleFactor=1 (100% browser zoom). This does NOT emulate Windows OS Display Scaling 125%; that would require deviceScaleFactor=1.25 on a fixed logical viewport or running on a 125% scaled display.',
      zeroWrites: true,
    },
    results,
  };

  const suffix = PHASE === 'before' ? '_BEFORE' : PHASE === 'after' ? '' : `_${PHASE.toUpperCase()}`;
  const outFile = path.join(OUT_DIR, `WORKFLOW_PIPELINE_RUNTIME_RESULTS${suffix}.json`);
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`[wfp-measure] wrote ${outFile}`);
  return payload;
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('WFP_MEASURE_FATAL', e);
      process.exit(1);
    });
}

module.exports = { run, discoverWfpContext, measureInPage };
