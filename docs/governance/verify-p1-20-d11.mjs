#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const { PDFParse } = require('pdf-parse');

const governanceDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(governanceDir, '..', '..');
const sourcePath = path.join(repoRoot, 'governance-evidence-archive', 'apply-chapter6-amendment.mjs');
const artifacts = {
  docx: path.join(governanceDir, 'DX_OSE_CONSTITUTION_v2.2.docx'),
  constitutionPdf: path.join(governanceDir, 'DX_OSE_CONSTITUTION_v2.2.pdf'),
  mergeMarkdown: path.join(governanceDir, 'DX_OSE_CONSTITUTION_v2.1_MERGE_REPORT.md'),
  mergePdf: path.join(governanceDir, 'DX_OSE_34_Clause_Merge_Report_v1.pdf'),
};

const approved =
  'The official period states are OPEN, CLOSING, and CLOSED. The state Archived is not a period registry state; historical snapshots and reports use SUPERSEDED versioning (§6.11, §6.17).';
const prohibitedFourState = /\bopen\s*,\s*closing\s*,\s*closed\s*,\s*archived\s*\.?/giu;

function normalize(text) {
  return text
    .replace(/\u00a0/gu, ' ')
    .replace(/[ \t\r\n]+/gu, ' ')
    .trim();
}

function decodeXml(text) {
  return text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function countExact(text, needle) {
  let count = 0;
  let from = 0;
  while ((from = text.indexOf(needle, from)) !== -1) {
    count += 1;
    from += needle.length;
  }
  return count;
}

function assertArtifact(label, text) {
  const normalized = normalize(text);
  const exactCount = countExact(normalized, approved);
  const prohibited = normalized.match(prohibitedFourState) ?? [];
  if (exactCount !== 1) {
    throw new Error(`${label}: approved D11 wording count must be 1, got ${exactCount}`);
  }
  if (prohibited.length !== 0) {
    throw new Error(`${label}: prohibited four-state phrase found ${prohibited.length} time(s)`);
  }
  console.log(`PASS ${label}: exact D11 wording=1; four-state phrase=0`);
}

async function extractPdf(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

for (const filePath of [sourcePath, ...Object.values(artifacts)]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required artifact is missing: ${filePath}`);
  }
}

const source = fs.readFileSync(sourcePath, 'utf8');
if (countExact(source, approved) !== 1) {
  throw new Error('governance-evidence-archive/apply-chapter6-amendment.mjs does not contain exactly one approved D11 sentence');
}
console.log('PASS approved source: governance-evidence-archive/apply-chapter6-amendment.mjs');

const zip = new AdmZip(artifacts.docx);
const documentXml = zip.readAsText('word/document.xml');
const docxText = decodeXml(documentXml.replace(/<[^>]+>/gu, ' '));
assertArtifact('constitution DOCX', docxText);

assertArtifact('constitution PDF', await extractPdf(artifacts.constitutionPdf));
assertArtifact('merge report Markdown', fs.readFileSync(artifacts.mergeMarkdown, 'utf8'));
assertArtifact('merge report PDF', await extractPdf(artifacts.mergePdf));

console.log('P1 #20 D11 verification passed for all four governed artifacts.');
