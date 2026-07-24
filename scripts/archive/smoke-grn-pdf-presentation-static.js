#!/usr/bin/env node
'use strict';

/**
 * Static smoke: GRN UAT presentation (timeline labels + PDF slot mapping).
 */
const {
  buildGrnWorkflowTimeline,
  mapSlotsToPdfApprovalHistory,
} = require('../src/services/grn-workflow-presentation.util');
const { buildGrnSignatureSlots } = require('../src/services/pdf/report-pdf-components');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`OK: ${msg}`);
  }
}

function makePostedGrn() {
  return {
    status: 'POSTED',
    createdAt: '2026-05-28T09:30:00.000Z',
    updatedAt: '2026-05-28T10:15:00.000Z',
    postedAt: '2026-05-28T10:15:00.000Z',
    importedBy: 'u1',
    approvedBy: 'u2',
    postedBy: 'u3',
    importedByUser: { firstName: 'Hesham', lastName: 'Cost' },
    approvedByUser: { firstName: 'Omar', lastName: 'Khalid' },
    postedByUser: { firstName: 'Layla', lastName: 'Nasser' },
  };
}

function main() {
  const grn = makePostedGrn();
  const slots = buildGrnWorkflowTimeline(grn);

  assert(slots.length === 4, `posted GRN has 4 slots (got ${slots.length})`);
  assert(slots[0].stageTitle === 'RECEIVED & VALIDATED', 'slot 0 is RECEIVED & VALIDATED');
  assert(slots[0].actorName === 'Hesham Cost', 'slot 0 shows actual importedByUser');
  assert(slots[0].roleLabel == null, 'slot 0 has no hardcoded role label');
  assert(slots[1].stageTitle === 'COST CONTROL APPROVED', 'slot 1 is COST CONTROL APPROVED');
  assert(slots[1].actorName === 'Omar Khalid', 'slot 1 shows actual approvedByUser');
  assert(slots[1].actedAt == null, 'cost timestamp null on POSTED GRN');
  assert(slots[2].stageTitle === 'FINANCE APPROVED', 'slot 2 is FINANCE APPROVED');
  assert(slots[2].actorName === 'Layla Nasser', 'slot 2 shows postedByUser as finance actor');
  assert(slots[3].stageTitle === 'POSTED TO INVENTORY', 'slot 3 is POSTED TO INVENTORY');
  assert(slots[3].actorName == null, 'posting slot has no actor');
  assert(slots[3].kind === 'POSTING', 'posting slot kind is POSTING');

  const pendingFinance = buildGrnWorkflowTimeline({
    ...grn,
    status: 'PENDING_FINANCE',
    postedAt: null,
    postedBy: null,
    postedByUser: null,
  });
  assert(pendingFinance[1].actedAt != null, 'cost slot may use updatedAt while PENDING_FINANCE');

  const pdfHistory = mapSlotsToPdfApprovalHistory(slots);
  const evidence = {
    header: { postedAt: grn.postedAt },
    approvalHistory: pdfHistory,
  };
  const pdfSlots = buildGrnSignatureSlots(evidence);
  const receivedSlot = pdfSlots.find((s) => s.label === 'Received & validated');
  const costSlot = pdfSlots.find((s) => s.label === 'Cost Control approved');
  const financeSlot = pdfSlots.find((s) => s.label === 'Finance approved');
  const postedSlot = pdfSlots.find((s) => s.label === 'Posted to inventory');

  assert(receivedSlot && receivedSlot.name === 'Hesham Cost', 'PDF received slot shows importer name');
  assert(costSlot && costSlot.name === 'Omar Khalid', 'PDF cost slot keeps actor without date');
  assert(financeSlot && financeSlot.name === 'Layla Nasser', 'PDF finance slot shows finance actor');
  assert(postedSlot && postedSlot.omitActorLine === true, 'PDF posted slot omits actor line');
  assert(postedSlot && postedSlot.name === '', 'PDF posted slot has empty actor name');

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll GRN PDF presentation static checks passed.');
}

main();
