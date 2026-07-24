'use strict';

const APPROVED_CHAIN = Object.freeze([
  'PENDING_DEPT',
  'PENDING_COST_CONTROL',
  'PENDING_FINANCE',
  'PENDING_SECURITY',
]);

function chainMatchesConstitution(orderedStatusKeys) {
  const ordered = (orderedStatusKeys || []).map((k) => String(k || '').toUpperCase()).filter(Boolean);
  return ordered.length === APPROVED_CHAIN.length && ordered.every((k, i) => k === APPROVED_CHAIN[i]);
}

function formatSteps(steps) {
  return (steps || []).map((s) => ({
    stepOrder: s.stepOrder,
    label: s.label,
    roleCode: s.approverRole?.code || null,
    permissionCode: s.permission?.legacyCode || null,
    statusKey: s.statusKey,
    capabilityCode: s.capabilityCode || null,
    autoApprove: s.autoApprove ?? false,
  }));
}

async function buildConfigurationInventory(prisma) {
  const mod = await prisma.accModule.findFirst({ where: { key: 'GET_PASS' } });
  if (!mod) throw new Error('GET_PASS acc module not found');

  const activeTenants = await prisma.tenant.findMany({
    where: { isActive: true, slug: { not: 'platform' } },
    select: { id: true, slug: true, name: true, createdAt: true },
    orderBy: { slug: 'asc' },
  });

  const stepInclude = {
    orderBy: { stepOrder: 'asc' },
    include: {
      approverRole: { select: { code: true, name: true } },
      permission: { select: { legacyCode: true, name: true } },
    },
  };

  const definitions = await prisma.accWorkflowDefinition.findMany({
    where: { moduleId: mod.id },
    include: {
      tenant: { select: { id: true, slug: true, name: true } },
      versions: {
        orderBy: [{ versionNumber: 'desc' }],
        include: { steps: stepInclude },
      },
    },
    orderBy: [{ tenantId: 'asc' }, { key: 'asc' }],
  });

  const documentPins = await prisma.getPass.groupBy({
    by: ['tenantId', 'accWorkflowVersionId', 'status'],
    _count: { _all: true },
    where: { accWorkflowVersionId: { not: null } },
  });

  const versionMeta = new Map();
  for (const def of definitions) {
    for (const ver of def.versions) {
      const orderedStatusKeys = ver.steps.map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean);
      versionMeta.set(ver.id, {
        versionId: ver.id,
        definitionId: def.id,
        definitionKey: def.key,
        definitionTenantId: def.tenantId,
        definitionTenantSlug: def.tenant?.slug || null,
        versionNumber: ver.versionNumber,
        status: ver.status,
        publishedAt: ver.publishedAt,
        publishedById: ver.publishedById,
        notes: ver.notes,
        orderedSteps: formatSteps(ver.steps),
        orderedStatusKeys,
        hasGmStep: orderedStatusKeys.includes('PENDING_GM'),
        matchesConstitution: chainMatchesConstitution(orderedStatusKeys),
      });
    }
  }

  const tenantResolution = [];
  for (const tenant of activeTenants) {
    const published = await prisma.accWorkflowVersion.findFirst({
      where: {
        status: 'PUBLISHED',
        definition: { moduleId: mod.id, isActive: true, OR: [{ tenantId: tenant.id }, { tenantId: null }] },
      },
      orderBy: [{ publishedAt: 'desc' }, { versionNumber: 'desc' }],
      include: {
        definition: { include: { tenant: { select: { slug: true } } } },
        steps: stepInclude,
      },
    });

    const meta = published ? versionMeta.get(published.id) : null;
    const pinsForTenant = documentPins.filter((p) => p.tenantId === tenant.id);
    const pinnedVersionIds = [...new Set(pinsForTenant.map((p) => p.accWorkflowVersionId))];

    tenantResolution.push({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      resolvedPublishedVersionId: published?.id || null,
      resolvedDefinitionKey: published?.definition?.key || null,
      resolvedDefinitionScope: published?.definition?.tenantId ? 'tenant' : 'global',
      resolvedDefinitionTenantSlug: published?.definition?.tenant?.slug || null,
      orderedStatusKeys: meta?.orderedStatusKeys || [],
      matchesConstitution: meta?.matchesConstitution ?? false,
      hasGmStep: meta?.hasGmStep ?? null,
      documentCountByPinnedVersion: pinnedVersionIds.map((vid) => ({
        accWorkflowVersionId: vid,
        ...(versionMeta.get(vid) || { unknownVersion: true }),
        documents: pinsForTenant
          .filter((p) => p.accWorkflowVersionId === vid)
          .map((p) => ({ status: p.status, count: p._count._all })),
        totalDocuments: pinsForTenant
          .filter((p) => p.accWorkflowVersionId === vid)
          .reduce((n, p) => n + p._count._all, 0),
      })),
      totalPinnedDocuments: pinsForTenant.reduce((n, p) => n + p._count._all, 0),
    });
  }

  const formattedDefinitions = definitions.map((def) => ({
    id: def.id,
    key: def.key,
    name: def.name,
    tenantId: def.tenantId,
    tenantSlug: def.tenant?.slug || null,
    scope: def.tenantId ? 'tenant' : 'global',
    isActive: def.isActive,
    versions: def.versions.map((ver) => versionMeta.get(ver.id)),
  }));

  const driftTenants = tenantResolution.filter((t) => !t.matchesConstitution);
  const gmVersions = [...versionMeta.values()].filter((v) => v.hasGmStep);
  const alignedTenants = tenantResolution.filter((t) => t.matchesConstitution);

  return {
    executedAt: new Date().toISOString(),
    approvedConstitutionChain: [...APPROVED_CHAIN],
    module: { id: mod.id, key: mod.key, name: mod.name },
    activeTenantCount: activeTenants.length,
    definitions: formattedDefinitions,
    versionIndex: [...versionMeta.values()],
    tenantResolution,
    summary: {
      definitionCount: definitions.length,
      globalDefinitions: definitions.filter((d) => !d.tenantId).length,
      tenantScopedDefinitions: definitions.filter((d) => d.tenantId).length,
      publishedVersions: [...versionMeta.values()].filter((v) => v.status === 'PUBLISHED').length,
      archivedVersions: [...versionMeta.values()].filter((v) => v.status === 'ARCHIVED').length,
      draftVersions: [...versionMeta.values()].filter((v) => v.status === 'DRAFT').length,
      versionsWithGmStep: gmVersions.length,
      tenantsConstitutionAligned: alignedTenants.length,
      tenantsWithDrift: driftTenants.length,
      totalPinnedDocuments: documentPins.reduce((n, p) => n + p._count._all, 0),
      documentsOnGmVersions: documentPins
        .filter((p) => versionMeta.get(p.accWorkflowVersionId)?.hasGmStep)
        .reduce((n, p) => n + p._count._all, 0),
    },
    driftTenants: driftTenants.map((t) => ({
      tenantSlug: t.tenantSlug,
      resolvedPublishedVersionId: t.resolvedPublishedVersionId,
      orderedStatusKeys: t.orderedStatusKeys,
    })),
  };
}

module.exports = {
  APPROVED_CHAIN,
  chainMatchesConstitution,
  buildConfigurationInventory,
};
