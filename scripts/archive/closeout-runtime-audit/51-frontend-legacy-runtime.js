'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPORT_DIR, FE_BASE } = require('./lib/constants');

const OUT = path.join(REPORT_DIR, 'FRONTEND_LEGACY_RUNTIME_CAPTURE.json');
const FE = path.resolve(__dirname, '../../../OSE-Frontend');
const STATIC = path.join(REPORT_DIR, 'FRONTEND_LEGACY_DEPENDENCY_MATRIX.json');

function loadStaticRows() {
  if (!fs.existsSync(STATIC)) return [];
  const j = JSON.parse(fs.readFileSync(STATIC, 'utf8'));
  return (j.rows || []).slice(0, 10).map((s) => ({
    screen: s.activeScreen,
    button: s.userAction,
    componentOrService: s.frontendFile,
    endpointCalled: s.endpoint,
    runtimeRequestCaptured: 'Pending authenticated Approve click',
    modernAccEndpointAvailable: s.modernAlternative,
    classification: s.classification,
  }));
}

function main() {
  const staticRows = loadStaticRows();
  let captured = [];
  let feReachable = false;
  let note = '';

  try {
    const pw = require(path.join(FE, 'node_modules/playwright'));
    const r = spawnSync(
      process.execPath,
      [
        '-e',
        `(async()=>{const {chromium}=require(${JSON.stringify(path.join(FE, 'node_modules/playwright'))});const b=await chromium.launch({headless:true});const p=await b.newPage();const cap=[];p.on('request',r=>{if(/approve-dept|approve-cost|approve-finance|lost-items/.test(r.url()))cap.push({method:r.method(),url:r.url()});});try{await p.goto(${JSON.stringify(FE_BASE + '/login')},{timeout:15000});console.log(JSON.stringify({ok:true,cap}));}catch(e){console.log(JSON.stringify({ok:false,err:e.message,cap}));}await b.close();})()`,
      ],
      { cwd: FE, encoding: 'utf8', timeout: 45000 },
    );
    const line = (r.stdout || '').trim().split('\n').pop();
    const parsed = JSON.parse(line || '{}');
    feReachable = !!parsed.ok;
    captured = parsed.cap || [];
    note = parsed.err || '';
  } catch (e) {
    note = `Playwright probe skipped: ${e.message}`;
  }

  const payload = {
    executedAt: new Date().toISOString(),
    feBase: FE_BASE,
    feReachable,
    networkCaptureAttempt: true,
    capturedRequests: captured,
    staticCorroboration: staticRows,
    runtimeNote:
      captured.length > 0
        ? 'Legacy approve endpoint invoked at runtime'
        : 'Static code paths call approveAtCurrentStep → /approve-dept; runtime HTTP requires logged-in INTERNAL doc Approve — FE login page reachable: ' + feReachable,
    classification: 'Frontend-Dependent Operational Legacy',
    table: staticRows.map((s) => ({
      screen: s.screen,
      button: s.button,
      componentService: s.componentOrService,
      endpointCalled: s.endpointCalled,
      runtimeRequestCaptured: captured.length ? JSON.stringify(captured) : 'Static + FE shell probe only',
      modernAccEndpointAvailable: s.modernAccEndpointAvailable,
    })),
    probeNote: note,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log('Wrote FRONTEND_LEGACY_RUNTIME_CAPTURE.json');
}

main();
