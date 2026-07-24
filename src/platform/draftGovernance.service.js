'use strict';

const { PrismaClient } = require('@prisma/client');
const { generateDocNumber, DocPrefix } = require('../services/docNumbering.service');
const { assertConcurrencyVersion, bumpConcurrencyUpdate } = require('./concurrency.service');
const { assertAttachmentMutable } = require('./attachmentGovernance.service');
const { hasPermission } = require('../middleware/authorize');

const prisma = new PrismaClient();

/** Ch.7.9 — default draft retention (days). */
const DEFAULT_DRAFT_RETENTION_DAYS = 30;

/** Ch.7.9 — platform expiration action for stale server drafts. */
const DRAFT_EXPIRATION_ACTION = 'DELETE';

/**
 * Ch.7.4 — ownership transfer is denied unless admin override (SETTINGS_MANAGE).
 * Constitution permits transfer only when platform policy allows it.
 */
const DRAFT_OWNERSHIP_TRANSFER_PERMITTED = false;

const EDITABLE_GRN = new Set(['DRAFT']);

const DRAFT_FAMILIES = ['grn', 'transfer', 'getPass', 'breakage'];

const DRAFT_OWNER_FIELD = {
    grn: 'importedBy',
    transfer: 'requestedBy',
    getPass: 'createdBy',
    breakage: 'createdBy',
};

const FAMILY_MANAGE_PERMISSION = {
    grn: 'GRN_MANAGE',
    transfer: 'TRANSFER_CREATE',
    getPass: 'GET_PASS_CREATE',
    breakage: 'BREAKAGE_CREATE',
};

function draftAccessDeniedError() {
    return Object.assign(new Error('You do not have permission to edit this draft.'), {
        status: 403,
        code: 'DRAFT_ACCESS_DENIED',
    });
}

function draftOwnerInactiveError() {
    return Object.assign(
        new Error('Draft owner is inactive. An administrator must recover or reassign this draft.'),
        { status: 423, code: 'DRAFT_OWNER_INACTIVE' },
    );
}

function draftOwnershipTransferDeniedError() {
    return Object.assign(new Error('Draft ownership transfer is not permitted by platform policy.'), {
        status: 403,
        code: 'DRAFT_OWNERSHIP_TRANSFER_DENIED',
    });
}

function draftRecoveryValidationError(details) {
    return Object.assign(new Error('Recovered draft failed current validation.'), {
        status: 422,
        code: 'DRAFT_RECOVERY_VALIDATION_FAILED',
        details,
    });
}

function resolveDraftOwnerId(doc, family) {
    const field = DRAFT_OWNER_FIELD[family];
    if (!field || !doc) return null;
    return doc[field] ?? null;
}

function assertDraftFamily(family) {
    if (!DRAFT_FAMILIES.includes(family)) {
        throw Object.assign(new Error(`Unknown draft family: ${family}`), { status: 400 });
    }
}

/**
 * Ch.7.4 — draft owner is the creating user field on each governed document family.
 */
function getDraftOwnerPolicy() {
    return {
        ownerFields: { ...DRAFT_OWNER_FIELD },
        ownershipTransferPermitted: DRAFT_OWNERSHIP_TRANSFER_PERMITTED,
        inactiveOwnerHandling: 'BLOCK_EDIT_UNLESS_ADMIN',
        accessRule: 'OWNER_OR_FAMILY_MANAGE_PERMISSION',
    };
}

function userHasFamilyManagePermission(user, family) {
    const permission = FAMILY_MANAGE_PERMISSION[family];
    return permission ? hasPermission(user, permission) : false;
}

function userHasAdminDraftOverride(user) {
    return hasPermission(user, 'SETTINGS_MANAGE') || hasPermission(user, 'HOTEL_USERS_MANAGE');
}

/**
 * Ch.7.4 — enforce who may open/edit server drafts.
 */
async function assertDraftEditable({ doc, family, user, allowAdminOverride = true }) {
    assertDraftFamily(family);
    const ownerId = resolveDraftOwnerId(doc, family);
    if (!ownerId) throw draftAccessDeniedError();

    const isOwner = ownerId === user.id;
    const hasManage = userHasFamilyManagePermission(user, family);
    const hasAdmin = allowAdminOverride && userHasAdminDraftOverride(user);

    if (!isOwner && !hasManage && !hasAdmin) {
        throw draftAccessDeniedError();
    }

    await assertDraftOwnerActive({ ownerId, tenantId: doc.tenantId, user, allowAdminOverride });
    return { ownerId, isOwner, hasManage, hasAdmin };
}

