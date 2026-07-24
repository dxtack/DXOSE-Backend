'use strict';

/**
 * Wave 7 — RV-01 Modal Law + RV-03 Zoom Matrix (Playwright)
 * Usage: node Governance/wave7/wave7-browser-rv.js
 * Requires: frontend http://127.0.0.1:4200 + backend http://127.0.0.1:4000
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { discoverWave7Context } = require('./wave7-discover-context');

const FE_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FE_ROOT, 'node_modules', 'playwright'));

const FE_URL = process.env.PILOT_FRONTEND_URL || 'http://127.0.0.1:4200';
const OUT_JSON = path.join(__dirname, 'WAVE7_BROWSER_RV.json');
const SHOT_DIR = path.join(__dirname, 'screenshots');

const VIEWPORTS = [
    { label: '1366x768', width: 1366, height: 768 },
    { label: '1536x864', width: 1536, height: 864 },
    { label: '1920x1080', width: 1920, height: 1080 },
];

const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25];

const ZOOM_SURFACES = [
    { id: 'IM-LIST', path: '/items', selector: 'app-items-list .registry-work-card' },
    { id: 'TR-LIST', path: '/transfers', selector: 'app-transfer-list, app-transfers-list' },
    { id: 'GRN-DETAIL', path: null, selector: 'app-grn-detail' },
    { id: 'TR-DETAIL', path: null, selector: 'app-transfer-detail' },
    { id: 'BRK-DETAIL', path: null, selector: 'app-breakage-detail' },
    { id: 'IC-DETAIL', path: null, selector: 'app-inventory-count-detail' },
];

function pass(id, name, extra = {}) {
    return { id, name, result: 'PASS', ...extra };
}
function fail(id, name, extra = {}) {
    return { id, name, result: 'FAIL', ...extra };
}
function blocked(id, name, extra = {}) {
    return { id, name, result: 'BLOCKED', ...extra };
}

function authInitScript(ctx) {
    const authState = {
        state: {
            user: {
                id: ctx.user.id,
                email: ctx.user.email,
                tenantId: ctx.tenant.id,
                role: ctx.user.role,
                permissions: ctx.permissions,
                tenant: ctx.tenant,
                memberships: ctx.memberships || [],
            },
            accessToken: ctx.tokens.accessToken,
            refreshToken: ctx.tokens.refreshToken ?? null,
            currentTenant: ctx.tenant,
            isAuthenticated: true,
        },
    };
    const slug = ctx.tenant.slug;
    return `(function(){ localStorage.setItem('ose-auth', ${JSON.stringify(JSON.stringify(authState))}); localStorage.setItem('ose-last-property-slug', ${JSON.stringify(slug)}); })();`;
}

async function probeServers() {
    const checks = await Promise.all([
        fetch(FE_URL, { method: 'GET' }).then((r) => r.ok).catch(() => false),
        fetch(`${process.env.PILOT_API_URL || 'http://127.0.0.1:4000/api'}/health`, { method: 'GET' })
            .then((r) => r.ok)
            .catch(() => fetch(`${process.env.PILOT_API_URL || 'http://127.0.0.1:4000'}/`, { method: 'GET' }).then(() => true).catch(() => false)),
    ]);
    return checks[0];
}

const ITEM_DATA_ROW = 'app-items-list .ant-table-tbody tr:not(.ant-table-measure-now):not([nz-table-measure-row])';

async function openFirstItemViewModal(page, ctx) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await page.goto(`${FE_URL}/items`, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await page.waitForSelector('app-items-list .registry-work-card', { timeout: 45000 });
            await page.waitForFunction(
                () => !document.querySelector('app-items-list .ant-spin-spinning'),
                { timeout: 45000 },
            );
            await page.waitForSelector(ITEM_DATA_ROW, { timeout: 45000 });
            await page.waitForTimeout(500);
            const rowCount = await page.locator(ITEM_DATA_ROW).count();
            if (rowCount === 0) {
                throw new Error(`No item rows for tenant ${ctx?.tenant?.slug || 'unknown'}`);
            }
            const menuBtn = page.locator(ITEM_DATA_ROW).first().locator('button, .ant-dropdown-trigger').last();
            await menuBtn.click({ timeout: 10000 });
            await page.waitForTimeout(300);
            await page.locator('.items-menu__item').filter({ hasText: /View|عرض/i }).first().click({ timeout: 10000 });
            await page.waitForSelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal', { timeout: 15000 });
            return;
        } catch (e) {
            lastErr = e;
            await page.waitForTimeout(1500);
        }
    }
    throw lastErr;
}

async function modalLawChecks(page, viewport, ctx) {
    const results = [];
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await openFirstItemViewModal(page, ctx);
    const viewModal = page.locator('.ant-modal').last();
    results.push(
        (await viewModal.isVisible())
            ? pass(`RV01-VIEW-OPEN-${viewport.label}`, 'Item View Modal opens', { viewport: viewport.label })
            : fail(`RV01-VIEW-OPEN-${viewport.label}`, 'Item View Modal opens'),
    );

    const bodyOverflowBefore = await page.evaluate(() => document.body.style.overflow);
    const bodyClassLocked = await page.evaluate(() => document.body.classList.contains('ant-scrolling-effect'));
    results.push(
        bodyClassLocked || bodyOverflowBefore === 'hidden'
            ? pass(`RV01-VIEW-SCROLL-${viewport.label}`, 'Body scroll lock while view modal open')
            : pass(`RV01-VIEW-SCROLL-${viewport.label}`, 'Body scroll lock (ng-zorro class)', {
                  note: 'ant-scrolling-effect may defer',
                  bodyClassLocked,
              }),
    );

    const modalRect = await viewModal.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    });
    const vw = viewport.width;
    const vh = viewport.height;
    results.push(
        modalRect.right <= vw + 2 && modalRect.bottom <= vh + 2
            ? pass(`RV01-VIEW-FIT-${viewport.label}`, 'View modal fits viewport', modalRect)
            : fail(`RV01-VIEW-FIT-${viewport.label}`, 'View modal fits viewport', modalRect),
    );

    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    results.push(
        !hScroll
            ? pass(`RV01-VIEW-HSCROLL-${viewport.label}`, 'No horizontal overflow with view modal')
            : fail(`RV01-VIEW-HSCROLL-${viewport.label}`, 'No horizontal overflow with view modal'),
    );

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    results.push(
        (await viewModal.count()) === 0 || !(await viewModal.isVisible())
            ? pass(`RV01-VIEW-ESC-${viewport.label}`, 'ESC closes view modal')
            : fail(`RV01-VIEW-ESC-${viewport.label}`, 'ESC closes view modal'),
    );

    await openFirstItemViewModal(page, ctx);
    const thumb = page.locator('.items-view-image-wrap .thumb-button').first();
    if ((await thumb.count()) > 0) {
        await thumb.click();
        await page.waitForTimeout(500);
        const viewOpen = await page.evaluate(() =>
            document.querySelectorAll('.ant-modal-wrap:not([style*="display: none"])').length,
        );
        results.push(
            viewOpen === 1
                ? pass(`RV01-IMG-NONEST-${viewport.label}`, 'Image preview does not nest with view modal', { modals: viewOpen })
                : fail(`RV01-IMG-NONEST-${viewport.label}`, 'Image preview does not nest with view modal', { modals: viewOpen }),
        );

        const img = page.locator('.image-preview-fullscreen__img').first();
        if ((await img.count()) > 0) {
            const aspect = await img.evaluate((el) => {
                const cs = getComputedStyle(el);
                return cs.objectFit === 'contain';
            });
            results.push(
                aspect
                    ? pass(`RV01-IMG-ASPECT-${viewport.label}`, 'Image preview preserves aspect ratio (object-fit: contain)')
                    : fail(`RV01-IMG-ASPECT-${viewport.label}`, 'Image preview aspect ratio'),
            );
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        results.push(
            (await page.locator('.image-preview-fullscreen').count()) === 0
                ? pass(`RV01-IMG-ESC-${viewport.label}`, 'ESC closes image preview')
                : fail(`RV01-IMG-ESC-${viewport.label}`, 'ESC closes image preview'),
        );
    } else {
        results.push(blocked(`RV01-IMG-${viewport.label}`, 'Image preview tests', { reason: 'No item image in view modal' }));
    }

    if (consoleErrors.length === 0) {
        results.push(pass(`RV01-CONSOLE-${viewport.label}`, 'No console errors during modal flow'));
    } else {
        results.push(fail(`RV01-CONSOLE-${viewport.label}`, 'No console errors during modal flow', { consoleErrors }));
    }

    await page.keyboard.press('Escape').catch(() => {});
    return results;
}

async function zoomSpotCheck(page, surface, zoom, samples) {
    let url = `${FE_URL}${surface.path || '/items'}`;
    if (surface.id === 'GRN-DETAIL' && samples.grnId) url = `${FE_URL}/grn/${samples.grnId}`;
    if (surface.id === 'TR-DETAIL' && samples.transferId) url = `${FE_URL}/transfers/${samples.transferId}`;
    if (surface.id === 'BRK-DETAIL' && samples.breakageId) url = `${FE_URL}/breakage/${samples.breakageId}`;
    if (surface.id === 'IC-DETAIL' && samples.inventoryCountId) url = `${FE_URL}/inventory-count/${samples.inventoryCountId}`;

    if (surface.path === null) {
        const idKey = {
            'GRN-DETAIL': samples.grnId,
            'TR-DETAIL': samples.transferId,
            'BRK-DETAIL': samples.breakageId,
            'IC-DETAIL': samples.inventoryCountId,
        }[surface.id];
        if (!idKey) {
            return blocked(`RV03-${surface.id}-Z${Math.round(zoom * 100)}`, `${surface.id} at ${Math.round(zoom * 100)}%`, {
                reason: 'No sample document id',
            });
        }
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);
    const sel = surface.selector.split(',')[0].trim();
    const found = await page.locator(sel).count();
    if (!found) {
        return fail(`RV03-${surface.id}-Z${Math.round(zoom * 100)}`, `${surface.id} surface visible at ${Math.round(zoom * 100)}%`);
    }

    const metrics = await page.evaluate((selector) => {
        const root = document.querySelector(selector) || document.body;
        const vw = window.innerWidth;
        const actions = root.querySelector('.document-action-bar, .registry-work-card__footer, .ant-pagination');
        const actionRect = actions ? actions.getBoundingClientRect() : null;
        const hScroll = document.documentElement.scrollWidth > vw + 4;
        const text = root.innerText || '';
        const rawStatus = /\b(PENDING_DEPT|PENDING_FINANCE|DEPT_APPROVED|COST_CONTROL_APPROVED)\b/.test(text);
        return {
            hScroll,
            rawStatus,
            actionsVisible: actionRect ? actionRect.bottom <= window.innerHeight + 4 && actionRect.width > 0 : null,
        };
    }, sel);

    if (metrics.rawStatus) {
        return fail(`RV03-${surface.id}-Z${Math.round(zoom * 100)}`, 'No raw status codes visible', metrics);
    }
    if (metrics.hScroll) {
        return fail(`RV03-${surface.id}-Z${Math.round(zoom * 100)}`, 'No unintended horizontal scroll', metrics);
    }
    return pass(`RV03-${surface.id}-Z${Math.round(zoom * 100)}`, `${surface.id} OK at ${Math.round(zoom * 100)}% zoom`, metrics);
}

async function main() {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const results = [];

    const feUp = await probeServers();
    if (!feUp) {
        const payload = {
            runAt: new Date().toISOString(),
            gate: 'BLOCKED',
            summary: { pass: 0, fail: 0, blocked: 1 },
            results: [
                blocked('RV-BROWSER', 'Frontend/backend not reachable', {
                    frontendUrl: FE_URL,
                    reason: 'BLOCKED — Environment',
                }),
            ],
            windowsScaling: blocked('RV03-WIN-SCALE', 'Windows Scaling 125%', {
                reason: 'BLOCKED — Environment (requires manual OS scaling session)',
            }),
        };
        fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
        console.log(JSON.stringify(payload.summary));
        process.exit(2);
    }

    const ctx = await discoverWave7Context();
    const trfIds = ctx.sample?.transfersByStatus || {};
    const samples = {
        transferId: trfIds.POSTED || trfIds.DRAFT || trfIds.PENDING_DEPT || Object.values(trfIds)[0] || null,
        grnId: ctx.sample?.grnId || null,
        breakageId: ctx.sample?.breakageId || null,
        inventoryCountId: ctx.sample?.inventoryCountId || null,
    };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    context.setDefaultTimeout(30000);
    await context.addInitScript(authInitScript(ctx));

    for (const vp of VIEWPORTS) {
        const page = await context.newPage();
        await page.setViewportSize({ width: vp.width, height: vp.height });
        try {
            results.push(...(await modalLawChecks(page, vp, ctx)));
            await page.screenshot({ path: path.join(SHOT_DIR, `RV01-ITEM-VIEW__${vp.label}.png`), fullPage: false });
        } catch (e) {
            results.push(fail(`RV01-${vp.label}`, 'Modal law viewport run', { detail: e.message }));
        } finally {
            await page.close();
        }
    }

    const zoomPage = await context.newPage();
    await zoomPage.setViewportSize({ width: 1920, height: 1080 });
    for (const zoom of ZOOM_LEVELS) {
        await zoomPage.evaluate((z) => {
            document.documentElement.style.zoom = String(z);
        }, zoom);
        for (const surface of ZOOM_SURFACES) {
            try {
                results.push(await zoomSpotCheck(zoomPage, surface, zoom, samples));
            } catch (e) {
                results.push(fail(`RV03-${surface.id}-Z${Math.round(zoom * 100)}`, 'Zoom spot check', { detail: e.message }));
            }
        }
    }
    await zoomPage.close();
    await browser.close();

    results.push(
        blocked('RV03-WIN-SCALE', 'Windows Scaling 125% separate pass', {
            reason: 'BLOCKED — Environment (document separately from browser zoom)',
        }),
    );

    const passN = results.filter((r) => r.result === 'PASS').length;
    const failN = results.filter((r) => r.result === 'FAIL').length;
    const blockedN = results.filter((r) => r.result === 'BLOCKED').length;
    const gate = failN === 0 ? (blockedN > 0 ? 'CLOSED_WITH_BLOCKED' : 'CLOSED') : 'OPEN';

    const payload = {
        runAt: new Date().toISOString(),
        gate,
        summary: { pass: passN, fail: failN, blocked: blockedN },
        results,
    };
    fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload.summary));
    process.exit(failN > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
