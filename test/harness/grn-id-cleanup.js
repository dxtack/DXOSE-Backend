'use strict';

async function deleteGrnCascade(prisma, grnIds) {
    const ids = grnIds.filter(Boolean);
    if (!ids.length) return;

    const grns = await prisma.grnImport.findMany({
        where: { id: { in: ids } },
        select: { approvalRequestId: true },
    });
    const approvalIds = [
        ...new Set([
            ...grns.map((row) => row.approvalRequestId).filter(Boolean),
            ...(
                await prisma.approvalRequest.findMany({
                    where: { grnImportId: { in: ids } },
                    select: { id: true },
                })
            ).map((row) => row.id),
        ]),
    ];

    if (approvalIds.length) {
        await prisma.approvalStep.deleteMany({ where: { requestId: { in: approvalIds } } });
        await prisma.approvalRequest.deleteMany({ where: { id: { in: approvalIds } } });
    }

    await prisma.auditLog.deleteMany({
        where: { entityId: { in: ids } },
    });

    await prisma.grnLine.deleteMany({ where: { grnImportId: { in: ids } } });
    await prisma.grnImport.deleteMany({ where: { id: { in: ids } } });
}

module.exports = {
    deleteGrnCascade,
};
