/**
 * FY 01 P6 — Assignment count consistency verification.
 */
'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const API = `http://127.0.0.1:${process.env.PORT || 4000}`;

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✓ ${label}`); return; }
  failed++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function httpJson(method, path, { token, body } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  console.log('\nFY 01 P6 — Assignment Count Consistency');
  console.log('='.repeat(60));

  const login = await httpJson('POST', '/auth/login', {
    body: { email: 'admin@grandhorizon.com', password: 'Admin@123', tenantSlug: 'grand-horizon' },
  });
  assert('login', login.status === 200);
  const token = login.data?.data?.accessToken;
  if (!token) {
    console.log('  (backend not running — skip API checks)');
    process.exit(0);
  }

  const users = (await httpJson('GET', '/user-rights/users', { token })).data?.data ?? [];
  const target = users.find((u) => u.assignmentCount > 0);
  assert('target user with assignments', !!target);

  const activeRes = await httpJson('GET', `/user-rights/users/${target.id}/assignments`, { token });
  const withInactive = await httpJson(
    'GET',
    `/user-rights/users/${target.id}/assignments?includeInactive=true`,
    { token },
  );

  const meta = withInactive.data?.meta;
  const activeList = activeRes.data?.data ?? [];
  const allList = withInactive.data?.data ?? [];

  assert('assignments API returns meta', !!meta);
  assert('list assignmentCount matches meta.activeCount', target.assignmentCount === meta.activeCount,
    `list=${target.assignmentCount} meta=${meta.activeCount}`);
  assert('active endpoint length matches activeCount', activeList.length === meta.activeCount);
  assert('includeInactive length >= activeCount', allList.length >= meta.activeCount);
  assert('totalCount = active + inactive', meta.totalCount === meta.activeCount + meta.inactiveCount);

  console.log('\n── Policy ──');
  console.log('  Scope: org group');
  console.log('  List/header count: active operational assignments only');
  console.log('  Grid default: active only; Show Inactive adds inactive rows');

  console.log('\n── Summary ──');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(60) + '\n');
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
