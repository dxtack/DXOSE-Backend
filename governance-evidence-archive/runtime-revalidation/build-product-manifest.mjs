/**
 * Product working-tree manifest — read-only, no git clean/reset.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'PRODUCT_MANIFEST.json');

const SKIP_DIRS = new Set(['node_modules', '.angular', 'dist', 'coverage', '.git']);
const EXT = new Set(['.ts', '.js', '.html', '.scss', '.json', '.sql', '.prisma']);

function walk(dir, base = dir) {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) entries.push(...walk(full, base));
    else {
      const ext = path.extname(name).toLowerCase();
      if (EXT.has(ext) || name === 'package.json') {
        const rel = path.relative(REPO, full).replace(/\\/g, '/');
        const buf = fs.readFileSync(full);
        entries.push({ path: rel, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
      }
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function aggregateHash(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(f.path + '\0' + f.sha256 + '\n');
  return h.digest('hex');
}

const gateCKeyFiles = [
  'OSE-backend/src/services/getPass.service.js',
  'OSE-Frontend/src/app/features/lost-items/utils/lost-items-status-display.util.ts',
  'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
];

// Load from GATE_C_BASELINE.json
const baselinePath = path.join(REPO, 'Governance/gate-c-remediation/GATE_C_BASELINE.json');
const baselineJson = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const gateCFileHashes = baselineJson.files_planned_for_change_sha256_at_baseline || {};

const feFiles = walk(path.join(REPO, 'OSE-Frontend/src'));
const beFiles = walk(path.join(REPO, 'OSE-backend/src'));

const fileMap = Object.fromEntries([...feFiles, ...beFiles].map((f) => [f.path, f]));

const gateCComparison = {};
for (const [rel, expected] of Object.entries(gateCFileHashes)) {
  if (rel === 'note') continue;
  const cur = fileMap[rel];
  gateCComparison[rel] = {
    gate_c_sha256: expected,
    current_sha256: cur?.sha256 ?? null,
    match: cur?.sha256?.toUpperCase() === String(expected).toUpperCase(),
  };
}

const allGateCCodeChangeFiles = [
  'OSE-backend/src/services/getPass.service.js',
  'OSE-Frontend/src/app/features/lost-items/utils/lost-items-status-display.util.ts',
  'OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.html',
  'OSE-Frontend/src/app/features/lost-items/lost-items-list/lost-items-list.component.ts',
  'OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.html',
  'OSE-Frontend/src/app/features/lost-items/lost-items-detail/lost-items-detail.component.ts',
  'OSE-Frontend/src/app/features/lost-items/models/lost-items.model.ts',
  'OSE-Frontend/src/app/core/directives/keyboard-navigation.directive.ts',
  'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.ts',
  'OSE-Frontend/src/app/features/grn/grn-create/grn-create.component.html',
  'OSE-Frontend/src/app/features/get-pass/get-pass-form/get-pass-form.component.ts',
  'OSE-Frontend/src/app/features/get-pass/get-pass-form/get-pass-form.component.html',
  'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.ts',
  'OSE-Frontend/src/app/features/transfers/transfer-form/transfer-form.component.html',
  'OSE-Frontend/src/app/features/breakage/breakage-create-modal/breakage-create-modal.component.ts',
  'OSE-Frontend/src/app/features/breakage/breakage-create-modal/breakage-create-modal.component.html',
  'OSE-Frontend/src/app/features/lost-items/lost-create-modal/lost-create-modal.component.ts',
  'OSE-Frontend/src/app/features/lost-items/lost-create-modal/lost-create-modal.component.html',
  'OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts',
  'OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.html',
  'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.ts',
  'OSE-Frontend/src/app/features/movements/movement-form/movement-form.component.html',
];

const gateCChangeSetMatch = allGateCCodeChangeFiles.every((rel) => {
  const c = gateCComparison[rel];
  return c ? c.match : fileMap[rel] != null; // files without baseline hash: present only
});

const manifest = {
  generatedAt: new Date().toISOString(),
  gitHead: null,
  productRoots: {
    'OSE-Frontend/src': { fileCount: feFiles.length, aggregateSha256: aggregateHash(feFiles) },
    'OSE-backend/src': { fileCount: beFiles.length, aggregateSha256: aggregateHash(beFiles) },
    combinedAggregateSha256: aggregateHash([...feFiles, ...beFiles]),
  },
  gateCComparison,
  gateCThreeFileAllMatch: Object.values(gateCComparison).every((x) => x.match),
  gateCFullChangeSetManifestAvailable: false,
  gateCProvableIdenticalToClosure: false,
  gateCProvableReason:
    'Only 3 Gate C file SHA256 captured at closure; keyboard-navigation.directive.ts modified post–Gate C browser remediation; full product tree untracked in git — byte-exact tree match not provable.',
  gateCRegressionRequired: true,
  gateCChangedFilesPresent: allGateCCodeChangeFiles.map((rel) => ({ path: rel, sha256: fileMap[rel]?.sha256 ?? null, exists: !!fileMap[rel] })),
};

try {
  const { execSync } = await import('child_process');
  manifest.gitHead = execSync('git rev-parse HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
  manifest.gitStatusShort = execSync('git status --short', { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch {
  /* optional */
}

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ out: OUT, gateCRegressionRequired: manifest.gateCRegressionRequired, gateCThreeFileAllMatch: manifest.gateCThreeFileAllMatch }));
