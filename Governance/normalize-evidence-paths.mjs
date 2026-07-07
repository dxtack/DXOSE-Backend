#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const EVIDENCE = path.join(import.meta.dirname, 'evidence.json');
const ev = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
let n = 0;
for (const e of Object.values(ev)) {
  for (const x of e.evidence ?? []) {
    if (!x.file || !x.file.includes('DX OS&E')) continue;
    x.file = x.file
      .replace(/^c:\\DX OS&E\\/i, '')
      .replace(/^c:\/DX OS&E\//i, '')
      .replace(/\\/g, '/');
    n++;
  }
}
fs.writeFileSync(EVIDENCE, JSON.stringify(ev, null, 2));
console.log('normalized', n, 'paths');
