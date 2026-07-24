/**
 * NOTE 05 — Remediate multi-property assignments → 1:1:1 fan-out.
 *
 * Usage:
 *   node scripts/remediate-note05-multi-property.js --dry-run
 *   node scripts/remediate-note05-multi-property.js --apply
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { normalizeRole } = require('../src/services/rbac.service');
const {
    provisionMembershipForProperty,
    retireMembershipForAssignment,
    addDepartmentsToAssignment,
} = require('../src/services/acc-assignment-membership-provision.service');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;

async function splitAssignment(assignment) {
    const roleCode = normalizeRole(assignment.role.code);
    const propertyRows = assignment.properties;
    const departmentIds = assignment.departments.map((d) => d.departmentId);
    const primaryDept = departmentIds[0] ?? null;

    const orgRoot = await prisma.tenant.findFirst({
        where: { parentId: null, OR: [{ id: { in: propertyRows.map((p) => p.propertyId) } }] },
        select: { id: true },
    });
    const orgRootId = orgRoot?.id ?? null;

    let targets = propertyRows.map((p) => p.propertyId);
    if (roleCode !== 'ORG_MANAGER' && orgRootId) {
        targets = targets.filter((id) => id !== orgRootId);
    }
    targets = [...new Set(targets)];

    return {
        assignmentId: assignment.id,
        userId: assignment.userId,
        email: assignment.user.email,
        roleCode,
        roleId: assignment.roleId,
        notes: assignment.notes,
        targets,
        departmentIds,
        primaryDept,
    };
}

async function remediateOne(plan, actorId = null) {
    const actions = [];

    if (plan.targets.length === 0) {
        actions.push({ action: 'deactivate-only', assignmentId: plan.assignmentId, reason: 'no-valid-branch-properties' });
        if (apply) {
            await prisma.$transaction(async (tx) => {
                const row = await tx.urUserAssignment.findUnique({
                    where: { id: plan.assignmentId },
                    include: { properties: true },
                });
                await retireMembershipForAssignment(tx, { ...row, userId: plan.userId });
                await tx.urUserAssignment.update({
                    where: { id: plan.assignmentId },
                    data: { isActive: false },
                });
            });
        }
        return actions;
    }

    for (const propertyId of plan.targets) {
        const existing = await prisma.urUserAssignment.findFirst({
            where: {
                userId: plan.userId,
                roleId: plan.roleId,
                isActive: true,
                properties: { some: { propertyId } },
                id: { not: plan.assignmentId },
            },
        });
        if (existing) {
            actions.push({ action: 'skip-existing', propertyId, assignmentId: existing.id });
            continue;
        }
        actions.push({ action: 'provision', propertyId, userId: plan.userId, roleCode: plan.roleCode });
        if (apply) {
            await prisma.$transaction(async (tx) => {
                const created = await provisionMembershipForProperty(tx, {
                    userId: plan.userId,
                    roleCode: plan.roleCode,
                    propertyId,
                    departmentId: plan.primaryDept,
                    notes: plan.notes,
                });
                await addDepartmentsToAssignment(tx, actorId ?? plan.userId, created.id, plan.departmentIds.slice(1));
            });
        }
    }

    actions.push({ action: 'deactivate-multi', assignmentId: plan.assignmentId });
    if (apply) {
        await prisma.$transaction(async (tx) => {
            const row = await tx.urUserAssignment.findUnique({
                where: { id: plan.assignmentId },
                include: { properties: { select: { propertyId: true } } },
            });
            await retireMembershipForAssignment(tx, { ...row, userId: plan.userId });
            await tx.urUserAssignment.update({
                where: { id: plan.assignmentId },
                data: { isActive: false },
            });
        });
    }

    return actions;
}

async function main() {
    console.log(`\nNOTE 05 Remediation — ${dryRun ? 'DRY RUN' : 'APPLY'}`);
    console.log('='.repeat(55));

    const bad = await prisma.urUserAssignment.findMany({
        where: { isActive: true },
        include: {
            role: { select: { id: true, code: true } },
            user: { select: { id: true, email: true } },
            properties: { include: { property: { select: { id: true, name: true, parentId: true } } } },
            departments: { select: { departmentId: true } },
        },
    });

    const toSplit = bad.filter((a) => a.properties.length > 1);

    if (toSplit.length === 0) {
        console.log('No multi-property active assignments found.');
        return;
    }

    for (const assignment of toSplit) {
        const plan = await splitAssignment(assignment);
        console.log(`\nUser: ${plan.email}`);
        console.log(`  Assignment: ${plan.assignmentId} (${plan.roleCode}, ${assignment.properties.length} properties)`);
        console.log(`  Split targets: ${plan.targets.length}`);

        const actions = await remediateOne(plan);
        actions.forEach((a) => console.log(`    → ${a.action}${a.propertyId ? ` ${a.propertyId}` : ''}`));
    }

    console.log('\nDone.');
    if (dryRun) console.log('Re-run with --apply to execute.');
}

main()
    .catch((e) => {
        console.error('FAILED:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
