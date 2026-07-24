'use strict';

const { fileExists } = require('./matrix-evidence-lib.cjs');

const FILE_RE = /File:\s*([^\s|;,\n]+)/gi;

function normalizePath(p) {
  if (!p) return null;
  return p.split('#')[0].trim().replace(/\\/g, '/');
}

function extractFilePaths(text) {
  if (!text) return [];
  const found = new Set();
  let m;
  const re = /File:\s*([^\s|;,\n]+)/gi;
  while ((m = re.exec(text)) !== null) {
    const p = normalizePath(m[1]);
    if (p && p.includes('/') && fileExists(p)) found.add(p);
  }
  return [...found];
}

function symbolFromDetail(detail, filePath) {
  if (!detail) return 'see file body';
  const lineRef = detail.match(/([A-Za-z0-9_.]+:\d+(?:-\d+)?)/);
  if (lineRef) return lineRef[1];
  const sym = detail.match(/(?:Method:|symbol:)\s*([^;|]+)/i);
  if (sym) return sym[1].trim().slice(0, 120);
  if (filePath?.includes('P0_RUNTIME_V3')) return 'scenarios[].result, actual, finalClassification';
  return detail.slice(0, 100);
}

function evidenceStatements(row, req, trace, filePath) {
  const rid = row.requirementId;
  const t = trace[rid] || {};
  const method = t.methods?.[t.files?.indexOf(filePath)] || t.methods?.[0] || '';

  if (filePath.includes('P0_RUNTIME_V3_FINAL.json')) {
    const sc = (row.scenarioIds || []).join(', ');
    return {
      proves: `v3 register records ${sc} with expected/actual/result fields tied to this requirement's runtime probe set.`,
      doesNotProve: 'Does not prove untested modules, static-only guards, or requirements without linked scenarios.',
    };
  }
  if (filePath.includes('GATE_C_BROWSER_RESULTS.json')) {
    return {
      proves: 'Gate C Playwright probes recorded enter/shift-enter/esc/tab/focus_visible outcomes on seven document-create shells.',
      doesNotProve: 'Does not prove keyboard behavior on detail views, lists, settings, reports, dialogs, or lookup overlays.',
    };
  }
  if (filePath.includes('constitution-base.md')) {
    return {
      proves: 'Normative constitution text or §reference defining the governance obligation cited in traceability.',
      doesNotProve: 'Does not prove runtime enforcement in product modules without separate service/route evidence.',
    };
  }
  if (filePath.includes('requirePermission') || filePath.includes('acc-authority')) {
    return {
      proves: 'ACC permission middleware or catalog declares which permission codes gate route entry before handler execution.',
      doesNotProve: 'Does not alone prove assignment scope, property scope, or workflow-state checks inside services.',
    };
  }
  if (filePath.includes('.service.js') || filePath.includes('.service.ts')) {
    const sym = method || 'service handler';
    return {
      proves: `Backend service symbol "${sym}" implements server-side mutation/validation path referenced for ${rid}.`,
      doesNotProve: `Does not prove the same behavior on Breakage/Lost/IC/Transfer unless separately traced and runtime-probed.`,
    };
  }
  if (method) {
    return {
      proves: `Traceability cites "${method}" in ${filePath} as implementation anchor for the requirement text.`,
      doesNotProve: 'Static symbol presence does not prove end-to-end runtime behavior across all modules in scope.',
    };
  }
  return {
    proves: `File content at ${filePath} is the cited implementation or governance artifact for this row.`,
    doesNotProve: 'File existence alone does not prove platform-wide runtime coverage.',
  };
}

function buildEvidenceRefs(row, req, trace) {
  const paths = new Set();
  if (row.primaryEvidence) paths.add(normalizePath(row.primaryEvidence));
  for (const p of extractFilePaths(row.actual)) paths.add(p);
  for (const p of extractFilePaths(row.evidenceDetail)) paths.add(p);
  for (const p of trace[row.requirementId]?.files || []) paths.add(normalizePath(p));

  const v3Path = 'Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json';
  if (row.runtimeEvidence?.length && fileExists(v3Path)) paths.add(v3Path);

  const valid = [...paths].filter((p) => p && fileExists(p));
  let primary = normalizePath(row.primaryEvidence) || valid[0] || 'Governance/CONSTITUTION_TRACEABILITY_MATRIX.md';
  if (row.runtimeEvidence?.length && fileExists(v3Path)) primary = v3Path;

  const supporting = [];
  const seen = new Set([primary]);

  for (const p of valid) {
    if (seen.has(p)) continue;
    seen.add(p);
    const stmt = evidenceStatements(row, req, trace, p);
    supporting.push({
      path: p,
      symbolOrLines: symbolFromDetail(row.evidenceDetail, p),
      proves: stmt.proves,
      doesNotProve: stmt.doesNotProve,
    });
  }

  for (const p of extractFilePaths(row.actual)) {
    const np = normalizePath(p);
    if (!np || !fileExists(np) || seen.has(np)) continue;
    seen.add(np);
    const stmt = evidenceStatements(row, req, trace, np);
    supporting.push({
      path: np,
      symbolOrLines: symbolFromDetail(row.actual, np),
      proves: stmt.proves,
      doesNotProve: stmt.doesNotProve,
    });
  }

  row.primaryEvidence = primary;
  row.supportingEvidence = supporting;
  row.evidenceFile = primary;
  return row;
}

module.exports = { extractFilePaths, buildEvidenceRefs, normalizePath, symbolFromDetail, evidenceStatements };
