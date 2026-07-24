/**
 * NOTE 05 — Validate 1:1:1 alignment (assignment property ↔ TenantMember).
 *
 * Usage:
 *   node scripts/validate-note05-alignment.js
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const OPERATIONAL_ROLE_CODES = new Set([
    'STOREKEEPER', 'FINANCE_MANAGER', 'COST_CONTROL', 'DEPT_MANAGER',
    'GENERAL_MANAGER', 'SECURITY', 'AUDITOR', 'ADMIN',
]);

async function main() {
    const activeAssignments = await prisma.urUserAssignment.findMany({
        where: { isActive: true },
        include: {
            role: { select: { code: true } },
            properties: { select: { propertyId: true, property: { select: { name: true, parentId: true } } } },
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
    });

    const multiProperty = [];
    const missingMembership = [];
    const orgRootOnOperational = [];

    for (const a of activeAssignments) {
        const propCount = a.properties.length;
        const roleCode = (a.role?.code ?? '').toUpperCase();

        if (propCount > 1) {
            multiProperty.push({
                assignmentId: a.id,
                userId: a.userId,
                email: a.user.email,
                roleCode,
                propertyCount: propCount,
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
                where: {
                    tenantId_userId: { tenantId: p.propertyId, userId: a.userId },
                },
                select: { id: true, isActive: true },
            });
            if (!member || !member.isActive) {
                missingMembership.push({
                    assignmentId: a.id,
                    userId: a.userId,
                    email: a.user.email,
                    propertyId: p.propertyId,
                    propertyName: p.property?.name,
                    roleCode,
                });
            }
        }
    }

    const summary = {
        activeAssignments: activeAssignments.length,
        multiPropertyAssignments: multiProperty.length,
        missingMembershipRows: missingMembership.length,
        orgRootOnOperationalAssignments: orgRootOnOperational.length,
        pass:
            multiProperty.length === 0 &&
            missingMembership.length === 0 &&
            orgRootOnOperational.length === 0,
    };

    console.log('\nNOTE 05 — Assignment / Membership Alignment');
    console.log('='.repeat(55));
    console.log(`  Active assignments:              ${summary.activeAssignments}`);
    console.log(`  Multi-property assignments:      ${summary.multiPropertyAssignments}`);
    console.log(`  Missing active TenantMember:     ${summary.missingMembershipRows}`);
    console.log(`  Org-root on operational roles:   ${summary.orgRootOnOperationalAssignments}`);
    console.log(`  PASS:                            ${summary.pass ? 'YES ✓' : 'NO ✗'}`);
    console.log('='.repeat(55));

    if (multiProperty.length > 0) {
        console.log('\nMulti-property (max 10):');
        multiProperty.slice(0, 10).forEach((r) => {
            console.log(`  - ${r.email} | ${r.roleCode} | ${r.propertyCount} properties | ${r.assignmentId}`);
        });
    }
    if (missingMembership.length > 0) {
        console.log('\nMissing membership (max 10):');
        missingMembership.slice(0, 10).forEach((r) => {
            console.log(`  - ${r.email} | ${r.propertyName} | ${r.roleCode}`);
        });
    }

    console.log('');
    if (!summary.pass) process.exit(1);
}

main()
    .catch((e) => {
        console.error('FAILED:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
