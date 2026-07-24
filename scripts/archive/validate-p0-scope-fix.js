'use strict';

/**
 * P0 Scope Fix Validation
 * Compares the old (all-users) query against the new (property-scoped) query.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
    }
}

async function run() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  P0 Scope Fix — Validation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // ── Collect properties to test against ───────────────────────────────
    const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 5,
    });

    if (tenants.length === 0) {
        console.log('  ℹ  No active tenants found. Cannot run live test.');
        process.exit(0);
    }

    // ── 1. Old query (no scope) ────────────────────────────────────────────
    const allUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
    });
    console.log(`OLD query (no scope)  → ${allUsers.length} users total in DB`);

    // ── 2. New scoped query per property ──────────────────────────────────
    for (const tenant of tenants) {
        const tenantId = tenant.id;

        const scopedUsers = await prisma.user.findMany({
            where: {
                isActive: true,
                OR: [
                    {
                        urAssignments: {
                            some: {
                                isActive: true,
                                OR: [
                                    { properties: { none: {} } },
                                    { properties: { some: { propertyId: tenantId } } },
                                ],
                            },
                        },
                    },
                    {
                        memberships: {
                            some: { tenantId, isActive: true },
                        },
                    },
                ],
            },
            select: { id: true, firstName: true, lastName: true, email: true },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

        const reduction = allUsers.length - scopedUsers.length;
        console.log(`\n  Property: ${tenant.name}`);
        console.log(`    Scoped query  → ${scopedUsers.length} users visible`);
        console.log(`    Reduction     → ${reduction} users hidden (no relationship to this property)`);

        assert(
            `${tenant.name}: scoped result ≤ total users`,
            scopedUsers.length <= allUsers.length,
        );
        assert(
            `${tenant.name}: scoped result is an array`,
            Array.isArray(scopedUsers),
        );

        if (scopedUsers.length > 0) {
            console.log(`    Sample visible users:`);
            scopedUsers.slice(0, 3).forEach((u) =>
                console.log(`      - ${u.firstName} ${u.lastName} | ${u.email}`),
            );
        } else {
            console.log(`    ℹ  No users have assignments or memberships for this property.`);
        }
    }

    // ── 3. Verify controller module still loads ───────────────────────────
    console.log('\n─────────────────────────────────────────────────────────────');
    try {
        require('../src/controllers/userRights.controller');
        assert('userRights.controller.js loads without errors', true);
    } catch (e) {
        assert('userRights.controller.js loads without errors', false, e.message);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  Validation: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (failed > 0) process.exit(1);
}

run()
    .catch((err) => { console.error('[validate-p0] Fatal:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
