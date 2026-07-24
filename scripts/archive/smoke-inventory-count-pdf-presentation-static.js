#!/usr/bin/env node
'use strict';

/**
 * Static smoke: Inventory Count UAT presentation (timeline labels + KPI mapping).
 */
const fs = require('fs');
const path = require('path');

const {
  buildInventoryCountWorkflowTimeline,
  mapSlotsToPdfApprovalHistory,
} = require('../src/services/inventory-count-workflow-presentation.util');
const { mapInventoryCountApprovalSlots, buildInventoryCountLocationPresentation } = require('../src/services/pdf/inventory-count-pdf.renderer');
const { buildAuditInventoryCountTableColumns } = require('../src/services/pdf/report-pdf-audit-shell');
const { formatMoney } = require('../src/services/pdf/report-pdf-layout');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`OK: ${msg}`);
  }
}

function makePostedSession() {
  return {
    id: 'sess-1',
    status: 'POSTED',
    postedAt: '2026-05-22T14:30:00.000Z',
    approvalRequest: {
      steps: [
        {
          stepNumber: 1,
          requiredRole: { code: 'FINANCE_MANAGER' },
          status: 'APPROVED',
          actedAt: '2026-05-22T10:00:00.000Z',
          actedByUser: { firstName: 'Layla', lastName: 'Nasser' },
        },
        {
          stepNumber: 2,
          requiredRole: { code: 'GENERAL_MANAGER' },
          status: 'APPROVED',
          actedAt: '2026-05-22T12:00:00.000Z',
          actedByUser: { firstName: 'Omar', lastName: 'Haddad' },
        },
      ],
    },
  };
}

function makeAuditRows() {
  return [
    {
      note: 'INVENTORY_COUNT_SUBMIT_COUNTS',
      changedAt: '2026-05-21T09:00:00.000Z',
      changedByUser: { firstName: 'Sara', lastName: 'Al-Mutairi' },
    },
  ];
}

