'use strict';

/**
 * Validate BRK-2606-0005 (or any doc no): DB photos → list mediaCount → detail → PDF.
 * Usage: node scripts/verify-brk-2606-0005.js [documentNo]
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const breakageService = require('../src/services/breakage.service');
const { generateBreakageEvidencePDF } = require('../src/services/pdf.service');

function countBreakageListMedia(row) {
  if (typeof row.mediaCount === 'number' && Number.isFinite(row.mediaCount)) {
    return Math.max(0, Math.floor(row.mediaCount));
  }
  const hasPrimary = Boolean((row.photoKey ?? '').trim() || (row.photoUrl ?? '').trim());
  let extra = 0;
  if (row.attachmentUrl?.trim()) {
    try {
      const parsed = JSON.parse(row.attachmentUrl);
      extra = Array.isArray(parsed) ? parsed.length : 0;
    } catch { extra = 0; }
  }
  if (hasPrimary) return 1 + extra;
  return extra;
}

const prisma = new PrismaClient();
const documentNo = process.argv[2] || 'BRK-2606-0005';

async function countDbPhotos(doc) {
  const lines = await prisma.movementLine.findMany({
    where: { documentId: doc.id },
    select: { photoKey: true, attachmentUrl: true },
  });

  let linePhotoItems = 0;
  for (const line of lines) {
    if (line.attachmentUrl) {
      try {
        const parsed = JSON.parse(line.attachmentUrl);
        if (Array.isArray(parsed)) linePhotoItems += parsed.length;
        else if (line.photoKey) linePhotoItems += 1;
      } catch {
        if (line.photoKey) linePhotoItems += 1;
      }
    } else if (line.photoKey) {
      linePhotoItems += 1;
    }
  }

  let docItems = 0;
  if (doc.attachmentUrl) {
    try {
      const parsed = JSON.parse(doc.attachmentUrl);
      if (Array.isArray(parsed)) docItems = parsed.length;
    } catch { /* ignore */ }
  }
  const docPrimary = doc.photoKey ? 1 : 0;

  return Math.max(linePhotoItems, docItems || docPrimary);
}

async function main() {
  const doc = await prisma.movementDocument.findFirst({
    where: { documentNo, movementType: 'BREAKAGE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!doc) {
    console.error('Document not found:', documentNo);
    process.exit(1);
  }

  const dbPhotoCount = await countDbPhotos(doc);
  const list = await breakageService.getBreakages(doc.tenantId, { take: 100, search: documentNo });
  const listRow = list.documents.find((d) => d.id === doc.id);
  const detail = await breakageService.getBreakageById(doc.id, doc.tenantId, null);
  const evidence = await breakageService.getEvidence(doc.id, doc.tenantId, null);
  const pdf = await generateBreakageEvidencePDF(evidence);

  const detailLineAttachments = (detail.lines || []).reduce(
    (sum, line) => sum + (line.attachments?.length ?? (line.photoUrl ? 1 : 0)),
    0,
  );
  const uiBadgeCount = listRow ? countBreakageListMedia(listRow) : 0;

  const result = {
    documentNo: doc.documentNo,
    id: doc.id,
    before: { listMediaCount: 0, photoColumn: '—' },
    after: {
      dbPhotoCount,
      listApiMediaCount: listRow?.mediaCount ?? null,
      countBreakageListMedia: uiBadgeCount,
      badgeLabel: uiBadgeCount > 0 ? `${uiBadgeCount} Photos` : null,
      detailLineAttachments,
      evidenceAttachments: evidence.attachments?.length ?? 0,
      pdfBytes: pdf.length,
    },
    pass:
      dbPhotoCount >= 6
        ? listRow?.mediaCount === dbPhotoCount
          && uiBadgeCount === dbPhotoCount
          && detailLineAttachments >= 6
          && (evidence.attachments?.length ?? 0) >= 6
          && pdf.length > 10_000
        : listRow?.mediaCount === dbPhotoCount && uiBadgeCount === dbPhotoCount,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exit(2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