/**
 * Ch.7.4 — block edits when draft owner is deactivated unless admin override.
 */
async function assertDraftOwnerActive({ ownerId, tenantId, user, allowAdminOverride = true }) {
    const owner = await prisma.user.findFirst({
        where: { id: ownerId, memberships: { some: { tenantId } } },
        select: { id: true, isActive: true },
    });
    if (!owner) throw draftAccessDeniedError();
    if (owner.isActive) return owner;

    const hasAdmin = allowAdminOverride && userHasAdminDraftOverride(user);
    if (hasAdmin) return owner;
    throw draftOwnerInactiveError();
}

/**
 * Ch.7.4 — governed ownership transfer (denied by default).
 */
async function transferDraftOwnership({
    family,
    documentId,
    tenantId,
    toUserId,
    actor,
}) {
    assertDraftFamily(family);
    const hasAdmin = userHasAdminDraftOverride(actor);
    if (!DRAFT_OWNERSHIP_TRANSFER_PERMITTED && !hasAdmin) {
        throw draftOwnershipTransferDeniedError();
    }

    const doc = await _loadDraftDocument(family, documentId, tenantId);
    if (!doc || doc.status !== 'DRAFT') {
        throw Object.assign(new Error('Only DRAFT documents can transfer ownership.'), { status: 422 });
    }

    await assertDraftEditable({ doc, family, user: actor });

    const ownerField = DRAFT_OWNER_FIELD[family];
    const targetUser = await prisma.user.findFirst({
        where: { id: toUserId, isActive: true, memberships: { some: { tenantId } } },
        select: { id: true },
    });
    if (!targetUser) {
        throw Object.assign(new Error('Target user not found or inactive.'), { status: 422 });
    }

    return _updateDraftOwner(family, documentId, tenantId, ownerField, toUserId);
}

/**
 * Ch.7.8 — recovered drafts must pass current header validation before continue/submit.
 */
function validateRecoveredDraft(doc, family) {
    assertDraftFamily(family);
    const issues = [];

    if (family === 'grn') {
        if (!doc.locationId) issues.push('locationId');
        if (!doc.receivingDate) issues.push('receivingDate');
    }
    if (family === 'transfer') {
        if (!doc.sourceLocationId) issues.push('sourceLocationId');
        if (!doc.destLocationId) issues.push('destLocationId');
    }
    if (family === 'getPass') {
        if (!doc.borrowingEntity?.trim()) issues.push('borrowingEntity');
        if (!doc.transferType) issues.push('transferType');
    }
    if (family === 'breakage') {
        if (!doc.reason?.trim()) issues.push('reason');
        if (!doc.department?.trim()) issues.push('department');
    }

    if (issues.length) {
        throw draftRecoveryValidationError(issues);
    }
    return true;
}

/**
 * Ch.7.9 — per-family draft registry query surface.
 */
