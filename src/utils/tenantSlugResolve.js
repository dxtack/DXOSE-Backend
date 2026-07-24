/**
 * Resolve tenant by slug with case-insensitive match and common legacy variants
 * (Rotana_1 vs rotana-1 vs rotana_1).
 */
function slugVariants(raw) {
    const base = String(raw ?? '').trim();
    if (!base) return [];

    const lower = base.toLowerCase();
    const set = new Set([base, lower]);

    const underscore = lower.replace(/-/g, '_');
    const hyphen = lower.replace(/_/g, '-');
    set.add(underscore);
    set.add(hyphen);

    // Title-ish legacy: rotana_1 -> Rotana_1
    const title = lower.replace(/(^|[-_])([a-z])/g, (_, sep, c) => `${sep}${c.toUpperCase()}`);
    set.add(title);

    return [...set].filter(Boolean);
}

async function findActiveTenantBySlug(db, rawSlug) {
    const variants = slugVariants(rawSlug);
    for (const candidate of variants) {
        const hit = await db.tenant.findFirst({
            where: {
                slug: { equals: candidate, mode: 'insensitive' },
                isActive: true,
            },
            select: { id: true, slug: true, name: true, parentId: true, subStatus: true, timezone: true },
        });
        if (hit) {
            return hit;
        }
    }
    return null;
}

module.exports = { slugVariants, findActiveTenantBySlug };
