'use strict';

const prisma = require('../src/config/database');

async function main() {
    const rows = await prisma.tenantMember.findMany({
        where: { tenant: { slug: 'grand-horizon' }, isActive: true },
        include: {
            user: { select: { email: true, id: true } },
            role: { select: { code: true } },
        },
        take: 50,
    });
    console.log(
        JSON.stringify(
            rows.map((r) => ({ email: r.user.email, role: r.role.code, userId: r.user.id })),
            null,
            2,
        ),
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
