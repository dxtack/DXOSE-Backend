'use strict';

const prisma = require('../src/config/database');

async function main() {
    const version = await prisma.accWorkflowVersion.findFirst({
        where: { status: 'PUBLISHED', definition: { module: { key: 'STOCK_COUNT' } } },
        orderBy: { versionNumber: 'desc' },
        include: {
            steps: {
                orderBy: { stepOrder: 'asc' },
                include: { approverRole: { select: { code: true } } },
            },
            definition: { include: { module: { select: { key: true } } } },
        },
    });
    if (!version) {
        console.error('No published STOCK_COUNT workflow found');
        process.exit(1);
    }
    const chain = version.steps.map((s) => ({
        stepOrder: s.stepOrder,
        roleCode: s.approverRole.code,
        statusKey: s.statusKey,
    }));
    const expected = [
        'COST_CONTROL',
        'DEPT_MANAGER',
        'FINANCE_MANAGER',
        'GENERAL_MANAGER',
    ];
    const roles = chain.map((s) => s.roleCode);
    const ok = roles.length === 4 && expected.every((r, i) => roles[i] === r);
    console.log(
        JSON.stringify(
            {
                ok,
                versionNumber: version.versionNumber,
                versionId: version.id,
                chain,
            },
            null,
            2,
        ),
    );
    if (!ok) process.exit(1);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
