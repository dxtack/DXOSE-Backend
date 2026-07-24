const express = require('express');

const { authenticate } = require('../middleware/authenticate');
const authController = require('../controllers/auth.controller');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const rolesRoutes = require('./roles.routes');
const auditRoutes = require('./audit.routes');

const itemRoutes = require('./item.routes');
const categoryRoutes = require('./category.routes');
const locationRoutes = require('./location.routes');
const supplierRoutes = require('./supplier.routes');

// M03 - Inventory Core
const stockRoutes = require('./stock.routes');
const movementRoutes = require('./movement.routes');
const ledgerRoutes = require('./ledger.routes');
const inventoryHistoryRoutes = require('./inventory-history.routes');

// M08 - Breakage
const breakageRoutes = require('./breakage.routes');
const lostItemsRoutes = require('./lostItems.routes');
const stockCountRoutes = require('./stockCount.routes');

const router = express.Router();

// GET /api/profile — real-time profile for settings (authenticated)
router.get('/profile', authenticate, authController.profile);

// M01 — Auth & Users
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);

// M14 — Audit Log
router.use('/audit-log', auditRoutes);

// M02 - Master Data
router.use('/items', itemRoutes);
router.use('/categories', categoryRoutes);
router.use('/locations', locationRoutes);
router.use('/suppliers', supplierRoutes);


// M03 - Inventory Core
router.use('/stock-balances', stockRoutes);
router.use('/movements', movementRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/inventory-history', inventoryHistoryRoutes);

// M05 - Units of Measure
const unitRoutes = require('./unit.routes');
router.use('/units', unitRoutes);

// M08 - Breakage
router.use('/breakage', breakageRoutes);
router.use('/lost', lostItemsRoutes);
router.use('/lost-items', lostItemsRoutes);

// M10: Stock Count
router.use('/stock-count', stockCountRoutes);

// Inventory Count (enterprise workflow) — canonical StockCountSession-based
const inventoryCountRoutes = require('./inventoryCount.routes');
router.use('/inventory-count', inventoryCountRoutes);

// M13: Reports
const reportsRoutes = require('./reports.routes');
router.use('/reports', reportsRoutes);

// M04-GRN: FutureLog GRN Import & Approval Gate
const grnRoutes = require('./grn.routes');
const mappingRoutes = require('./mapping.routes');
router.use('/grn', grnRoutes);
router.use('/mappings', mappingRoutes);

// M06-TRF: Inter-Store Transfer Control Gate
const transferRoutes = require('./transfer.routes');
router.use('/transfers', transferRoutes);

// SaaS Phase 2: Executive Dashboard
const dashboardRoutes = require('./dashboard.routes');
router.use('/dashboard', dashboardRoutes);

// Get Pass
const getPassRoutes = require('./getPass.routes');
router.use('/get-passes', getPassRoutes);

// Departments
const departmentRoutes = require('./department.routes');
router.use('/departments', departmentRoutes);

// Notifications
const notificationRoutes = require('./notification.routes');
router.use('/notifications', notificationRoutes);

// Workflow Pipeline — operational command center (single source for pending work)
const workflowPipelineRoutes = require('./workflow-pipeline.routes');
router.use('/workflow-pipeline', workflowPipelineRoutes);

// Stock Report (Inventory Count Report)
const stockReportRoutes = require('./stockReport.routes');
router.use('/stock-report', stockReportRoutes);

// Period Close
const periodCloseRoutes = require('./periodClose.routes');
router.use('/period-close', periodCloseRoutes);

// Integrity monitoring & month-end governance (F2/F3)
const integrityRoutes = require('./integrity.routes');
router.use('/integrity', integrityRoutes);

// Par Level
const parLevelRoutes = require('./parLevel.routes');
router.use('/par-levels', parLevelRoutes);

// Consumption Report
const consumptionRoutes = require('./consumption.routes');
router.use('/consumption', consumptionRoutes);

// Reorder Suggestions
const reorderRoutes = require('./reorder.routes');
router.use('/reorder', reorderRoutes);

// Constitution v2.0 platform (Ch.6–11, 14, 22)
const constitutionRoutes = require('./constitution.routes');
router.use('/constitution', constitutionRoutes);

// Inventory status (OB phase) — PATCH contract for SPA
const inventoryRoutes = require('./inventory.routes');
router.use('/inventory', inventoryRoutes);

// Tenant settings (OB lock/finalize, inventory-status for settings UI)
const settingRoutes = require('./setting.routes');
router.use('/settings', settingRoutes);

// Signed-URL resolver for cloud-stored attachments (authenticated + tenant-scoped)
const fileRoutes = require('./file.routes');
router.use('/files', fileRoutes);

// Super Admin — Tenant Management & Platform Controls
const superAdminRoutes = require('./superAdmin.routes');
router.use('/super-admin', superAdminRoutes);

// API v1 — organizations (root tenants)
const organizationRoutes = require('./organization.routes');
router.use('/v1/organizations', organizationRoutes);

// Tenant-scoped organization helpers (sister hotels, etc.)
const organizationPortalRoutes = require('./organization.portal.routes');
router.use('/organization', organizationPortalRoutes);

// User Rights — Phase 2 (Read-Only permission matrix viewer)
const userRightsRoutes = require('./userRights.routes');
router.use('/user-rights', userRightsRoutes);

// ACC Workflow Builder — Stage S10 (configuration only)
const accWorkflowConfigRoutes = require('./accWorkflowConfig.routes');
router.use('/access-control/workflows', accWorkflowConfigRoutes);

const accAdvancedPolicyRoutes = require('./accAdvancedPolicy.routes');
router.use('/access-control/policies', accAdvancedPolicyRoutes);

const accEnforcementRoutes = require('./accEnforcement.routes');
router.use('/access-control/enforcement', accEnforcementRoutes);

const accSystemRoutes = require('./accSystem.routes');
router.use('/access-control/system', accSystemRoutes);

module.exports = router;

