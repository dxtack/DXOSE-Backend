/**
 * FY 01 P0 — Legacy assignment / NOTE 05 compliance inventory (read-only).
 *
 * Usage:
 *   node scripts/fy01-legacy-inventory.js
 *   node scripts/fy01-legacy-inventory.js --json
 *
 * Exit 1 when active NOTE 05 violations or active department drift remain.
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { getAssignmentCoverageReport } = require('../src/services/acc-p2-assignment-coverage.service');
const { extractLegacyTag } = require('../src/services/acc-membership-assignment-sync.service');

const prisma = new PrismaClient();
const jsonOut = process.argv.includes('--json');

const OPERATIONAL_ROLE_CODES = new Set([
    'STOREKEEPER', 'FINANCE_MANAGER', 'COST_CONTROL', 'DEPT_MANAGER',
    'GENERAL_MANAGER', 'SECURITY', 'AUDITOR', 'ADMIN',
]);

async function collectDepartmentDrift(activeAssignments, members) {
    const drift = [];
    for (const a of activeAssignments) {
        if (a.properties.length !== 1) continue;
        const propId = a.properties[0].propertyId;
        const member = members.find((m) => m.userId === a.userId && m.tenantId === propId);
        if (!member?.isActive || !member.user?.isActive) continue;

        const deptIds = a.departments.map((d) => d.departmentId);
        const roleCode = (a.role?.code ?? '').toUpperCase();

        if (deptIds.length === 1 && member.departmentId && member.departmentId !== deptIds[0]) {
            drift.push({
                assignmentId: a.id,
                email: a.user.email,
                property: a.properties[0].property?.name,
                roleCode,
                type: 'dept-mismatch',
                memberDept: member.department?.name,
                assignmentDept: a.departments[0].department?.name,
            });
        } else if (deptIds.length > 1 && member.departmentId && !deptIds.includes(member.departmentId)) {
            drift.push({
                assignmentId: a.id,
                email: a.user.email,
                property: a.properties[0].property?.name,
                roleCode,
                type: 'multi-dept-excludes-member',
                memberDept: member.department?.name,
            });
        } else if (deptIds.length === 0 && member.departmentId && !member.canViewAllDepartments) {
            drift.push({
                assignmentId: a.id,
                email: a.user.email,
                property: a.properties[0].property?.name,
                roleCode,
                type: 'all-depts-assignment-member-has-dept',
                memberDept: member.department?.name,
            });
        }
    }
    return drift;
}

async function collectNote05Violations(activeAssignments) {
    const multiProperty = [];
    const missingMembership = [];
    const orgRootOnOperational = [];
    const operationalAllProperties = [];

    for (const a of activeAssignments) {
        const propCount = a.properties.length;
        const roleCode = (a.role?.code ?? '').toUpperCase();

        if (propCount > 1) {
            multiProperty.push({
                assignmentId: a.id,
                email: a.user.email,
                roleCode,
                propertyCount: propCount,
            });
        }

        if (propCount === 0 && roleCode !== 'SUPER_ADMIN' && roleCode !== 'ORG_MANAGER') {
            operationalAllProperties.push({
                assignmentId: a.id,
                email: a.user.email,
                roleCode,
            });
        }

        if (OPERATIONAL_ROLE_CODES.has(roleCode) || (roleCode.includes('__') && roleCode !== 'ORG_MANAGER')) {
            for (const p of a.properties) {
                if (!p.property) continue;
                const branchChildCount = await prisma.tenant.count({
                    where: { parentId: p.propertyId, isActive: true },
                });
                if (branchChildCount > 0) {
                    orgRootOnOperational.push({
                        assignmentId: a.id,
                        email: a.user.email,
                        propertyName: p.property.name,
                        roleCode,
                    });
                }
            }
        }

        for (const p of a.properties) {
            const member = await prisma.tenantMember.findUnique({
                where: { tenantId_userId: { tenantId: p.propertyId, userId: a.userId } },
                select: { id: true, isActive: true },
            });
            if (!member || !member.isActive) {
                missingMembership.push({
                    assignmentId: a.id,
                    email: a.user.email,
                    propertyName: p.property?.name,
                    roleCode,
                });
            }
        }
    }

    return { multiProperty, missingMembership, orgRootOnOperational, operationalAllProperties };
}

async function collectByProperty() {
    const orgRoots = await prisma.tenant.findMany({
        where: { parentId: null, isActive: true },
        select: { id: true, name: true },
    });
    const orgById = Object.fromEntries(orgRoots.map((o) => [o.id, o.name]));

    const properties = await prisma.tenant.findMany({
        where: { parentId: { not: null }, isActive: true },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
    });

    const rows = [];
    for (const prop of properties) {
        const activeAssignments = await prisma.urUserAssignment.count({
            where: { isActive: true, properties: { some: { propertyId: prop.id } } },
        });
        const inactiveAssignments = await prisma.urUserAssignment.count({
            where: { isActive: false, properties: { some: { propertyId: prop.id } } },
        });
        const activeMembers = await prisma.tenantMember.count({
            where: { isActive: true, tenantId: prop.id },
        });
        rows.push({
            org: orgById[prop.parentId] ?? '?',
            property: prop.name,
            activeAssignments,
            inactiveAssignments,
            activeMembers,
        });
    }
    return rows;
}

async function main() {
    const [assignments, members, coverage] = await Promise.all([
        prisma.urUserAssignment.findMany({
            include: {
                role: { select: { code: true, name: true } },
                user: { select: { id: true, email: true, isActive: true } },
                properties: { include: { property: { select: { id: true, name: true, parentId: true } } } },
                departments: { include: { department: { select: { id: true, name: true } } } },
            },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.tenantMember.findMany({
            where: { isActive: true },
            include: {
                role: { select: { code: true, id: true } },
                user: { select: { email: true, isActive: true } },
                tenant: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
            },
        }),
        getAssignmentCoverageReport(),
    ]);

    const active = assignments.filter((a) => a.isActive);
    const inactive = assignments.filter((a) => !a.isActive);

    const noProperty = assignments.filter((a) => a.properties.length === 0);
    const multiProperty = assignments.filter((a) => a.properties.length > 1);
    const nonLegacy = assignments.filter((a) => !(a.notes ?? '').startsWith('legacy:'));

    const note05 = await collectNote05Violations(active);
    const departmentDrift = await collectDepartmentDrift(active, members);
    const byProperty = await collectByProperty();

  const legacyTags = new Set(
    assignments
      .map((a) => extractLegacyTag(a.notes))
      .filter(Boolean),
  );
    const membersNoAssignment = members.filter((m) => {
        if (!m.user?.isActive) return false;
        const tag = `legacy:${m.id}`;
        const hasLegacy = legacyTags.has(tag);
        const hasProp = active.some(
            (a) => a.userId === m.userId && a.properties.some((p) => p.propertyId === m.tenantId),
        );
        return !hasLegacy && !hasProp;
    });

    const activePropDist = {
        zero: active.filter((a) => a.properties.length === 0).length,
        one: active.filter((a) => a.properties.length === 1).length,
        multi: active.filter((a) => a.properties.length > 1).length,
    };

    const note05Pass =
        note05.multiProperty.length === 0 &&
        note05.missingMembership.length === 0 &&
        note05.orgRootOnOperational.length === 0 &&
        note05.operationalAllProperties.length === 0;

    const report = {
        databaseUrl: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@') ?? '(not set)',
        summary: {
            totalAssignments: assignments.length,
            activeAssignments: active.length,
            inactiveAssignments: inactive.length,
            noPropertyAssignments: noProperty.length,
            allPropertiesActive: noProperty.filter((a) => a.isActive).length,
            multiPropertyAssignments: multiProperty.length,
            multiPropertyActive: multiProperty.filter((a) => a.isActive).length,
            nonLegacyAssignments: nonLegacy.length,
            activePropertyDistribution: activePropDist,
            departmentDriftActive: departmentDrift.length,
            membersWithoutAssignment: membersNoAssignment.length,
            note05Pass,
            p2CoverageComplete: coverage.summary.coverageComplete,
            p2RoleDrift: coverage.summary.roleDrift,
            p2InactiveDrift: coverage.summary.inactiveDrift,
            p2OrphanLegacyAssignments: coverage.summary.orphanLegacyAssignments,
        },
        note05: {
            pass: note05Pass,
            multiProperty: note05.multiProperty,
            missingMembership: note05.missingMembership,
            orgRootOnOperational: note05.orgRootOnOperational,
            operationalAllProperties: note05.operationalAllProperties,
        },
        departmentDrift,
        membersWithoutAssignment: membersNoAssignment.map((m) => ({
            email: m.user.email,
            tenant: m.tenant?.name,
            role: m.role?.code,
            memberId: m.id,
        })),
        allPropertiesAssignments: noProperty.map((a) => ({
            id: a.id,
            active: a.isActive,
            email: a.user.email,
            role: a.role?.code,
            notes: a.notes,
        })),
        inactiveMultiProperty: multiProperty
            .filter((a) => !a.isActive)
            .map((a) => ({
                id: a.id,
                email: a.user.email,
                role: a.role?.code,
                propertyCount: a.properties.length,
                notes: a.notes,
            })),
        byProperty,
    };

    if (jsonOut) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        const s = report.summary;
        console.log('\nFY 01 P0 — Legacy Assignment Inventory');
        console.log('='.repeat(60));
        console.log(`  Database:                       ${report.databaseUrl}`);
        console.log(`  Total assignments:              ${s.totalAssignments}`);
        console.log(`  Active / inactive:              ${s.activeAssignments} / ${s.inactiveAssignments}`);
        console.log(`  No property rows (all-prop):    ${s.noPropertyAssignments} (${s.allPropertiesActive} active)`);
        console.log(`  Multi-property:                 ${s.multiPropertyAssignments} (${s.multiPropertyActive} active)`);
        console.log(`  Active prop distribution:       0=${activePropDist.zero} 1=${activePropDist.one} multi=${activePropDist.multi}`);
        console.log(`  Department drift (active):      ${s.departmentDriftActive}`);
        console.log(`  Members w/o assignment:         ${s.membersWithoutAssignment}`);
        console.log(`  NOTE 05 (active):               ${s.note05Pass ? 'PASS ✓' : 'FAIL ✗'}`);
        console.log(`  P2 coverage:                    ${s.p2CoverageComplete ? 'PASS ✓' : 'FAIL ✗'}`);
        console.log(`  P2 role drift:                  ${s.p2RoleDrift}`);
        console.log(`  P2 orphan legacy assignments:   ${s.p2OrphanLegacyAssignments}`);
        console.log('='.repeat(60));

        if (departmentDrift.length > 0) {
            console.log('\nDepartment drift (active):');
            departmentDrift.forEach((r) => {
                console.log(`  - ${r.email} | ${r.property} | ${r.roleCode} | ${r.type} | member=${r.memberDept ?? '?'}`);
            });
        }
        if (report.allPropertiesAssignments.length > 0) {
            console.log('\nAll-properties assignments:');
            report.allPropertiesAssignments.forEach((r) => {
                console.log(`  - ${r.email} | ${r.role} | active=${r.active}`);
            });
        }
        if (report.inactiveMultiProperty.length > 0) {
            console.log('\nInactive multi-property (historical):');
            report.inactiveMultiProperty.forEach((r) => {
                console.log(`  - ${r.email} | ${r.role} | ${r.propertyCount} properties`);
            });
        }
        console.log('\nBy property (active assignments / members):');
        byProperty.forEach((r) => {
            console.log(`  - ${r.org} / ${r.property}: assignments=${r.activeAssignments} members=${r.activeMembers}`);
        });
        console.log('');
    }

    const pass =
        note05Pass &&
        report.summary.departmentDriftActive === 0 &&
        report.summary.membersWithoutAssignment === 0 &&
        report.summary.p2CoverageComplete;
    if (!pass) process.exit(1);
}

main()
    .catch((e) => {
        console.error('FAILED:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
