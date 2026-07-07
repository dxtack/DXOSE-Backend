'use strict';
/** Extract IM-LIST primary-viewport BEFORE metrics from the pilot runtime results. */
const fs = require('fs');
const path = require('path');
const PILOT = path.resolve(__dirname, '..', 'responsive-audit', 'pilot', 'ITEM_MASTER_TRANSFER_RUNTIME_RESULTS.json');
const OUT = path.resolve(__dirname, '..', 'responsive-audit', 'item-master', 'ITEM_MASTER_LIST_RUNTIME_RESULTS_BEFORE.json');

const data = JSON.parse(fs.readFileSync(PILOT, 'utf8'));
const rows = data.results.filter((r) => r.screenId === 'IM-LIST' && r.matrix === 'primary');
const summary = rows.map((r) => {
  const m = r.measurement || {};
  const t = (m.tables && m.tables[0]) || {};
  return {
    viewport: r.viewport,
    result: r.result,
    flags: r.flags,
    pageVerticalScroll: m.scroll ? m.scroll.pageVerticalScroll : null,
    pageHorizontalScroll: m.scroll ? m.scroll.pageHorizontalScroll : null,
    verticalScrollOwners: m.scroll && m.scroll.owners ? m.scroll.owners.length : null,
    siderHeight: m.appShell && m.appShell.sider ? m.appShell.sider.height : null,
    headerHeight: m.appShell && m.appShell.header ? m.appShell.header.height : null,
    contentHeight: m.appShell && m.appShell.content ? m.appShell.content.height : null,
    contentWidth: m.appShell && m.appShell.content ? m.appShell.content.width : null,
    outerCard: m.outerCard ? { width: m.outerCard.width, height: m.outerCard.height, y: m.outerCard.y, bottom: m.outerCard.bottom } : null,
    tableContainerH: t.containerHeight ?? null,
    tableBodyHeight: t.bodyClientHeight ?? t.bodyHeight ?? null,
    tableBodyScrollHeight: t.bodyScrollHeight ?? null,
    tableBodyMaxHeight: t.bodyMaxHeight ?? null,
    columns: t.columns ?? null,
    columnCount: t.columnCount ?? null,
    pagination: m.pagination ? { y: m.pagination.y, bottom: m.pagination.bottom, visibleInViewport: m.pagination.visibleInViewport } : null,
    footer: m.footer ? { y: m.footer.y, bottom: m.footer.bottom, visibleInViewport: m.footer.visibleInViewport } : null,
    blankBelowTable: m.blankBelowTable ?? null,
  };
});
fs.writeFileSync(OUT, JSON.stringify({ source: 'pilot ITEM_MASTER_TRANSFER_RUNTIME_RESULTS.json', extractedAt: new Date().toISOString(), results: summary }, null, 2));
console.log(JSON.stringify(summary, null, 2));