async function listFamilyDrafts(tenantId, family, { ownerId } = {}) {
    assertDraftFamily(family);
    const retentionCutoff = _retentionCutoffDate();

    if (family === 'grn') {
        const rows = await prisma.grnImport.findMany({
            where: {
                tenantId,
                status: 'DRAFT',
                ...(ownerId ? { importedBy: ownerId } : {}),
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                grnNumber: true,
                importedBy: true,
                createdAt: true,
                updatedAt: true,
                status: true,
                concurrencyVersion: true,
                notes: true,
                pdfAttachmentUrl: true,
                _count: { select: { lines: true } },
            },
        });
        return rows.map((r) => {
            const hasInvoice = Boolean(r.pdfAttachmentUrl && String(r.pdfAttachmentUrl).trim());
            const hasNotes = Boolean(r.notes && String(r.notes).trim());
            const lineCount = r._count?.lines ?? 0;
            // Vendor/location/date/invoice# alone are not resume-worthy.
            const hasMeaningfulWork = lineCount > 0 || hasInvoice || hasNotes;
            return {
                family,
                documentId: r.id,
                documentNo: r.grnNumber,
                ownerId: r.importedBy,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                status: r.status,
                concurrencyVersion: r.concurrencyVersion,
                expiresAfter: _expiresAfter(r.updatedAt),
                pastRetention: r.updatedAt < retentionCutoff,
                lineCount,
                hasMeaningfulWork,
            };
        });
    }

    if (family === 'transfer') {
        const rows = await prisma.storeTransfer.findMany({
            where: {
                tenantId,
                status: 'DRAFT',
                ...(ownerId ? { requestedBy: ownerId } : {}),
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                transferNo: true,
                requestedBy: true,
                createdAt: true,
                updatedAt: true,
                status: true,
            },
        });
        return rows.map((r) => ({
            family,
            documentId: r.id,
            documentNo: r.transferNo,
            ownerId: r.requestedBy,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            status: r.status,
            expiresAfter: _expiresAfter(r.updatedAt),
            pastRetention: r.updatedAt < retentionCutoff,
        }));
    }

    if (family === 'getPass') {
        const rows = await prisma.getPass.findMany({
            where: {
                tenantId,
                status: 'DRAFT',
                ...(ownerId ? { createdBy: ownerId } : {}),
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                passNo: true,
                createdBy: true,
                createdAt: true,
                updatedAt: true,
                status: true,
            },
        });
        return rows.map((r) => ({
            family,
            documentId: r.id,
            documentNo: r.passNo,
            ownerId: r.createdBy,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            status: r.status,
            expiresAfter: _expiresAfter(r.updatedAt),
            pastRetention: r.updatedAt < retentionCutoff,
        }));
    }

    const rows = await prisma.movementDocument.findMany({
        where: {
            tenantId,
            status: 'DRAFT',
            movementType: { in: ['BREAKAGE', 'LOST'] },
            ...(ownerId ? { createdBy: ownerId } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true,
            documentNo: true,
            createdBy: true,
            createdAt: true,
            updatedAt: true,
            status: true,
            movementType: true,
        },
    });
    return rows.map((r) => ({
        family: 'breakage',
        documentId: r.id,
        documentNo: r.documentNo,
        ownerId: r.createdBy,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        status: r.status,
        movementType: r.movementType,
        expiresAfter: _expiresAfter(r.updatedAt),
        pastRetention: r.updatedAt < retentionCutoff,
    }));
}

/**
 * Ch.7.9 — expire stale server drafts past default retention.
 */
async function expireStaleDrafts(tenantId) {
    const cutoff = _retentionCutoffDate();
    const summary = { grn: 0, transfer: 0, getPass: 0, breakage: 0 };

    if (DRAFT_EXPIRATION_ACTION !== 'DELETE') {
        return { action: DRAFT_EXPIRATION_ACTION, summary, cutoff };
    }

    const grnResult = await prisma.grnImport.deleteMany({
        where: { tenantId, status: 'DRAFT', updatedAt: { lt: cutoff } },
    });
    summary.grn = grnResult.count;

    const transferResult = await prisma.storeTransfer.deleteMany({
        where: { tenantId, status: 'DRAFT', updatedAt: { lt: cutoff } },
    });
    summary.transfer = transferResult.count;

    const getPassResult = await prisma.getPass.deleteMany({
        where: { tenantId, status: 'DRAFT', updatedAt: { lt: cutoff } },
    });
    summary.getPass = getPassResult.count;

    const breakageResult = await prisma.movementDocument.deleteMany({
        where: {
            tenantId,
            status: 'DRAFT',
            movementType: { in: ['BREAKAGE', 'LOST'] },
            updatedAt: { lt: cutoff },
        },
    });
    summary.breakage = breakageResult.count;

    return { action: DRAFT_EXPIRATION_ACTION, summary, cutoff, retentionDays: DEFAULT_DRAFT_RETENTION_DAYS };
}

function getDraftRetentionPolicy() {
    return {
        retentionDays: DEFAULT_DRAFT_RETENTION_DAYS,
        expirationAction: DRAFT_EXPIRATION_ACTION,
        families: [...DRAFT_FAMILIES],
    };
}

/**
 * Server GRN draft create (Ch.7 continuity).
 * Same minimum as official createGrn: supplier + ≥1 line — no empty shells, no wasted grnNumber.
 */
async function createGrnServerDraft({
    tenantId,
    userId,
    supplierId,
    locationId,
    receivingDate,
    notes,
    lines,
}) {
    if (!supplierId) {
        throw Object.assign(
            new Error('Supplier is required. Server GRN drafts cannot be created without a supplier and at least one line.'),
            { status: 400, statusCode: 400, code: 'GRN_DRAFT_SUPPLIER_REQUIRED' },
        );
    }
    if (!Array.isArray(lines) || lines.length === 0) {
        throw Object.assign(
            new Error('At least one line item is required. Server GRN drafts cannot be created empty.'),
            { status: 400, statusCode: 400, code: 'GRN_DRAFT_LINES_REQUIRED' },
        );
    }

    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) {
        throw Object.assign(new Error('Supplier not found. Make sure the supplier exists in the system first.'), {
            status: 404,
            statusCode: 404,
        });
    }

    const resolvedLocationId = locationId || (await _defaultLocationId(tenantId));
    const location = await prisma.location.findFirst({
        where: { id: resolvedLocationId, tenantId },
        select: { id: true },
    });
    if (!location) {
        throw Object.assign(new Error('Warehouse/Location not found.'), { status: 404, statusCode: 404 });
    }

    const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
    if (itemIds.length !== lines.length) {
        throw Object.assign(new Error('Each draft line requires an itemId.'), {
            status: 400,
            statusCode: 400,
            code: 'GRN_DRAFT_LINE_ITEM_REQUIRED',
        });
    }
    const foundItems = await prisma.item.findMany({
        where: { id: { in: itemIds }, tenantId },
        select: { id: true, name: true, barcode: true },
    });
    const foundIds = new Set(foundItems.map((i) => i.id));
    const missing = itemIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
        throw Object.assign(new Error(`${missing.length} item(s) not found in Item Master. Add them first.`), {
            status: 422,
            statusCode: 422,
            details: missing,
        });
    }
    const invalidQty = lines.filter((l) => !(Number(l.receivedQty) > 0));
    if (invalidQty.length) {
        throw Object.assign(new Error('All received quantities must be greater than zero.'), {
            status: 400,
            statusCode: 400,
        });
    }
    const itemMap = Object.fromEntries(foundItems.map((i) => [i.id, i]));

    // Allocate document number only after validation succeeds (no empty-shell consumption).
    const systemNumber = await generateDocNumber(tenantId, DocPrefix.RECEIVE, receivingDate || new Date());
    return prisma.grnImport.create({
        data: {
            tenantId,
            grnNumber: systemNumber,
            supplierInvoiceNumber: null,
            vendorId: supplier.id,
            vendorNameSnapshot: supplier.name,
            locationId: resolvedLocationId,
            receivingDate: receivingDate ? new Date(receivingDate) : new Date(),
            pdfAttachmentUrl: '',
            status: 'DRAFT',
            importedBy: userId,
            notes: notes || null,
            concurrencyVersion: 0,
            lines: {
                create: lines.map((l) => {
                    const received = Number(l.receivedQty);
                    const orderedRaw = l.orderedQty;
                    const ordered =
                        orderedRaw != null && orderedRaw !== '' ? Number(orderedRaw) : received;
                    return {
                        futurelogItemCode: itemMap[l.itemId]?.barcode || l.itemId,
                        futurelogDescription: itemMap[l.itemId]?.name || '',
                        futurelogUom: l.uomId || 'pcs',
                        orderedQty: Number.isFinite(ordered) ? ordered : received,
                        receivedQty: received,
                        unitPrice: Number(l.unitPrice) || 0,
                        internalItemId: l.itemId,
                        internalUomId: l.uomId || null,
                        conversionFactor: 1,
                        qtyInBaseUnit: received,
                        isMapped: true,
                    };
                }),
            },
        },
        include: {
            lines: true,
            vendor: { select: { name: true } },
            location: { select: { name: true } },
        },
    });
}

