#!/usr/bin/env node
/** Assign permanent Requirement IDs to requirements.json (run once; IDs must never change). */
import fs from 'fs';
import path from 'path';

const REQ = path.join(path.resolve(import.meta.dirname), 'requirements.json');
const requirements = JSON.parse(fs.readFileSync(REQ, 'utf8'));

for (const r of requirements) {
  if (r.requirementId) continue;
  const seq = r.reqId.split('-').pop();
  const seq3 = String(parseInt(seq, 10)).padStart(3, '0');
  r.requirementId = `C${String(r.chapter).padStart(2, '0')}-${r.section}-${seq3}`;
}

fs.writeFileSync(REQ, JSON.stringify(requirements, null, 2));
console.log('Assigned', requirements.length, 'requirement IDs');
