'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, HOTEL_B, FIXTURE_TAG } = require('./lib/constants');
const prisma = require('../../src/config/database');

const PASSWORD = 'CloseoutAudit@123';
const EMAIL_DOMAIN = 'closeout-audit.local';

async function upsertTestUser({ email, roleCode, tenantId, departmentId, isActive = true, notes, skipUrAssignment = false }) {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, isActive: true, firstName: 'Closeout', lastName: roleCode },
    create: {
      email,
      passwordHash: hash,
      isActive: true,
      firstName: 'Closeout',
      lastName: roleCode,
    },
  });
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Role missing: ${roleCode}`);

  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: {
      roleId: role.id,
      isActive,
      departmentId: departmentId || null,
    },
    create: {
      tenantId,
      userId: user.id,
      roleId: role.id,
      isActive,
      departmentId: departmentId || null,
    },
  });

  let assignment = null;
  if (!skipUrAssignment) {
    assignment = await prisma.urUserAssignment.findFirst({
      where: { userId: user.id, notes: { startsWith: FIXTURE_TAG } },
    });
    if (!assignment) {
      assignment = await prisma.urUserAssignment.create({
        data: {
          userId: user.id,
          roleId: role.id,
          isActive,
          notes: `${FIXTURE_TAG} ${roleCode}`,
        },
      });
      await prisma.urAssignmentProperty.create({
        data: { assignmentId: assignment.id, propertyId: tenantId },
      });
      if (departmentId) {
        await prisma.urAssignmentDepartment.create({
          data: { assignmentId: assignment.id, departmentId },
        });
      }
    } else {
      await prisma.urUserAssignment.update({
        where: { id: assignment.id },
        data: { isActive },
      });
    }
  }

  return {
    userId: user.id,
    email,
    roleCode,
    tenantId,
    departmentId,
    assignmentId: assignment?.id || null,
    password: PASSWORD,
  };
}

async function main() {
  const fb = await prisma.department.findFirst({ where: { tenantId: HOTEL_A.id, code: 'FB' } });
  const hk = await prisma.department.findFirst({ where: { tenantId: HOTEL_A.id, code: 'HK' } });
  const orgRoot = await prisma.tenant.findFirst({ where: { slug: 'dx-hospitality-group' } });

  const identities = [];

  identities.push(
    await upsertTestUser({
      email: `gm-a@${EMAIL_DOMAIN}`,
      roleCode: 'GENERAL_MANAGER',
      tenantId: HOTEL_A.id,
    }),
  );
  identities.push(
    await upsertTestUser({
      email: `storekeeper-a@${EMAIL_DOMAIN}`,
      roleCode: 'STOREKEEPER',
      tenantId: HOTEL_A.id,
    }),
  );
  identities.push(
    await upsertTestUser({
      email: `finance-a@${EMAIL_DOMAIN}`,
      roleCode: 'FINANCE_MANAGER',
      tenantId: HOTEL_A.id,
    }),
  );
  identities.push(
    await upsertTestUser({
      email: `cost-a@${EMAIL_DOMAIN}`,
      roleCode: 'COST_CONTROL',
      tenantId: HOTEL_A.id,
    }),
  );
  identities.push(
    await upsertTestUser({
      email: `dept-mgr-fb@${EMAIL_DOMAIN}`,
      roleCode: 'DEPT_MANAGER',
      tenantId: HOTEL_A.id,
      departmentId: fb?.id,
    }),
  );
  identities.push(
    await upsertTestUser({
      email: `dept-mgr-hk@${EMAIL_DOMAIN}`,
      roleCode: 'DEPT_MANAGER',
      tenantId: HOTEL_A.id,
      departmentId: hk?.id,
    }),
  );
  identities.push(
    await upsertTestUser({
      email: `auditor-a@${EMAIL_DOMAIN}`,
      roleCode: 'AUDITOR',
      tenantId: HOTEL_A.id,
    }),
  );
  identities.push(
    await upsertTestUser({
      email: `creator-fb@${EMAIL_DOMAIN}`,
      roleCode: 'DEPT_MANAGER',
      tenantId: HOTEL_A.id,
      departmentId: fb?.id,
    }),
  );

  if (orgRoot) {
    const orgIdent = await upsertTestUser({
      email: `org-mgr@${EMAIL_DOMAIN}`,
      roleCode: 'ORG_MANAGER',
      tenantId: orgRoot.id,
    });
    const orgAssign = await prisma.urUserAssignment.findFirst({
      where: { userId: orgIdent.userId, notes: { startsWith: FIXTURE_TAG } },
    });
    if (orgAssign) {
      await prisma.urAssignmentProperty.upsert({
        where: { assignmentId_propertyId: { assignmentId: orgAssign.id, propertyId: HOTEL_A.id } },
        update: {},
        create: { assignmentId: orgAssign.id, propertyId: HOTEL_A.id },
      });
    }
    identities.push(orgIdent);
  }

  const superUser = await upsertTestUser({
    email: `super-op-a@${EMAIL_DOMAIN}`,
    roleCode: 'SUPER_ADMIN',
    tenantId: HOTEL_A.id,
  });
  identities.push(superUser);

  identities.push(
    await upsertTestUser({
      email: `never-assigned@${EMAIL_DOMAIN}`,
      roleCode: 'DEPT_MANAGER',
      tenantId: HOTEL_A.id,
      skipUrAssignment: true,
    }),
  );

  const deletedAssign = await upsertTestUser({
    email: `deleted-assign@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: HOTEL_A.id,
    departmentId: fb?.id,
  });
  await prisma.urUserAssignment.deleteMany({ where: { userId: deletedAssign.userId, notes: { startsWith: FIXTURE_TAG } } });
  identities.push({ ...deletedAssign, note: 'ur assignments deleted' });

  const wrongProp = await upsertTestUser({
    email: `wrong-property@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: HOTEL_A.id,
  });
  await prisma.urAssignmentProperty.deleteMany({
    where: { assignment: { userId: wrongProp.userId, notes: { startsWith: FIXTURE_TAG } } },
  });
  const wa = await prisma.urUserAssignment.findFirst({ where: { userId: wrongProp.userId, notes: { startsWith: FIXTURE_TAG } } });
  if (wa) {
    await prisma.urAssignmentProperty.create({ data: { assignmentId: wa.id, propertyId: HOTEL_B.id } });
  }
  identities.push({ ...wrongProp, note: 'ur assignment property = Hotel B only' });

  const noAssign = await upsertTestUser({
    email: `no-assign@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: HOTEL_A.id,
  });
  await prisma.urUserAssignment.updateMany({
    where: { userId: noAssign.userId },
    data: { isActive: false },
  });
  identities.push({ ...noAssign, note: 'ur assignments deactivated' });

  const inactive = await upsertTestUser({
    email: `inactive-assign@${EMAIL_DOMAIN}`,
    roleCode: 'DEPT_MANAGER',
    tenantId: HOTEL_A.id,
    departmentId: fb?.id,
    isActive: false,
  });
  identities.push(inactive);

  identities.push(
    await upsertTestUser({
      email: `finance-b@${EMAIL_DOMAIN}`,
      roleCode: 'FINANCE_MANAGER',
      tenantId: HOTEL_B.id,
    }),
  );

  const out = {
    executedAt: new Date().toISOString(),
    tag: FIXTURE_TAG,
    password: PASSWORD,
    hotelA: HOTEL_A,
    hotelB: HOTEL_B,
    departments: { fb: fb?.id, hk: hk?.id },
    identities,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'TEST_IDENTITIES_AND_ASSIGNMENTS.json'), JSON.stringify(out, null, 2));
  console.log('Wrote TEST_IDENTITIES_AND_ASSIGNMENTS.json', identities.length, 'identities');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
