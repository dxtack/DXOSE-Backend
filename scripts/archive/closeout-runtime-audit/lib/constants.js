'use strict';

const path = require('path');

module.exports = {
  REPORT_DIR: path.resolve(__dirname, '../../../governance-evidence-archive/closeout-runtime-audit'),
  API_BASE: process.env.OSE_API_URL || `http://127.0.0.1:${process.env.PORT || 4000}/api`,
  FE_BASE: process.env.OSE_FE_URL || 'http://127.0.0.1:4200',
  FIXTURE_TAG: 'CLOSEOUT_RT_AUDIT',
  HOTEL_A: { slug: 'grand-horizon', id: 'd7f5e85c-86f9-487d-b17d-708cebcf9ca3' },
  HOTEL_B: { slug: 'dx-airport-hotel', id: 'bf7638b8-04db-4051-94d1-0cf039827c00' },
  PASSWORDS: {
    default: 'Admin@123',
    dxuat: process.env.UAT_PASSWORD || 'Password@123',
    superadmin: process.env.SUPERADMIN_PASSWORD || 'superadmin@2026',
  },
  USERS_GH: {
    DEPT_MANAGER_A: { email: 'fb.manager@grandhorizon.com', role: 'DEPT_MANAGER', password: 'Admin@123' },
    DEPT_MANAGER_B: { email: 'hk.manager@grandhorizon.com', role: 'DEPT_MANAGER', password: 'Admin@123' },
    STOREKEEPER: { email: 'store@grandhorizon.com', role: 'STOREKEEPER', password: 'Admin@123' },
    COST_CONTROL: { email: 'cost@grandhorizon.com', role: 'COST_CONTROL', password: 'Admin@123' },
    FINANCE: { email: 'finance@grandhorizon.com', role: 'FINANCE_MANAGER', password: 'Admin@123' },
    GM: { email: 'richard.evans@dxuat.com', role: 'GENERAL_MANAGER', password: 'Password@123' },
    ADMIN: { email: 'admin@grandhorizon.com', role: 'ADMIN', password: 'Admin@123' },
    AUDITOR: { email: 'auditor@grandhorizon.com', role: 'AUDITOR', password: 'Admin@123' },
  },
  USERS_PLATFORM: {
    SUPER_ADMIN: { email: 'superadmin@ose.cloud', role: 'SUPER_ADMIN', password: 'superadmin@2026', tenantSlug: 'platform' },
    ORG_MANAGER: { email: 'superadmin@ose.cloud', role: 'ORG_MANAGER', password: 'superadmin@2026', tenantSlug: 'dx-hospitality-group' },
  },
};
