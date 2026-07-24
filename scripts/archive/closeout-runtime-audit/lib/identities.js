'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./constants');

function loadIdentities() {
  const p = path.join(REPORT_DIR, 'TEST_IDENTITIES_AND_ASSIGNMENTS.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function identityByKey(data, key) {
  const map = {
    GM: 'gm-a@',
    STOREKEEPER: 'storekeeper-a@',
    FINANCE: 'finance-a@',
    COST_CONTROL: 'cost-a@',
    DEPT_MANAGER_FB: 'dept-mgr-fb@',
    DEPT_MANAGER_HK: 'dept-mgr-hk@',
    DEPT_CREATOR_FB: 'creator-fb@',
    AUDITOR: 'auditor-a@',
    ORG_MANAGER: 'org-mgr@',
    SUPER_ADMIN_OP: 'super-op-a@',
    NO_ASSIGN: 'no-assign@',
    INACTIVE_ASSIGN: 'inactive-assign@',
    FINANCE_B: 'finance-b@',
  };
  const prefix = map[key];
  if (!prefix) return null;
  return data?.identities?.find((i) => i.email.startsWith(prefix)) || null;
}

module.exports = { loadIdentities, identityByKey };
