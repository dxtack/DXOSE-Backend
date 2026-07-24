'use strict';
const prisma = require('../src/config/database');

(async () => {
    const emails = ['fb.manager@grandhorizon.com', 'hk.manager@grandhorizon.com', 'store@grandhorizon.com'];
    const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
    });
    for (const u of users) {
        const members = await prisma.tenantMember.findMany({
            where: { userId: u.id, isActive: true },
            include: {
                role: { select: { code: true } },
                department: { select: { id: true, name: true, code: true } },
                tenant: { select: { id: true, name: true } },
            },
        });
        const locUsers = await prisma.locationUser.findMany({
            where: { userId: u.id },
            include: { location: { select: { id: true, name: true, departmentId: true } } },
        });
        console.log('\n===', u.email, '===');
        console.log('memberships:', JSON.stringify(members, null, 2));
        console.log('location_users:', locUsers.length, locUsers.map((l) => l.location?.name));
    }
    await prisma.$disconnect();
})();
