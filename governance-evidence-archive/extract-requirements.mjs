#!/usr/bin/env node
/** Extract atomic mandatory requirements from constitution-base.md */
import fs from 'fs';
import path from 'path';

const CONSTITUTION = path.join(path.resolve(import.meta.dirname, '..'), 'docs/governance/scripts/constitution-base.md');
const OUT = path.join(path.resolve(import.meta.dirname), 'requirements.json');
const text = fs.readFileSync(CONSTITUTION, 'utf8');
const lines = text.split('\n');
const reqs = [];
let ch = '',
  sec = '';

const push = (section, requirement, scope = 'Platform-wide') => {
  const secBase = section.replace(/\.\d+$/, '');
  const seq = reqs.filter((r) => r.section.startsWith(section.split('.').slice(0, 2).join('.'))).length + 1;
  const reqId = `${section}-${String(seq).padStart(2, '0')}`;
  reqs.push({ reqId, chapter: ch, section, requirement, scope });
};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const chm = line.match(/^## Chapter (\d+) —/);
  if (chm) {
    ch = chm[1];
    sec = '';
    continue;
  }
  if (line.match(/^### \d+\.\d+/) && !line.toLowerCase().includes('out of scope')) {
    sec = line.match(/^### (\d+\.\d+)/)[1];
    continue;
  }
  const dscm = line.match(/^#### (\d+\.\d+\.\d+)/);
  if (dscm) {
    sec = dscm[1];
    continue;
  }
  if (/^### .+Out of Scope/i.test(line)) {
    sec = '';
    continue;
  }
  if (!sec || !ch) continue;

  // Table rows Ch 2.5 editability
  if (sec === '2.5' && line.startsWith('|') && line.includes('|')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length === 2 && cells[0] !== 'State' && cells[0] !== '-------') {
      push('2.5', `Editability — ${cells[0]}: ${cells[1]}`, 'Document-specific');
    }
  }
  // Ch 3.4 table - handled via explicit adds below
  if (/\b(shall|must)\b/i.test(line) && !/\bshould\b/i.test(line.replace(/shall not|must not/gi, ''))) {
    if (line.startsWith('|') && line.includes('Send Back') || line.includes('Reject')) continue;
    const req = line.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, '').trim();
    if (req.length < 12) continue;
    const scope =
      ['10', '11'].includes(ch) ? (ch === '10' ? 'Inventory' : 'Financial') :
      ['17', '18', '19', '20', '21', '23', '24', '25', '28'].includes(ch) ? 'UX' :
      ['2', '3', '5', '6', '7', '8', '9', '12', '13', '14', '15', '22', '26'].includes(ch) ? 'Document-specific' :
      ch === '16' ? 'Master Data' :
      ch === '29' ? 'Governance' : 'Platform-wide';
    push(sec, req, scope);
  }
}

// Explicit expansions for numbered lists missed by line parser
const expansions = [
  ['3.4', 'Send Back shall not end the document.', 'Document-specific'],
  ['3.4', 'Reject shall end the document.', 'Document-specific'],
  ['3.4', 'Send Back shall require a reason.', 'Document-specific'],
  ['3.4', 'Reject shall require a reason.', 'Document-specific'],
  ['9.3', 'System Document Numbers shall be unique within governed numbering scope.', 'Document-specific'],
  ['9.3', 'Upon first Server Draft, number permanently reserved.', 'Document-specific'],
  ['9.3', 'Deleted draft numbers never released or recycled.', 'Document-specific'],
  ['9.3', 'Number gaps acceptable; numbers must not be reused.', 'Document-specific'],
  ['9.3', 'All creation channels use same numbering governance.', 'Document-specific'],
  ['9.3', 'Prefixes governed centrally; modules must not configure independently unless authorized.', 'Document-specific'],
  ['9.3', 'Once assigned, number immutable for entire lifecycle.', 'Document-specific'],
  ['9.3', 'Allocation traceable through platform audit mechanisms.', 'Document-specific'],
  ['9.3', 'Manual override prohibited.', 'Document-specific'],
  ['9.3', 'Annual reset per prefix per year.', 'Document-specific'],
  ['5.2', 'Before Posting, verify user authority.', 'Document-specific'],
  ['5.2', 'Before Posting, verify valid workflow state.', 'Document-specific'],
  ['5.2', 'Before Posting, verify open period for Posting Date.', 'Document-specific'],
  ['5.2', 'Before Posting, full document revalidation.', 'Document-specific'],
  ['5.2', 'Before Posting, stock availability for outbound documents.', 'Document-specific'],
  ['5.2', 'Posting uses single transactional boundary; partial posting prohibited.', 'Document-specific'],
  ['5.2', 'Posting idempotent — repeat request never creates additional effects.', 'Document-specific'],
  ['5.2', 'Final workflow approval triggers posting by default (BDR-004).', 'Document-specific'],
  ['6.5', 'Posting only when Posting Period Open and validations pass.', 'Financial'],
  ['6.5', 'Posting into Closed period prohibited.', 'Financial'],
  ['6.5', 'Period validation centralized; modules shall not implement independent period logic.', 'Financial'],
  ['6.5', 'Assigned Posting Period immutable after Posting.', 'Document-specific'],
  ['7.7', 'Auto-save on meaningful business events.', 'Document-specific'],
  ['7.7', 'Auto-save on add/delete row, qty/price change, supplier/warehouse change, attachment, notes, before navigation.', 'Document-specific'],
  ['8.6', 'Protected mutations (Save Draft, Submit, Approve, Reject, Send Back, Cancel, Post) must not double-execute without detection.', 'Document-specific'],
  ['17.2', 'Keyboard-first; Enter next field not submit; Esc closes overlays.', 'UX'],
  ['17.3', 'Keyboard behavior consistent across all modules.', 'UX'],
  ['18.2', 'Backend returns codes; server-side authoritative; one error type one channel.', 'UX'],
  ['23.3', 'Lookup search: code, name, barcode; debounce; ranking.', 'UX'],
  ['28.2', 'Screen reader compatibility for governed interactions.', 'Accessibility'],
  ['28.3', 'Validation and error messages accessible to assistive technology.', 'Accessibility'],
];

for (const [section, requirement, scope] of expansions) {
  const exists = reqs.some((r) => r.requirement === requirement);
  if (!exists) {
    ch = section.split('.')[0];
    push(section, requirement, scope);
  }
}

// Deduplicate by requirement text within section
const seen = new Set();
const unique = [];
for (const r of reqs) {
  const k = `${r.chapter}|${r.section}|${r.requirement}`;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(r);
}

// Re-number reqIds sequentially per section
const bySec = {};
for (const r of unique) {
  const base = r.section;
  bySec[base] = (bySec[base] || 0) + 1;
  r.reqId = `${base}-${String(bySec[base]).padStart(2, '0')}`;
}

unique.sort((a, b) => {
  const ca = Number(a.chapter) - Number(b.chapter);
  if (ca) return ca;
  return a.reqId.localeCompare(b.reqId);
});

fs.writeFileSync(OUT, JSON.stringify(unique, null, 2));
console.log('Requirements:', unique.length, '->', OUT);
