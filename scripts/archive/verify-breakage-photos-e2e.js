'use strict';

/**
 * End-to-end verification for one breakage document: DB → API detail → evidence → PDF.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const breakageService = require('../src/services/breakage.service');
const { generateBreakageEvidencePDF } = require('../src/services/pdf.service');

const docId = process.argv[2];
if (!docId) {
  console.error('Usage: node scripts/verify-breakage-photos-e2e.js <documentId>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const db = await prisma.movementDocument.findFirst({
    where: { id: docId, movementType: 'BREAKAGE' },
    include: { lines: { select: { id: true, photoKey: true, attachmentUrl: true } } },
  });
  if (!db) throw new Error('Document not found');

  const api = await breakageService.getBreakageById(docId, db.tenantId, null);
  const list = await breakageService.getBreakages(db.tenantId, { take: 100 });
  const listRow = list.documents.find((d) => d.id === docId);
  const evidence = await breakageService.getEvidence(docId, db.tenantId, null);
  const pdf = await generateBreakageEvidencePDF(evidence);

  const lineMedia = (api.lines || []).map((line) => ({
    id: line.id,
    attachments: line.attachments?.length ?? 0,
    photoUrl: Boolean(line.photoUrl),
  }));

  const pass =
    lineMedia.some((l) => l.attachments > 0 || l.photoUrl) &&
    (listRow?.mediaCount ?? 0) > 0 &&
    (evidence.attachments?.length ?? 0) > 0 &&
    pdf.length > 10_000;

  console.log(
    JSON.stringify(
      {
        documentNo: db.documentNo,
        db: {
          docPhotoKey: db.photoKey,
          linesWithPhotoKey: db.lines.filter((l) => l.photoKey).length,
        },
        apiDetail: { lineMedia, docAttachments: api.attachments?.length ?? 0 },
        list: { mediaCount: listRow?.mediaCount ?? 0 },
        evidence: { attachments: evidence.attachments?.length ?? 0 },
        pdfBytes: pdf.length,
        e2ePass: pass,
      },
      null,
      2,
    ),
  );

  if (!pass) process.exit(2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
