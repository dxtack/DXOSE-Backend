'use strict';
const p = require('../../src/config/database');
(async () => {
  const gh = await p.tenant.findFirst({ where: { slug: 'grand-horizon' }, select: { id: true, slug: true, parentId: true } });
  const org = await p.tenant.findFirst({ where: { slug: 'dx-hospitality-group' }, select: { id: true, slug: true } });
  const orgUser = await p.user.findFirst({ where: { email: 'org-mgr@closeout-audit.local' } });
  let tm = null;
  if (orgUser) {
    tm = await p.tenantMember.findMany({ where: { userId: orgUser.id }, include: { tenant: { select: { slug: true } }, role: { select: { code: true } } } });
  }
  console.log(JSON.stringify({ gh, org, isChild: gh?.parentId === org?.id, orgUserMemberships: tm }, null, 2));
  await p.$disconnect();
})();
