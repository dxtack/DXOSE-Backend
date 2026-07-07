'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_REL = 'Governance/constitution-coverage/V3_SCENARIO_REQUIREMENT_ALLOWLIST.json';

function loadDeliveredAllowlist(root) {
  const allowlistPath = path.join(root, DEFAULT_REL);
  const raw = fs.readFileSync(allowlistPath, 'utf8');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const doc = JSON.parse(raw);
  const map = {};
  const entriesById = {};
  let linkCount = 0;

  const list = doc.scenarios || [];
  for (const entry of list) {
    entriesById[entry.scenarioId] = entry;
    map[entry.scenarioId] = entry.allowedRequirementIds || [];
    linkCount += (entry.allowedRequirementIds || []).length;
  }

  return {
    allowlistPath: DEFAULT_REL,
    allowlistAbsolutePath: allowlistPath,
    hash,
    doc,
    map,
    entriesById,
    scenarioCount: list.length,
    linkCount,
  };
}

function invertAllowlistMap(map) {
  const inv = {};
  for (const [sid, ids] of Object.entries(map)) {
    for (const rid of ids) {
      if (!inv[rid]) inv[rid] = [];
      inv[rid].push(sid);
    }
  }
  return inv;
}

function crossCuttingEntries(doc) {
  return doc.crossCuttingFindings || [];
}

module.exports = {
  DEFAULT_REL,
  loadDeliveredAllowlist,
  invertAllowlistMap,
  crossCuttingEntries,
};
