'use strict';

/**
 * Read-only: inspect breakage photo storage in DB for regression evidence.
 * Usage: node scripts/verify-breakage-photos-evidence.js [documentNoOrId]
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const filter = process.argv[2] || null;

async function main() {
  const rows = filter
    ? await prisma.$queryRaw`
        SELECT
          md.id,
          md."documentNo",
          md.status,
          md."createdAt",
          md."photoKey" AS doc_photo_key,
          md."attachmentUrl" AS doc_attachment_url,
          ml.id AS line_id,
          ml."photoKey" AS line_photo_key,
          ml."attachmentUrl" AS line_attachment_url
        FROM movement_documents md
        JOIN movement_lines ml ON ml."documentId" = md.id
        WHERE md."movementType" = 'BREAKAGE'
          AND (md.id::text = ${filter} OR md."documentNo" = ${filter})
        ORDER BY ml.id
      `
    : await prisma.$queryRaw`
        SELECT
          md.id,
          md."documentNo",
          md.status,
          md."createdAt",
          md."photoKey" AS doc_photo_key,
          CASE WHEN md."attachmentUrl" IS NOT NULL THEN LEFT(md."attachmentUrl", 60) ELSE NULL END AS doc_attachment_preview,
          ml.id AS line_id,
          ml."photoKey" AS line_photo_key,
          CASE WHEN ml."attachmentUrl" IS NOT NULL THEN LEFT(ml."attachmentUrl", 60) ELSE NULL END AS line_attachment_preview
        FROM movement_documents md
        JOIN movement_lines ml ON ml."documentId" = md.id
        WHERE md."movementType" = 'BREAKAGE'
        ORDER BY md."createdAt" DESC
        LIMIT 40
      `;

  console.log('=== BREAKAGE PHOTO DB EVIDENCE ===');
  console.log(JSON.stringify(rows, null, 2));

  const withLinePhotos = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT md.id)::int AS doc_count
    FROM movement_documents md
    JOIN movement_lines ml ON ml."documentId" = md.id
    WHERE md."movementType" = 'BREAKAGE'
      AND (ml."photoKey" IS NOT NULL OR ml."attachmentUrl" IS NOT NULL)
  `;
  const withDocPhotos = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS doc_count
    FROM movement_documents md
    WHERE md."movementType" = 'BREAKAGE'
      AND (md."photoKey" IS NOT NULL OR md."attachmentUrl" IS NOT NULL)
  `;
  const total = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS doc_count FROM movement_documents WHERE "movementType" = 'BREAKAGE'
  `;

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({ totalBreakageDocs: total[0], withDocLevelPhotos: withDocPhotos[0], withLineLevelPhotos: withLinePhotos[0] }, null, 2));

  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'movement_lines' AND column_name IN ('photoKey', 'attachmentUrl')
    ORDER BY column_name
  `;
  console.log('\n=== movement_lines photo columns ===');
  console.log(JSON.stringify(cols, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
