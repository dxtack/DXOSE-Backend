'use strict';

/**
 * Phase 4 — Strict browser verification for workflow timeline (no skipped modules).
 * Usage: node Governance/phase-4-workflow-timeline/phase-4-workflow-timeline-browser.cjs
 */

const { createRequire } = require('module');
const requireFromFrontend = createRequire(require('path').join(__dirname, '../../OSE-Frontend/package.json'));
const { chromium } = requireFromFrontend('playwright');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../OSE-backend/.env') });

const GOV_DIR = __dirname;
const API = process.env.OSE_API_URL || 'http://127.0.0.1:4000/api';
const BASE = process.env.OSE_BASE_URL || 'http://127.0.0.1:4200';
const TENANT = process.env.UAT_TENANT || 'closeout-audit-hotel-disposable';
const EMAIL = process.env.UAT_EMAIL || 'p4-org_manager@phase4-timeline-gate.local';
const PASSWORD = process.env.UAT_PASSWORD || 'Phase4Gate@123';

const { loadFixtures } = require('./phase-4-timeline-assertions.lib.cjs');

const scenarios = [];

function record(id, name, pass, detail = {}) {
  scenarios.push({ id, name, pass, skipped: false, ...detail });
}

async function apiLogin(tenantSlug = TENANT) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, tenantSlug }),
  });
  const json = await res.json();
  if (!json?.success) throw new Error(`Login failed: ${JSON.stringify(json)}`);
  return json.data;
}

async function seedAuth(page, authPayload, tenantSlug) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(({ auth, slug }) => {
    const state = {
      isAuthenticated: true,
      user: auth.user,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      currentTenant: auth.user?.tenant ?? null,
    };
    localStorage.setItem('ose-auth', JSON.stringify({ state }));
    localStorage.setItem('ose-last-property-slug', slug);
  }, { auth: authPayload, slug: tenantSlug });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
}

const TIMELINE_CARD_SELECTORS = [
  '.document-card--timeline',
  '.inventory-approval-trail-card',
  '.gp-d__timeline-card',
].join(', ');

async function inspectTimelineCard(page, route, label) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector(TIMELINE_CARD_SELECTORS, { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2000);

  const card = page.locator(TIMELINE_CARD_SELECTORS).first();
  const cardCount = await card.count();
  if (cardCount === 0) {
    return { label, route, cardMissing: true, titleExact: false, hasBy: false, hasActedBy: false, text: '', roleLabels: [], badges: [] };
  }

  const heading = card.locator('h2').first();
  const titleText = (await heading.innerText().catch(() => '')).trim();
  const text = await card.innerText().catch(() => '');
  const roleLabels = (await card.locator('.rw-timeline__role').allTextContents()).map((t) => t.trim()).filter(Boolean);
  const badges = (await card.locator('.rw-timeline__action').allTextContents()).map((t) => t.trim()).filter(Boolean);
  const hasBy = /\bBy\s+\S/.test(text);
  const hasActedBy = /Acted by/i.test(text);
  const titleExact = titleText === 'Workflow Timeline';

  return {
    label,
    route,
    cardMissing: false,
    titleText,
    titleExact,
    hasBy,
    hasActedBy,
    actorCheck: hasBy && !hasActedBy,
    noUndefined: !/\bundefined\b/i.test(text),
    noRawEnum: !/\b(SEND_BACK|PENDING_GM|PENDING_DEPT)\b/.test(text),
    noWorkflowHistoryEyebrow: !/^WORKFLOW HISTORY/m.test(text) && !/\nWORKFLOW HISTORY\n/.test(text),
    text: text.slice(0, 1200),
    roleLabels,
    badges,
  };
}

function countRoleLabels(roleLabels, label) {
  return roleLabels.filter((t) => t === label).length;
}

