'use strict';

/**
 * Compare DB vs API breakage photo fields for regression evidence.
 * Usage: node scripts/verify-breakage-photos-api.js <documentId>
 */

require('dotenv').config();
const breakageService = require('../src/services/breakage.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const docId = process.argv[2];

if (!docId) {
  console.error('Usage: node scripts/verify-breakage-photos-api.js <documentId>');
  process.exit(1);
}

function pickLineMedia(line) {
  return {
    id: line.id,
    photoKey: line.photoKey ?? null,
    photoUrl: line.photoUrl ?? null,
    attachmentUrl: line.attachmentUrl ?? null,
    attachments: Array.isArray(line.attachments)
      ? line.attachments.map((a) => ({
          key: a.key,
          url: a.url ? String(a.url).slice(0, 120) : null,
          mimetype: a.mimetype,
          originalName: a.originalName,
        }))
      : line.attachments,
  };
}

async function main() {
  const dbRow = await prisma.movementDocument.findFirst({
    where: { id: docId, movementType: 'BREAKAGE' },
    include: {
      lines: { select: { id: true, photoKey: true, attachmentUrl: true } },
    },
  });
  if (!dbRow) {
    console.error('Document not found:', docId);
    process.exit(1);
  }

  const doc = await breakageService.getBreakageById(docId, dbRow.tenantId, null);
  const evidence = await breakageService.getEvidence(docId, dbRow.tenantId, null);

  const apiSample = {
    id: doc.id,
    documentNo: doc.documentNo,
    photoKey: doc.photoKey ?? null,
    photoUrl: doc.photoUrl ? String(doc.photoUrl).slice(0, 120) : null,
    attachmentUrl: doc.attachmentUrl ? String(doc.attachmentUrl).slice(0, 120) : null,
    attachments: Array.isArray(doc.attachments)
      ? doc.attachments.map((a) => ({
          key: a.key,
          url: a.url ? String(a.url).slice(0, 120) : null,
          mimetype: a.mimetype,
        }))
      : doc.attachments,
    lines: (doc.lines || []).map(pickLineMedia),
  };

  const evidenceSample = {
    photoEvidence: evidence.photoEvidence,
    attachmentsCount: Array.isArray(evidence.attachments) ? evidence.attachments.length : 0,
    attachments: (evidence.attachments || []).slice(0, 5).map((a) => ({
      key: a.key,
      url: a.url ? String(a.url).slice(0, 120) : null,
      originalName: a.originalName,
    })),
  };

  console.log('=== DB (raw) ===');
  console.log(
    JSON.stringify(
      {
        id: dbRow.id,
        documentNo: dbRow.documentNo,
        doc_photoKey: dbRow.photoKey,
        doc_attachmentUrl: dbRow.attachmentUrl ? dbRow.attachmentUrl.slice(0, 120) : null,
        lines: dbRow.lines,
      },
      null,
      2,
    ),
  );

  console.log('\n=== API GET /breakage/:id (via service) ===');
  console.log(JSON.stringify(apiSample, null, 2));

  console.log('\n=== API evidence payload ===');
  console.log(JSON.stringify(evidenceSample, null, 2));

  const dbHasDocPhoto = Boolean(dbRow.photoKey || dbRow.attachmentUrl);
  const dbHasLinePhoto = dbRow.lines.some((l) => l.photoKey || l.attachmentUrl);
  const apiHasLinePhoto = apiSample.lines.some(
    (l) => l.photoKey || l.photoUrl || (l.attachments && l.attachments.length),
  );
  const apiHasDocPhoto = Boolean(
    apiSample.photoKey || apiSample.photoUrl || (apiSample.attachments && apiSample.attachments.length),
  );

  let failingLayer = [];
  if (dbHasDocPhoto || dbHasLinePhoto) {
    if (!dbHasDocPhoto && !dbHasLinePhoto) failingLayer.push('STORAGE');
    if (dbHasDocPhoto && !apiHasDocPhoto) failingLayer.push('API_DOC_ENRICHMENT');
    if (dbHasLinePhoto && !apiHasLinePhoto) failingLayer.push('API_LINE_ENRICHMENT');
    if (apiHasDocPhoto && dbHasDocPhoto && !dbHasLinePhoto) {
      failingLayer.push('UI_LINE_COLUMN_EXPECTS_LINE_DATA');
    }
    if (!evidenceSample.attachmentsCount && (apiHasDocPhoto || apiHasLinePhoto)) {
      failingLayer.push('PDF_EVIDENCE_GALLERY');
    }
  } else {
    failingLayer.push('STORAGE_NO_PHOTOS_IN_DB');
  }

  console.log('\n=== LAYER DIAGNOSIS ===');
  console.log(
    JSON.stringify(
      {
        dbHasDocPhoto,
        dbHasLinePhoto,
        apiHasDocPhoto,
        apiHasLinePhoto,
        evidenceAttachmentCount: evidenceSample.attachmentsCount,
        failingLayer,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
