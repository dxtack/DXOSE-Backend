'use strict';
const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

function buildConfirmedDefects() {
  const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  const acc = readJson(path.join(REPORT_DIR, 'ACC_OPERATIONAL_LEGACY_RESULTS.json'));
  const gp = readJson(path.join(REPORT_DIR, 'GET_PASS_PERMISSION_MATRIX.json'));
  const cross = readJson(path.join(REPORT_DIR, 'CROSS_TENANT_RESULTS.json'));
  const tests = readJson(path.join(REPORT_DIR, 'TEST_EXECUTION_RESULTS.json'));
  const gpMatrix = readJson(path.join(REPORT_DIR, 'GET_PASS_PERMISSION_MATRIX.json'));

  const defects = [];

  for (const row of gpMatrix?.matrix || gp?.matrix || []) {
    if (row.classification === 'Confirmed Authorization Bypass') {
      defects.push({
        id: `GP-PERM-${row.endpoint}-${row.role || row.scenario}`,
        type: 'Confirmed Authorization Bypass',
        evidence: row,
      });
    }
  }

  for (const row of acc?.getPassFastForward || []) {
    if (row.intermediateApprovalsBySubmitter && row.statusAfterSubmit?.startsWith('PENDING_')) {
      defects.push({
        id: `GP-FF-${row.userKey}`,
        type: 'Confirmed Runtime Behavior (submit fast-forward stamps)',
        evidence: row,
      });
    }
  }

  for (const row of acc?.breakageAutoApproval || []) {
    const steps = row.approvalRequest?.steps || [];
    const stampedIntermediate = steps.some(
      (s) => s.status === 'APPROVED' && s.comment?.includes('Auto-approved by system due to high-level authority'),
    );
    if (stampedIntermediate && row.finalDocumentStatus === 'DRAFT') {
      defects.push({
        id: `ACC-STEP-STAMP-${row.userKey}`,
        type: 'Confirmed Runtime Behavior (dept step auto-stamped on create)',
        evidence: row,
      });
    }
  }

  for (const row of cross?.results || []) {
    if (String(row.result).startsWith('P0')) {
      defects.push({ id: `XT-${row.resource}-${row.operation}`, type: 'Confirmed Cross-Tenant Leak', evidence: row });
    }
  }

  for (const t of tests?.results || []) {
    if (t.exit !== 0) {
      defects.push({
        id: `TEST-${t.label}`,
        type: 'Automated test failure',
        evidence: { command: t.command, exit: t.exit, exactFailure: t.exactFailure },
      });
    }
  }

  let md = `# Confirmed Defects (Runtime Evidence Only)\n\nGenerated: ${new Date().toISOString()}\n\n`;
  if (!defects.length) md += 'No confirmed defects with full runtime evidence pack in this run.\n';
  for (const d of defects) {
    md += `\n## ${d.id}\n\n**Type:** ${d.type}\n\n\`\`\`json\n${JSON.stringify(d.evidence, null, 2)}\n\`\`\`\n`;
  }
  fs.writeFileSync(path.join(REPORT_DIR, 'CONFIRMED_DEFECTS.md'), md);
  console.log('Wrote CONFIRMED_DEFECTS.md count:', defects.length);
}

buildConfirmedDefects();
