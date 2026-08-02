'use strict';



/**

 * Wave 1A — runs only src unit tests classified as non-DB (pure or mocked).

 * Invoked by: npm run test:unit

 */

const { spawnSync } = require('child_process');

const path = require('path');



const root = path.join(__dirname, '..');



/** @type {readonly string[]} */

const UNIT_TEST_FILES = [

    'src/acc-authority/effective-runtime-permissions.util.test.js',

    'src/acc-authority/effective-runtime-permissions.consumer.test.js',

    'src/acc-authority/workflow-step-permissions.parity.test.js',

    'src/acc-authority/step-permission-enforcement.test.js',

    'src/acc-runtime/roleCode.test.js',

    'src/middleware/requireBranchPropertyContext.test.js',

    'src/platform/timeline/approvalTimeline.builder.test.js',

    'src/platform/timeline/constitutional-sendBack-timeline.test.js',

    'src/platform/workflowSendBack.service.test.js',

    'src/platform/timeline/getPassTimeline.builder.test.js',

    'src/platform/timeline/grnTimeline.builder.test.js',

    'src/platform/timeline/inventoryCountTimeline.builder.test.js',

    'src/platform/timeline/timelineEntry.test.js',

    'src/services/get-pass-force-close.util.test.js',

    'src/services/get-pass-workflow-tabs.util.test.js',

    'src/services/getPassReturnDisposition.util.test.js',

    'src/services/getPass.service.test.js',

    'src/services/grn.service.test.js',

    'src/services/inventoryTruthReconciliation.service.test.js',

    'src/services/inventoryValuation.service.test.js',

    'src/services/item.service.test.js',

    'src/services/bulkItemImageUpload.service.test.js',

    'src/services/bulkItemImageUpload.expiry.test.js',

    'src/services/ledgerReplay.service.test.js',

    'src/services/location-item-resolution.service.test.js',

    'src/services/mapping.service.consumer.test.js',

    'src/utils/timeline-present.util.test.js',

    'src/utils/evidence-format.util.test.js',

    'src/services/grnEvidence.service.consumer.test.js',

    'src/services/transferEvidence.service.consumer.test.js',

    'src/services/stockCountEvidence.service.consumer.test.js',

    'src/services/consumption.service.consumer.test.js',

    'src/controllers/item.controller.consumer.test.js',

    'src/services/unit.service.consumer.test.js',

    'src/services/supplier.service.consumer.test.js',

    'src/services/reorder.service.consumer.test.js',

    'src/platform/displayCurrency.service.consumer.test.js',

    'src/utils/movementLineFinancial.util.consumer.test.js',

    'src/services/docNumbering.service.consumer.test.js',

    'src/services/parLevel.service.test.js',

    'src/services/periodGuard.service.test.js',

    'src/services/periodAutoClose.service.test.js',

    'src/utils/tenant-calendar.util.test.js',

    'src/routes/period-close-granular-permissions.test.js',

    'src/utils/adjustmentDirection.util.test.js',

    'src/services/adjustmentCreateIdempotency.service.test.js',

    'src/services/posting.service.test.js',

    'src/services/postingGovernedGetPass.service.test.js',

    'src/services/rbac.service.test.js',

    'src/services/setting.service.test.js',

    'src/services/users.service.test.js',

    'src/utils/resolveTenantMembership.test.js',

    'src/utils/tenantSwitchValidation.test.js',

    'src/services/tenant-isolation-getPass.test.js',

    'src/services/acc-workflow-movement.runtime.test.js',

    'src/services/acc-workflow-count.runtime.test.js',

    'src/services/inventory-count-workflow.behavior.test.js',

    'src/services/inventory-count-lifecycle.behavior.test.js',

    'src/services/constitutional-sendBack-modules.runtime.test.js',

    'src/services/inventory-count-cancel-atomicity.test.js',

    'src/services/inventory-count-approval.behavior.test.js',

    'src/services/breakage-approval-request.behavior.test.js',

];



const args = ['--test', ...UNIT_TEST_FILES.map((rel) => path.join(root, rel))];

const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });

process.exit(result.status ?? 1);

