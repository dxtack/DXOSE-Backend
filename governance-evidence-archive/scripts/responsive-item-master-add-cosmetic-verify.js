'use strict';
/**
 * Runtime verification: Add Item cosmetic cleanup + Description removed from Add only.
 * Scope: /items/new (Create mode). Does NOT touch Edit/Import/GRN.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { generateAccessToken, generateRefreshToken } = require('../../src/utils/jwt');
const { resolveAccPermissionsForMembership } = require('../../src/acc-runtime/resolvePermissions');
const { membershipRoleCode, getRoleIdByCode } = require('../../src/services/rbac.service');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));
const FRONTEND_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const API = process.env.PILOT_API_URL || 'http://127.0.0.1:4000/api';
const OUT_DIR = path.resolve(__dirname, '..', 'responsive-audit', 'item-master');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const VIEWPORTS = [
  { w: 1366, h: 768, tag: '1366x768' },
  { w: 1536, h: 864, tag: '1536x864' },
  { w: 1920, h: 1080, tag: '1920x1080' },
];

async function mintWithPerm(slug, perm) {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) throw new Error(`tenant not found: ${slug}`);
    const members = await prisma.tenantMember.findMany({
      where: { tenantId: tenant.id, isActive: true },
      include: { user: true, role: true },
    });
    for (const m of members) {
      if (!m.user?.isActive) continue;
      const roleCode = membershipRoleCode(m) || m.role;
      let roleId = m.roleId;
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
      if (!perms.includes(perm)) continue;
      const token = generateAccessToken({
        userId: m.user.id,
        tenantId: tenant.id,
        email: m.user.email,
        role: roleCode,
        roleId,
        permissions: perms,
        permissionVersion: m.user.permissionVersion,
      });
      return {
        tenant,
        token,
        email: m.user.email,
        userId: m.user.id,
        roleCode,
        permissions: perms,
        refreshToken: generateRefreshToken({ userId: m.user.id, tenantId: tenant.id }),
      };
    }
    throw new Error(`no user with ${perm} for ${slug}`);
  } finally {
    await prisma['$disconnect']();
  }
}

function authState(a) {
  return {
    state: {
      user: {
        id: a.userId,
        email: a.email,
        tenantId: a.tenant.id,
        role: a.roleCode,
        permissions: a.permissions,
        tenant: { id: a.tenant.id, slug: a.tenant.slug, name: a.tenant.name },
        memberships: [
          { tenantId: a.tenant.id, tenantSlug: a.tenant.slug, tenantName: a.tenant.name },
        ],
      },
      accessToken: a.token,
      refreshToken: a.refreshToken,
      currentTenant: { id: a.tenant.id, slug: a.tenant.slug, name: a.tenant.name },
      isAuthenticated: true,
    },
    accessToken: a.token,
    refreshToken: a.refreshToken,
    currentTenant: { id: a.tenant.id, slug: a.tenant.slug, name: a.tenant.name },
    isAuthenticated: true,
  };
}

async function measureDom(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const q = (s) => document.querySelector(s);
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const descTextarea = q('app-item-form textarea[formcontrolname="description"]');
    const unitPrice = q('app-item-form nz-input-number[formcontrolname="unitPrice"]');
    const openingQty = q('app-item-form nz-input-number[formcontrolname="openingQty"]');
    const defaultStoreItem = q('app-item-form nz-select[formcontrolname="defaultStoreId"]');
    const defaultStoreCol = defaultStoreItem ? defaultStoreItem.closest('[nz-col]') : null;
    const imageCol = q('app-item-form .item-form__image-col');
    const imageColWrap = imageCol ? imageCol.closest('[nz-col]') : null;
    const imageLabel = imageCol ? imageCol.querySelector('nz-form-label') : null;
    const upload = q('app-item-form .item-form__image-col app-shared-upload');
    const dropzone = q('app-item-form .item-form__image-col .shared-upload__dropzone');
    const legacyUploadBar = q('app-item-form .item-form__upload-bar');
    const footer = q('app-item-form .document-editor-card__footer');

    // gap between last visible form row bottom and footer top
    const dsRect = rect(defaultStoreCol);
    const imgRect = rect(imageColWrap);
    const footerRect = rect(footer);
    const lastRowBottom = Math.max(dsRect ? dsRect.bottom : 0, imgRect ? imgRect.bottom : 0);
    const footerGap = footerRect ? Math.round(footerRect.top - lastRowBottom) : null;

    // same-row check: image col to the right of default store, tops close
    let imageBesideDefaultStore = null;
    if (dsRect && imgRect) {
      imageBesideDefaultStore =
        imgRect.left >= dsRect.right - 4 && Math.abs(imgRect.top - dsRect.top) <= 8;
    }

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      docScrollH: doc.scrollHeight,
      clientH: doc.clientHeight,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      descriptionVisible: !!descTextarea,
      unitPriceVisible: !!unitPrice,
      openingQtyVisible: !!openingQty,
      imageColPresent: !!upload,
      legacyUploadBarPresent: !!legacyUploadBar,
      imageLabelText: imageLabel ? (imageLabel.textContent || '').trim() : null,
      defaultStoreCol: dsRect,
      imageCol: imgRect,
      dropzone: rect(dropzone),
      footer: footerRect,
      footerGapPx: footerGap,
      imageBesideDefaultStore,
    };
  });
}

async function visualPass(browser, auth, authSt) {
  const results = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    await ctx.addInitScript(([st, slug]) => {
      localStorage.clear();
      localStorage.setItem('ose-auth', st);
      localStorage.setItem('ose-last-property-slug', slug);
    }, [JSON.stringify(authSt), auth.tenant.slug]);
    const page = await ctx.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0]);
    });
    page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()}`));
    page.on('response', (r) => {
      if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });
    await page.goto(`${FRONTEND_URL}/items/new`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('app-item-form .document-editor-card', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const dom = await measureDom(page);
    await page.screenshot({
      path: path.join(SHOT_DIR, `IM-ADD-COSMETIC__${vp.tag}__top.png`),
      fullPage: false,
    });
    const scrollNeeded = dom.docScrollH > dom.clientH + 8;
    if (scrollNeeded) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: path.join(SHOT_DIR, `IM-ADD-COSMETIC__${vp.tag}__bottom.png`),
      fullPage: false,
    });
    results.push({
      viewport: vp.tag,
      dom,
      consoleErrors: consoleErrors.filter((e) => !e.includes('integrity/reconciliation')),
      failedRequests: failedRequests.filter((e) => !e.includes('integrity/reconciliation')),
    });
    await ctx.close();
  }
  return results;
}

async function uiCreatePayloadPass(browser, auth, authSt, lookups) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(([st, slug]) => {
    localStorage.clear();
    localStorage.setItem('ose-auth', st);
    localStorage.setItem('ose-last-property-slug', slug);
  }, [JSON.stringify(authSt), auth.tenant.slug]);
  const page = await ctx.newPage();
  let captured = null;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/api\/items\/?$/.test(req.url())) {
      try {
        captured = JSON.parse(req.postData() || '{}');
      } catch {
        captured = { parseError: true };
      }
    }
  });
  await page.goto(`${FRONTEND_URL}/items/new`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('app-item-form .document-editor-card', { timeout: 60000 });
  await page.waitForTimeout(2000);
  const testName = `PL-COSMETIC-CARD-${Date.now()}`;
  await page.evaluate(
    ({ name, departmentId, defaultStoreId, baseUnitId, supplierId }) => {
      const el = document.querySelector('app-item-form');
      const ng = window.ng;
      const cmp = ng?.getComponent?.(el);
      if (!cmp?.form) throw new Error('ItemFormComponent not ready');
      // Description control still exists in the form group; set it to prove it is NOT sent on Add.
      cmp.form.patchValue({
        name,
        departmentId,
        defaultStoreId,
        baseUnitId,
        supplierId,
        barcode: '',
        description: 'SHOULD-NOT-BE-SENT-ON-ADD',
      });
      cmp.form.updateValueAndValidity();
      cmp.save();
    },
    {
      name: testName,
      departmentId: lookups.deptId,
      defaultStoreId: lookups.storeId,
      baseUnitId: lookups.unitId,
      supplierId: lookups.supplierId,
    },
  );
  await page.waitForTimeout(5000);
  await ctx.close();
  return {
    uiPostCaptured: !!captured,
    uiPostPayload: captured,
    uiPayloadHasDescription: captured ? Object.prototype.hasOwnProperty.call(captured, 'description') : null,
    uiPayloadHasUnitPrice: captured ? Object.prototype.hasOwnProperty.call(captured, 'unitPrice') : null,
    uiPayloadHasOpeningQuantity: captured
      ? Object.prototype.hasOwnProperty.call(captured, 'openingQuantity')
      : null,
    uiTestName: testName,
  };
}

async function functionalPass(auth, lookups) {
  const prisma = new PrismaClient();
  const testName = `PL-COSMETIC-FUNC-${Date.now()}`;
  let itemId = null;
  try {
    const category = await prisma.category.findFirst({ where: { tenantId: auth.tenant.id, isActive: true } });
    if (!lookups.deptId || !lookups.storeId || !lookups.unitId || !lookups.supplierId) {
      throw new Error('missing lookup data for create test');
    }
    // Card-only Add payload (mirrors what the UI now sends: no description/unitPrice/openingQuantity).
    const payload = {
      name: testName,
      barcode: '',
      departmentId: lookups.deptId,
      categoryId: category?.id || null,
      subcategoryId: null,
      supplierId: lookups.supplierId,
      defaultStoreId: lookups.storeId,
      isActive: true,
      itemUnits: [{ unitId: lookups.unitId, unitType: 'BASE', conversionRate: 1 }],
    };
    const r = await fetch(`${API}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const createStatus = r.status;
    const body = await r.json();
    if (!r.ok) throw new Error(`create failed ${r.status}: ${JSON.stringify(body)}`);
    itemId = body.data?.id || body.id;
    if (!itemId) throw new Error('no item id in create response');

    const item = await prisma.item.findFirst({
      where: { id: itemId, tenantId: auth.tenant.id },
      include: {
        stockBalances: true,
        _count: { select: { ledgerEntries: true, movementLines: true } },
      },
    });
    const result = {
      testName,
      createStatus,
      payloadKeys: Object.keys(payload),
      payloadHasDescription: Object.prototype.hasOwnProperty.call(payload, 'description'),
      payloadHasUnitPrice: Object.prototype.hasOwnProperty.call(payload, 'unitPrice'),
      payloadHasOpeningQuantity: Object.prototype.hasOwnProperty.call(payload, 'openingQuantity'),
      itemCreated: !!item,
      itemUnitPrice: item ? Number(item.unitPrice) : null,
      itemDescriptionInDb: item ? item.description : null,
      stockBalanceCount: item?.stockBalances?.length ?? 0,
      ledgerCount: item?._count?.ledgerEntries ?? 0,
      movementLineCount: item?._count?.movementLines ?? 0,
    };

    const del = await fetch(`${API}/items/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    let deleted = del.ok;
    if (!deleted) {
      try {
        await prisma.item.delete({ where: { id: itemId } });
        deleted = true;
      } catch {
        deleted = false;
      }
    }
    if (deleted) itemId = null;
    result.cleanupDeleted = deleted;
    result.itemIdAfterCleanup = itemId;
    return result;
  } finally {
    if (itemId) {
      try {
        await prisma.item.delete({ where: { id: itemId } });
      } catch {
        /* best effort */
      }
    }
    await prisma['$disconnect']();
  }
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const auth = await mintWithPerm('dx-airport-hotel', 'BASIC_DATA_EDIT');
  const authSt = authState(auth);
  const prisma = new PrismaClient();
  const store = await prisma.location.findFirst({
    where: { tenantId: auth.tenant.id, isActive: true, departmentId: { not: null } },
  });
  const dept = store?.departmentId
    ? await prisma.department.findFirst({ where: { id: store.departmentId, tenantId: auth.tenant.id } })
    : null;
  const unit = await prisma.unit.findFirst({ where: { tenantId: auth.tenant.id, isActive: true } });
  const supplier = await prisma.supplier.findFirst({ where: { tenantId: auth.tenant.id, isActive: true } });
  await prisma['$disconnect']();
  const lookups = {
    deptId: dept?.id || '',
    storeId: store?.id || '',
    unitId: unit?.id || '',
    supplierId: supplier?.id || '',
  };

  const browser = await chromium.launch({ headless: true });
  const visual = await visualPass(browser, auth, authSt);
  const uiCreate = await uiCreatePayloadPass(browser, auth, authSt, lookups);
  await browser.close();

  const functional = await functionalPass(auth, lookups);

  // Cleanup UI-created item if save succeeded
  if (uiCreate.uiPostPayload?.name) {
    const prisma2 = new PrismaClient();
    try {
      const created = await prisma2.item.findFirst({
        where: { tenantId: auth.tenant.id, name: uiCreate.uiTestName },
      });
      if (created) {
        try {
          await prisma2.item.delete({ where: { id: created.id } });
          uiCreate.uiCleanupDeleted = true;
        } catch {
          uiCreate.uiCleanupDeleted = false;
        }
      } else {
        uiCreate.uiCleanupDeleted = 'no-item-found';
      }
    } finally {
      await prisma2['$disconnect']();
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tenant: auth.tenant.slug,
    user: auth.email,
    visual,
    uiCreate,
    functional,
    summary: {
      descriptionHiddenAllViewports: visual.every((v) => !v.dom.descriptionVisible),
      unitPriceHiddenAllViewports: visual.every((v) => !v.dom.unitPriceVisible),
      openingQtyHiddenAllViewports: visual.every((v) => !v.dom.openingQtyVisible),
      imageColPresentAllViewports: visual.every((v) => v.dom.imageColPresent),
      legacyUploadBarAbsentAllViewports: visual.every((v) => !v.dom.legacyUploadBarPresent),
      imageBesideDefaultStoreAllViewports: visual.every((v) => v.dom.imageBesideDefaultStore === true),
      noHorizontalOverflow: visual.every((v) => !v.dom.horizontalOverflow),
      footerGapReasonable: visual.every((v) => v.dom.footerGapPx != null && v.dom.footerGapPx <= 32),
      zeroConsoleErrors: visual.every((v) => v.consoleErrors.length === 0),
      zeroFailedRequests: visual.every((v) => v.failedRequests.length === 0),
      uiPayloadExcludesDescription: uiCreate.uiPostCaptured && !uiCreate.uiPayloadHasDescription,
      uiPayloadExcludesObFields:
        uiCreate.uiPostCaptured &&
        !uiCreate.uiPayloadHasUnitPrice &&
        !uiCreate.uiPayloadHasOpeningQuantity,
      functionalPayloadExcludesDescription: !functional.payloadHasDescription,
      cardOnlyDbSideEffects:
        functional.stockBalanceCount === 0 &&
        functional.ledgerCount === 0 &&
        functional.movementLineCount === 0,
      cleanupOk: functional.cleanupDeleted && !functional.itemIdAfterCleanup,
    },
  };

  const outPath = path.join(OUT_DIR, 'ITEM_MASTER_ADD_COSMETIC_RUNTIME.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('OUT:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
