const DEFAULT_UNITS = [
    ['Piece', 'pcs'],
    ['Unit', 'unit'],
    ['Dozen', 'dz'],
    ['Set', 'set'],
    ['Pair', 'pair'],
    ['Kilogram', 'kg'],
    ['Gram', 'g'],
    ['Liter', 'ltr'],
    ['Milliliter', 'ml'],
    ['Bottle', 'btl'],
    ['Can', 'can'],
    ['Carton', 'ctn'],
    ['Box', 'box'],
    ['Pack', 'pk'],
    ['Tray', 'try'],
    ['Bag', 'bag'],
    ['Gallon', 'gal'],
    ['Roll', 'roll'],
    ['Bucket', 'bkt'],
    ['Jerrycan', 'jcn'],
    ['Meter', 'm'],
    ['Square Meter', 'm2'],
    ['Sheet', 'sht'],
    ['Box 100pcs', 'bx100'],
    ['Person/Pax', 'pax'],
];

/** Only these seeded unit names stay Active by default. */
const ACTIVE_DEFAULT_UNIT_NAMES = new Set(['Piece', 'Unit']);

const isDefaultUnitActive = (name) => ACTIVE_DEFAULT_UNIT_NAMES.has(name);

const seedDefaultUnitsForTenant = async (tx, tenantId) => {
    for (const [name, abbreviation] of DEFAULT_UNITS) {
        const isActive = isDefaultUnitActive(name);
        await tx.unit.upsert({
            where: {
                tenantId_name: {
                    tenantId,
                    name,
                },
            },
            // Status-only on update — preserve abbreviation / description / ids.
            update: {
                isActive,
            },
            create: {
                tenantId,
                name,
                abbreviation,
                isActive,
            },
        });
    }
};

module.exports = {
    DEFAULT_UNITS,
    ACTIVE_DEFAULT_UNIT_NAMES,
    isDefaultUnitActive,
    seedDefaultUnitsForTenant,
};
