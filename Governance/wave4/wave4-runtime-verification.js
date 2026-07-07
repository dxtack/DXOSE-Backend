'use strict';

/**
 * Wave 4 — Concurrency Runtime Verification
 * Usage: node Governance/wave4/wave4-runtime-verification.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

delete process.env.DATABASE_URL;
require('../../test/harness/preload');

const BE_ROOT = path.join(__dirname, '../..');
const W3_EVIDENCE = path.join(__dirname, '../wave3/WAVE3_RUNTIME_VERIFICATION.json');
const EVIDENCE_PATH = path.join(__dirname, 'WAVE4_RUNTIME_VERIFICATION.json');
const RUN_ID = `W4-RV-${Date.now()}`;

function pass(id, name, extra = {}) {
  return { id, name, result: 'PASS', ...extra };
}

function fail(id, name, extra = {}) {
  return { id, name, result: 'FAIL', ...extra };
}

function runNodeTest(pattern) {
  try {
    const out = execSync(`node --test ${pattern}`, { cwd: BE_ROOT, encoding: 'utf8', shell: true });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}\n${e.stderr || ''}\n${e.message}` };
  }
}

function runJest(pattern, testNamePattern) {
  const nameFlag = testNamePattern ? ` -t "${testNamePattern}"` : '';
  try {
    const out = execSync(`npx jest ${pattern}${nameFlag} --no-cache 2>&1`, { cwd: BE_ROOT, encoding: 'utf8', shell: true });
    return { ok: /Tests:\s+\d+ passed,\s+\d+ total/.test(out), out };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}\n${e.message}` };
  }
}

async function main() {
  const scenarios = [];

  let w3Gate = 'UNKNOWN';
  if (fs.existsSync(W3_EVIDENCE)) {
    const w3 = JSON.parse(fs.readFileSync(W3_EVIDENCE, 'utf8'));
    w3Gate = w3.summary?.gate ?? 'UNKNOWN';
  }
  scenarios.push(
    w3Gate === 'CLOSED'
      ? pass('W3-GATE', 'Wave 3 closed prerequisite', { gate: w3Gate })
      : fail('W3-GATE', 'Wave 3 closed prerequisite', { gate: w3Gate }),
  );

  const concurrencyUnit = runNodeTest('src/platform/concurrency.service.test.js');
  scenarios.push(
    concurrencyUnit.ok
      ? pass('W4-UNIT-01', 'concurrency.service unit tests')
      : fail('W4-UNIT-01', 'concurrency.service unit tests', { outputTail: concurrencyUnit.out.slice(-800) }),
  );

  const countCancel = runNodeTest('src/services/inventory-count-cancel-atomicity.test.js');
  scenarios.push(
    countCancel.ok
      ? pass('W4-IC-01', 'Inventory count cancel atomicity + concurrencyVersion')
      : fail('W4-IC-01', 'Inventory count cancel atomicity + concurrencyVersion', { outputTail: countCancel.out.slice(-800) }),
  );

  const getPass = runNodeTest(
    'src/services/getPass.service.test.js --test-name-pattern "submitGetPass|sendBackGetPass|rejectGetPass|deleteGetPass"',
  );
  scenarios.push(
    getPass.ok
      ? pass('W4-GP-01', 'Get Pass mutation concurrency tests')
      : fail('W4-GP-01', 'Get Pass mutation concurrency tests', { outputTail: getPass.out.slice(-800) }),
  );

  const breakageStatic = fs.readFileSync(path.join(BE_ROOT, 'src/services/breakage.service.js'), 'utf8');
  scenarios.push(
    breakageStatic.includes('assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion')
      ? pass('W4-BRK-01', 'Breakage submit guards concurrencyVersion')
      : fail('W4-BRK-01', 'Breakage submit guards concurrencyVersion'),
  );

  const transferStatic = fs.readFileSync(path.join(BE_ROOT, 'src/services/transfer.service.js'), 'utf8');
  scenarios.push(
    transferStatic.includes('assertConcurrencyVersion') && transferStatic.includes('updateTransfer')
      ? pass('W4-TRF-01', 'Transfer save/update guards concurrencyVersion')
      : fail('W4-TRF-01', 'Transfer save/update guards concurrencyVersion'),
  );

  const icService = fs.readFileSync(path.join(BE_ROOT, 'src/services/inventoryCount.service.js'), 'utf8');
  scenarios.push(
    icService.includes('assertSessionConcurrency') && icService.includes('guardedSessionUpdate')
      ? pass('W4-IC-02', 'Inventory count service concurrency guards')
      : fail('W4-IC-02', 'Inventory count service concurrency guards'),
  );

  const schema = fs.readFileSync(path.join(BE_ROOT, 'prisma/schema.prisma'), 'utf8');
  scenarios.push(
    /model StockCountSession[\s\S]*concurrencyVersion/.test(schema)
      ? pass('W4-IC-03', 'StockCountSession schema concurrencyVersion')
      : fail('W4-IC-03', 'StockCountSession schema concurrencyVersion'),
  );

  const feModel = fs.readFileSync(
    path.join(__dirname, '../../../OSE-Frontend/src/app/features/inventory-count/models/inventory-count.model.ts'),
    'utf8',
  );
  const feService = fs.readFileSync(
    path.join(__dirname, '../../../OSE-Frontend/src/app/features/inventory-count/services/inventory-count.service.ts'),
    'utf8',
  );
  scenarios.push(
    feModel.includes('concurrencyVersion') && feService.includes('concurrencyVersion')
      ? pass('W4-IC-04', 'Inventory count FE payloads include concurrencyVersion')
      : fail('W4-IC-04', 'Inventory count FE payloads include concurrencyVersion'),
  );

  const passCount = scenarios.filter((s) => s.result === 'PASS').length;
  const failCount = scenarios.filter((s) => s.result === 'FAIL').length;

  const evidence = {
    generatedAt: new Date().toISOString(),
    classification: 'WAVE4_RUNTIME_VERIFICATION',
    runId: RUN_ID,
    wave: 4,
    summary: {
      total: scenarios.length,
      pass: passCount,
      fail: failCount,
      gate: failCount === 0 ? 'CLOSED' : 'OPEN',
    },
    scenarios,
  };

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence.summary, null, 2));
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
