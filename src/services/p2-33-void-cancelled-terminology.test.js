'use strict';

/**
 * P2 #33 — user-facing Void/Voided consistency (notes + cancel path still writes VOID).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('inventoryCount cancel notes use Voided on (not Cancelled on)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, 'inventoryCount.service.js'),
    'utf8',
  );
  assert.match(src, /Voided on \$\{cancelledAt/);
  assert.equal(src.includes('Cancelled on ${cancelledAt'), false);
});

test('FE i18n success copy uses voided (EN)', () => {
  const en = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../../OSE-Frontend/public/i18n/en.json'),
      'utf8',
    ),
  );
  assert.equal(en.INVENTORY_COUNT_PAGE.MSG_DRAFT_CANCELLED, 'Draft {{no}} voided.');
  assert.equal(en.INVENTORY_COUNT_DETAIL.MSG_SESSION_CANCELLED, 'Session {{no}} voided.');
  // Cancel action button label retained
  assert.equal(en.INVENTORY_COUNT_PAGE.CANCEL, 'Cancel');
  assert.equal(en.INVENTORY_COUNT_DETAIL.CONFIRM_CANCEL_OK, 'Cancel session');
});

test('constitution-base BDR-007 is Active and Ch.2.5 row is Void only', () => {
  const md = fs.readFileSync(
    path.join(__dirname, '../../docs/governance/scripts/constitution-base.md'),
    'utf8',
  );
  assert.match(md, /BDR-007 \| Void vs Cancelled user-facing label \| Active/);
  assert.match(md, /\| Void \| No \|/);
  assert.equal(md.includes('| Void / Cancelled | No |'), false);
});
