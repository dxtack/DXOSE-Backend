'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createDisposableScopeFixture } = require('../../harness/disposable-scope-fixture');
const { cleanupScopeFixture } = require('../../harness/cleanup-scope-fixture');

function assertForbidden(label, promise) {
    return promise.then(
        () => {
            assert.fail(`${label} should have been rejected with 403`);
        },
        (err) => {
            assert.equal(err.statusCode, 403, `${label} should return statusCode 403`);
        },
    );
}

test('ACC assignment department scope — property/dept junctions restrict locations', async () => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let fixture;

    try {
        fixture = await createDisposableScopeFixture(prisma, runContext);

        const assignment = await prisma.urUserAssignment.findUnique({
            where: { id: fixture.assignmentId },
            include: {
                properties: true,
                departments: true,
            },
        });
        assert.ok(assignment, 'assignment must exist');
        assert.equal(assignment.isActive, true, 'assignment must be active');
        assert.equal(assignment.properties.length, 1, 'exactly one property junction');
        assert.equal(assignment.properties[0].propertyId, fixture.tenantAId, 'property junction must point to tenant A');
        assert.equal(assignment.departments.length, 1, 'exactly one department junction');
        assert.equal(assignment.departments[0].departmentId, fixture.departmentAId, 'department junction must point to department A');
        assert.ok(
            !assignment.notes || !assignment.notes.startsWith('legacy:'),
            'must not use legacy notes assignment path',
        );

        const deptBJunction = await prisma.urAssignmentDepartment.findFirst({
            where: { assignmentId: fixture.assignmentId, departmentId: fixture.departmentBId },
        });
        assert.equal(deptBJunction, null, 'must not have department B junction');

        const deptXJunction = await prisma.urAssignmentDepartment.findFirst({
            where: { assignmentId: fixture.assignmentId, departmentId: fixture.departmentXId },
        });
        assert.equal(deptXJunction, null, 'must not have department X junction');

        const [locA, locB, locX] = await Promise.all([
            prisma.location.findUnique({ where: { id: fixture.locationAId } }),
            prisma.location.findUnique({ where: { id: fixture.locationBId } }),
            prisma.location.findUnique({ where: { id: fixture.locationXId } }),
        ]);
        assert.equal(locA.tenantId, fixture.tenantAId);
        assert.equal(locA.departmentId, fixture.departmentAId);
        assert.equal(locB.tenantId, fixture.tenantAId);
        assert.equal(locB.departmentId, fixture.departmentBId);
        assert.equal(locX.tenantId, fixture.tenantXId);
        assert.equal(locX.departmentId, fixture.departmentXId);

        const {
            resolveUserScope,
            assertLocationInScope,
            assertDepartmentInScope,
            locationLookupScopeWhere,
            mergeScopeIntoWhere,
            SCOPE_SOURCE,
        } = require('../../../src/services/scope/scope.service');

        const scope = await resolveUserScope(
            { id: fixture.userId, role: fixture.roleCode },
            fixture.tenantAId,
        );

        assert.ok(scope && typeof scope === 'object', 'scope must be an object');
        assert.equal(scope.scopeSource, SCOPE_SOURCE.UR_ASSIGNMENT, 'scope must come from UR assignment');
        assert.equal(scope.isTenantWide, false);
        assert.equal(scope.canViewAllDepartments, false);
        assert.equal(scope.canViewAllLocations, false);
        assert.equal(scope.departmentId, fixture.departmentAId);
        assert.ok(Array.isArray(scope.allowedLocationIds), 'allowedLocationIds must be an array');
        assert.ok(scope.allowedLocationIds.includes(fixture.locationAId), 'scope must include location A');
        assert.ok(!scope.allowedLocationIds.includes(fixture.locationBId), 'scope must exclude location B');
        assert.ok(!scope.allowedLocationIds.includes(fixture.locationXId), 'scope must exclude cross-tenant location X');

        const scopeOutputIds = [
            scope.departmentId,
            ...(scope.allowedLocationIds || []),
        ].filter(Boolean);
        for (const id of scopeOutputIds) {
            assert.notEqual(id, fixture.tenantXId, 'scope output must not contain tenant X id');
            assert.notEqual(id, fixture.departmentXId, 'scope output must not contain department X id');
            assert.notEqual(id, fixture.locationXId, 'scope output must not contain location X id');
        }

        await assertLocationInScope(fixture.locationAId, fixture.tenantAId, scope);
        await assertForbidden(
            'assertLocationInScope location B',
            assertLocationInScope(fixture.locationBId, fixture.tenantAId, scope),
        );
        await assertLocationInScope(fixture.locationXId, fixture.tenantAId, scope).then(
            () => assert.fail('assertLocationInScope location X cross-tenant should reject'),
            (err) => {
                assert.ok(
                    err.statusCode === 403 || err.statusCode === 404,
                    'cross-tenant location must not be allowed (403 or 404)',
                );
            },
        );

        await assertDepartmentInScope(fixture.departmentAId, fixture.tenantAId, scope);
        await assertForbidden(
            'assertDepartmentInScope department B',
            assertDepartmentInScope(fixture.departmentBId, fixture.tenantAId, scope),
        );

        const where = mergeScopeIntoWhere(
            {
                tenantId: fixture.tenantAId,
                id: { in: [fixture.locationAId, fixture.locationBId, fixture.locationXId] },
            },
            locationLookupScopeWhere(scope),
        );

        const visible = await prisma.location.findMany({
            where,
            select: { id: true },
            orderBy: { id: 'asc' },
        });

        assert.deepEqual(
            visible.map((row) => row.id),
            [fixture.locationAId],
            'Prisma filtered visible locations must be location A only',
        );
    } finally {
        try {
            if (fixture) {
                await cleanupScopeFixture(prisma, { runContext, fixture });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});