async function saveGrnDraft(grnId, tenantId, user, payload, expectedVersion) {
    const grn = await prisma.grnImport.findFirst({ where: { id: grnId, tenantId } });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    if (!EDITABLE_GRN.has(grn.status)) {
        throw Object.assign(new Error('Only draft GRNs can be saved.'), { status: 422 });
    }

    await assertDraftEditable({ doc: grn, family: 'grn', user });
    assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
        required: true,
        audit: {
            tenantId,
            entityType: 'GRN',
            entityId: grnId,
            changedBy: user?.id ?? grn.importedBy,
        },
    });

    if (payload.invoiceUrl != null && payload.invoiceUrl !== grn.pdfAttachmentUrl) {
        assertAttachmentMutable(grn.status);
    }

    const supplier = payload.supplierId
        ? await prisma.supplier.findFirst({ where: { id: payload.supplierId, tenantId } })
        : null;

    return prisma.grnImport.update({
        where: { id: grnId },
        data: bumpConcurrencyUpdate({
            vendorId: payload.supplierId || grn.vendorId,
            vendorNameSnapshot: supplier?.name || grn.vendorNameSnapshot,
            locationId: payload.locationId || grn.locationId,
            receivingDate: payload.receivingDate ? new Date(payload.receivingDate) : grn.receivingDate,
            supplierInvoiceNumber: payload.supplierInvoiceNumber ?? grn.supplierInvoiceNumber,
            notes: payload.notes ?? grn.notes,
            pdfAttachmentUrl: payload.invoiceUrl ?? grn.pdfAttachmentUrl,
        }),
    });
}

