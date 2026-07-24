'use strict';

/**
 * Stitch IM + WFP compare viewport screenshots side-by-side.
 */
const path = require('path');
const fs = require('fs');

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'OSE-Frontend');
const { chromium } = require(path.join(FRONTEND_ROOT, 'node_modules', 'playwright'));

const OUT_DIR = path.resolve(__dirname, '..');
const COMPARE_DIR = path.join(OUT_DIR, 'screenshots', 'compare');
const VIEWPORTS = ['1366x768', '1536x864', '1920x1080'];

async function stitch(imRel, wfpRel, outRel) {
  const imPath = path.join(OUT_DIR, imRel).replace(/\\/g, '/');
  const wfpPath = path.join(OUT_DIR, wfpRel).replace(/\\/g, '/');
  const outPath = path.join(OUT_DIR, outRel);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#111;display:flex;gap:2px}
    img{display:block;height:100vh;width:auto}
    .label{position:absolute;top:8px;padding:4px 8px;background:rgba(0,0,0,.65);color:#fff;font:600 12px system-ui}
    .wrap{position:relative}
  </style></head><body>
    <div class="wrap"><span class="label">Item Master</span><img src="file:///${imPath}" /></div>
    <div class="wrap"><span class="label">Workflow Pipeline</span><img src="file:///${wfpPath}" /></div>
  </body></html>`);
  await page.screenshot({ path: outPath, fullPage: false });
  await browser.close();
  return outRel;
}

async function run() {
  fs.mkdirSync(COMPARE_DIR, { recursive: true });
  const stitched = [];
  for (const vp of VIEWPORTS) {
    const im = `screenshots/compare/IM-LIST__${vp}__viewport.png`;
    const wfp = `screenshots/compare/WFP__${vp}__viewport.png`;
    const out = `screenshots/compare/SIDE_BY_SIDE__${vp}.png`;
    if (!fs.existsSync(path.join(OUT_DIR, im)) || !fs.existsSync(path.join(OUT_DIR, wfp))) {
      console.warn(`[stitch] skip ${vp} — missing inputs`);
      continue;
    }
    await stitch(im, wfp, out);
    stitched.push(out);
    console.log(`[stitch] ${out}`);
  }
  return stitched;
}

if (require.main === module) {
  run().catch((e) => {
    console.error('STITCH_FATAL', e);
    process.exit(1);
  });
}

module.exports = { run };
