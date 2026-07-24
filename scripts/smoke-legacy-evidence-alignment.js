/**
 * Smoke: legacy stock-count evidence alignment (cell-first).
 * Run: node scripts/smoke-legacy-evidence-alignment.js
 *
 * Uses in-memory session + locationQty fixtures (no DB).
 */
const stockCountEvidence = require('../src/services/stockCountEvidence.service');

const { _buildEvidenceRows, _sessionHasAnyCountedCells } = stockCountEvidence;

const item = { name: 'Test Item', barcode: 'BC1', category: { name: 'Cat' } };
const locStore = { name: 'Main Store' };

function assert(name, cond) {
  if (!cond) {
    console.error(JSON.stringify({ fail: name }));
    process.exit(1);
  }
}

// Legacy: no counted cells → use StockCountLine
const legacySession = {
  id: 's1',
  locationId: 'loc-a',
  lines: [
    {
      itemId: 'i1',
      item,
      bookQty: 10,
      countedQty: 42,
      varianceQty: 32,
      wacUnitCost: 2,
      varianceValue: 64,
    },
  ],
};
const legacyCells = [{ itemId: 'i1', locationId: 'loc-a', roundNo: 1, countedQty: null, bookQty: 10, item, location: locStore }];
assert('legacy no counted cells', !_sessionHasAnyCountedCells(legacyCells));
const legacyRows = _buildEvidenceRows(legacySession, legacyCells);
assert('legacy row count', legacyRows.length === 1);
assert('legacy counted from line', legacyRows[0].countedQty === 42);

// Canonical: counted cells → latest round, ignore stale line.countedQty
const canonSession = {
  id: 's2',
  locationId: 'loc-a',
  lines: [
    {
      itemId: 'i1',
      item,
      bookQty: 10,
      countedQty: 1,
      varianceQty: -9,
      wacUnitCost: 2,
      varianceValue: -18,
    },
  ],
};
const canonCells = [
  { itemId: 'i1', locationId: 'loc-a', roundNo: 1, countedQty: 5, bookQty: 10, item, location: locStore },
  { itemId: 'i1', locationId: 'loc-a', roundNo: 2, countedQty: 77, bookQty: 10, item, location: locStore },
];
assert('canonical has cells', _sessionHasAnyCountedCells(canonCells));
const canonRows = _buildEvidenceRows(canonSession, canonCells);
assert('canonical one row per item-loc', canonRows.length === 1);
assert('canonical latest round qty', canonRows[0].countedQty === 77);
assert('canonical variance from cell book', canonRows[0].varianceQty === 67);
assert('canonical value uses line wac', canonRows[0].varianceValue === 134);

console.log(
  JSON.stringify(
    {
      mode: 'legacy_evidence_alignment',
      legacyCountedQty: legacyRows[0].countedQty,
      canonicalCountedQty: canonRows[0].countedQty,
      pass: true,
    },
    null,
    2
  )
);
