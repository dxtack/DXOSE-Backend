#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'Governance/evidence.json'), 'utf8'));
const requirements = JSON.parse(fs.readFileSync(path.join(ROOT, 'Governance/requirements.json'), 'utf8'));

function resolveFile(f) {
  const clean = f.replace(/^c:\\\\DX OS&E\\\\/i, '').replace(/^c:\/DX OS&E\//i, '');
  const candidates = [
    path.join(ROOT, clean),
    path.join(ROOT, clean.replace(/\\/g, '/')),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return true;
  }
  if (clean.includes(' — ') || clean.includes('grep:') || clean.endsWith('/src') || clean.endsWith('\\src')) {
    return true; // search-scope evidence, not a single file
  }
  return false;
}

const byChapter = {};
for (const req of requirements) {
  const ch = req.chapter;
  if (!byChapter[ch]) byChapter[ch] = { broken: [], ok: [] };
  const e = evidence[req.requirementId];
  for (const ev of e?.evidence ?? []) {
    const file = ev.file ?? '';
    if (!file || file.includes('grep:') || file.endsWith('/src') || file.endsWith('\\src') || file === 'OSE-Frontend' || file === 'OSE-Frontend/src/app') {
      continue;
    }
    if (!resolveFile(file)) {
      byChapter[ch].broken.push({ id: req.requirementId, file });
    }
  }
}

for (const ch of Object.keys(byChapter).sort((a, b) => +a - +b)) {
  const b = byChapter[ch];
  if (b.broken.length) {
    console.log(`Ch${ch} broken paths: ${b.broken.length}`);
    for (const x of b.broken.slice(0, 5)) console.log(`  ${x.id}: ${x.file}`);
  }
}

const totalBroken = Object.values(byChapter).reduce((n, b) => n + b.broken.length, 0);
console.log('total broken file refs:', totalBroken);
