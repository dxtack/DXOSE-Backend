-- Bootstrap OPEN period registry rows for existing tenants (Ch.6.2 — explicit registry)
INSERT INTO "period_closes" ("id", "tenantId", "year", "month", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."id", EXTRACT(YEAR FROM CURRENT_DATE)::int, gs.m, 'OPEN'::"PeriodCloseStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" t
CROSS JOIN generate_series(1, 12) AS gs(m)
ON CONFLICT ("tenantId", "year", "month") DO NOTHING;
