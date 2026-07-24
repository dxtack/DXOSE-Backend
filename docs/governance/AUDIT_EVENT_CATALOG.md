# Audit event catalog — enterprise narrative baseline

| Field | Value |
|--------|--------|
| **Purpose** | Single reference for **`AuditLog.action`**, **`entityType`**, **actor**, and **payload** expectations. Supports **Audit Consolidation Phase** without implying all values are yet enforced in code. |
| **Schema** | `AuditLog` model + `AuditAction` enum in `OSE-backend/prisma/schema.prisma`. |
| **Rule** | New writers MUST use **`AuditAction` enum members only** until enum is extended by migration. Domain-specific verbs belong in **`note`** or structured **`afterValue`** if enum extension is deferred. |

---

## 1. Severity legend

| Level | Meaning |
|-------|--------|
| **P0** | Security / compliance / financial control (who changed inventory or money path). |
| **P1** | Operational reconciliation (posting, approvals, period state). |
| **P2** | Configuration / master data (settings, mappings). |
| **P3** | Convenience / read models. |

---

## 2. Canonical `entityType` values (target convention)

Use **UPPER_SNAKE** for application-owned domains. Align Prisma writes to this set over time.

| `entityType` | Meaning | Primary workflows |
|----------------|---------|-------------------|
| **`USER`** | User account lifecycle | Auth (login/logout), admin user CRUD |
| **`SETTINGS`** | Tenant-level control flags (OB, inventory phase) | OB lock/finalize, inventory status |
| **`TENANT_SETTING`** | Generic key/value tenant settings row | `setSetting` key/value changes |
| **`MOVEMENT`** | Posted inventory document (GRN, adjustment, etc.) | `postDocument` |
| **`STOCK_COUNT`** | Stock count session (legacy + canonical session table) | Inventory count lifecycle, legacy stock count |
| **`STOCK_REPORT`** | Saved stock variance report | Save / (future) submit/approve/post |
| **`PERIOD_CLOSE`** | Fiscal period close record | Close / reopen |
| **`TRANSFER`** | Store transfer | (future) submit/approve/reject/receive |
| **`GET_PASS`** | Internal Get Pass document | Get Pass lifecycle |
| **`ITEM_MAPPING`** / **`UOM_MAPPING`** / **`VENDOR_MAPPING`** | FutureLog integration mappings | Mapping upserts |

**Current deviations:** `TenantSetting`, `ItemMapping`, `UomMapping`, `VendorMapping`. **`GET_PASS`** is now on `EntityType` (Phase A).

---

## 3. `AuditAction` enum — canonical meanings

| Action | Meaning | Typical actor | P0/P1 |
|--------|---------|---------------|-------|
| **`CREATE`** | New entity record | User / import | P1–P2 |
| **`UPDATE`** | Field change without domain-specific verb | User / system | P2 |
| **`DELETE`** | Hard delete or destructive remove | User | P1 |
| **`POST`** | Economic posting to ledger (generic movement) | User (poster) | **P0** |
| **`VOID`** | Void/cancel posted or pre-posted business object | User | P1 |
| **`APPROVE`** | Approval granted | Approver | **P0** |
| **`REJECT`** | Approval denied | Approver | P1 |
| **`IMPORT`** | Data import event | User / job | P2 |
| **`LOGIN`** / **`LOGOUT`** | Session authentication | Self | P0 |
| **`SUBMIT`** | Submitted for approval workflow | Submitter | P1 |
| **`CLOSE_PERIOD`** | Period closed with snapshots | Finance / admin | **P0** |
| **`REOPEN_PERIOD`** | **Fiscal period** reopened only | Finance / admin | **P0** |
| **`LOCK_OB`** | Opening balance import locked | Admin | P0 |
| **`FINALIZE_OB`** | OB finalized; snapshot recorded | Admin | **P0** |
| **`COUNT_APPROVE`** | Count session approval granted | Approver | **P0** |
| **`COUNT_REJECT`** | Count session approval denied | Approver | P1 |

**Governance correction:** Do **not** use **`REOPEN_PERIOD`** for “Opening Balance enabled” — reserve it for **`periodClose.reopenPeriod`** only. OB enable uses **`UPDATE`** on `SETTINGS` with an **`OB_IMPORT_ENABLED`** note prefix (**Phase A implemented**). Optional later: dedicated enum (`OPEN_OB_STAGE`) via migration.

---

## 4. Domain events — required payload fields (target)

### 4.1 All events (minimum)

| Field | Required | Notes |
|--------|----------|--------|
| `tenantId` | Yes | UUID |
| `entityType` | Yes | Catalog §2 |
| `entityId` | Yes | Stable business id (string); prefer session/report/movement id |
| `action` | Yes | Enum §3 |
| `changedBy` | Yes | User id performing the action |
| `changedAt` | Auto | DB default |
| `note` | Recommended | Human-readable one-liner for operators |
| `beforeValue` / `afterValue` | When mutating state | JSON snapshots; keep PII minimal |

### 4.2 Optional operational fields

| Field | When |
|--------|------|
| `ipAddress`, `userAgent` | Security-sensitive: auth, user admin, optional for posting |
| Transactional write (`tx`) | When audit row must commit **with** the same DB transaction as the mutation |

---

## 5. Workflow associations (target matrix)

