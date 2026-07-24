const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const results = await Promise.all([
    p.urUserAssignment.count(),
    p.urAssignmentProperty.count(),
    p.urAssignmentDepartment.count(),
    p.urUserOverride.count(),
    p.urAuditEvent.count(),
  ]);

  console.log('urUserAssignment rows:    ', results[0]);
  console.log('urAssignmentProperty rows:', results[1]);
  console.log('urAssignmentDepartment rows:', results[2]);
  console.log('urUserOverride rows:      ', results[3]);
  console.log('urAuditEvent rows:        ', results[4]);
  console.log('');
  console.log('Wave 1 — All 5 tables accessible. PASS');
}

main().then(() => p.$disconnect()).catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
