'use strict';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const doc = await prisma.movementDocument.findFirst({
    where: { documentNo: 'BRK-2606-0005', movementType: 'BREAKAGE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!doc) throw new Error('BRK-2606-0005 not found');
  const lines = await prisma.movementLine.findMany({
    where: { documentId: doc.id },
    orderBy: { id: 'asc' },
  });
  const existing = lines.filter((l) => l.photoKey).length;
  if (existing > 0) {
    console.log('Already has line photos:', existing);
    return;
  }
  for (let i = 0; i < lines.length; i += 1) {
    const key = `/uploads/attachments/breakage-photo-BRK-2606-0005-L${i}.png`;
    await prisma.movementLine.update({
      where: { id: lines[i].id },
      data: {
        photoKey: key,
        attachmentUrl: JSON.stringify([
          { key, url: key, originalName: `evidence-${i + 1}.png`, mimetype: 'image/png' },
        ]),
      },
    });
  }
  console.log(`Seeded ${lines.length} line photos on ${doc.documentNo} (${doc.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
