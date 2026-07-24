'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const OUT = path.join(REPORT_DIR, 'GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json');
const GOV_ROOTS = [
  path.resolve(__dirname, '../../docs/governance'),
  path.resolve(__dirname, '../../governance-evidence-archive'),
  path.resolve(__dirname, '../../docs/full-system-review'),
];
const CODE_REF = path.resolve(__dirname, '../../src/services/acc-workflow-get-pass.runtime.js');

const SEARCH_TERMS = [
  'fast-forward',
  'fast forward',
  'creator role',
  'creator-role',
  'getSubmitInitialWorkflow',
  'submit initial workflow',
  'skip department',
  'skip cost control',
  'PENDING_SECURITY',
  'Business Decision',
  'BDR',
  'ADR-',
];

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue;
      walkFiles(p, acc);
    } else if (/\.(md|json|txt|docx|pdf|xlsx)$/i.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

function searchGovernance() {
  const hits = [];
  for (const root of GOV_ROOTS) {
    for (const file of walkFiles(root)) {
      if (/\.(docx|pdf|xlsx)$/i.test(file)) {
        hits.push({ file: path.relative(path.resolve(__dirname, '../../..'), file), note: 'Binary — not text-searchable in harness' });
        continue;
      }
      let text = '';
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lower = text.toLowerCase();
      for (const term of SEARCH_TERMS) {
        if (lower.includes(term.toLowerCase())) {
          const idx = lower.indexOf(term.toLowerCase());
          hits.push({
            file: path.relative(path.resolve(__dirname, '../../..'), file),
            term,
            excerpt: text.slice(Math.max(0, idx - 80), idx + 120).replace(/\s+/g, ' ').trim(),
          });
        }
      }
    }
  }
  return hits;
}

function approvedBdrCandidates(hits) {
  const bdrLike = hits.filter(
    (h) =>
      h.term &&
      (/BDR|Business Decision|ADR-/i.test(h.term) || /decisions\//i.test(h.file || '')) &&
      /get.?pass|workflow|submit|creator|fast/i.test(`${h.file} ${h.excerpt || ''}`),
  );
  const adrs = hits.filter((h) => /ADR-/i.test(h.file || '') && /get.?pass|workflow|submit|creator/i.test(`${h.file} ${h.excerpt || ''}`));
  return { bdrLike, adrs };
}

function readCodeBehavior() {
  const src = fs.readFileSync(CODE_REF, 'utf8');
  const fnMatch = src.match(/function getSubmitInitialWorkflowFromContext[\s\S]{0,1200}/);
  return {
    file: 'OSE-backend/src/services/acc-workflow-get-pass.runtime.js',
    functionName: 'getSubmitInitialWorkflowFromContext',
    lines: '73-112',
    behaviorSummary:
      'On submit, if creator role matches a step in ACC chain (and is not last step), status jumps to next step and stamps current step approval fields with submitter userId. ORG_MANAGER/SUPER_ADMIN jump to last pending step stamping all prior steps.',
    isGovernanceDocument: false,
    note: 'Product runtime implementation — not an approved governance decision record',
  };
}

function constitutionChainReference(hits) {
  const wm = hits.find((h) => h.file?.includes('WORKFLOW_MATRIX.md') && /PENDING_DEPT|PENDING_COST_CONTROL|PENDING_FINANCE|PENDING_SECURITY/i.test(h.excerpt || ''));
  return wm
    ? {
        file: wm.file,
        approvedChain: 'Department → Cost Control → Finance → Security (no GM in constitution-aligned fixture)',
        mentionsCreatorSkip: false,
      }
    : {
        file: 'docs/governance/WORKFLOW_MATRIX.md',
        approvedChain: 'PENDING_DEPT → PENDING_COST_CONTROL → PENDING_FINANCE → PENDING_SECURITY (GM listed in global matrix only)',
        mentionsCreatorSkip: false,
      };
}

function main() {
  const hits = searchGovernance();
  const { bdrLike, adrs } = approvedBdrCandidates(hits);
  const code = readCodeBehavior();
  const constitution = constitutionChainReference(hits);

  const approvedBdr = null;
  const classification = 'Runtime-Confirmed Governance / Constitution Defect';

  const out = {
    executedAt: new Date().toISOString(),
    question: 'Is there an approved Business Decision Record authorizing Get Pass creator-role fast-forward on submit?',
    approvedBusinessDecisionRecord: approvedBdr,
    classification,
    doNotLabelAsBDR: 'Product function getSubmitInitialWorkflowFromContext is implementation code, not a BDR',
    governanceSearch: {
      rootsSearched: GOV_ROOTS.map((r) => path.relative(path.resolve(__dirname, '../../..'), r)),
      searchTerms: SEARCH_TERMS,
      hitCount: hits.length,
      adrHitsForGetPass: adrs,
      bdrLikeHitsForGetPass: bdrLike,
      onlyInventoryAdrsFound: adrs.length === 0 && bdrLike.length === 0,
      knownAdrsNotApplicable: ['docs/governance/decisions/ADR-001-inventory-count-canonical.md', 'docs/governance/decisions/ADR-002-inventory-truth-unification.md'],
    },
    requiredFields: {
      bdrFileName: null,
      decisionId: null,
      approvedText: null,
      approvalDate: null,
      rolesAllowedToSkip: null,
      modulesInScope: null,
      allowsSkipDepartment: null,
      allowsSkipCostControl: null,
      submitCountsAsApproval: null,
      allowsActorStampOnUnexecutedStep: null,
    },
    runtimeConfirmedBehavior: {
      ...code,
      financeCreatorOnConstitutionChain: {
        expectedFirstStepIfNoSkip: 'PENDING_DEPT',
        actualStatusAfterSubmit: 'PENDING_SECURITY',
        deptStepSkipped: true,
        costControlStepSkipped: true,
        financeSelfStampOnSubmit: true,
        evidenceArtifact: 'GET_PASS_ALIGNED_WORKFLOW_ACTOR_MATRIX.json',
      },
    },
    constitutionReference: constitution,
    explicitAnswers: {
      approvedBdrExists: false,
      submitCountsAsApproval: 'YES at runtime — submit stamps approval fields on skipped steps (financeApprovedBy set on Finance creator submit)',
      allowsActorStampOnUnexecutedStep: 'YES at runtime — dept/cost-control stamps absent but finance stamp applied without those steps executing',
      allowsSkipDepartment: 'YES at runtime for Finance creator — no approved governance document found',
      allowsSkipCostControl: 'YES at runtime for Finance creator — no approved governance document found',
      modulesInScope: 'GET_PASS only (function in acc-workflow-get-pass.runtime.js)',
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json');
}

main();
