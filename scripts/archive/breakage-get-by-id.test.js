'use strict';

/**
 * getBreakageById must resolve media enrichment before returning (status contract for submit/approval).
 * Run: node --test scripts/breakage-get-by-id.test.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const breakageService = require('../src/services/breakage.service');
const { FIXTURE_TAG } = require('./lib/phase5-timeline-fixture.helpers');

const prisma = new PrismaClient();

test('getBreakageById returns resolved document with status (not a Promise)', async () => {
    const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    assert.ok(tenant);
    const doc = await prisma.movementDocument.findFirst({
        where: { tenantId: tenant.id, movementType: 'BREAKAGE', notes: FIXTURE_TAG },
        orderBy: { createdAt: 'desc' },
    });
    assert.ok(doc, 'breakage fixture required');
    const member = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        include: { user: true, role: true },
    });
    const user = { ...member.user, role: member.role.code, permissions: ['BREAKAGE_MANAGE'] };
    const loaded = await breakageService.getBreakageById(doc.id, tenant.id, user);
    assert.equal(typeof loaded.status, 'string');
    assert.ok(loaded.status.length > 0);
    assert.notEqual(String(Object.prototype.toString.call(loaded)), '[object Promise]');
    assert.ok('photoUrl' in loaded || loaded.photoUrl === null);
    assert.ok(Array.isArray(loaded.attachments) || loaded.attachments == null);
    assert.ok(Array.isArray(loaded.lines));
});

test('submitBreakage receives Draft userFacingState when status is DRAFT', async () => {
    const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    assert.ok(tenant);
    const draft = await prisma.movementDocument.findFirst({
        where: { tenantId: tenant.id, movementType: 'BREAKAGE', status: 'DRAFT' },
        orderBy: { createdAt: 'desc' },
    });
    if (!draft) {
        test.skip('no draft breakage in tenant');
        return;
    }
    const member = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        include: { user: true, role: true },
    });
    const user = { ...member.user, role: member.role.code, permissions: ['BREAKAGE_MANAGE'] };
    const loaded = await breakageService.getBreakageById(draft.id, tenant.id, user);
    assert.equal(loaded.status, 'DRAFT');
    assert.equal(loaded.userFacingState, 'Draft');
});
