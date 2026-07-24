'use strict';

const fs = require('fs');
const path = require('path');

const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED', 'NOT_APPLICABLE']);

function validateCounts(counts, total, scriptName) {
  const sum =
    counts.PASS +
    counts.FAIL +
    counts.BLOCKED +
    counts.NOT_EXECUTED +
    counts.NOT_APPLICABLE;
  if (sum !== total) {
    throw new Error(
      `[${scriptName}] Count mismatch: PASS+FAIL+BLOCKED+NOT_EXECUTED+NOT_APPLICABLE=${sum} but total=${total}`,
    );
  }
}

class ScenarioReport {
  constructor(scriptName) {
    this.scriptName = scriptName;
    this.scenarios = [];
    this.meta = {};
    this.hadUnexpected500 = false;
    this.missingFixtures = [];
    this.missingIdentities = [];
  }

  add(row) {
    const status = row.result || row.status;
    if (!STATUSES.has(status)) {
      throw new Error(`Invalid scenario status: ${status} in ${this.scriptName}`);
    }
    if (row.http === 500) this.hadUnexpected500 = true;
    this.scenarios.push(row);
    return row;
  }

  pass(id, extra = {}) {
    return this.add({ id, result: 'PASS', ...extra });
  }

  fail(id, extra = {}) {
    return this.add({ id, result: 'FAIL', ...extra });
  }

  blocked(id, reason, extra = {}) {
    return this.add({ id, result: 'BLOCKED', reason, ...extra });
  }

  notExecuted(id, reason, extra = {}) {
    return this.add({ id, result: 'NOT_EXECUTED', reason, ...extra });
  }

  notApplicable(id, reason, extra = {}) {
    return this.add({ id, result: 'NOT_APPLICABLE', reason, ...extra });
  }

  summary() {
    const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_EXECUTED: 0, NOT_APPLICABLE: 0 };
    for (const s of this.scenarios) counts[s.result] += 1;
    validateCounts(counts, this.scenarios.length, this.scriptName);
    const requiredGap = counts.NOT_EXECUTED + counts.BLOCKED;
    const harnessExit =
      counts.FAIL > 0 ||
      requiredGap > 0 ||
      this.hadUnexpected500 ||
      this.missingFixtures.length > 0 ||
      this.missingIdentities.length > 0
        ? 1
        : 0;
    return {
      script: this.scriptName,
      harnessExit,
      counts,
      total: this.scenarios.length,
      countValidation: 'PASS + FAIL + BLOCKED + NOT_EXECUTED + NOT_APPLICABLE = total',
      hadUnexpected500: this.hadUnexpected500,
      missingFixtures: this.missingFixtures,
      missingIdentities: this.missingIdentities,
    };
  }

  writeJson(outPath, extra = {}) {
    const payload = {
      executedAt: new Date().toISOString(),
      ...this.summary(),
      meta: this.meta,
      scenarios: this.scenarios,
      ...extra,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    return payload;
  }

  finish(outPath, extra = {}) {
    const payload = this.writeJson(outPath, extra);
    const s = payload.counts;
    console.log(
      `[${this.scriptName}] total=${payload.total} PASS=${s.PASS} FAIL=${s.FAIL} BLOCKED=${s.BLOCKED} NOT_EXECUTED=${s.NOT_EXECUTED} N/A=${s.NOT_APPLICABLE} harnessExit=${payload.harnessExit}`,
    );
    if (payload.harnessExit !== 0) process.exitCode = 1;
    return payload;
  }
}

module.exports = { ScenarioReport, STATUSES, validateCounts };
