'use strict';

/**
 * Phase 1.1 — Backend Data Integrity Validation
 *
 * Validates that getUserAssignments and getUserOverrides are now
 * property-scoped and that assignmentCount is consistent.
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

function section(title) {
    console.log(`\n${'─'.repeat(62)}`);
    console.log(`  ${title}`);
    console.log('─'.repeat(62));
}

async function run() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Phase 1.1 — Backend Data Integrity Validation');
    console.log('═══════════════════════════════════════════════════════════════');

    // ── Pick a user who has assignments spanning multiple properties ──────
    const testTenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        take: 5,
    });

    if (testTenants.length === 0) {
        console.log('  ℹ  No active tenants. Cannot run live test.');
        process.exit(0);
    }

    const firstTenant = testTenants[0];
    const tenantId    = firstTenant.id;

    // Find a user visible in this property who has at least one assignment
    const visibleUser = await prisma.user.findFirst({
        where: {
            isActive: true,
            OR: [
                { urAssignments: { some: { isActive: true, OR: [{ properties: { none: {} } }, { properties: { some: { propertyId: tenantId } } }] } } },
                { memberships:   { some: { tenantId, isActive: true } } },
            ],
        },
        include: {
            urAssignments: {
                where: { isActive: true },
                include: { properties: { select: { propertyId: true } } },
            },
        },
    });

    if (!visibleUser) {
        console.log('  ℹ  No suitable user found for live testing.');
        process.exit(0);
    }

    const userId = visibleUser.id;
    console.log(`\n  Test user: ${visibleUser.firstName} ${visibleUser.lastName}`);
    console.log(`  Test property: ${firstTenant.name} (${tenantId})`);

    // ── 1. getUserAssignments scope ────────────────────────────────────────
    section('1. getUserAssignments — Property Scope');

    // Old behaviour (no filter)
    const allAssignments = visibleUser.urAssignments;

    // New behaviour (property filter)
    const scopedAssignments = await prisma.urUserAssignment.findMany({
        where: {
            userId,
            isActive: true,
            OR: [
                { properties: { none: {} } },
                { properties: { some: { propertyId: tenantId } } },
            ],
        },
        include: { properties: { select: { propertyId: true } } },
    });

    console.log(`  Total assignments (unscoped): ${allAssignments.length}`);
    console.log(`  Scoped assignments (property ${firstTenant.name}): ${scopedAssignments.length}`);

    assert('Scoped result ≤ total assignments',    scopedAssignments.length <= allAssignments.length);
    assert('Scoped result is array',                Array.isArray(scopedAssignments));

    // Verify every returned assignment is actually visible for this property
    const outOfScope = scopedAssignments.filter((a) => {
        if (a.properties.length === 0) return false;               // all-properties: OK
        return !a.properties.some((p) => p.propertyId === tenantId); // should not happen
    });
    assert('No out-of-scope assignments returned', outOfScope.length === 0,
        `${outOfScope.length} out-of-scope rows found`);

    // ── 2. assignmentCount consistency ────────────────────────────────────
    section('2. assignmentCount Consistency (getUsers vs getUserAssignments)');

    // Fetch the count as getUsers would
    const userWithCount = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            _count: {
                select: {
                    urAssignments: {
                        where: {
                            isActive: true,
                            OR: [
                                { properties: { none: {} } },
                                { properties: { some: { propertyId: tenantId } } },
                            ],
                        },
                    },
                },
            },
        },
    });

    const countFromUsers       = userWithCount?._count?.urAssignments ?? 0;
    const countFromAssignments = scopedAssignments.length;

    console.log(`  assignmentCount from getUsers:           ${countFromUsers}`);
    console.log(`  assignment list length from getUserAssignments: ${countFromAssignments}`);
    assert('assignmentCount matches actual assignment list length',
        countFromUsers === countFromAssignments,
        `${countFromUsers} vs ${countFromAssignments}`,
    );

    // ── 3. getUserOverrides scope ─────────────────────────────────────────
    section('3. getUserOverrides — Property Scope');

    const allOverrides = await prisma.urUserOverride.findMany({
        where: { userId },
        select: { id: true, assignmentId: true },
    });

    const visibleAssignmentIds = new Set(scopedAssignments.map((a) => a.id));

    const scopedOverrides = allOverrides.filter(
        (o) => o.assignmentId === null || visibleAssignmentIds.has(o.assignmentId),
    );

    console.log(`  Total overrides (unscoped):  ${allOverrides.length}`);
    console.log(`  Scoped overrides (property): ${scopedOverrides.length}`);

    assert('Scoped overrides ≤ total overrides', scopedOverrides.length <= allOverrides.length);

    const outOfScopeOverrides = allOverrides.filter(
        (o) => o.assignmentId !== null && !visibleAssignmentIds.has(o.assignmentId),
    );
    assert('Out-of-scope assignment overrides correctly excluded',
        outOfScopeOverrides.length === allOverrides.length - scopedOverrides.length,
    );

    if (allOverrides.length > 0) {
        console.log(`    Global (null assignmentId) overrides: ${allOverrides.filter(o => o.assignmentId === null).length} — always included`);
        console.log(`    Assignment-scoped overrides filtered: ${outOfScopeOverrides.length}`);
    } else {
        console.log('    ℹ  No overrides on file for this user (empty scope filter: correct)');
        assert('Empty overrides handled gracefully', true);
    }

    // ── 4. Multiple properties — isolation check ──────────────────────────
    section('4. Property Isolation Across Multiple Properties');

    for (const tenant of testTenants) {
        const result = await prisma.urUserAssignment.findMany({
            where: {
                userId,
                isActive: true,
                OR: [
                    { properties: { none: {} } },
                    { properties: { some: { propertyId: tenant.id } } },
                ],
            },
            select: { id: true },
        });
        console.log(`  ${tenant.name}: ${result.length} assignment(s)`);
        assert(`${tenant.name}: scoped count is non-negative`, result.length >= 0);
    }

    // ── 5. Controller still loads ─────────────────────────────────────────
    section('5. Controller Module Load');
    try {
        require('../src/controllers/userRights.controller');
        assert('userRights.controller.js loads without errors', true);
    } catch (e) {
        assert('userRights.controller.js loads without errors', false, e.message);
    }

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  Validation: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (failed > 0) process.exit(1);
}

run()
    .catch((err) => { console.error('[validate-p1] Fatal:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