async function loadGrnDraftForRecovery(grnId, tenantId, user) {
    const grn = await prisma.grnImport.findFirst({ where: { id: grnId, tenantId } });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    if (grn.status !== 'DRAFT') {
        throw Object.assign(new Error('Document is not a recoverable draft.'), { status: 422 });
    }
    await assertDraftEditable({ doc: grn, family: 'grn', user });
    validateRecoveredDraft(grn, 'grn');
    return grn;
}

/**
 * Ch.7.12 — delete a server GRN draft (owner / family-manage / admin).
 */
async function deleteGrnServerDraft(grnId, tenantId, user, expectedVersion) {
    const grn = await prisma.grnImport.findFirst({ where: { id: grnId, tenantId } });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    if (!EDITABLE_GRN.has(grn.status)) {
        throw Object.assign(new Error('Only draft GRNs can be deleted.'), { status: 422 });
    }

    await assertDraftEditable({ doc: grn, family: 'grn', user });
    assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
        required: true,
        audit: {
            tenantId,
            entityType: 'GRN',
            entityId: grnId,
            changedBy: user?.id ?? grn.importedBy,
        },
    });

    await prisma.grnImport.delete({ where: { id: grnId } });
    return { id: grnId, deleted: true };
}

async function _defaultLocationId(tenantId) {
    const loc = await prisma.location.findFirst({ where: { tenantId, isActive: true }, select: { id: true } });
    if (!loc) throw Object.assign(new Error('No active warehouse found.'), { status: 422 });
    return loc.id;
}

async function _loadDraftDocument(family, documentId, tenantId) {
    if (family === 'grn') {
        return prisma.grnImport.findFirst({ where: { id: documentId, tenantId } });
    }
    if (family === 'transfer') {
        return prisma.storeTransfer.findFirst({ where: { id: documentId, tenantId } });
    }
    if (family === 'getPass') {
        return prisma.getPass.findFirst({ where: { id: documentId, tenantId } });
    }
    return prisma.movementDocument.findFirst({
        where: { id: documentId, tenantId, movementType: { in: ['BREAKAGE', 'LOST'] } },
    });
}

async function _updateDraftOwner(family, documentId, tenantId, ownerField, toUserId) {
    if (family === 'grn') {
        return prisma.grnImport.update({
            where: { id: documentId },
            data: { [ownerField]: toUserId },
        });
    }
    if (family === 'transfer') {
        return prisma.storeTransfer.update({
            where: { id: documentId },
            data: { [ownerField]: toUserId },
        });
    }
    if (family === 'getPass') {
        return prisma.getPass.update({
            where: { id: documentId },
            data: { [ownerField]: toUserId },
        });
    }
    return prisma.movementDocument.update({
        where: { id: documentId },
        data: { [ownerField]: toUserId },
    });
}

function _retentionCutoffDate() {
    const d = new Date();
    d.setDate(d.getDate() - DEFAULT_DRAFT_RETENTION_DAYS);
    return d;
}

function _expiresAfter(updatedAt) {
    const d = new Date(updatedAt);
    d.setDate(d.getDate() + DEFAULT_DRAFT_RETENTION_DAYS);
    return d;
}

module.exports = {
    DEFAULT_DRAFT_RETENTION_DAYS,
    DRAFT_EXPIRATION_ACTION,
    DRAFT_OWNERSHIP_TRANSFER_PERMITTED,
    DRAFT_FAMILIES,
    DRAFT_OWNER_FIELD,
    EDITABLE_GRN,
    getDraftOwnerPolicy,
    getDraftRetentionPolicy,
    resolveDraftOwnerId,
    assertDraftEditable,
    assertDraftOwnerActive,
    transferDraftOwnership,
    validateRecoveredDraft,
    listFamilyDrafts,
    expireStaleDrafts,
    createGrnServerDraft,
    saveGrnDraft,
    loadGrnDraftForRecovery,
    deleteGrnServerDraft,
};
