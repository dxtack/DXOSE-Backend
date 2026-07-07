'use strict';

const {
  timelineEntriesFromResponse,
  detailData,
  listRows,
  sumLineQty,
  sumLineTotals,
  assertNoLeak,
} = require('./phase-5-detail-assertions.lib.cjs');
const {
  stockSnapshot,
  ledgerRowsForRef,
  assertExactTransferPosting,
  assertExactBreakagePosting,
  assertExactLostPosting,
  assertStockDelta,
  compareListDetailFull,
} = require('./phase-5-posting-assertions.lib.cjs');
const { mutationSnapshot, assertUnchanged } = require('./phase-5-mutation-harness.lib.cjs');

function is2xx(s) {
  return s >= 200 && s < 300;
}

function movRow(prisma, id, tenantId) {
  return prisma.movementDocument.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, concurrencyVersion: true, postedAt: true, movementType: true },
  });
}

function trRow(prisma, id, tenantId) {
  return prisma.storeTransfer.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, concurrencyVersion: true, transferNo: true },
  });
}

async function recordDenial(record, id, name, res, before, after, expectedStatus) {
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const unchanged = assertUnchanged(before, after);
  const pass = expected.includes(res.status) && unchanged.pass;
  record(id, name, pass, {
    http: res.status,
    expectedStatus: expected,
    statusBefore: before.status,
    statusAfter: after.status,
    concurrencyBefore: before.concurrencyVersion,
    concurrencyAfter: after.concurrencyVersion,
    ledgerBefore: before.ledger,
    ledgerAfter: after.ledger,
    auditBefore: before.auditSuccess,
    auditAfter: after.auditSuccess,
    unchangedIssues: unchanged.issues,
  });
  return pass;
}

async function fetchDetail(apiRequest, API_BASE, module, id, token) {
  const paths = { TRANSFER: `/transfers/${id}`, BREAKAGE: `/breakage/${id}`, LOST: `/lost/${id}` };
  return apiRequest(API_BASE, 'GET', paths[module], null, token);
}

