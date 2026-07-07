'use strict';

const fs = require('fs');
const path = require('path');

const FIXTURES_PATH = path.join(__dirname, 'PHASE_5_FIXTURES.json');

function loadFixtures() {
  if (!fs.existsSync(FIXTURES_PATH)) return null;
  return JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
}

function timelineEntriesFromResponse(tl) {
  return tl?.data?.data?.timelineEntries || tl?.data?.timelineEntries || [];
}

function detailData(res) {
  return res?.data?.data ?? res?.data ?? null;
}

function listRows(res) {
  const d = res?.data?.data ?? res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.rows)) return d.rows;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

function lineQty(line) {
  return Number(line?.qty ?? line?.qtyRequested ?? line?.requestedQty ?? line?.qtyInBaseUnit ?? 0);
}

function lineTotal(line) {
  const tv = line?.totalValue;
  if (tv != null) return Number(tv);
  return lineQty(line) * Number(line?.unitCost ?? 0);
}

function sumLineTotals(lines) {
  return (lines || []).reduce((s, l) => s + lineTotal(l), 0);
}

function sumLineQty(lines) {
  return (lines || []).reduce((s, l) => s + lineQty(l), 0);
}

function assertNoLeak(detail) {
  const issues = [];
  const walk = (obj, pathPrefix = '') => {
    if (obj == null) return;
    if (typeof obj === 'string') {
      if (obj === 'undefined' || obj === 'null') issues.push(`leaked ${pathPrefix}: ${obj}`);
      if (/^(PENDING_|DEPT_APPROVED|COST_CONTROL_)/.test(obj) && pathPrefix.includes('userFacing')) {
        /* ok - may be internal keys in wrong place */
      }
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walk(v, `${pathPrefix}[${i}]`));
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) walk(v, pathPrefix ? `${pathPrefix}.${k}` : k);
    }
  };
  walk(detail);
  return issues;
}

function compareListDetail(listRow, detail, fields) {
  const mismatches = [];
  for (const { listKey, detailKey, transform } of fields) {
    const lk = listKey;
    const dk = detailKey || listKey;
    let a = listRow?.[lk];
    let b = detail?.[dk];
    if (transform) {
      a = transform(a);
      b = transform(b);
    }
    if (String(a ?? '') !== String(b ?? '') && Number(a) !== Number(b)) {
      mismatches.push({ field: lk, list: a, detail: b });
    }
  }
  return mismatches;
}

function assertTimelineBasics(entries, moduleKey, options = {}) {
  const issues = [];
  const allowEmpty = options.allowEmpty === true;
  if (!Array.isArray(entries) || entries.length === 0) {
    if (!allowEmpty) issues.push('empty_timeline');
    return issues;
  }
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].globalOrder <= entries[i - 1].globalOrder) issues.push('timeline_order');
    break;
  }
  for (const e of entries) {
    if (e.displayTitleKey?.match(/^(PENDING_|SEND_BACK$)/)) issues.push(`raw_key:${e.displayTitleKey}`);
    if (e.actor?.name === 'undefined') issues.push('undefined_actor');
  }
  if (moduleKey === 'TRANSFER' && entries.some((e) => e.lifecycleEventType === 'SEND_BACK')) {
    issues.push('transfer_send_back_not_supported');
  }
  return issues;
}

module.exports = {
  FIXTURES_PATH,
  loadFixtures,
  timelineEntriesFromResponse,
  detailData,
  listRows,
  lineQty,
  lineTotal,
  sumLineTotals,
  sumLineQty,
  assertNoLeak,
  compareListDetail,
  assertTimelineBasics,
};
