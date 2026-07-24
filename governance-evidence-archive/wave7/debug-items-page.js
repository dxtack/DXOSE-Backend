'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { discoverWave7Context } = require('./wave7-discover-context');
const FE_ROOT = path.resolve(__dirname, '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FE_ROOT, 'node_modules', 'playwright'));
const FE_URL = 'http://127.0.0.1:4200';

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

(async () => {
    const ctx = await discoverWave7Context();
    console.log('tenant', ctx.tenant.slug, ctx.sample);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(authInitScript(ctx));
    const page = await context.newPage();
    await page.goto(`${FE_URL}/items`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    const probe = await page.evaluate(() => ({
        path: location.pathname,
        hasItemsList: !!document.querySelector('app-items-list'),
        hasCard: !!document.querySelector('app-items-list .registry-work-card'),
        tbodyTr: document.querySelectorAll('app-items-list .ant-table-tbody tr').length,
        spinning: !!document.querySelector('app-items-list .ant-spin-spinning'),
        listError: document.querySelector('app-items-list .items-work-region-state--error')?.innerText || null,
        title: document.title,
    }));
    console.log(JSON.stringify(probe, null, 2));
    await page.screenshot({ path: path.join(__dirname, 'screenshots', 'DEBUG-items-1366.png') });
    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
