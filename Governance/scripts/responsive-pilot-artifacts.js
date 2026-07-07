'use strict';
// Generates condensed evidence artifacts from RUNTIME_RESULTS.json. READ-ONLY (writes evidence only).
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(__dirname, '..', 'responsive-audit', 'pilot');
const raw = require(path.join(OUT, 'ITEM_MASTER_TRANSFER_RUNTIME_RESULTS.json'));

const primary = raw.results.filter((r) => r.matrix === 'primary');
const byScreen = new Map();
for (const r of primary) {
  if (!byScreen.has(r.screenId)) byScreen.set(r.screenId, { screenId: r.screenId, module: r.module, name: r.name, family: r.family, type: r.type, status: r.status || null, route: r.requestedUrl, measurements: {} });
  const m = r.measurement || {};
  const t = (m.tables && m.tables[0]) || {};
  const c = (m.appShell && m.appShell.contentAvailable) || {};
  const card = m.outerCard || {};
  byScreen.get(r.screenId).measurements[r.viewport] = {
    result: r.result,
    flags: r.flags,
    landedUrl: r.landedUrl,
    appShell: { sider: m.appShell && m.appShell.sider, header: m.appShell && m.appShell.header, contentAvailable: c, contentOffsets: m.appShell && m.appShell.contentOffsets },
    outerCard: { width: card.width, height: card.height, x: card.x, y: card.y, maxWidth: card.maxWidth, padding: { top: card.paddingTop, right: card.paddingRight, bottom: card.paddingBottom, left: card.paddingLeft } },
    table: t.columnCount ? { containerWidth: t.containerWidth, bodyWidth: t.bodyWidth, bodyHeight: t.bodyHeight, bodyMaxHeight: t.bodyMaxHeight, scrollWidth: t.bodyScrollWidth, clientWidth: t.bodyClientWidth, columnCount: t.columnCount, columns: t.columns, visibleRows: t.visibleRows, horizontalScrollInside: t.horizontalScrollInside, verticalScrollInside: t.verticalScrollInside } : null,
    pagination: m.pagination || null,
    modal: m.modal || null,
    scroll: m.scroll ? { pageVerticalScroll: m.scroll.pageVerticalScroll, pageHorizontalScroll: m.scroll.pageHorizontalScroll, doubleVerticalScroll: m.scroll.doubleVerticalScroll, owners: m.scroll.owners } : null,
    blankBelowTable: m.blankBelowTable,
  };
}

const condensed = { generatedAt: new Date().toISOString(), runInfo: raw.runInfo, screens: [...byScreen.values()] };
fs.writeFileSync(path.join(OUT, 'ITEM_MASTER_TRANSFER_MEASUREMENTS.json'), JSON.stringify(condensed, null, 2));

// ── Markdown ──
const VPs = ['1366x768', '1536x864', '1920x1080'];
const n = (v) => (v == null ? '—' : v);
let md = '';
md += '# Item Master + Transfer — Runtime Measurement Matrix\n\n';
md += `Generated: ${condensed.generatedAt}\n\n`;
md += `Frontend: ${raw.runInfo.frontendUrl} · API: ${raw.runInfo.api}\n\n`;
md += `Tenant: \`${raw.runInfo.tenant.slug}\` (${raw.runInfo.tenant.name}) — child hotel\n\n`;
md += `Account: \`${raw.runInfo.account.email}\` · role ${raw.runInfo.account.role} · ${raw.runInfo.account.permissionCount} permissions (read-only minted session)\n\n`;
md += `Viewports (primary, OS scaling 100%, browser zoom 100%): ${VPs.join(', ')} — CSS pixels via getBoundingClientRect().\n\n`;
md += `Windows 125% represented as a second matrix (CSS viewport = physical/1.25, dpr 1.25): 1093×614, 1229×691, 1536×864.\n\n`;

