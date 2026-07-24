'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR, API_BASE, FE_BASE, HOTEL_A, HOTEL_B, USERS_GH, USERS_PLATFORM } = require('./lib/constants');
const { getSession } = require('./lib/http');
const { prisma, getStockFixture, getDepartments } = require('./lib/evidence');

async function discoverOrgManager() {
  const orgMembers = await prisma.tenantMember.findMany({
    where: { role: { code: 'ORG_MANAGER' }, isActive: true },
    include: { user: { select: { email: true, id: true } }, tenant: { select: { slug: true, id: true } } },
    take: 10,
  });
  return orgMembers;
}

async function discoverHotelAdmin() {
  return prisma.tenantMember.findMany({
    where: { tenantId: HOTEL_A.id, role: { code: { in: ['HOTEL_ADMIN', 'ADMIN'] } }, isActive: true },
    include: { user: { select: { email: true } }, role: { select: { code: true } } },
  });
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const executedAt = new Date().toISOString();
  const stock = await getStockFixture(HOTEL_A.id);
  const depts = await getDepartments(HOTEL_A.id);
  const orgMembers = await discoverOrgManager();
  const hotelAdmins = await discoverHotelAdmin();

  const sessions = {};
  for (const [key, spec] of Object.entries(USERS_GH)) {
    const s = await getSession(API_BASE, spec, HOTEL_A.slug);
    sessions[key] = {
      email: spec.email,
      role: spec.role,
      loginOk: s.ok,
      httpStatus: s.loginRes?.status,
      permissions: s.permissions?.slice?.(0, 20) || [],
      permissionCount: s.permissions?.length || 0,
      tenantSlug: s.user?.tenant?.slug,
    };
  }

  const superS = await getSession(API_BASE, USERS_PLATFORM.SUPER_ADMIN, HOTEL_A.slug);
  const superGh = superS.ok ? superS : await (async () => {
    const base = await getSession(API_BASE, USERS_PLATFORM.SUPER_ADMIN, 'platform');
    if (!base.ok) return base;
    const { switchTenant } = require('./lib/http');
    const sw = await switchTenant(API_BASE, base.token, HOTEL_A.slug);
    if (sw.status !== 200) return { ok: false, loginRes: sw };
    return {
      ok: true,
      token: sw.data.data.accessToken,
      user: sw.data.data.user,
      permissions: sw.data.data.user?.permissions || [],
    };
  })();

  const env = {
    executedAt,
    apiBase: API_BASE,
    frontendBase: FE_BASE,
    database: process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') : 'from .env',
    hotelA: HOTEL_A,
    hotelB: HOTEL_B,
    fixtureTag: 'CLOSEOUT_RT_AUDIT',
    stockFixture: stock,
    departments: depts,
    orgManagerMembers: orgMembers.map((m) => ({
      email: m.user.email,
      tenantSlug: m.tenant.slug,
      tenantId: m.tenant.id,
    })),
    hotelAdminMembers: hotelAdmins.map((m) => ({ email: m.user.email, role: m.role.code })),
    userSessions: sessions,
    superAdminOperational: {
      email: USERS_PLATFORM.SUPER_ADMIN.email,
      loginOk: superGh.ok,
      tenantSlug: superGh.user?.tenant?.slug,
      permissionCount: superGh.permissions?.length || 0,
    },
    accPublishedWorkflow: await prisma.accWorkflowVersion.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, versionNumber: true, definition: { select: { key: true, module: { select: { key: true } } } } },
      take: 20,
    }),
  };

  const md = `# Closeout Runtime Audit — Execution Environment

**Executed at:** ${executedAt}

## Tenants

| Label | Slug | ID |
|-------|------|-----|
| Hotel A | ${HOTEL_A.slug} | ${HOTEL_A.id} |
| Hotel B | ${HOTEL_B.slug} | ${HOTEL_B.id} |

## API / Frontend

- API: ${API_BASE}
- Frontend: ${FE_BASE}

## Stock fixture (Hotel A)

\`\`\`json
${JSON.stringify(stock, null, 2)}
\`\`\`

## Users tested (login probe)

\`\`\`json
${JSON.stringify(sessions, null, 2)}
\`\`\`

## ORG_MANAGER memberships

\`\`\`json
${JSON.stringify(env.orgManagerMembers, null, 2)}
\`\`\`

## SUPER_ADMIN operational (Hotel A context)

\`\`\`json
${JSON.stringify(env.superAdminOperational, null, 2)}
\`\`\`

`;

  fs.writeFileSync(path.join(REPORT_DIR, 'EXECUTION_ENVIRONMENT.md'), md);
  fs.writeFileSync(path.join(REPORT_DIR, 'EXECUTION_ENVIRONMENT.json'), JSON.stringify(env, null, 2));
  console.log('Wrote EXECUTION_ENVIRONMENT to', REPORT_DIR);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
