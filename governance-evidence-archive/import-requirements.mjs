#!/usr/bin/env node
/** Import atomic requirement inventory from constitution extraction subagent transcript */
import fs from 'fs';
import path from 'path';

const TRANSCRIPT =
  'C:\\Users\\amrsa\\.cursor\\projects\\c-DX-OS-E\\agent-transcripts\\1bcc7efd-a7ee-412a-89e1-e6ff1edba1f9\\subagents\\f2ae5189-3ec1-40d5-ac79-beab6473e7d2.jsonl';
const OUT = path.join(path.resolve(import.meta.dirname), 'requirements.json');

const raw = fs.readFileSync(TRANSCRIPT, 'utf8');
let requirements = null;
for (const line of raw.split('\n')) {
  if (!line.includes('reqId')) continue;
  try {
    const row = JSON.parse(line);
    if (row.role !== 'assistant') continue;
    const text = row?.message?.content?.[0]?.text;
    if (!text?.includes('1.1-01')) continue;
    const clean = text.includes('[REDACTED]') ? text.slice(0, text.indexOf('[REDACTED]')).trim() : text;
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']') + 1;
    requirements = JSON.parse(clean.slice(start, end));
    break;
  } catch (err) {
    console.error('Line parse error:', err.message);
  }
}
if (!requirements) throw new Error('Requirement JSON not found in transcript');

fs.writeFileSync(OUT, JSON.stringify(requirements, null, 2));
console.log('Imported', requirements.length, 'requirements ->', OUT);
