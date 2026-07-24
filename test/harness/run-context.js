'use strict';

const crypto = require('crypto');

/**
 * Unique identifiers for a single integration test run.
 */
function createRunContext() {
    const stamp = Date.now();
    const suffix = crypto.randomBytes(3).toString('hex');
    const runId = `${stamp}-${suffix}`;
    const tenantSlug = `it-${stamp}-${suffix}`;
    const emailDomain = 'it.local';

    return Object.freeze({
        runId,
        tenantSlug,
        emailDomain,
        integrationEmail(localPart) {
            return `${localPart}-${runId}@${emailDomain}`;
        },
    });
}

module.exports = { createRunContext };