async function fetchList(apiRequest, API_BASE, module, token, search = '') {
  const paths = {
    TRANSFER: `/transfers?take=100${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    BREAKAGE: `/breakage?take=100${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    LOST: `/lost?take=100${search ? `&search=${encodeURIComponent(search)}` : ''}`,
  };
  return apiRequest(API_BASE, 'GET', paths[module], null, token);
}

function findListRow(rows, id) {
  return rows.find((r) => r.id === id);
}

async function assertFullDetailFixture(ctx, moduleKey, key, expectations = {}) {
  const { record, fixtures, token, apiRequest, API_BASE, prisma } = ctx;
  const fx = fixtures[moduleKey.toLowerCase()]?.[key];
  if (!fx?.id) {
    record(`P5-${moduleKey}-FULL-${key}`, `${moduleKey} ${key} full reconcile`, false, { reason: 'missing_fixture' });
    return null;
  }
  const res = await fetchDetail(apiRequest, API_BASE, moduleKey, fx.id, token);
  const detail = detailData(res);
  const docNo = detail?.transferNo || detail?.documentNo || fx.documentNo;
  const listRes = await fetchList(apiRequest, API_BASE, moduleKey, token, docNo || fixtures.fixtureTag);
  let row = findListRow(listRows(listRes), fx.id);
  if (!row && docNo) {
    const retry = await fetchList(apiRequest, API_BASE, moduleKey, token, docNo.split('-').pop());
    row = findListRow(listRows(retry), fx.id);
  }
  const mismatches = row
    ? compareListDetailFull(row, detail, moduleKey, { sumLineQty, sumLineTotals })
    : [{ field: 'list_row', list: null, detail: fx.id }];
  const leakIssues = assertNoLeak(detail);
  const statusOk = !expectations.status || detail?.status === expectations.status;
  const pass =
    res.status === 200 &&
    !!detail?.id &&
    mismatches.length === 0 &&
    leakIssues.length === 0 &&
    statusOk;
  record(`P5-${moduleKey}-FULL-${key}`, `${moduleKey} ${key} full list/detail reconcile`, pass, {
    fixtureId: fx.id,
    status: detail?.status,
    userFacingState: detail?.constitutionUserFacingState || detail?.userFacingState,
    mismatches,
    leakIssues,
    lineCount: detail?.lines?.length,
    totalQty: sumLineQty(detail?.lines),
    totalValue: sumLineTotals(detail?.lines),
    mediaCount: detail?.mediaCount,
  });
  return { pass, detail, fx, row };
}

async function runFullListDetailReconciliation(ctx) {
  const modules = {
    TRANSFER: ['draft', 'pendingDept', 'pendingFinance', 'posted', 'rejected'],
    BREAKAGE: ['draft', 'pendingCostControl', 'pendingFinance', 'pendingGm', 'approved', 'rejected', 'void'],
    LOST: ['deptApproved', 'pendingFinance', 'approvedEmployee', 'approvedHotel', 'rejected'],
  };
  for (const [mod, keys] of Object.entries(modules)) {
    for (const key of keys) {
      await assertFullDetailFixture(ctx, mod, key);
    }
  }
}

async function runExactPostingReconciliation(ctx) {
  const { record, fixtures, prisma } = ctx;
  const tenantId = fixtures.tenantId;

  const posted = fixtures.transfer?.posted;
  if (posted?.id) {
    const line = posted.lines?.[0];
    const tr = await prisma.storeTransfer.findFirst({
      where: { id: posted.id, tenantId },
      select: { sourceLocationId: true, destLocationId: true },
    });
    const rows = await ledgerRowsForRef(tenantId, posted.id);
    const qty = Number(line?.qty ?? 1);
    const ledgerCheck = assertExactTransferPosting(rows, {
      itemId: line?.itemId,
      sourceLocationId: tr?.sourceLocationId,
      destLocationId: tr?.destLocationId,
      qty,
      referenceId: posted.id,
    });
    record('P5-TR-POST-EXACT', 'Posted transfer exact TRANSFER_OUT/IN ledger', ledgerCheck.pass, {
      fixtureId: posted.id,
      issues: ledgerCheck.issues,
      outQty: ledgerCheck.outRows?.[0]?.qtyOut,
      inQty: ledgerCheck.inRows?.[0]?.qtyIn,
    });
  }

  const brk = fixtures.breakage?.approved;
  if (brk?.id) {
    const line = brk.lines?.[0];
    const rows = await ledgerRowsForRef(tenantId, brk.id);
    const qty = Number(line?.qty ?? 1);
    const doc = await movRow(prisma, brk.id, tenantId);
    const ledgerCheck = assertExactBreakagePosting(rows, {
      itemId: line?.itemId,
      locationId: line?.itemId ? (await prisma.movementLine.findFirst({ where: { documentId: brk.id }, select: { locationId: true } }))?.locationId : null,
      qty,
      referenceId: brk.id,
    });
    const stock = await stockSnapshot(tenantId, line?.itemId, ledgerCheck.row?.locationId);
    record('P5-BRK-POST-EXACT', 'Approved breakage exact BREAKAGE ledger + postedAt', ledgerCheck.pass && !!doc?.postedAt, {
      fixtureId: brk.id,
      issues: ledgerCheck.issues,
      postedAt: doc?.postedAt,
      stock,
    });
  }

  const lost = fixtures.lost?.approvedEmployee;
  if (lost?.id) {
    const line = lost.lines?.[0];
    const rows = await ledgerRowsForRef(tenantId, lost.id);
    const locId = (await prisma.movementLine.findFirst({ where: { documentId: lost.id }, select: { locationId: true } }))?.locationId;
    const qty = Number(line?.qty ?? 1);
    const ledgerCheck = assertExactLostPosting(rows, {
      itemId: line?.itemId,
      locationId: locId,
      qty,
      referenceId: lost.id,
    });
    const stock = await stockSnapshot(tenantId, line?.itemId, locId);
    record('P5-LOST-POST-EXACT', 'Approved lost exact LOST ledger row', ledgerCheck.pass, {
      fixtureId: lost.id,
      issues: ledgerCheck.issues,
      totalQtyLost: stock.totalQtyLost,
    });
  }
}

async function snapTransfer(prisma, tenantId, id, itemId, srcLoc, destLoc) {
  return mutationSnapshot(prisma, tenantId, {
    transferId: id,
    referenceId: id,
    entityType: 'TRANSFER',
    itemId,
    locationId: srcLoc,
    destLocationId: destLoc,
  });
}

async function snapMovement(prisma, tenantId, id, entityType, itemId, locationId) {
  return mutationSnapshot(prisma, tenantId, {
    movementId: id,
    referenceId: id,
    entityType,
    itemId,
    locationId,
  });
}

async function runMutationNegatives(ctx) {
  const { record, fixtures, tokens, apiRequest, API_BASE, prisma } = ctx;
  const tenantId = fixtures.tenantId;
  const stock = fixtures._stock;

  const penTr = fixtures.transfer?.pendingDept?.id;
  if (penTr && stock) {
    const before = await snapTransfer(prisma, tenantId, penTr, stock.itemId, stock.sourceLocationId, stock.destLocationId);
    const row = await trRow(prisma, penTr, tenantId);
    const deny = await apiRequest(
      API_BASE,
      'POST',
      `/transfers/${penTr}/approve`,
      { comment: 'deny', concurrencyVersion: row?.concurrencyVersion ?? 0 },
      tokens.storekeeper,
    );
    const after = await snapTransfer(prisma, tenantId, penTr, stock.itemId, stock.sourceLocationId, stock.destLocationId);
    await recordDenial(record, 'P5-NEG-TR-WRONG-ROLE', 'Wrong role cannot approve transfer', deny, before, after, 403);

    const stale = await apiRequest(
      API_BASE,
      'POST',
      `/transfers/${penTr}/approve`,
      { comment: 'stale', concurrencyVersion: 0 },
      tokens.deptManager,
    );
    const afterStale = await snapTransfer(prisma, tenantId, penTr, stock.itemId, stock.sourceLocationId, stock.destLocationId);
    await recordDenial(record, 'P5-NEG-TR-STALE', 'Stale concurrency on transfer approve', stale, before, afterStale, 409);
  }

  const denyCases = [
    { id: 'P5-NEG-TR-NO-ASSIGN', actor: 'noAssign', doc: penTr, path: `/transfers/${penTr}/approve`, body: (r) => ({ comment: 'x', concurrencyVersion: r?.concurrencyVersion ?? 0 }), expected: 403, mod: 'transfer' },
    { id: 'P5-NEG-TR-INACTIVE', actor: 'inactiveAssign', doc: penTr, path: `/transfers/${penTr}/approve`, body: (r) => ({ comment: 'x', concurrencyVersion: r?.concurrencyVersion ?? 0 }), expected: 403, mod: 'transfer' },
    { id: 'P5-NEG-TR-DELETED', actor: 'deletedAssign', doc: penTr, path: `/transfers/${penTr}/approve`, body: (r) => ({ comment: 'x', concurrencyVersion: r?.concurrencyVersion ?? 0 }), expected: 403, mod: 'transfer' },
    { id: 'P5-NEG-TR-VIEWONLY', actor: 'viewOnly', doc: penTr, path: `/transfers/${penTr}/approve`, body: (r) => ({ comment: 'x', concurrencyVersion: r?.concurrencyVersion ?? 0 }), expected: 403, mod: 'transfer' },
  ];

  for (const c of denyCases) {
    if (!c.doc || !tokens[c.actor]) {
      record(c.id, `Transfer deny: ${c.actor}`, false, { reason: 'missing_fixture_or_token' });
      continue;
    }
    const before = await snapTransfer(prisma, tenantId, c.doc, stock.itemId, stock.sourceLocationId, stock.destLocationId);
    const row = await trRow(prisma, c.doc, tenantId);
    const res = await apiRequest(API_BASE, 'POST', c.path, c.body(row), tokens[c.actor]);
    const after = await snapTransfer(prisma, tenantId, c.doc, stock.itemId, stock.sourceLocationId, stock.destLocationId);
    await recordDenial(record, c.id, `Transfer approve denied (${c.actor})`, res, before, after, c.expected);
  }

  const postedId = fixtures.transfer?.posted?.id;
  if (postedId) {
    const before = await snapTransfer(prisma, tenantId, postedId, stock.itemId, stock.sourceLocationId, stock.destLocationId);
    const row = await trRow(prisma, postedId, tenantId);
    const dup = await apiRequest(
      API_BASE,
      'POST',
      `/transfers/${postedId}/approve`,
      { comment: 'dup', concurrencyVersion: row?.concurrencyVersion ?? 0 },
      tokens.financeManager,
    );
    const after = await snapTransfer(prisma, tenantId, postedId, stock.itemId, stock.sourceLocationId, stock.destLocationId);
    await recordDenial(record, 'P5-NEG-TR-TERMINAL', 'Cannot approve posted transfer', dup, before, after, [403, 422]);
  }

  const brkCc = fixtures.breakage?.pendingCostControl?.id;
  const brkLine = fixtures.breakage?.pendingCostControl?.lines?.[0];
  const brkLoc = brkLine?.itemId
    ? (await prisma.movementLine.findFirst({ where: { documentId: brkCc }, select: { locationId: true } }))?.locationId
    : stock?.locationId;

  const brkDenies = [
    { id: 'P5-NEG-BRK-NO-ASSIGN', actor: 'noAssign', doc: brkCc, expected: 403 },
    { id: 'P5-NEG-BRK-VIEWONLY', actor: 'viewOnly', doc: brkCc, expected: 403 },
    { id: 'P5-NEG-BRK-WRONG-ROLE', actor: 'storekeeper', doc: brkCc, expected: 403 },
  ];
  for (const c of brkDenies) {
    if (!c.doc || !tokens[c.actor]) {
      record(c.id, `Breakage deny ${c.actor}`, false, { reason: 'missing' });
      continue;
    }
    const before = await snapMovement(prisma, tenantId, c.doc, 'BREAKAGE', brkLine?.itemId, brkLoc);
    const row = await movRow(prisma, c.doc, tenantId);
    const res = await apiRequest(API_BASE, 'POST', `/breakage/${c.doc}/approve`, { comment: 'x', concurrencyVersion: row?.concurrencyVersion ?? 0 }, tokens[c.actor]);
    const after = await snapMovement(prisma, tenantId, c.doc, 'BREAKAGE', brkLine?.itemId, brkLoc);
    await recordDenial(record, c.id, `Breakage approve denied (${c.actor})`, res, before, after, c.expected);
  }

  const brkApproved = fixtures.breakage?.approved?.id;
  if (brkApproved) {
    const before = await snapMovement(prisma, tenantId, brkApproved, 'BREAKAGE', brkLine?.itemId, brkLoc);
    const row = await movRow(prisma, brkApproved, tenantId);
    const voidRes = await apiRequest(API_BASE, 'POST', `/breakage/${brkApproved}/void`, { reason: 'x', concurrencyVersion: row?.concurrencyVersion ?? 0 }, tokens.storekeeper);
    const after = await snapMovement(prisma, tenantId, brkApproved, 'BREAKAGE', brkLine?.itemId, brkLoc);
    await recordDenial(record, 'P5-NEG-BRK-VOID-APPROVED', 'Cannot void approved breakage', voidRes, before, after, [400, 403, 422, 423]);
  }

  const brkVoid = fixtures.breakage?.void?.id;
  if (brkVoid) {
    const before = await snapMovement(prisma, tenantId, brkVoid, 'BREAKAGE', brkLine?.itemId, brkLoc);
    const row = await movRow(prisma, brkVoid, tenantId);
    const res = await apiRequest(API_BASE, 'POST', `/breakage/${brkVoid}/approve`, { comment: 'x', concurrencyVersion: row?.concurrencyVersion ?? 0 }, tokens.costControl);
    const after = await snapMovement(prisma, tenantId, brkVoid, 'BREAKAGE', brkLine?.itemId, brkLoc);
    await recordDenial(record, 'P5-NEG-BRK-TERMINAL', 'Cannot approve void breakage', res, before, after, [403, 400, 422]);
  }

  const foreignBrk = fixtures.breakage?.approved?.id;
  if (foreignBrk && tokens.viewOnly) {
    const oosId = fixtures.outOfScope?.breakage?.id;
    if (oosId) {
      const ev = await apiRequest(API_BASE, 'GET', `/breakage/${oosId}/evidence`, null, tokens.viewOnly);
      record('P5-NEG-BRK-FOREIGN-EVIDENCE', 'View-only cannot access OOS breakage evidence', ev.status === 403 || ev.status === 404, {
        http: ev.status,
        fixtureId: oosId,
      });
    }
  }

  const lostDept = fixtures.lost?.deptApproved?.id;
  const lostLine = fixtures.lost?.deptApproved?.lines?.[0];
  const lostLoc = lostLine?.itemId
    ? (await prisma.movementLine.findFirst({ where: { documentId: lostDept }, select: { locationId: true } }))?.locationId
    : stock?.locationId;

  for (const [id, actor, expected] of [
    ['P5-NEG-LOST-NO-ASSIGN', 'noAssign', 403],
    ['P5-NEG-LOST-VIEWONLY', 'viewOnly', 403],
  ]) {
    if (!lostDept || !tokens[actor]) {
      record(id, `Lost deny ${actor}`, false, { reason: 'missing' });
      continue;
    }
    const before = await snapMovement(prisma, tenantId, lostDept, 'BREAKAGE', lostLine?.itemId, lostLoc);
    const row = await movRow(prisma, lostDept, tenantId);
    const res = await apiRequest(API_BASE, 'POST', `/lost/${lostDept}/approve`, { comment: 'x', concurrencyVersion: row?.concurrencyVersion ?? 0 }, tokens[actor]);
    const after = await snapMovement(prisma, tenantId, lostDept, 'BREAKAGE', lostLine?.itemId, lostLoc);
    await recordDenial(record, id, `Lost approve denied (${actor})`, res, before, after, expected);
  }

  const lostApproved = fixtures.lost?.approvedEmployee?.id;
  if (lostApproved) {
    const before = await snapMovement(prisma, tenantId, lostApproved, 'BREAKAGE', lostLine?.itemId, lostLoc);
    const row = await movRow(prisma, lostApproved, tenantId);
    const dup = await apiRequest(
      API_BASE,
      'POST',
      `/lost/${lostApproved}/approve`,
      { accountability: 'HOTEL', comment: 'dup', concurrencyVersion: row?.concurrencyVersion ?? 0 },
      tokens.generalManager,
    );
    const after = await snapMovement(prisma, tenantId, lostApproved, 'BREAKAGE', lostLine?.itemId, lostLoc);
    await recordDenial(record, 'P5-NEG-LOST-DUP-FINAL', 'Duplicate final lost approval denied', dup, before, after, [403, 422, 423]);

    const treatChange = await apiRequest(
      API_BASE,
      'POST',
      `/lost/${lostApproved}/approve`,
      { accountability: 'EMPLOYEE', comment: 'change treatment', concurrencyVersion: row?.concurrencyVersion ?? 0 },
      tokens.generalManager,
    );
    const afterTreat = await snapMovement(prisma, tenantId, lostApproved, 'BREAKAGE', lostLine?.itemId, lostLoc);
    await recordDenial(record, 'P5-NEG-LOST-TREAT-CHANGE', 'Cannot change treatment after APPROVED', treatChange, before, afterTreat, [403, 422, 423]);
  }

  const staleJwt = await apiRequest(
    API_BASE,
    'GET',
    `/transfers/${penTr || fixtures.transfer?.draft?.id}`,
    null,
    'invalid.jwt.token',
  );
  record('P5-NEG-STALE-JWT', 'Stale JWT rejected', staleJwt.status === 401, { http: staleJwt.status });

  const foreignId = fixtures.crossTenant?.foreignTransferId;
  if (foreignId) {
    const res = await fetchDetail(apiRequest, API_BASE, 'TRANSFER', foreignId, tokens.orgManager);
    record('P5-NEG-CROSS-TENANT', 'Cross-tenant transfer detail 404', res.status === 404, { http: res.status, fixtureId: foreignId });
  }

  const scoped = tokens.scopedDept;
  if (scoped) {
    for (const [mod, key] of [['TRANSFER', 'transfer'], ['BREAKAGE', 'breakage'], ['LOST', 'lost']]) {
      const id = fixtures.outOfScope?.[key]?.id;
      if (!id) {
        record(`P5-NEG-OOS-${mod}`, `${mod} OOS detail denied`, false, { reason: 'missing_oos' });
        continue;
      }
      const res = await fetchDetail(apiRequest, API_BASE, mod, id, scoped);
      record(`P5-NEG-OOS-${mod}`, `${mod} OOS detail 403`, res.status === 403, { http: res.status, fixtureId: id });
    }
  }
}

async function runActionFlows(ctx) {
  const { record, fixtures, tokens, apiRequest, API_BASE, prisma, FIXTURE_TAG } = ctx;
  const tenantId = fixtures.tenantId;
  const bf = fixtures.browserFlows;
  if (!bf?.transferPost?.id) {
    record('P5-FLOW-TR-FULL', 'Transfer dept→finance→post flow', false, { reason: 'missing_browser_flow' });
    return;
  }

  const trId = bf.transferPost.id;
  const { itemId, sourceLocationId, destLocationId, qty, stockBefore } = bf.transferPost;
  const srcBefore = stockBefore?.source || (await stockSnapshot(tenantId, itemId, sourceLocationId));
  const destBefore = stockBefore?.dest || (await stockSnapshot(tenantId, itemId, destLocationId));

  let row = await trRow(prisma, trId, tenantId);
  const deptAp = await apiRequest(
    API_BASE,
    'POST',
    `/transfers/${trId}/approve`,
    { comment: FIXTURE_TAG, concurrencyVersion: row?.concurrencyVersion ?? 0 },
    tokens.deptManager,
  );
  const afterDept = detailData(await fetchDetail(apiRequest, API_BASE, 'TRANSFER', trId, tokens.orgManager));
  record('P5-FLOW-TR-DEPT', 'Transfer dept approve → PENDING_FINANCE', is2xx(deptAp.status) && afterDept?.status === 'PENDING_FINANCE', {
    http: deptAp.status,
    status: afterDept?.status,
    fixtureId: trId,
  });

  row = await trRow(prisma, trId, tenantId);
  const finAp = await apiRequest(
    API_BASE,
    'POST',
    `/transfers/${trId}/approve`,
    { comment: FIXTURE_TAG, concurrencyVersion: row?.concurrencyVersion ?? 0 },
    tokens.financeManager,
  );
  const afterFin = detailData(await fetchDetail(apiRequest, API_BASE, 'TRANSFER', trId, tokens.orgManager));
  const rows = await ledgerRowsForRef(tenantId, trId);
  const ledgerCheck = assertExactTransferPosting(rows, {
    itemId,
    sourceLocationId,
    destLocationId,
    qty,
    referenceId: trId,
  });
  const srcAfter = await stockSnapshot(tenantId, itemId, sourceLocationId);
  const destAfter = await stockSnapshot(tenantId, itemId, destLocationId);
  const stockSrc = assertStockDelta(srcBefore, srcAfter, { qtyDelta: -qty });
  const stockDest = assertStockDelta(destBefore, destAfter, { qtyDelta: qty });
  record('P5-FLOW-TR-POST', 'Transfer finance approve & post with exact ledger/stock', is2xx(finAp.status) && afterFin?.status === 'POSTED' && ledgerCheck.pass && stockSrc.pass && stockDest.pass, {
    http: finAp.status,
    status: afterFin?.status,
    ledgerIssues: ledgerCheck.issues,
    stockIssues: [...(stockSrc.issues || []), ...(stockDest.issues || [])],
    fixtureId: trId,
  });

  const brkId = bf.breakageApprove?.pendingCcId;
  if (brkId) {
    const locId = bf.breakageApprove.locationId;
    const bQty = bf.breakageApprove.qty;
    const stockBBefore = await stockSnapshot(tenantId, itemId, locId);
    for (const [stepId, actor, expStatus] of [
      ['P5-FLOW-BRK-CC', 'costControl', 'COST_CONTROL_APPROVED'],
      ['P5-FLOW-BRK-FIN', 'financeManager', 'FINANCE_APPROVED'],
      ['P5-FLOW-BRK-GM', 'generalManager', 'APPROVED'],
    ]) {
      const r = await movRow(prisma, brkId, tenantId);
      const res = await apiRequest(
        API_BASE,
        'POST',
        `/breakage/${brkId}/approve`,
        { comment: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 },
        tokens[actor],
      );
      const det = detailData(await fetchDetail(apiRequest, API_BASE, 'BREAKAGE', brkId, tokens.orgManager));
      record(stepId, `Breakage ${actor} approve`, is2xx(res.status) && det?.status === expStatus, {
        http: res.status,
        status: det?.status,
        expected: expStatus,
        fixtureId: brkId,
      });
    }
    const brkRows = await ledgerRowsForRef(tenantId, brkId);
    const brkLedger = assertExactBreakagePosting(brkRows, { itemId, locationId: locId, qty: bQty, referenceId: brkId });
    const stockBAfter = await stockSnapshot(tenantId, itemId, locId);
    const dmgDelta = assertStockDelta(stockBBefore, stockBAfter, { qtyDelta: -bQty, totalQtyDamageDelta: bQty });
    record('P5-FLOW-BRK-POST', 'Breakage full chain exact ledger/stock', brkLedger.pass && dmgDelta.pass, {
      ledgerIssues: brkLedger.issues,
      stockIssues: dmgDelta.issues,
      fixtureId: brkId,
    });
  }

  const lostId = bf.lostChain?.deptApprovedId;
  if (lostId) {
    const locId = bf.lostChain.locationId;
    const lQty = bf.lostChain.qty;
    const stockLBefore = await stockSnapshot(tenantId, itemId, locId);
    for (const [stepId, actor, body, expStatus] of [
      ['P5-FLOW-LOST-CC', 'costControl', { comment: FIXTURE_TAG }, 'COST_CONTROL_APPROVED'],
      ['P5-FLOW-LOST-FIN', 'financeManager', { comment: FIXTURE_TAG }, 'FINANCE_APPROVED'],
      ['P5-FLOW-LOST-GM-EMP', 'generalManager', { accountability: 'EMPLOYEE', comment: 'Phase5 Employee' }, 'APPROVED'],
    ]) {
      const r = await movRow(prisma, lostId, tenantId);
      const res = await apiRequest(
        API_BASE,
        'POST',
        `/lost/${lostId}/approve`,
        { ...body, concurrencyVersion: r?.concurrencyVersion ?? 0 },
        tokens[actor],
      );
      const det = detailData(await fetchDetail(apiRequest, API_BASE, 'LOST', lostId, tokens.orgManager));
      record(stepId, `Lost chain ${actor}`, is2xx(res.status) && det?.status === expStatus, {
        http: res.status,
        status: det?.status,
        fixtureId: lostId,
      });
    }
    const lostRows = await ledgerRowsForRef(tenantId, lostId);
    const lostLedger = assertExactLostPosting(lostRows, { itemId, locationId: locId, qty: lQty, referenceId: lostId });
    const stockLAfter = await stockSnapshot(tenantId, itemId, locId);
    const lostDelta = assertStockDelta(stockLBefore, stockLAfter, { qtyDelta: -lQty, totalQtyLostDelta: lQty });
    const det = detailData(await fetchDetail(apiRequest, API_BASE, 'LOST', lostId, tokens.orgManager));
    const treatment = String(det?.suggestedAction || det?.finalLossTreatment || '');
    record('P5-FLOW-LOST-POST', 'Lost employee deduction exact ledger/stock/treatment', lostLedger.pass && lostDelta.pass && treatment.includes('EMPLOYEE'), {
      ledgerIssues: lostLedger.issues,
      treatment,
      fixtureId: lostId,
    });
  }

  const lostHotelId = bf.lostChainHotel?.deptApprovedId;
  if (lostHotelId) {
    for (const actor of ['costControl', 'financeManager']) {
      const r = await movRow(prisma, lostHotelId, tenantId);
      await apiRequest(
        API_BASE,
        'POST',
        `/lost/${lostHotelId}/approve`,
        { comment: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 },
        tokens[actor],
      );
    }
    const r = await movRow(prisma, lostHotelId, tenantId);
    const gm = await apiRequest(
      API_BASE,
      'POST',
      `/lost/${lostHotelId}/approve`,
      { accountability: 'HOTEL', comment: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 },
      tokens.generalManager,
    );
    const det = detailData(await fetchDetail(apiRequest, API_BASE, 'LOST', lostHotelId, tokens.orgManager));
    const treatment = String(det?.suggestedAction || det?.finalLossTreatment || '');
    record('P5-FLOW-LOST-HOTEL', 'Lost hotel expenses approved', is2xx(gm.status) && det?.status === 'APPROVED' && treatment.includes('HOTEL'), {
      http: gm.status,
      treatment,
      fixtureId: lostHotelId,
    });
  }

  const lostRejId = bf.lostReject?.deptApprovedId;
  if (lostRejId) {
    const r = await movRow(prisma, lostRejId, tenantId);
    const rej = await apiRequest(
      API_BASE,
      'POST',
      `/lost/${lostRejId}/reject`,
      { comment: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 },
      tokens.costControl,
    );
    const det = detailData(await fetchDetail(apiRequest, API_BASE, 'LOST', lostRejId, tokens.orgManager));
    record('P5-FLOW-LOST-REJECT', 'Lost reject → REJECTED terminal', is2xx(rej.status) && det?.status === 'REJECTED', {
      http: rej.status,
      status: det?.status,
      fixtureId: lostRejId,
    });
  }

  for (const [key, voidKey, path] of [
    ['breakageVoidDraft', 'draftId', 'void'],
    ['breakageVoidRejected', 'rejectedId', 'void'],
  ]) {
    const vid = bf[key]?.[voidKey];
    if (!vid) continue;
    const locId = bf.breakageApprove?.locationId || sourceLocationId;
    const before = await snapMovement(prisma, tenantId, vid, 'BREAKAGE', itemId, locId);
    const r = await movRow(prisma, vid, tenantId);
    const res = await apiRequest(
      API_BASE,
      'POST',
      `/breakage/${vid}/void`,
      { reason: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 },
      tokens.storekeeper,
    );
    const after = await snapMovement(prisma, tenantId, vid, 'BREAKAGE', itemId, locId);
    const unchanged = assertUnchanged(before, after, ['ledger']);
    const det = detailData(await fetchDetail(apiRequest, API_BASE, 'BREAKAGE', vid, tokens.orgManager));
    record(`P5-FLOW-BRK-VOID-${key}`, `Breakage void ${key}`, is2xx(res.status) && det?.status === 'VOID' && unchanged.pass, {
      http: res.status,
      status: det?.status,
      fixtureId: vid,
    });
  }
}

async function runActionMatrixRuntime(ctx) {
  const { record, fixtures, tokens, apiRequest, API_BASE, prisma, ACTION_MATRIX, FIXTURE_TAG } = ctx;
  const rows = ACTION_MATRIX?.actions || [];

  const execCase = async (testId, name, fn) => {
    try {
      const result = await fn();
      record(testId, name, !!result.pass, result.detail || {});
    } catch (e) {
      record(testId, name, false, { error: String(e.message).slice(0, 300) });
    }
  };

  for (const row of rows) {
    const allowId = row.runtimeAllow?.testId || `P5-MX-${row.id}-ALLOW`;
    const denyId = row.runtimeDeny?.testId || `P5-MX-${row.id}-DENY`;

    if (row.runtimeAllow) {
      await execCase(allowId, `Matrix allow: ${row.route}`, async () => {
        const a = row.runtimeAllow;
        const token = tokens[a.actor];
        if (!token) return { pass: false, detail: { reason: 'no_token' } };
        let id;
        if (a.createTransfer && row.module === 'TRANSFER') {
          const stock = fixtures._stock;
          const create = await apiRequest(
            API_BASE,
            'POST',
            '/transfers',
            {
              sourceLocationId: stock.sourceLocationId,
              destLocationId: stock.destLocationId,
              reason: `${FIXTURE_TAG} MX`,
              lines: [{ itemId: stock.itemId, uomId: stock.unitId, requestedQty: 1 }],
            },
            token,
          );
          id = create.data?.data?.id;
        } else {
          const fixturePath = a.fixture?.split('.') || [];
          let fx = fixtures;
          for (const p of fixturePath) fx = fx?.[p];
          id = a.field ? fx?.[a.field] : fx?.id;
        }
        if (!id) return { pass: false, detail: { reason: 'no_fixture' } };

        if (row.module === 'TRANSFER' && row.method === 'PATCH') {
          const r = await trRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'PATCH', `/transfers/${id}`, { notes: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 }, token);
          return { pass: is2xx(res.status), detail: { http: res.status } };
        }
        if (row.module === 'TRANSFER' && row.method === 'DELETE') {
          const r = await trRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'DELETE', `/transfers/${id}?concurrencyVersion=${r?.concurrencyVersion ?? 0}`, null, token);
          return { pass: is2xx(res.status), detail: { http: res.status } };
        }
        if (row.module === 'TRANSFER' && row.route.includes('/reject')) {
          const r = await trRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'POST', `/transfers/${id}/reject`, { reason: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 }, token);
          const det = detailData(await fetchDetail(apiRequest, API_BASE, 'TRANSFER', id, tokens.orgManager));
          return { pass: is2xx(res.status) && det?.status === 'REJECTED', detail: { http: res.status, status: det?.status } };
        }
        if (row.module === 'TRANSFER' && row.route.includes('/submit')) {
          const r = await trRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'POST', `/transfers/${id}/submit`, { concurrencyVersion: r?.concurrencyVersion ?? 0 }, token);
          const det = detailData(await fetchDetail(apiRequest, API_BASE, 'TRANSFER', id, tokens.orgManager));
          return { pass: is2xx(res.status) && det?.status === 'PENDING_DEPT', detail: { http: res.status, status: det?.status } };
        }
        if (row.module === 'TRANSFER' && row.route.includes('/approve')) {
          const r = await trRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'POST', `/transfers/${id}/approve`, { comment: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 }, token);
          return { pass: is2xx(res.status), detail: { http: res.status } };
        }
        if (row.module === 'BREAKAGE' && row.route.includes('/submit')) {
          const r = await movRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'POST', `/breakage/${id}/submit`, { concurrencyVersion: r?.concurrencyVersion ?? 0 }, token);
          const det = detailData(await fetchDetail(apiRequest, API_BASE, 'BREAKAGE', id, tokens.orgManager));
          return { pass: is2xx(res.status) && det?.status === 'DEPT_APPROVED', detail: { http: res.status, status: det?.status } };
        }
        if ((row.module === 'BREAKAGE' || row.module === 'LOST') && row.route.includes('/reject')) {
          const base = row.module === 'LOST' ? 'lost' : 'breakage';
          const r = await movRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'POST', `/${base}/${id}/reject`, { comment: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 }, token);
          const det = detailData(await fetchDetail(apiRequest, API_BASE, row.module, id, tokens.orgManager));
          return { pass: is2xx(res.status) && det?.status === 'REJECTED', detail: { http: res.status, status: det?.status } };
        }
        if ((row.module === 'BREAKAGE' || row.module === 'LOST') && row.route.includes('/approve')) {
          const base = row.module === 'LOST' ? 'lost' : 'breakage';
          const r = await movRow(prisma, id, fixtures.tenantId);
          const body = { comment: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0, ...(a.body || {}) };
          const res = await apiRequest(API_BASE, 'POST', `/${base}/${id}/approve`, body, token);
          return { pass: is2xx(res.status), detail: { http: res.status } };
        }
        if (row.module === 'BREAKAGE' && row.route.includes('/void')) {
          const r = await movRow(prisma, id, fixtures.tenantId);
          const res = await apiRequest(API_BASE, 'POST', `/breakage/${id}/void`, { reason: FIXTURE_TAG, concurrencyVersion: r?.concurrencyVersion ?? 0 }, token);
          const det = detailData(await fetchDetail(apiRequest, API_BASE, 'BREAKAGE', id, tokens.orgManager));
          return { pass: is2xx(res.status) && det?.status === 'VOID', detail: { http: res.status, status: det?.status } };
        }
        return { pass: false, detail: { reason: 'unhandled_allow', route: row.route } };
      });
    }

    if (row.runtimeDeny) {
      await execCase(denyId, `Matrix deny: ${row.route}`, async () => {
        const d = row.runtimeDeny;
        const token = d.actor === 'staleJwt' ? 'invalid.jwt.token' : tokens[d.actor];
        if (!token && d.actor !== 'staleJwt') return { pass: false, detail: { reason: 'no_token' } };
        let id;
        if (d.fixture) {
          const fixturePath = d.fixture.split('.');
          let fx = fixtures;
          for (const p of fixturePath) fx = fx?.[p];
          id = d.field ? fx?.[d.field] : fx?.id;
        }
        if (!id && d.actor !== 'staleJwt') return { pass: false, detail: { reason: 'no_fixture' } };

        let res;
        if (row.module === 'TRANSFER' && row.method === 'PATCH') {
          res = await apiRequest(API_BASE, 'PATCH', `/transfers/${id}`, { reason: 'x' }, token);
        } else if (row.module === 'TRANSFER' && row.method === 'DELETE') {
          res = await apiRequest(API_BASE, 'DELETE', `/transfers/${id}`, null, token);
        } else if (row.module === 'TRANSFER') {
          const r = await trRow(prisma, id, fixtures.tenantId);
          const path = row.route.includes('/reject') ? 'reject' : row.route.includes('/submit') ? 'submit' : 'approve';
          const body = path === 'reject' ? { reason: 'x', concurrencyVersion: r?.concurrencyVersion ?? 0 } : { comment: 'x', concurrencyVersion: d.staleConcurrency ? 0 : (r?.concurrencyVersion ?? 0) };
          res = await apiRequest(API_BASE, 'POST', `/transfers/${id}/${path}`, body, token);
        } else {
          const base = row.module === 'LOST' ? 'lost' : 'breakage';
          const r = await movRow(prisma, id, fixtures.tenantId);
          const path = row.route.includes('/void') ? 'void' : row.route.includes('/reject') ? 'reject' : row.route.includes('/submit') ? 'submit' : 'approve';
          const body =
            path === 'void'
              ? { reason: 'x', concurrencyVersion: r?.concurrencyVersion ?? 0 }
              : path === 'reject'
                ? { comment: 'x', concurrencyVersion: r?.concurrencyVersion ?? 0 }
                : { comment: 'x', concurrencyVersion: d.staleConcurrency ? 0 : (r?.concurrencyVersion ?? 0) };
          res = await apiRequest(API_BASE, 'POST', `/${base}/${id}/${path}`, body, token);
        }
        return {
          pass: res.status === d.expectedHttp,
          detail: { http: res.status, expected: d.expectedHttp },
        };
      });
    }
  }
}

async function runDraftTimelineAssertion(ctx) {
  const { record, fixtures, token, apiRequest, API_BASE } = ctx;
  const draftId = fixtures.transfer?.draft?.id;
  if (!draftId) {
    record('P5-TR-DRAFT-TL-API', 'DRAFT transfer timeline API empty array', false, { reason: 'no_draft' });
    return;
  }
  const tl = await apiRequest(API_BASE, 'GET', `/constitution/timeline/TRANSFER/${draftId}`, null, token);
  const entries = timelineEntriesFromResponse(tl);
  record('P5-TR-DRAFT-TL-API', 'DRAFT transfer timeline API returns 200 with zero entries', tl.status === 200 && entries.length === 0, {
    http: tl.status,
    entryCount: entries.length,
    fixtureId: draftId,
  });
}

module.exports = {
  runFullListDetailReconciliation,
  runExactPostingReconciliation,
  runMutationNegatives,
  runActionFlows,
  runActionMatrixRuntime,
  runDraftTimelineAssertion,
  fetchDetail,
  fetchList,
};
