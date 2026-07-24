'use strict';

function userDisplayName(user) {
    if (!user) return null;
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || null;
}

function toIso(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = {
    userDisplayName,
    toIso,
};
