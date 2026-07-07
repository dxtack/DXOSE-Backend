#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../constitution-extraction/CONSTITUTION_FRESH_REGISTER.csv');
const reqPath = path.join(__dirname, '../requirements.json');
const outPath = path.join(__dirname, 'REQUIREMENTS_476_393_MAPPING.json');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
}

function reqIdToFreshId(requirementId) {
  return requirementId.replace(/^C0(\d)-/, 'C$1-');
}

function freshIdToReqId(freshId) {
  const m = freshId.match(/^C(\d+)-/);
  if (!m) return freshId;
  return freshId.replace(/^C(\d+)-/, `C${String(m[1]).padStart(2, '0')}-`);
}

const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
const headers = parseCsvLine(lines[0]);
const idx = (name) => headers.indexOf(name);

const freshRows = [];
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  freshRows.push({
    fresh_id: cols[idx('fresh_id')],
    category_bucket: cols[idx('category_bucket')],
    strength_classification: cols[idx('strength_classification')],
    product_gap_applicability: cols[idx('product_gap_applicability')],
    normalized_atomic_clause: cols[idx('normalized_atomic_clause')] || '',
    verification_type: cols[idx('verification_type')],
    chapter_num: cols[idx('chapter_num')],
    section: cols[idx('section')],
  });
}

const requirements = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
const reqById = new Map(requirements.map((r) => [r.requirementId, r]));
const reqFreshSet = new Set(requirements.map((r) => reqIdToFreshId(r.requirementId)));

function classifyExcludedFreshRow(r) {
  const b = r.category_bucket || 'Unknown';
  if (b === 'Out of Scope') return { rowType: 'Out of Scope', reasonExcludedFrom393: 'category_bucket=Out of Scope' };
  if (b === 'Optional Capability' || b === 'Excluded Pending Ratification') return { rowType: 'Optional', reasonExcludedFrom393: `category_bucket=${b}` };
  if (b === 'Descriptive Context' || r.strength_classification === 'Descriptive') return { rowType: 'Descriptive Context', reasonExcludedFrom393: b === 'Descriptive Context' ? 'category_bucket=Descriptive Context' : 'strength_classification=Descriptive' };
  if (['Governance Definition', 'Governance Document Requirement', 'Authoring Guidance', 'Documentation'].includes(b)) {
    return { rowType: b === 'Governance Document Requirement' ? 'Governance Definition' : b, reasonExcludedFrom393: `category_bucket=${b}` };
  }
  if (r.product_gap_applicability === 'No') return { rowType: 'Non-implementable extraction row', reasonExcludedFrom393: 'product_gap_applicability=No' };
  if (b === 'UX/Presentation') return { rowType: 'UX/Presentation', reasonExcludedFrom393: 'category_bucket=UX/Presentation — consolidated into normative UX register rows in 393' };
  return { rowType: 'Duplicate or consolidated into 393 register', reasonExcludedFrom393: 'Fresh extraction row consolidated into deduplicated 393 implementation register (many-to-one)' };
}

const exclusiveTo476 = freshRows
  .filter((r) => !reqFreshSet.has(r.fresh_id))
  .map((r) => {
    const { rowType, reasonExcludedFrom393 } = classifyExcludedFreshRow(r);
    return {
      side: '476-only',
      fresh_id: r.fresh_id,
      mapped_requirementId: freshIdToReqId(r.fresh_id),
      textPreview: r.normalized_atomic_clause.slice(0, 160),
      category_bucket: r.category_bucket,
      strength: r.strength_classification,
      product_gap_applicability: r.product_gap_applicability,
      rowType,
      reasonExcludedFrom393,
      in393SSOT: false,
    };
  });

const freshIdSet = new Set(freshRows.map((r) => r.fresh_id));
const exclusiveTo393 = requirements
  .filter((r) => !freshIdSet.has(reqIdToFreshId(r.requirementId)))
  .map((r) => ({
    side: '393-only',
    requirementId: r.requirementId,
    fresh_id: reqIdToFreshId(r.requirementId),
    textPreview: (r.requirement || '').slice(0, 160),
    rowType: '393 SSOT register entry without 1:1 fresh extraction row',
    reasonExcludedFrom476: 'Normative implementation register entry — merged/split from multiple fresh rows or added during Gate A deduplication',
    in393SSOT: true,
  }));

const categoryCounts476Only = {};
for (const r of exclusiveTo476) categoryCounts476Only[r.rowType] = (categoryCounts476Only[r.rowType] || 0) + 1;

const out = {
  generatedAt: new Date().toISOString(),
  source476: csvPath,
  source393: reqPath,
  total476: freshRows.length,
  total393: requirements.length,
  overlapFreshIdMatch: freshRows.length - exclusiveTo476.length,
  exclusiveTo476Count: exclusiveTo476.length,
  exclusiveTo393Count: exclusiveTo393.length,
  netCountDelta476Minus393: freshRows.length - requirements.length,
  netDeltaReconciled: exclusiveTo476.length - exclusiveTo393.length,
  netDeltaMatchesExpected: exclusiveTo476.length - exclusiveTo393.length === freshRows.length - requirements.length,
  categoryCounts476Only,
  explanation: {
    ssot393: 'requirements.json / CONSTITUTION_TRACEABILITY_MATRIX.md — 393 deduplicated implementation obligations',
    ssot476: 'CONSTITUTION_FRESH_REGISTER.csv — 476 atomic PDF extraction rows including context/definitions/optional',
    whyNot83RowsInOneList: '476−393=83 is NET count gap: 199 fresh-only rows minus 116 register-only rows = 83',
  },
  exclusiveTo476,
  exclusiveTo393,
  rows: [...exclusiveTo476, ...exclusiveTo393],
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      total476: out.total476,
      total393: out.total393,
      overlap: out.overlapFreshIdMatch,
      exclusive476: out.exclusiveTo476Count,
      exclusive393: out.exclusiveTo393Count,
      netDelta: out.netCountDelta476Minus393,
      reconciled: out.netDeltaReconciled,
      ok: out.netDeltaMatchesExpected,
      categoryCounts476Only: out.categoryCounts476Only,
    },
    null,
    2,
  ),
);
