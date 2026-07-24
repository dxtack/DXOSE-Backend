/**
 * Single definition for email lookup keys: must match user creation sanitization
 * (`validators` create user) so login / reset can find the same DB row.
 */
function normalizeEmailForLookup(raw) {
    return String(raw ?? '')
        .trim()
        .replace(/\s+/g, '')
        .toLowerCase();
}

/** Resolve a user row by normalized or legacy mixed-case email. */
async function findUserByEmailForLookup(db, rawEmail) {
    const normalized = normalizeEmailForLookup(rawEmail);
    if (!normalized) {
        return null;
    }

    const exact = await db.user.findUnique({
        where: { email: normalized },
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
    });
    if (exact) {
        return exact;
    }

    return db.user.findFirst({
        where: { email: { equals: normalized, mode: 'insensitive' } },
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
    });
}

module.exports = { normalizeEmailForLookup, findUserByEmailForLookup };
