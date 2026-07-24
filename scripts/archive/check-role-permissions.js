require('dotenv').config();
const prisma = require('../src/config/database');
const { getPermissionsForMembership, getRoleIdByCode } = require('../src/services/rbac.service');

(async () => {
    for (const code of ['ORG_MANAGER', 'ADMIN', 'FINANCE_MANAGER']) {
        const roleId = await getRoleIdByCode(code);
        const perms = await getPermissionsForMembership({ roleId, roleCode: code });
        console.log(code, 'perms', perms.length, 'USERS_COMPANY_MANAGE', perms.includes('USERS_COMPANY_MANAGE'));
    }
    await prisma.$disconnect();
})();
