'use strict';

/**
 * Check whether a resolved capability set includes the given code.
 * Thin wrapper — future ACC enforce path will centralize alias/canonical mapping here.
 */
const hasCapability = (permissions, capabilityCode) => {
    if (!capabilityCode || !Array.isArray(permissions)) {
        return false;
    }
    return permissions.includes(capabilityCode);
};

module.exports = { hasCapability };
