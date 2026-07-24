'use strict';

function validateActionMatrixBindings(matrix, scenarioIds) {
  const rows = matrix?.actions || [];
  let missingAllowBindingCount = 0;
  let missingDenyBindingCount = 0;
  let unexecutedActionBindingCount = 0;
  const idSet = new Set(scenarioIds);

  for (const row of rows) {
    if (!row.runtimeAllow?.testId) missingAllowBindingCount += 1;
    else if (!idSet.has(row.runtimeAllow.testId)) unexecutedActionBindingCount += 1;
    if (!row.runtimeDeny?.testId) missingDenyBindingCount += 1;
    else if (!idSet.has(row.runtimeDeny.testId)) unexecutedActionBindingCount += 1;
  }
  return { missingAllowBindingCount, missingDenyBindingCount, unexecutedActionBindingCount };
}

function computePhaseClosed(counters) {
  return (
    counters.runtimeFailCount === 0 &&
    counters.browserFailCount === 0 &&
    counters.regressionFailCount === 0 &&
    counters.skippedCount === 0 &&
    counters.vacuousCount === 0 &&
    counters.requestRewriteCount === 0 &&
    counters.missingAllowBindingCount === 0 &&
    counters.missingDenyBindingCount === 0 &&
    counters.unexecutedActionBindingCount === 0 &&
    counters.ledgerFieldMismatchCount === 0 &&
    counters.missingVoidTimelineCount === 0 &&
    counters.unauthorizedVisibleMutationButtonCount === 0 &&
    counters.missingScenarioIdCount === 0 &&
    counters.frontendProductionBuildPass === true
  );
}

module.exports = { validateActionMatrixBindings, computePhaseClosed };
