'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const breakageService = require('../src/services/breakage.service');
const { generateBreakageEvidencePDF } = require('../src/services/pdf.service');

const docId = process.argv[2];
if (!docId) {
  console.error('Usage: node scripts/verify-breakage-pdf.js <documentId>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.movementDocument.findFirst({
    where: { id: docId, movementType: 'BREAKAGE' },
    select: { tenantId: true, documentNo: true },
  });
  if (!row) throw new Error('Not found');

  const evidence = await breakageService.getEvidence(docId, row.tenantId, null);
  const buf = await generateBreakageEvidencePDF(evidence);
  const out = path.join(__dirname, '..', 'uploads', `_verify-pdf-${row.documentNo.replace(/[^a-z0-9-]/gi, '_')}.pdf`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log(JSON.stringify({
    documentNo: row.documentNo,
    pdfBytes: buf.length,
    evidenceAttachments: evidence.attachments?.length ?? 0,
    outputPath: out,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
