#!/usr/bin/env node
'use strict';

/**
 * Explains live GRN smoke: document state + timeline entry titles.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { getGrnTimeline } = require('../src/platform/documentTimeline.service');

const DOC_ID = process.argv[2] || '72542334-42d3-4fd7-b3b7-4c4de04eb0c8';

async function main() {
    const prisma = new PrismaClient();
    const grn = await prisma.grnImport.findFirst({
        where: { id: DOC_ID },
        include: {
            approvalRequest: { select: { id: true, grnImportId: true, cycleNumber: true, status: true, currentStep: true } },
        },
    });
    if (!grn) {
        console.error('GRN not found:', DOC_ID);
        process.exit(1);
    }
    const timeline = await getGrnTimeline(grn.id, grn.tenantId);
    console.log(JSON.stringify({
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        status: grn.status,
        approvalRequestId: grn.approvalRequestId,
        activeApproval: grn.approvalRequest,
        workflowSlotsCount: timeline.workflowSlots.length,
        auditEventsCount: timeline.auditEvents.length,
        timelineEntriesCount: timeline.timelineEntries.length,
        timelineEntries: timeline.timelineEntries.map((e) => ({
            globalOrder: e.globalOrder,
            entryType: e.entryType,
            stageKey: e.stageKey,
            displayTitleKey: e.displayTitleKey,
            cycleNumber: e.cycleNumber,
            status: e.status,
        })),
        workflowSlotStatuses: timeline.workflowSlots.map((s) => ({ order: s.order, stageTitle: s.stageTitle, status: s.status })),
    }, null, 2));
    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