md += '## App shell (identical on every screen)\n\n';
md += '| Metric | 1366×768 | 1536×864 | 1920×1080 |\n|---|--:|--:|--:|\n';
const shellRow = (label, fn) => { md += `| ${label} | ${VPs.map((v) => n(fn(v))).join(' | ')} |\n`; };
const imList = byScreen.get('IM-LIST').measurements;
shellRow('Sider width (px)', (v) => imList[v].appShell.sider && imList[v].appShell.sider.width);
shellRow('Header height (px)', (v) => imList[v].appShell.header && imList[v].appShell.header.height);
shellRow('Content available width (px)', (v) => imList[v].appShell.contentAvailable.width);
shellRow('Shell/content total height (px)', (v) => imList[v].appShell.contentAvailable.height);
shellRow('Page vertical scroll?', (v) => imList[v].scroll.pageVerticalScroll);
md += '\n> Shell height is a constant ~1133px on every viewport because the 25-item sidebar nav (overflow:hidden, min-height:768px) is taller than the viewport and stretches the shell. The document — not the content container — owns vertical scroll on all screens.\n\n';

function screenTable(ids, title) {
  md += `## ${title}\n\n`;
  md += '| Screen | Viewport | Result | Content avail | Outer card (W×H) | Card max-w | Table body (W×H) | Cols | Rows | sW/cW | Pagination | Scroll owner | Blank below |\n';
  md += '|---|---|---|--:|--:|---|--:|--:|--:|--:|---|---|--:|\n';
  for (const id of ids) {
    const s = byScreen.get(id);
    if (!s) continue;
    for (const v of VPs) {
      const m = s.measurements[v];
      if (!m) continue;
      const ca = `${m.appShell.contentAvailable.width}×${m.appShell.contentAvailable.height}`;
      const card = m.outerCard.width ? `${m.outerCard.width}×${m.outerCard.height}` : '—';
      const tb = m.table ? `${m.table.bodyWidth}×${m.table.bodyHeight}` : '—';
      const cols = m.table ? m.table.columnCount : '—';
      const rows = m.table ? m.table.visibleRows : '—';
      const swcw = m.table ? `${m.table.scrollWidth}/${m.table.clientWidth}` : '—';
      const pag = m.pagination ? (m.pagination.visibleInViewport ? 'visible' : 'below-fold') : '—';
      let owner = 'document';
      if (m.scroll && m.scroll.doubleVerticalScroll) owner = 'document + table (DOUBLE)';
      else if (m.table && m.table.verticalScrollInside) owner = 'table-body';
      md += `| ${s.name} | ${v} | ${m.result} | ${ca} | ${card} | ${n(m.outerCard.maxWidth)} | ${tb} | ${cols} | ${rows} | ${swcw} | ${pag} | ${owner} | ${n(m.blankBelowTable)} |\n`;
    }
  }
  md += '\n';
}

screenTable(['IM-LIST', 'IM-ADD', 'IM-EDIT', 'IM-IMPORT', 'IM-LIST-MODAL'], 'Item Master');
screenTable(['TR-LIST', 'TR-NEW', 'TR-EDIT', 'TR-DETAIL-DRAFT', 'TR-DETAIL-PENDING_DEPT', 'TR-DETAIL-PENDING_FINANCE', 'TR-DETAIL-POSTED', 'TR-DETAIL-REJECTED'], 'Transfer');

md += '## Column inventory (identical across all three viewports — no viewport-based hiding)\n\n';
const cols1366 = (id) => { const s = byScreen.get(id); const t = s && s.measurements['1366x768'].table; return t ? t.columns.join(', ') : '—'; };
md += `- Item Master List (8): ${cols1366('IM-LIST')}\n`;
md += `- Transfer List (6): ${cols1366('TR-LIST')}\n`;
md += `- Transfer Detail lines (6): ${(byScreen.get('TR-DETAIL-POSTED').measurements['1366x768'].table || {}).columns?.join(', ')}\n\n`;

fs.writeFileSync(path.join(OUT, 'ITEM_MASTER_TRANSFER_MEASUREMENTS.md'), md);
console.log('artifacts written to', OUT);
