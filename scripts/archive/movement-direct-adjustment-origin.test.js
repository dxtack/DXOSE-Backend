'use strict';

/**
 * createMovementDraft origin contract — mandatory, fail-closed.
 * Run: node --test scripts/movement-direct-adjustment-origin.test.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const movementService = require('../src/services/movement.service');
const { MOVEMENT_DRAFT_ORIGIN_REQUIRED } = require('../src/services/movementDirectAdjustment.guard');

const prisma = new PrismaClient();

test('createMovementDraft throws when origin is omitted', async () => {
    const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    assert.ok(tenant);
    const member = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        include: { user: true },
    });
    assert.ok(member);

    await assert.rejects(
        () => movementService.createMovementDraft(
            { movementType: 'ADJUSTMENT', documentDate: '2026-01-01', lines: [] },
            tenant.id,
            member.userId,
        ),
        (err) => err.code === MOVEMENT_DRAFT_ORIGIN_REQUIRED,
    );
});

test('createMovementDraft accepts INTERNAL origin for non-direct callers', async () => {
    const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    assert.ok(tenant);
    const member = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        include: { user: true },
    });
    assert.ok(member);

    const doc = await movementService.createMovementDraft(
        {
            movementType: 'ADJUSTMENT',
            documentDate: new Date().toISOString().split('T')[0],
            lines: [],
        },
        tenant.id,
        member.userId,
        prisma,
        { origin: 'INTERNAL' },
    );
    assert.equal(doc.movementType, 'ADJUSTMENT');
    assert.equal(doc.status, 'DRAFT');
    await prisma.movementDocument.delete({ where: { id: doc.id } });
});
