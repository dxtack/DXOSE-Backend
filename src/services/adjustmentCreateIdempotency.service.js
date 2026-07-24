'use strict';

/** In-process create idempotency — no schema persistence; survives concurrent duplicate requests only. */
const TTL_MS = 10 * 60 * 1000;

/** @type {Map<string, { documentId: string, expiresAt: number }>} */
const completed = new Map();

/** @type {Map<string, Promise<{ replay: boolean, documentId: string }>>} */
const inflight = new Map();

function makeKey(tenantId, userId, clientRequestKey) {
    return `${tenantId}:${userId}:${String(clientRequestKey).trim()}`;
}

function purgeExpired() {
    const now = Date.now();
    for (const [key, entry] of completed.entries()) {
        if (entry.expiresAt <= now) {
            completed.delete(key);
        }
    }
}

/**
 * @param {string} tenantId
 * @param {string} userId
 * @param {string} clientRequestKey
 * @param {() => Promise<{ id: string }>} factory
 * @returns {Promise<{ replay: boolean, document: object }>}
 */
async function runIdempotentAdjustmentCreate(tenantId, userId, clientRequestKey, factory) {
    const keyRaw = String(clientRequestKey ?? '').trim();
    if (!keyRaw) {
        const document = await factory();
        return { replay: false, document };
    }

    purgeExpired();
    const key = makeKey(tenantId, userId, keyRaw);

    const cached = completed.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return { replay: true, documentId: cached.documentId };
    }

    const pending = inflight.get(key);
    if (pending) {
        const result = await pending;
        return result;
    }

    const promise = (async () => {
        try {
            const document = await factory();
            completed.set(key, { documentId: document.id, expiresAt: Date.now() + TTL_MS });
            return { replay: false, document };
        } finally {
            inflight.delete(key);
        }
    })();

    inflight.set(key, promise);
    return promise;
}

/** Test-only reset. */
function _resetAdjustmentCreateIdempotencyForTests() {
    completed.clear();
    inflight.clear();
}

module.exports = {
    runIdempotentAdjustmentCreate,
    _resetAdjustmentCreateIdempotencyForTests,
};
