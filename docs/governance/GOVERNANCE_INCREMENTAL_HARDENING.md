# Incremental governance hardening (post–Phase 1 closure)

| Field | Value |
|--------|--------|
| **Purpose** | After stabilization **lock**, reduce **semantic drift** without big-bang refactors. |
| **Constraints** | No UX redesign; no new reporting products; enforcement stays **incremental** and **reversible** unless explicitly promoted to policy. |

Companion: **`PHASE1_STABILIZATION_CLOSURE.md`** (closure scope, CI, readiness).

---

## 1. Note-token adoption strategy

**Goal:** High-signal substrings in `AuditLog.note` remain **grep-stable** and **catalog-aligned** as code changes.

**Mechanism (already started):**

- `OSE-backend/src/services/auditWriter.service.js` exports **`AuditNoteTokens`** — a frozen object of commonly searched substrings (OB import, cancel draft, posting markers, Get Pass approval prefix).

**Adoption rules:**

1. **Touch-only migration:** When a file is already being changed for a bugfix or small task, replace literals with `AuditNoteTokens.*` **only** where a direct mapping exists; do not open domain-wide refactors for their own sake.  
2. **New writes:** Prefer importing `AuditNoteTokens` (or adding a new key there + one line in `AUDIT_EVENT_CATALOG.md`) over inventing a new free-form prefix.  
3. **Exceptions:** Free-text remains valid for human-readable suffixes (e.g. reasons, document numbers); the token is the **leading structured key**, not the entire string.  
4. **Catalog sync:** Any new token in code should appear in **`AUDIT_EVENT_CATALOG.md`** (or the relevant domain audit doc) in the same PR.

**Anti-patterns:**

- Blocking PRs on “not every note uses the constant yet.”  
- Enforcing regex validation in production middleware before catalog coverage exists.

---

## 2. Remaining semantic drift risks

| Risk | Why it persists | Mitigation |
|------|-----------------|------------|
| **`entityType` string variety** | Historical and domain-specific strings (`ItemMapping`, `TenantSetting`, `EntityType` constants) coexist | Document in catalog; Phase D optional normalization for **new writes** only |
| **Dual count workflows on `STOCK_COUNT`** | Legacy vs canonical distinguished by **note** / **afterValue** | Keep notes explicit; do not merge semantics without sunset plan (`LEGACY_STOCK_COUNT_SUNSET_PLAN.md`) |
| **Literal notes in large services** | Transfer, posting, inventory, get-pass have many literals | Incremental Touch-only migration (§1) |
| **Invalid action bypass vs Prisma error** | Facade **skips** invalid actions with a log line (different signal than DB rejection) | Runbooks / log alerts for `invalid AuditAction — audit row skipped` |
| **Schema file unreadable at runtime** | Validation skipped; Prisma remains guard | Packaging/deploy reviews ensure `prisma/schema.prisma` present on app host if validation is relied upon |

---

## 3. Future governance enforcement direction

**Near term (recommended):**

- Keep **`governance-smokes`** required on default branch PRs.  
- Add optional **scheduled** workflow (weekly) on main to catch drift if path filters are misconfigured.  
- Staging pipeline: run **one** read-only reconciliation smoke (`DATABASE_URL`) per release candidate for reporting slices already scripted.

**Medium term (policy-gated):**

- **ESLint custom rule** or `eslint-plugin-no-restricted-syntax`: ban `auditLog.create` outside `auditWriter.service.js` (redundant with CI but faster feedback locally).  
- **Stricter note helper** (dev-only or feature-flag): `assertNoteStartsWith(token)` for selected controllers during integration tests only.

**Long term (enterprise policy):**

- **Hard-fail on audit loss** for selected financial transactions — requires product/legal sign-off and idempotent retry design (explicitly **not** Phase 1 default).  
- **Central `entityType` enum** in code + CI check that new writes use catalog values only.

---

## 4. What stays out of this track

- Dashboard or analytics build-out.  
- AI on audit content.  
- Global payload redesign for `AuditLog` JSON columns.  
- Rewriting stabilized workflow state machines for “cleanliness” without a defect driver.

Those belong to **later product phases** and separate charters, not to incremental governance hardening.
