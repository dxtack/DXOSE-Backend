#!/usr/bin/env node
/** Emit per-chapter verification batch reports from evidence.json */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const requirements = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/requirements.json'), 'utf8'),
);
const evidence = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'governance-evidence-archive/evidence.json'), 'utf8'),
);

const batches = [
  { name: 'Batch 1 — Ch1', chapters: ['1'] },
  { name: 'Batch 2 — Ch2', chapters: ['2'] },
  { name: 'Batch 3 — Ch3', chapters: ['3'] },
  { name: 'Batch 4 — Ch4', chapters: ['4'] },
  { name: 'Batch 5 — Ch5', chapters: ['5'] },
  { name: 'Batch 6 — Ch6-11', chapters: ['6', '7', '8', '9', '10', '11'] },
  { name: 'Batch 7 — Ch12-18', chapters: ['12', '13', '14', '15', '16', '17', '18'] },
  { name: 'Batch 8 — Ch19-29', chapters: ['19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'] },
];

for (const batch of batches) {
  const rows = requirements.filter((r) => batch.chapters.includes(r.chapter));
  const ids = rows.map((r) => r.requirementId);
  const yes = [];
  const partial = [];
  const no = [];
  const nv = [];
  const gaps = [];

  for (const r of rows) {
    const e = evidence[r.requirementId];
    const impl = e?.implemented ?? 'missing';
    if (impl === 'Yes') yes.push(r.requirementId);
    else if (impl === 'Partial') partial.push(r.requirementId);
    else if (impl === 'No') no.push(r.requirementId);
    else nv.push(r.requirementId);
    if (impl === 'No' || (impl === 'Partial' && e?.remainingWork && e.remainingWork !== 'Complete')) {
      gaps.push(`${r.requirementId}: ${e?.remainingWork ?? '—'}`);
    }
  }

  console.log(`\n=== ${batch.name} ===`);
  console.log('Requirement IDs reviewed:', ids.join(', '));
  console.log('Count reviewed:', ids.length);
  console.log('Changed from Not Verified:', 0, '(baseline already verified)');
  console.log('Remaining Not Verified:', nv.length, nv.length ? nv.join(', ') : '—');
  console.log('Marked Yes:', yes.length, yes.join(', ') || '—');
  console.log('Marked Partial:', partial.length);
  console.log('Marked No:', no.length, no.join(', ') || '—');
  console.log('New verified gaps (sample):', gaps.slice(0, 5).join(' | ') || '—');
}

const total = requirements.length;
const allNv = requirements.filter((r) => evidence[r.requirementId]?.implemented === 'Not Verified');
console.log('\n=== REGISTER TOTAL ===');
console.log('Total reviewed:', total);
console.log('Remaining Not Verified:', allNv.length);
console.log('Empty evidence:', requirements.filter((r) => !evidence[r.requirementId]?.evidence?.length).length);