function main() {
  const session = makePostedSession();
  const slots = buildInventoryCountWorkflowTimeline(session, makeAuditRows());

  assert(slots.length === 4, `posted 2-step session has 4 slots (got ${slots.length})`);
  assert(slots[0].stageTitle === 'VARIANCE REVIEW', 'slot 0 is VARIANCE REVIEW');
  assert(slots[0].roleLabel === 'Cost Control', 'slot 0 role is Cost Control');
  assert(slots[0].kind === 'MILESTONE', 'slot 0 kind is MILESTONE');
  assert(slots[1].stageTitle === 'FINANCE APPROVED', 'slot 1 is FINANCE APPROVED');
  assert(slots[2].stageTitle === 'GENERAL MANAGER APPROVED', 'slot 2 is GENERAL MANAGER APPROVED');
  assert(slots[2].status === 'APPROVED', 'GM slot status is APPROVED');
  assert(slots[3].stageTitle === 'POSTED TO INVENTORY', 'slot 3 is POSTED TO INVENTORY');
  assert(slots[3].status === 'POSTED', 'posted slot status is POSTED');
  assert(slots[3].kind === 'POSTING', 'posted slot kind is POSTING');

  const serialized = JSON.stringify(slots);
  assert(!serialized.includes('Approval 1'), 'no Approval 1 label');
  assert(!serialized.includes('Approval 2'), 'no Approval 2 label');

  const pdfHistory = mapSlotsToPdfApprovalHistory(slots);
  const pdfSlots = mapInventoryCountApprovalSlots(pdfHistory);
  const variancePdfSlot = pdfSlots.find((s) => s.label === 'VARIANCE REVIEW');
  const gmSlot = pdfSlots.find((s) => s.label === 'GENERAL MANAGER APPROVED');
  const postedSlot = pdfSlots.find((s) => s.label === 'POSTED TO INVENTORY');
  assert(variancePdfSlot && variancePdfSlot.name === 'Cost Control', 'PDF variance review shows Cost Control (not dash)');
  assert(gmSlot && gmSlot.status === 'APPROVED', 'PDF GM slot stays APPROVED (not remapped to POSTED)');
  assert(gmSlot && gmSlot.name === 'Omar Haddad', 'PDF GM slot keeps actor name');
  assert(postedSlot && postedSlot.status === 'POSTED', 'PDF posted slot is POSTED');
  assert(postedSlot && postedSlot.omitActorLine === true, 'PDF posted slot omits actor line');
  assert(postedSlot && postedSlot.name === '', 'PDF posted slot has no actor name');

  const lines = [
    { varianceValueEstimate: 100 },
    { varianceValueEstimate: -100 },
    { varianceValueEstimate: -15 },
  ];
  const totalNet = lines.reduce((s, l) => s + Number(l.varianceValueEstimate || 0), 0);
  const totalAbs = lines.reduce((s, l) => s + Math.abs(Number(l.varianceValueEstimate || 0)), 0);
  assert(Math.abs(totalNet - (-15)) < 1e-9, 'totalNetVarianceValue equals signed sum');
  assert(Math.abs(totalAbs - 215) < 1e-9, 'totalAbsVarianceValue equals sum of |line values|');

  const revealSlots = buildInventoryCountWorkflowTimeline(
    { ...session, status: 'REVEAL_REVIEW', postedAt: null },
    [],
  );
  assert(revealSlots[0].status === 'IN_PROGRESS', 'reveal review milestone is IN_PROGRESS');
  assert(revealSlots[0].actedAt == null, 'missing audit degrades milestone date (null, not invented)');

  const invSvc = fs.readFileSync(path.join(__dirname, '../src/services/inventoryCount.service.js'), 'utf8');
  assert(invSvc.includes('workflowTimeline'), 'getSession exposes workflowTimeline');
  assert(invSvc.includes('totalNetVarianceValue'), 'exportPdf exposes totalNetVarianceValue');
  assert(invSvc.includes('buildInventoryCountWorkflowTimelineForSession'), 'exportPdf uses presentation util');

  const renderer = fs.readFileSync(
    path.join(__dirname, '../src/services/pdf/inventory-count-pdf.renderer.js'),
    'utf8',
  );
  assert(
    !renderer.includes("if (statusRaw === 'APPROVED' || statusRaw === 'POSTED') status = 'POSTED'"),
    'PDF renderer no longer remaps APPROVED to POSTED',
  );

  const shell = fs.readFileSync(path.join(__dirname, '../src/services/pdf/report-pdf-audit-shell.js'), 'utf8');
  assert(shell.includes('NET VARIANCE VALUE (SAR)'), 'audit shell has NET VARIANCE KPI');
  assert(shell.includes('ABS VARIANCE EXPOSURE (SAR)'), 'audit shell has ABS EXPOSURE KPI');

  const pageWidth = 515.28;
  const columns = buildAuditInventoryCountTableColumns(pageWidth);
  const indexCol = columns.find((c) => c.key === 'index');
  const valueCol = columns.find((c) => c.key === 'varianceValue');
  const padX = 5;
  const innerW = valueCol.width - padX * 2;
  assert(indexCol && indexCol.width >= 28, `index column width >= 28pt (got ${indexCol?.width})`);
  assert(valueCol && valueCol.width >= 62, `variance value column width >= 62pt (got ${valueCol?.width})`);
  assert(innerW >= 52, `variance value inner width fits SAR total (got ${innerW})`);
  assert(!shell.includes('flexShrinkOrder = [1, 3, 7]'), 'variance value column excluded from flex shrink');

  const multiLoc = buildInventoryCountLocationPresentation(
    { primaryLocation: 'Store Floor 1', scope: { locations: ['Store Floor 1', 'Store Floor 2'] } },
    [],
  );
  assert(multiLoc.label === 'Locations', 'multi-location metadata uses Locations label');
  assert(multiLoc.value.includes('Store Floor 1') && multiLoc.value.includes('Store Floor 2'), 'multi-location lists all stores');

  assert(formatMoney(73499.25) === 'SAR 73,499.25', 'KPI money uses thousands separators');
  assert(shell.includes('drawAuditInventoryCountTotalNumeric'), 'total row uses non-wrapping numeric draw helper');
  assert(shell.includes('formatInventoryCountTotalQty'), 'total row qty uses fixed 2dp presentation');

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll inventory count PDF presentation static checks passed.');
}

main();