async function main() {
  const fixtures = loadFixtures();
  if (!fixtures) throw new Error('PHASE_4_TIMELINE_FIXTURES.json missing — run fixture seed first');

  const required = [
    ['P4-BR-GRN', `/grn/${fixtures.grn.id}`, 'GRN'],
    ['P4-BR-TR', `/transfers/${fixtures.transfer.id}`, 'Transfer'],
    ['P4-BR-BRK', `/breakage/${fixtures.breakage.id}`, 'Breakage'],
    ['P4-BR-GP-V4-SB', `/get-passes/${fixtures.getPassSendBackResubmit.id}`, 'Get Pass v4 Send Back'],
    ['P4-BR-GP-RET', `/get-passes/${fixtures.getPassPhysicalReturn.id}`, 'Get Pass physical return'],
    ['P4-BR-IC', `/inventory-count/${fixtures.inventoryCount.id}`, 'Inventory Count'],
  ];

  const v3 = fixtures.getPassV3Gm;
  if (v3?.id) {
    required.push(['P4-BR-GP-V3-GM', `/get-passes/${v3.id}`, 'Get Pass historical v3 GM']);
  } else {
    record('P4-BR-GP-V3-GM', 'Get Pass historical v3 GM fixture required', false, { reason: 'missing_fixture' });
  }

  const auth = await apiLogin(TENANT);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await seedAuth(page, auth, TENANT);

  for (const [id, route, label] of required) {
    const r = await inspectTimelineCard(page, route, label);
    const pass =
      !r.cardMissing &&
      r.titleExact &&
      r.actorCheck &&
      r.noUndefined &&
      r.noRawEnum &&
      r.noWorkflowHistoryEyebrow !== false &&
      r.text.length > 20;
    record(id, `${label} — exact Workflow Timeline title + By actor meta`, pass, r);

    if (id === 'P4-BR-GP-V4-SB') {
      const sentBackCount = countRoleLabels(r.roleLabels, 'Sent Back');
      const resubmittedCount = countRoleLabels(r.roleLabels, 'Resubmitted');
      const submittedCount = countRoleLabels(r.roleLabels, 'Submitted');
      const returnedCount = countRoleLabels(r.roleLabels, 'Returned');
      record('P4-BR-GP-SB-EVENT', 'Browser: Sent Back exactly once; no Returned lifecycle label', sentBackCount === 1 && returnedCount === 0, {
        sentBackCount,
        returnedCount,
        resubmittedCount,
        submittedCount,
        roleLabels: r.roleLabels,
      });
      record('P4-BR-GP-RS-EVENT', 'Browser: Resubmitted exactly once; Submitted preserved', resubmittedCount === 1 && submittedCount === 1, {
        resubmittedCount,
        submittedCount,
        roleLabels: r.roleLabels,
      });
      if (fixtures.getPassSendBackResubmit.sendBackReason) {
        record(
          'P4-BR-GP-SB-REASON',
          'Browser: Send Back reason visible',
          r.text.includes(fixtures.getPassSendBackResubmit.sendBackReason.slice(0, 20)),
          { reasonFragment: fixtures.getPassSendBackResubmit.sendBackReason.slice(0, 40) },
        );
      }
    }

    if (id === 'P4-BR-GP-RET') {
      const hasCheckedOut = /Checked Out/i.test(r.text);
      const hasReturned = countRoleLabels(r.roleLabels, 'Returned') >= 1;
      const noSentBack = !/Sent Back/i.test(r.text);
      const noResubmitted = !/Resubmitted/i.test(r.text);
      record('P4-BR-GP-RET-EVENT', 'Browser: Checked Out + Returned; no Sent Back/Resubmitted', hasCheckedOut && hasReturned && noSentBack && noResubmitted, {
        hasCheckedOut,
        hasReturned,
        noSentBack,
        noResubmitted,
      });
    }

    if (id === 'P4-BR-GP-V3-GM') {
      const hasGm = /General [Mm]anager|GM approved/i.test(r.text);
      record('P4-BR-GP-V3-GM-STAGE', 'Browser: v3 GM approval stage visible with stamp', hasGm && !!v3.gmActor && r.text.includes(v3.gmActor.split(' ')[0]), {
        gmActor: v3.gmActor,
        hasGm,
      });
    }

    if (id === 'P4-BR-IC') {
      const countSubmittedIdx = r.roleLabels.findIndex((t) => t === 'Count submitted');
      const countSubmittedBadge = countSubmittedIdx >= 0 ? r.badges[countSubmittedIdx] : null;
      const duplicateSubmitted = countRoleLabels(r.roleLabels, 'Submitted') > 1;
      record('P4-BR-IC-SEM', 'Browser: Count submitted Completed badge; single Submitted lifecycle row', countSubmittedBadge === 'Completed' && countRoleLabels(r.roleLabels, 'Submitted') === 1 && !duplicateSubmitted, {
        countSubmittedBadge,
        submittedRoleCount: countRoleLabels(r.roleLabels, 'Submitted'),
        roleLabels: r.roleLabels,
        badges: r.badges,
      });
    }

    if (id === 'P4-BR-GRN') {
      const receivedCompletedOnly = /Received & validated[\s\S]{0,25}Completed/i.test(r.text);
      record('P4-BR-GRN-SEM', 'Browser: GRN Received & validated milestone renders', receivedCompletedOnly || /Received & validated/i.test(r.text), {
        receivedCompletedOnly,
      });
    }
  }

  await browser.close();

  const passCount = scenarios.filter((s) => s.pass).length;
  const failCount = scenarios.filter((s) => !s.pass).length;
  const skippedCount = scenarios.filter((s) => s.skipped).length;
  const phaseClosed = failCount === 0 && skippedCount === 0;

  const out = {
    generatedAt: new Date().toISOString(),
    passCount,
    failCount,
    skippedCount,
    phaseClosed,
    scenarios,
    fixtures: {
      grnId: fixtures.grn?.id,
      transferId: fixtures.transfer?.id,
      breakageId: fixtures.breakage?.id,
      getPassSendBackResubmitId: fixtures.getPassSendBackResubmit?.id,
      getPassPhysicalReturnId: fixtures.getPassPhysicalReturn?.id,
      getPassV3GmId: fixtures.getPassV3Gm?.id,
      inventoryCountId: fixtures.inventoryCount?.id,
    },
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_4_BROWSER_RESULTS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ passCount, failCount, skippedCount, phaseClosed }, null, 2));
  process.exit(phaseClosed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
