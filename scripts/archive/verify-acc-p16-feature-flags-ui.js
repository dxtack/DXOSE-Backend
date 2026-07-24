'use strict';

/**
 * P16 — ACC-native Feature Flags UI verification.
 * Usage: node scripts/verify-acc-p16-feature-flags-ui.js
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

async function main() {
  console.log('\nACC P16 — ACC-native Feature Flags UI\n');

  const ts = fs.readFileSync(
    path.resolve(__dirname, '../../OSE-Frontend/src/app/features/access-control/acc-system/acc-system-diagnostics.component.ts'),
    'utf8',
  );
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../OSE-Frontend/src/app/features/access-control/acc-system/acc-system-diagnostics.component.html'),
    'utf8',
  );
  const svc = fs.readFileSync(
    path.resolve(__dirname, '../../OSE-Frontend/src/app/features/access-control/acc-system/services/acc-system.service.ts'),
    'utf8',
  );

  console.log('[1] ACC System UI exposes runtime enforcement:');
  assert('runtime tab type', ts.includes("'runtime'"));
  assert('feature flags card in template', html.includes('FEATURE_FLAGS') || html.includes('featureFlags'));
  assert('diagnostics includes featureFlags type', svc.includes('featureFlags'));

  console.log('\n[2] Backend diagnostics exposes feature flags + scope runtime:');
  const diag = fs.readFileSync(
    path.resolve(__dirname, '../src/services/acc-system-diagnostics.service.js'),
    'utf8',
  );
  assert('getAccFeatureFlagStatus in diagnostics', diag.includes('getAccFeatureFlagStatus'));
  assert('scope runtime in diagnostics', diag.includes('getAccScopeRuntimeStatus'));

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`P16 Validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('ACC P16 Feature Flags UI PASS\n');
}

main().catch((e) => {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
});
