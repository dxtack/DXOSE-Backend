'use strict';

/** Smoke: create breakage with line photo and verify DB line photoKey. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const breakageService = require('../src/services/breakage.service');

const prisma = new PrismaClient();

// 1x1 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!tenant) throw new Error('No tenant');
  const member = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    include: { user: true, role: true },
  });
  const user = member
    ? { ...member.user, role: member.role?.code || member.role?.name }
    : null;
  const stock = await prisma.stockBalance.findFirst({
    where: { tenantId: tenant.id, qtyOnHand: { gt: 0 } },
    select: { itemId: true, locationId: true, qtyOnHand: true },
  });
  if (!tenant || !user || !stock) throw new Error('Missing seed data');

  const photoFile = {
    originalname: 'verify-line-photo.png',
    mimetype: 'image/png',
    size: TINY_PNG.length,
    buffer: TINY_PNG,
  };

  const created = await breakageService.createBreakage(
    {
      reason: 'Photo persistence verify',
      suggestedAction: 'HOTEL',
      lines: [
        {
          locationId: stock.locationId,
          itemId: stock.itemId,
          qty: 1,
        },
      ],
    },
    tenant.id,
    user,
    [[photoFile]],
  );

  const dbLine = await prisma.movementLine.findFirst({
    where: { documentId: created.id },
    select: { photoKey: true, attachmentUrl: true },
  });

  console.log(
    JSON.stringify(
      {
        createdId: created.id,
        documentNo: created.documentNo,
        apiLinePhotoKey: created.lines?.[0]?.photoKey ?? null,
        apiLineAttachments: created.lines?.[0]?.attachments?.length ?? 0,
        dbLinePhotoKey: dbLine?.photoKey ?? null,
        dbLineHasAttachmentUrl: Boolean(dbLine?.attachmentUrl),
        createPersistPass: Boolean(dbLine?.photoKey),
      },
      null,
      2,
    ),
  );

  await prisma.movementDocument.delete({ where: { id: created.id } }).catch(() => {});

  if (!dbLine?.photoKey) process.exit(2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
