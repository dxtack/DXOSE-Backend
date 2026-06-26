'use strict';

/**
 * User Rights — Phase 1 Seed Script
 * Purpose  : Mirror the Legacy RBAC permission matrix into the new ur_* tables.
 * Safety   : Read-only with respect to all existing tables.
 *            Only inserts into: ur_resources, ur_actions, ur_permissions, ur_role_permissions.
 *            Never modifies: roles, permissions, role_permissions, users, or any other table.
 * Run with : node scripts/seed-user-rights-phase1.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Resource definitions ────────────────────────────────────────────────────
// Each resource represents a screen / module in the system.
const RESOURCES = [
  { code: 'MASTER_DATA',   name: 'Master Data (Items, Categories, Suppliers)', category: 'Setup',         displayOrder: 10 },
  { code: 'INVENTORY',     name: 'Inventory Stock',                             category: 'Inventory',     displayOrder: 20 },
  { code: 'MOVEMENTS',     name: 'Movements & Ledger',                          category: 'Operations',    displayOrder: 30 },
  { code: 'ISSUE',         name: 'Store Issues',                                category: 'Operations',    displayOrder: 40 },
  { code: 'TRANSFER',      name: 'Store Transfers',                             category: 'Operations',    displayOrder: 50 },
  { code: 'GRN',           name: 'Goods Receipt Notes',                         category: 'Operations',    displayOrder: 60 },
  { code: 'BREAKAGE',      name: 'Breakage Documents',                          category: 'Operations',    displayOrder: 70 },
  { code: 'ADJUSTMENT',    name: 'Stock Adjustments',                           category: 'Operations',    displayOrder: 80 },
  { code: 'STOCK_COUNT',   name: 'Stock Count Sessions',                        category: 'Operations',    displayOrder: 90 },
  { code: 'LOST_ITEMS',    name: 'Lost & Found Items',                          category: 'Operations',    displayOrder: 100 },
  { code: 'REPORTS',       name: 'Reports',                                     category: 'Reports',       displayOrder: 110 },
  { code: 'DASHBOARD',     name: 'Dashboard',                                   category: 'Dashboard',     displayOrder: 120 },
  { code: 'GET_PASS',      name: 'Get Pass',                                    category: 'Operations',    displayOrder: 130 },
  { code: 'IMPORT',        name: 'Data Import (Excel)',                         category: 'Setup',         displayOrder: 140 },
  { code: 'USERS',         name: 'User Management',                             category: 'Administration',displayOrder: 150 },
  { code: 'SETTINGS',      name: 'System Settings',                             category: 'Administration',displayOrder: 160 },
  { code: 'AUDIT_LOG',     name: 'Audit Log',                                   category: 'Governance',    displayOrder: 170 },
  { code: 'PERIOD_CLOSE',  name: 'Period Close',                                category: 'Governance',    displayOrder: 180 },
  { code: 'INTEGRITY',     name: 'Data Integrity Check',                        category: 'Governance',    displayOrder: 190 },
  { code: 'DIAGNOSTICS',   name: 'System Diagnostics',                          category: 'Administration',displayOrder: 200 },
];

// ─── Action definitions ──────────────────────────────────────────────────────
const ACTIONS = [
  { code: 'VIEW',                    name: 'View',                         displayOrder: 10 },
  { code: 'CREATE',                  name: 'Create',                       displayOrder: 20 },
  { code: 'EDIT',                    name: 'Edit',                         displayOrder: 30 },
  { code: 'MANAGE',                  name: 'Manage (View + Edit)',          displayOrder: 40 },
  { code: 'APPROVE',                 name: 'Approve',                      displayOrder: 50 },
  { code: 'DISPATCH_RECEIVE',        name: 'Dispatch / Receive',           displayOrder: 60 },
  { code: 'EXPORT',                  name: 'Export',                       displayOrder: 70 },
  { code: 'APPROVE_FINAL',           name: 'Final Approval',               displayOrder: 80 },
  { code: 'APPROVE_EXIT',            name: 'Approve Exit',                 displayOrder: 90 },
  { code: 'APPROVE_RETURN',          name: 'Approve Return',               displayOrder: 100 },
  { code: 'FORCE_CLOSE_INITIATE',    name: 'Force-Close Initiate',         displayOrder: 110 },
  { code: 'FORCE_CLOSE_APPROVE',     name: 'Force-Close Approve',          displayOrder: 120 },
  { code: 'CONFIRM_DESTINATION',     name: 'Confirm Destination Receipt',  displayOrder: 130 },
  { code: 'READ',                    name: 'Read (List Only)',              displayOrder: 140 },
  { code: 'MANAGE_HOTEL',            name: 'Manage Hotel Users',           displayOrder: 150 },
  { code: 'MANAGE_ORG',              name: 'Manage Org Users',             displayOrder: 160 },
  { code: 'DIAGNOSE',                name: 'Diagnose',                     displayOrder: 170 },
];

// ─── Permission mapping: legacy code → resource + action ────────────────────
// Source of truth: PERMISSIONS object in src/middleware/authorize.js
// Each entry maps one legacy permission code to its resource + action.
const PERMISSION_MAP = [
  // Master Data
  { legacyCode: 'BASIC_DATA_VIEW',               resource: 'MASTER_DATA',  action: 'VIEW',                 name: 'View Master Data' },
  { legacyCode: 'BASIC_DATA_EDIT',               resource: 'MASTER_DATA',  action: 'EDIT',                 name: 'Edit Master Data' },
  { legacyCode: 'ITEM_MANAGE',                   resource: 'MASTER_DATA',  action: 'MANAGE',               name: 'Manage Items' },

  // Inventory
  { legacyCode: 'INVENTORY_VIEW',                resource: 'INVENTORY',    action: 'VIEW',                 name: 'View Inventory Stock' },
  { legacyCode: 'STOCK_MANAGE',                  resource: 'INVENTORY',    action: 'MANAGE',               name: 'Manage Stock' },

  // Movements / Ledger
  { legacyCode: 'MOVEMENTS_VIEW',                resource: 'MOVEMENTS',    action: 'VIEW',                 name: 'View Movements Register' },
  { legacyCode: 'LEDGER_VIEW',                   resource: 'MOVEMENTS',    action: 'READ',                 name: 'View Ledger' },
  { legacyCode: 'INVENTORY_HISTORY_VIEW',        resource: 'MOVEMENTS',    action: 'EXPORT',               name: 'View Inventory History' },
  { legacyCode: 'MOVEMENT_CREATE',               resource: 'MOVEMENTS',    action: 'CREATE',               name: 'Create Movements' },

  // Issues
  { legacyCode: 'ISSUE_CREATE',                  resource: 'ISSUE',        action: 'CREATE',               name: 'Create Store Issues' },
  { legacyCode: 'ISSUE_APPROVE',                 resource: 'ISSUE',        action: 'APPROVE',              name: 'Approve Store Issues' },

  // Transfers
  { legacyCode: 'TRANSFER_VIEW',                 resource: 'TRANSFER',     action: 'VIEW',                 name: 'View Transfers' },
  { legacyCode: 'TRANSFER_CREATE',               resource: 'TRANSFER',     action: 'CREATE',               name: 'Create Transfers' },
  { legacyCode: 'TRANSFER_APPROVE',              resource: 'TRANSFER',     action: 'APPROVE',              name: 'Approve Transfers' },
  { legacyCode: 'TRANSFER_DISPATCH_RECEIVE',     resource: 'TRANSFER',     action: 'DISPATCH_RECEIVE',     name: 'Dispatch / Receive Transfers' },

  // GRN
  { legacyCode: 'GRN_VIEW',                      resource: 'GRN',          action: 'VIEW',                 name: 'View GRN' },
  { legacyCode: 'GRN_MANAGE',                    resource: 'GRN',          action: 'MANAGE',               name: 'Manage GRN' },

  // Breakage
  { legacyCode: 'BREAKAGE_VIEW',                 resource: 'BREAKAGE',     action: 'VIEW',                 name: 'View Breakage' },
  { legacyCode: 'BREAKAGE_CREATE',               resource: 'BREAKAGE',     action: 'CREATE',               name: 'Create Breakage' },
  { legacyCode: 'APPROVE_BREAKAGE',              resource: 'BREAKAGE',     action: 'APPROVE',              name: 'Approve Breakage' },
  { legacyCode: 'BREAKAGE_APPROVE',              resource: 'BREAKAGE',     action: 'APPROVE',              name: 'Approve Breakage (alias)' },
  { legacyCode: 'READ_BREAKAGE',                 resource: 'BREAKAGE',     action: 'READ',                 name: 'Read Breakage List' },

  // Adjustment
  { legacyCode: 'ADJUSTMENT_CREATE',             resource: 'ADJUSTMENT',   action: 'CREATE',               name: 'Create Adjustments' },

  // Stock Count
  { legacyCode: 'STOCK_COUNT_VIEW',              resource: 'STOCK_COUNT',  action: 'VIEW',                 name: 'View Stock Count' },
  { legacyCode: 'STOCK_COUNT_MANAGE',            resource: 'STOCK_COUNT',  action: 'MANAGE',               name: 'Manage Stock Count' },
  { legacyCode: 'APPROVE_INVENTORY_COUNT',       resource: 'STOCK_COUNT',  action: 'APPROVE',              name: 'Approve Inventory Count' },

  // Lost & Found
  { legacyCode: 'LOST_ITEMS_VIEW',               resource: 'LOST_ITEMS',   action: 'VIEW',                 name: 'View Lost Items' },
  { legacyCode: 'APPROVE_LOST',                  resource: 'LOST_ITEMS',   action: 'APPROVE',              name: 'Approve Lost Items' },
  { legacyCode: 'READ_LOST',                     resource: 'LOST_ITEMS',   action: 'READ',                 name: 'Read Lost Items List' },
  { legacyCode: 'LOST_CREATE',                   resource: 'LOST_ITEMS',   action: 'CREATE',               name: 'Create Lost Items' },

  // Reports
  { legacyCode: 'REPORTS_VIEW',                  resource: 'REPORTS',      action: 'VIEW',                 name: 'View Reports' },
  { legacyCode: 'REPORTS_EXPORT',                resource: 'REPORTS',      action: 'EXPORT',               name: 'Export Reports' },

  // Dashboard
  { legacyCode: 'VIEW_DASHBOARD',                resource: 'DASHBOARD',    action: 'VIEW',                 name: 'View Dashboard Screen' },
  { legacyCode: 'DASHBOARD_VIEW',                resource: 'DASHBOARD',    action: 'READ',                 name: 'View Dashboard Analytics' },

  // Get Pass
  { legacyCode: 'GET_PASS_VIEW',                 resource: 'GET_PASS',     action: 'VIEW',                 name: 'View Get Passes' },
  { legacyCode: 'GET_PASS_CREATE',               resource: 'GET_PASS',     action: 'CREATE',               name: 'Create Get Pass' },
  { legacyCode: 'GET_PASS_APPROVE',              resource: 'GET_PASS',     action: 'APPROVE',              name: 'Approve Get Pass' },
  { legacyCode: 'GET_PASS_APPROVE_FINAL',        resource: 'GET_PASS',     action: 'APPROVE_FINAL',        name: 'Final Approve Get Pass' },
  { legacyCode: 'GET_PASS_APPROVE_EXIT',         resource: 'GET_PASS',     action: 'APPROVE_EXIT',         name: 'Approve Get Pass Exit' },
  { legacyCode: 'GET_PASS_APPROVE_RETURN',       resource: 'GET_PASS',     action: 'APPROVE_RETURN',       name: 'Approve Get Pass Return' },
  { legacyCode: 'GET_PASS_FORCE_CLOSE_INITIATE', resource: 'GET_PASS',     action: 'FORCE_CLOSE_INITIATE', name: 'Initiate Get Pass Force Close' },
  { legacyCode: 'GET_PASS_FORCE_CLOSE_APPROVE',  resource: 'GET_PASS',     action: 'FORCE_CLOSE_APPROVE',  name: 'Approve Get Pass Force Close' },
  { legacyCode: 'GET_PASS_CONFIRM_DESTINATION',  resource: 'GET_PASS',     action: 'CONFIRM_DESTINATION',  name: 'Confirm Get Pass Destination' },

  // Import
  { legacyCode: 'IMPORT_EXCEL',                  resource: 'IMPORT',       action: 'EXPORT',               name: 'Import / Export Excel' },
  { legacyCode: 'IMPORT_CREATE',                 resource: 'IMPORT',       action: 'CREATE',               name: 'Create Import Sessions' },

  // Users
  { legacyCode: 'HOTEL_USERS_MANAGE',            resource: 'USERS',        action: 'MANAGE_HOTEL',         name: 'Manage Hotel Users' },
  { legacyCode: 'USERS_COMPANY_MANAGE',          resource: 'USERS',        action: 'MANAGE_ORG',           name: 'Manage Org Users' },
  { legacyCode: 'USER_MANAGE',                   resource: 'USERS',        action: 'MANAGE',               name: 'Manage Users (generic)' },

  // Settings
  { legacyCode: 'SETTINGS_MANAGE',               resource: 'SETTINGS',     action: 'MANAGE',               name: 'Manage System Settings' },
  { legacyCode: 'TENANT_MANAGE',                 resource: 'SETTINGS',     action: 'MANAGE_ORG',           name: 'Manage Tenant/Org Settings' },

  // Audit Log
  { legacyCode: 'AUDIT_LOG_VIEW',                resource: 'AUDIT_LOG',    action: 'VIEW',                 name: 'View Audit Log' },

  // Period Close
  { legacyCode: 'PERIOD_CLOSE_MANAGE',           resource: 'PERIOD_CLOSE', action: 'MANAGE',               name: 'Manage Period Close' },

  // Integrity
  { legacyCode: 'INTEGRITY_VIEW',                resource: 'INTEGRITY',    action: 'VIEW',                 name: 'View Integrity Dashboard' },

  // Diagnostics
  { legacyCode: 'TENANT_OPS_DIAGNOSE',           resource: 'DIAGNOSTICS',  action: 'DIAGNOSE',             name: 'Diagnose Tenant Operations' },
];

// ─── Role → permission assignments (from PERMISSIONS in authorize.js) ────────
// Derived from the PERMISSIONS constant. Each entry is [roleCode, [legacyCodes]].
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    'SETTINGS_MANAGE',
    'TENANT_MANAGE',
    'APPROVE_INVENTORY_COUNT',
    'READ_BREAKAGE',
    'READ_LOST',
  ],
  ORG_MANAGER: [
    'BASIC_DATA_VIEW',
    'BASIC_DATA_EDIT',
    'INVENTORY_VIEW',
    'MOVEMENTS_VIEW',
    'LEDGER_VIEW',
    'INVENTORY_HISTORY_VIEW',
    'MOVEMENT_CREATE',
    'ISSUE_CREATE',
    'ISSUE_APPROVE',
    'TRANSFER_VIEW',
    'TRANSFER_CREATE',
    'TRANSFER_APPROVE',
    'TRANSFER_DISPATCH_RECEIVE',
    'GRN_VIEW',
    'GRN_MANAGE',
    'BREAKAGE_VIEW',
    'BREAKAGE_CREATE',
    'APPROVE_BREAKAGE',
    'STOCK_COUNT_MANAGE',
    'STOCK_COUNT_VIEW',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'READ_BREAKAGE',
    'READ_LOST',
    'LOST_ITEMS_VIEW',
    'APPROVE_LOST',
    'LOST_CREATE',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'GET_PASS_CREATE',
    'GET_PASS_VIEW',
    'GET_PASS_APPROVE',
    'GET_PASS_APPROVE_FINAL',
    'GET_PASS_APPROVE_EXIT',
    'GET_PASS_APPROVE_RETURN',
    'GET_PASS_CONFIRM_DESTINATION',
    'IMPORT_EXCEL',
    'IMPORT_CREATE',
    'USERS_COMPANY_MANAGE',
    'SETTINGS_MANAGE',
    'TENANT_MANAGE',
    'AUDIT_LOG_VIEW',
    'PERIOD_CLOSE_MANAGE',
    'INTEGRITY_VIEW',
    'STOCK_MANAGE',
    'ITEM_MANAGE',
    'USER_MANAGE',
  ],
  STOREKEEPER: [
    'BASIC_DATA_VIEW',
    'INVENTORY_VIEW',
    'MOVEMENTS_VIEW',
    'LEDGER_VIEW',
    'INVENTORY_HISTORY_VIEW',
    'MOVEMENT_CREATE',
    'ISSUE_CREATE',
    'TRANSFER_VIEW',
    'TRANSFER_DISPATCH_RECEIVE',
    'GRN_VIEW',
    'GRN_MANAGE',
    'BREAKAGE_CREATE',
    'STOCK_COUNT_VIEW',
    'STOCK_COUNT_MANAGE',
    'REPORTS_VIEW',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'GET_PASS_VIEW',
    'GET_PASS_CREATE',
    'IMPORT_EXCEL',
    'IMPORT_CREATE',
    'STOCK_MANAGE',
  ],
  DEPT_MANAGER: [
    'BASIC_DATA_VIEW',
    'INVENTORY_VIEW',
    'ISSUE_CREATE',
    'ISSUE_APPROVE',
    'TRANSFER_VIEW',
    'TRANSFER_CREATE',
    'TRANSFER_APPROVE',
    'BREAKAGE_VIEW',
    'BREAKAGE_CREATE',
    'APPROVE_BREAKAGE',
    'REPORTS_VIEW',
    'LOST_ITEMS_VIEW',
    'APPROVE_LOST',
    'LOST_CREATE',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'GET_PASS_CREATE',
    'GET_PASS_VIEW',
  ],
  COST_CONTROL: [
    'BASIC_DATA_VIEW',
    'INVENTORY_VIEW',
    'MOVEMENTS_VIEW',
    'LEDGER_VIEW',
    'INVENTORY_HISTORY_VIEW',
    'TRANSFER_VIEW',
    'GRN_VIEW',
    'GRN_MANAGE',
    'BREAKAGE_VIEW',
    'APPROVE_BREAKAGE',
    'STOCK_COUNT_VIEW',
    'STOCK_COUNT_MANAGE',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'READ_BREAKAGE',
    'READ_LOST',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'GET_PASS_VIEW',
    'APPROVE_LOST',
  ],
  FINANCE_MANAGER: [
    'BASIC_DATA_VIEW',
    'BASIC_DATA_EDIT',
    'INVENTORY_VIEW',
    'MOVEMENTS_VIEW',
    'LEDGER_VIEW',
    'INVENTORY_HISTORY_VIEW',
    'MOVEMENT_CREATE',
    'ISSUE_CREATE',
    'ISSUE_APPROVE',
    'TRANSFER_VIEW',
    'TRANSFER_CREATE',
    'TRANSFER_APPROVE',
    'GRN_VIEW',
    'GRN_MANAGE',
    'BREAKAGE_VIEW',
    'BREAKAGE_CREATE',
    'APPROVE_BREAKAGE',
    'ADJUSTMENT_CREATE',
    'STOCK_COUNT_VIEW',
    'STOCK_COUNT_MANAGE',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'READ_BREAKAGE',
    'READ_LOST',
    'LOST_ITEMS_VIEW',
    'APPROVE_LOST',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'GET_PASS_VIEW',
    'GET_PASS_CREATE',
    'GET_PASS_APPROVE',
    'GET_PASS_APPROVE_EXIT',
    'GET_PASS_APPROVE_RETURN',
    'GET_PASS_FORCE_CLOSE_INITIATE',
    'GET_PASS_CONFIRM_DESTINATION',
    'IMPORT_EXCEL',
    'IMPORT_CREATE',
    'AUDIT_LOG_VIEW',
    'PERIOD_CLOSE_MANAGE',
    'INTEGRITY_VIEW',
    'HOTEL_USERS_MANAGE',
    'USER_MANAGE',
    'TENANT_OPS_DIAGNOSE',
  ],
  AUDITOR: [
    'BASIC_DATA_VIEW',
    'INVENTORY_VIEW',
    'MOVEMENTS_VIEW',
    'LEDGER_VIEW',
    'INVENTORY_HISTORY_VIEW',
    'TRANSFER_VIEW',
    'GRN_VIEW',
    'STOCK_COUNT_VIEW',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'AUDIT_LOG_VIEW',
    'INTEGRITY_VIEW',
  ],
  SECURITY: [
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'GET_PASS_VIEW',
    'GET_PASS_APPROVE_FINAL',
    'GET_PASS_APPROVE_EXIT',
    'GET_PASS_APPROVE_RETURN',
    'GET_PASS_CONFIRM_DESTINATION',
  ],
  GENERAL_MANAGER: [
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'APPROVE_BREAKAGE',
    'APPROVE_INVENTORY_COUNT',
    'APPROVE_LOST',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'GET_PASS_APPROVE_FINAL',
    'GET_PASS_FORCE_CLOSE_APPROVE',
    'AUDIT_LOG_VIEW',
  ],
};

// ─── Main seed function ──────────────────────────────────────────────────────
async function seed() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' User Rights Phase 1 — Seed Mirror');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Upsert Resources
  console.log('Step 1: Seeding Resources...');
  const resourceMap = {};
  for (const r of RESOURCES) {
    const record = await prisma.urResource.upsert({
      where:  { code: r.code },
      update: { name: r.name, category: r.category, displayOrder: r.displayOrder },
      create: r,
    });
    resourceMap[r.code] = record.id;
  }
  console.log(`  ✓ ${RESOURCES.length} resources seeded\n`);

  // Step 2: Upsert Actions
  console.log('Step 2: Seeding Actions...');
  const actionMap = {};
  for (const a of ACTIONS) {
    const record = await prisma.urAction.upsert({
      where:  { code: a.code },
      update: { name: a.name, displayOrder: a.displayOrder },
      create: a,
    });
    actionMap[a.code] = record.id;
  }
  console.log(`  ✓ ${ACTIONS.length} actions seeded\n`);

  // Step 3: Upsert Permissions (one row per legacy code)
  console.log('Step 3: Seeding Permissions (legacy code bridge)...');
  const permissionMap = {};
  let permCount = 0;
  for (const p of PERMISSION_MAP) {
    const resourceId = resourceMap[p.resource];
    const actionId   = actionMap[p.action];
    if (!resourceId) { console.warn(`  ⚠ Unknown resource code: ${p.resource} for ${p.legacyCode}`); continue; }
    if (!actionId)   { console.warn(`  ⚠ Unknown action code: ${p.action} for ${p.legacyCode}`);   continue; }

    const record = await prisma.urPermission.upsert({
      where:  { legacyCode: p.legacyCode },
      update: { resourceId, actionId, name: p.name },
      create: { resourceId, actionId, legacyCode: p.legacyCode, name: p.name },
    });
    permissionMap[p.legacyCode] = record.id;
    permCount++;
  }
  console.log(`  ✓ ${permCount} permissions seeded\n`);

  // Step 4: Load all Role records from DB
  console.log('Step 4: Loading roles from database...');
  const dbRoles = await prisma.role.findMany({ select: { id: true, code: true } });
  const roleIdByCode = {};
  for (const r of dbRoles) {
    roleIdByCode[r.code] = r.id;
  }
  console.log(`  ✓ Found ${dbRoles.length} roles: ${dbRoles.map(r => r.code).join(', ')}\n`);

  // Step 5: Upsert UrRolePermission mappings
  console.log('Step 5: Seeding Role-Permission mappings...');
  let rpCount = 0;
  let skipped = 0;
  for (const [roleCode, legacyCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByCode[roleCode];
    if (!roleId) {
      console.warn(`  ⚠ Role not found in DB: ${roleCode} — skipping`);
      skipped++;
      continue;
    }

    for (const legacyCode of legacyCodes) {
      const permissionId = permissionMap[legacyCode];
      if (!permissionId) {
        console.warn(`  ⚠ Permission not seeded: ${legacyCode} for role ${roleCode} — skipping`);
        skipped++;
        continue;
      }

      await prisma.urRolePermission.upsert({
        where:  { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
      rpCount++;
    }
  }
  console.log(`  ✓ ${rpCount} role-permission mappings seeded (${skipped} skipped)\n`);

  // ─── Final report ──────────────────────────────────────────────────────────
  const totalResources   = await prisma.urResource.count();
  const totalActions     = await prisma.urAction.count();
  const totalPermissions = await prisma.urPermission.count();
  const totalRolePerms   = await prisma.urRolePermission.count();

  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Seed Complete — Summary');
  console.log('───────────────────────────────────────────────────────────');
  console.log(` Resources created   : ${totalResources}`);
  console.log(` Actions created     : ${totalActions}`);
  console.log(` Permissions created : ${totalPermissions}`);
  console.log(` Role-perm mappings  : ${totalRolePerms}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' ✓ No existing tables were modified.');
  console.log(' ✓ Legacy RBAC enforcement is 100% unchanged.');
  console.log(' ✓ Phase 1 database foundation complete.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