| Workflow | Lifecycle events (target names) | `entityType` | Importance |
|----------|-----------------------------------|--------------|------------|
| **Auth** | `LOGIN`, `LOGOUT` | `USER` | P0 |
| **User admin** | `CREATE`, `UPDATE` (role change = `UPDATE` + role in after) | `USER` | P0 |
| **Movement posting** | `POST` | `MOVEMENT` | **P0** |
| **Inventory count** | `SUBMIT` (counts + for approval) · `COUNT_APPROVE` · `COUNT_REJECT` · **`POST`** (posting engine) · `VOID` (draft cancel) | `STOCK_COUNT` | **P0** |
| **Legacy stock count** | `SUBMIT` · `COUNT_APPROVE` (per step) · `COUNT_REJECT` · **`POST`** | `STOCK_COUNT` | P1 |
| **Stock report** | `CREATE` (save) · `SUBMIT` · `APPROVE` / `REJECT` · **`POST`** | `STOCK_REPORT` | P1 |
| **Period close** | `CLOSE_PERIOD`, `REOPEN_PERIOD` | `PERIOD_CLOSE` | **P0** |
| **OB / settings** | `LOCK_OB`, `FINALIZE_OB`, `UPDATE` / `CREATE` on tenant setting keys | `SETTINGS` / `TENANT_SETTING` | P0 |
| **Store transfer** | `CREATE` · `SUBMIT` · `APPROVE` (multi-step; `note` distinguishes step vs final) · `REJECT` · `UPDATE` (dispatch) · **`POST`** (receive / ledger) | `TRANSFER` | P1 |
| **Get Pass** | Map workflow verbs to enum + `note` until enum extended | `GET_PASS` | P1 |
| **Mappings** | `CREATE` / `UPDATE` | `*_MAPPING` | P2 |

---

## 6. Before / after expectations (patterns)

| Pattern | `beforeValue` | `afterValue` |
|---------|---------------|--------------|
| **Status transition** | `{ status: prior }` | `{ status: next }` |
| **OB lock** | `{ value: prior }` | `{ value: 'LOCKED', reason }` |
| **Finalize OB** | optional summary ref | `{ snapshotSummary, allowOpeningBalance, ... }` (shape already used in `finalizeOpeningBalance`) |
| **Posting** | optional doc snapshot | `{ documentNo, movementType, postedAt }` subset |
| **Cancel draft count** | `{ status, snapshotAt, postedAt }` | `{ status: 'VOID', ... }` — use **valid** `action` (e.g. **`VOID`** or **`UPDATE`**) per consolidation decision |

---

## 7. Get Pass — domain verbs on `note` (Phase A implemented)

Non-enum workflow verbs were **collapsed** to **`UPDATE`** or **`APPROVE`** with stable **`note`** tokens (no `AuditAction` migration):

| Domain step | `action` | `note` |
|-------------|----------|--------|
| Confirm receipt at destination | `UPDATE` | `GET_PASS_CONFIRM_RECEIPT_DESTINATION` |
| Accept destination department | `UPDATE` | `GET_PASS_ACCEPT_DESTINATION_DEPARTMENT` |
| Security exit approval (checkout) | `APPROVE` | `GET_PASS_APPROVE_PENDING_SECURITY` |
| Dept / cost / finance / GM approval step | `APPROVE` | `GET_PASS_APPROVE_STEP:<STATUS>` |
| Process return (partial) | `UPDATE` | `GET_PASS_PROCESS_RETURN` |
| Manual close | `UPDATE` | `GET_PASS_CLOSE` |

Reverse-logistics steps that already used `UPDATE` + notes (`GET_PASS_SHIP_BACK`, etc.) unchanged.

---

## 8. Importance vs implementation status (honest)

| Event group | Importance | Implementation status |
|-------------|--------------|------------------------|
| Auth / user CRUD | P0 | **Implemented** (M14 path) |
| Period close | P0 | **Implemented** |
| Movement `POST` | P0 | **Implemented** |
| OB finalize | P0 | **Implemented** (trail + enum) |
| OB lock | P0 | **Implemented** |
| OB enable | P0 | **`UPDATE`** + `OB_IMPORT_ENABLED` note — **Phase A** (replaces misleading `REOPEN_PERIOD`) |
| Inventory count cancel | P1 | **`VOID`** persists — **Phase A** (`note` includes `domainVerb=CANCEL_DRAFT`) |
| Inventory count post / approvals | P0 | **Phase C:** `SUBMIT` / `COUNT_APPROVE` / `COUNT_REJECT` / `POST` (see `AUDIT_PHASE_C_SMOKE_RESULTS.md`) |
| Legacy stock count lifecycle | P1 | **Phase C:** submit / approve steps / reject / `POST`; create/update lines/void still light |
| Stock report submit/approve/post | P1 | **Phase C:** `SUBMIT` / `APPROVE` / `REJECT` / `POST` |
| **Store transfer** | P1 | **Transfer slice:** create/submit/approve/reject/dispatch/receive + `POST` on receive (`TRANSFER_AUDIT_*`) |
| Get Pass | P1 | **Phase A:** enum-valid `action` + stable `note` tokens for domain steps |

---

## Related

- `AUDIT_CONSOLIDATION_ANALYSIS.md`  
- `AUDIT_CONSOLIDATION_PLAN.md`  
- `AUDIT_PHASE_A_SMOKE_RESULTS.md`  
- `AUDIT_PHASE_C_SMOKE_RESULTS.md`  
- `TRANSFER_AUDIT_ANALYSIS.md`  
- `TRANSFER_AUDIT_SMOKE_RESULTS.md`  
- `WORKFLOW_MATRIX.md` (if present — cross-check lifecycle names)
