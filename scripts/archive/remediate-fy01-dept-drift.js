/**
 * FY 01 P0 — Align assignment department scope with TenantMember.departmentId.
 *
 * When an active single-property assignment has no department junction rows (All Departments)
 * but the linked TenantMember has a specific department, add that department to the assignment.
 *
 * Usage:
 *   node scripts/remediate-fy01-dept-drift.js --dry-run
 *   node scripts/remediate-fy01-dept-drift.js --apply
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const auditLogger = require('../src/engines/ur-audit.logger');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;

async function findDriftRows() {
    const activeAssignments = await prisma.urUserAssignment.findMany({
        where: { isActive: true, properties: { some: {} } },
        include: {
            role: { select: { code: true } },
            user: { select: { id: true, email: true } },
            properties: { include: { property: { select: { id: true, name: true } } } },
            departments: true,
        },
    });

    const plans = [];

    for (const a of activeAssignments) {
        if (a.properties.length !== 1) continue;
        const propertyId = a.properties[0].propertyId;
        const member = await prisma.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: propertyId, userId: a.userId } },
            include: { department: { select: { id: true, name: true } } },
        });
        if (!member?.isActive || !member.departmentId || member.canViewAllDepartments) continue;

        const deptIds = a.departments.map((d) => d.departmentId);
        if (deptIds.length === 0) {
            plans.push({
                assignmentId: a.id,
                email: a.user.email,
                property: a.properties[0].property?.name,
                roleCode: a.role?.code,
                departmentId: member.departmentId,
                departmentName: member.department?.name,
                action: 'add-department-to-assignment',
            });
        } else if (deptIds.length === 1 && deptIds[0] !== member.departmentId) {
            plans.push({
                assignmentId: a.id,
                email: a.user.email,
                property: a.properties[0].property?.name,
                roleCode: a.role?.code,
                departmentId: member.departmentId,
                departmentName: member.department?.name,
                currentDepartmentId: deptIds[0],
                action: 'replace-department-on-assignment',
            });
        }
    }

    return plans;
}

async function resolveActorId() {
    const superUser = await prisma.user.findFirst({
        where: { email: 'superadmin@ose.cloud', isActive: true },
        select: { id: true },
    });
    return superUser?.id ?? null;
}

async function applyPlan(plan, actorId) {
    if (plan.action === 'add-department-to-assignment') {
        await prisma.urAssignmentDepartment.upsert({
            where: {
                assignmentId_departmentId: {
                    assignmentId: plan.assignmentId,
                    departmentId: plan.departmentId,
                },
            },
            create: { assignmentId: plan.assignmentId, departmentId: plan.departmentId },
            update: {},
        });
        if (actorId) {
            await auditLogger.logScopeDepartmentAdded(actorId, {
                id: plan.assignmentId,
                assignmentId: plan.assignmentId,
                departmentId: plan.departmentId,
            });
        }
        return;
    }

    if (plan.action === 'replace-department-on-assignment') {
        await prisma.$transaction(async (tx) => {
            await tx.urAssignmentDepartment.deleteMany({
                where: { assignmentId: plan.assignmentId },
            });
            await tx.urAssignmentDepartment.create({
                data: {
                    assignmentId: plan.assignmentId,
                    departmentId: plan.departmentId,
                },
            });
        });
    }
}

async function main() {
    console.log(`\nFY 01 P0 — Department Drift Remediation — ${dryRun ? 'DRY RUN' : 'APPLY'}`);
    console.log('='.repeat(60));

    const plans = await findDriftRows();
    if (plans.length === 0) {
        console.log('No active department drift rows found.');
        console.log('');
        return;
    }

    const actorId = apply ? await resolveActorId() : null;

    for (const plan of plans) {
        console.log(`\n${plan.email} | ${plan.property} | ${plan.roleCode}`);
        console.log(`  Action: ${plan.action}`);
        console.log(`  Department: ${plan.departmentName} (${plan.departmentId})`);
        if (apply) {
            await applyPlan(plan, actorId);
            console.log('  Applied ✓');
        }
    }

    console.log(`\nTotal: ${plans.length} row(s)`);
    console.log('='.repeat(60));
    console.log('');
}

main()
    .catch((e) => {
        console.error('FAILED:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
