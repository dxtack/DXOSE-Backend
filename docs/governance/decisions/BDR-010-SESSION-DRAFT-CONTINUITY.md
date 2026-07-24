# BDR-010 — Session & Draft Continuity Architecture

| Field | Value |
|-------|-------|
| **Status** | **Draft — Pending Ratification** |
| **Delivery exception** | **Out of current pre-sale delivery** — see [EX-BDR-010-DELIVERY-OUT-OF-SCOPE.md](EX-BDR-010-DELIVERY-OUT-OF-SCOPE.md) (2026-07-17). Do not open new continuity phases in this batch. |
| **Date** | 2026-07-12 |
| **Decision owners** | Platform Architecture / Product Governance |
| **Constitution impact** | New **Chapter 30** (Session Continuity); extensions to **Chapter 7** (§7.12–7.13) and **Chapter 14** (§14.10) |
| **Related requirements** | 7.10-05, 7.12-*, 7.13-*, 14.10-*, 30.1-* through 30.7-*, **30.6-02 (REQ-SESSION-RECOVERY-001)** |
| **Operational defaults** | `OSE-backend/docs/governance/config/continuity-policy-defaults.json` |
| **Supersedes** | None |
| **Depends on** | Ch.7 Draft Governance, Ch.8 Concurrency, Ch.14 Attachments, Ch.17 Keyboard (lookup close rules) |

---

## 1. Context

Users working on long operational forms (e.g. GRN Create) experienced **session token expiry** mid-task. The platform already has:

- Reactive token refresh on `401 TOKEN_EXPIRED` (`auth.interceptor.ts`, single-flight).
- Partial server draft governance (`draftGovernance.service.js`, `/constitution/grn/draft`).
- Frontend draft helpers (`DraftRecoveryService`, `DraftAutoSaveService`, `DocumentDraftStateService`) **not fully wired** to GRN Create.

Proactive session continuity and a unified draft layer are required **before** generalizing auto-save across all long forms.

---

## 2. Decision

Ratify a **four-layer continuity model** with strict separation of concerns and a phased rollout starting with GRN.

### 2.1 Session Manager — separation of concerns

| Component | Responsibility | SHALL NOT |
|-----------|----------------|-----------|
| **AuthService** | Login, logout, token storage, `refresh()` execution, JWT payload decode | Schedule refresh, idle detection, return-URL recovery |
| **SessionManager** | JWT `exp` monitoring, proactive refresh scheduling, user-activity / idle tracking, session-end UX, `returnUrl` capture, coordination with `DocumentDraftStateService.flushBeforeSessionEnd()` | Perform login UI or own HTTP retry logic |
| **HTTP Interceptor** | Attach credentials; on `401` with `TOKEN_EXPIRED` or `PERMISSIONS_STALE`, invoke single-flight refresh and **retry the failed request once** | Act as the primary refresh mechanism |

**Rationale:** Prevents `AuthService` bloat; proactive refresh must not depend on failed API calls.

### 2.2 Proactive refresh policy

- Read access-token `exp` after login and every successful refresh.
- Schedule refresh before `exp` using a **configurable safety margin** (see §2.9 Operational defaults).
- Run scheduled refresh **only while the session is Active** (see idle policy).
- On refresh failure: end session gracefully (§2.4).

**Token defaults (current release):** access token ~15 minutes; refresh token ~7 days (`jwt.js`).

### 2.3 Idle detection policy

**Active signals:** mouse, keyboard, touch, scroll, and in-app navigation (router events).

**Idle threshold:** **configurable** via approved platform configuration (see §2.9).

| State | Proactive refresh | On next active signal |
|-------|-------------------|------------------------|
| **Active** | Scheduled per §2.2 | N/A |
| **Idle** | **Suspended** | If refresh token valid → refresh then resume; else → re-login flow |

**Rationale:** Prevents indefinitely open browser tabs from maintaining live sessions without user presence.

### 2.4 Session failure & recovery UX

When the session cannot be renewed:

1. **Flush** registered local/server draft handlers via `DocumentDraftStateService` (best-effort, non-blocking).
2. Show a **clear, translated** session-expired message (not a raw `401`).
3. Persist **`returnUrl`** (current route + relevant query params).
4. Redirect to login; after successful login, execute **full session recovery** per **REQ-SESSION-RECOVERY-001** (Constitution §30.6.2).
5. **Skip** leave-page guard when redirect is caused by session expiry (Ch.7.10).

**REQ-SESSION-RECOVERY-001:** After re-login caused by session expiry, restore `returnUrl` and available draft data without requiring the user to re-enter persisted fields.

### 2.5 Draft infrastructure — unified client API

Introduce a platform **DraftManager** (client) with a stable interface:

```text
save(screenKey, draftId?, payload)
restore(screenKey, draftId?)
list(screenKey)
delete(screenKey, draftId)
clear(screenKey)
```

**Storage key composition:**

```text
tenantId + userId + screenKey + entityId? + schemaVersion
```

- `entityId` — optional server document id when editing an existing draft.
- `schemaVersion` — **mandatory** integer per screen; mismatch handled per Ch.7.12.4 (Compatible → Restore; Upgradeable → Migrate; Incompatible → Ignore + notify).

**DraftManager operation contract (Ch.7.12.5):**

- Operations idempotent where possible.
- `restore()` is read-only (does not mutate draft state).
- `clear(screenKey, draftId)` removes local draft and linked server draft for the same `draftId`.

**Persistence cadence (local layer):** configurable debounce and snapshot intervals (see §2.9).

Server drafts remain governed by existing Ch.7.4–7.9 policies; local drafts are a **cache and recovery aid**, not a substitute for server recognition (Ch.7.2).

### 2.6 Server draft API — pilot-first

**Phase 1 (GRN pilot)** uses existing constitution routes (no breaking rename in v2.1):

| Operation | Route (current) |
|-----------|-----------------|
| Create server draft | `POST /constitution/grn/draft` |
| Update server draft | `PATCH /constitution/grn/draft/:id` |
| Recover for validation | `GET /constitution/grn/draft/:id/recover` |
| List family drafts | `GET /constitution/drafts/:family` |

After GRN pilot validation, extract shared patterns into a generalized draft service — **not before** pilot learnings are captured.

### 2.7 Temporary attachments

- On file select, upload to a **temporary** attachment store; draft payload stores **`attachmentId` only** (not raw file bytes).
- On successful submit/post, link attachment to the document per Ch.14.
- **Cleanup:** delete unlinked temporary attachments per **configurable retention policy** (see §2.9).

### 2.9 Operational defaults (configurable — not Constitution-fixed)

Principles and contracts live in the Constitution. **Numeric defaults** live here and in the approved configuration file so they can change without a Constitution amendment.

**File:** `OSE-backend/docs/governance/config/continuity-policy-defaults.json`

| Parameter | v2.1 default | Config key |
|-----------|--------------|------------|
| Proactive refresh safety margin | **3 minutes** (allowed range 2–5) | `session.proactiveRefreshMarginMinutes` |
| Idle timeout | **30 minutes** | `session.idleTimeoutMinutes` |
| Local draft debounce | **2.5 seconds** (allowed range 2–3) | `draft.localDebounceMs` |
| Local draft snapshot interval | **30 seconds** | `draft.localSnapshotIntervalSeconds` |
| Temporary upload retention | **48 hours** (allowed range 24–72) | `attachments.temporaryRetentionHours` |

Deployment overrides SHALL be documented in release notes. Changes within BDR-defined bounds do not require a Constitution amendment. Changes outside bounds require a BDR amendment.

### 2.10 Observability and telemetry

SessionManager and DraftManager SHALL emit **observable continuity events** from day one of implementation. No specific vendor (Application Insights, OpenTelemetry, etc.) is required — only a **stable event contract** that any sink can consume.

**SessionManager events:** `session.proactive_refresh.started`, `session.proactive_refresh.succeeded`, `session.proactive_refresh.failed`, `session.idle.entered`, `session.idle.resumed`, `session.expired`, `session.recovery.started`, `session.recovery.succeeded`, `session.recovery.failed`.

**DraftManager events:** `draft.saved.local`, `draft.saved.server`, `draft.restored`, `draft.migration.performed`, `draft.ignored.incompatible`, `draft.recovery.failed`, `draft.cleared`.

**Rules:**

- Emit at service boundary; screens SHALL NOT re-implement logging for these flows.
- No tokens, passwords, or full draft payloads in event payloads.
- Failed paths SHALL include `errorCode` or `failureReason` for production diagnosis.

Constitution reference: Ch.30 §30.10, Ch.7 §7.12.8.

### 2.11 Phase 1 — SessionManager Definition of Done

Phase 1 is **complete** only when all criteria below are verified (unit + integration tests unless noted):

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Proactive refresh is scheduled from JWT `exp` minus configured safety margin — **not** a fixed wall-clock interval unrelated to token expiry | `session-manager.service.spec.ts` |
| 2 | At most **one** concurrent refresh (single-flight); no refresh stampede | `session-manager.service.spec.ts` + existing `auth.interceptor.ts` chain |
| 3 | HTTP Interceptor remains **fallback only**; SessionManager is primary for active sessions | Integration: proactive refresh fires before 401 on active session |
| 4 | Idle detection applies configurable policy from `continuity-policy-defaults.json` | `session-manager.service.spec.ts` |
| 5 | Proactive refresh **suspended** while Idle; resumes per §2.3 on activity | `session-manager.service.spec.ts` |
| 6 | `returnUrl` persisted when session ends | `session-manager.service.spec.ts` |
| 7 | Leave-page guard **skipped** on session-expiry redirect | E2E or guard integration test |
| 8 | Session continuity events emitted per §2.10 | `session-telemetry.service.spec.ts` or SessionManager test spy |
| 9 | Unit and integration tests cover success and failure paths (refresh fail, idle resume with expired refresh token) | CI green on Phase 1 test suite |

Phase 1 **does not** require DraftManager or GRN wiring. REQ-SESSION-RECOVERY-001 full draft restore is Phase 2–3 scope; Phase 1 SHALL still emit `session.recovery.*` events and persist `returnUrl`.

### 2.8 Implementation phases (binding rollout order)

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| **1 — Session Manager** | Proactive refresh, idle detection, returnUrl, session recovery UX, telemetry | **§2.11 Definition of Done** — all criteria verified |
| **2 — Draft Framework** | DraftManager local layer, restore prompt wiring, DocumentDraftState integration, draft telemetry | GRN-independent unit/integration tests for save/restore/list; draft events per §2.10 |
| **3 — GRN Pilot** | Wire GRN Create to local + server drafts, temp invoice upload, end-to-end recovery | User can abandon GRN, re-login, continue draft with validation gate |
| **4 — Generalization** | Transfer, Stock Count, Adjustment, PO, other long forms | Each screen declares `screenKey` + `schemaVersion` in Ch.29 register |

Phases **must** execute in order; Phase 4 screens **must not** ship local-only draft hacks.

---

## 3. Alternatives considered

| Alternative | Rejected because |
|-------------|------------------|
| Interceptor-only refresh | Users still see failures on first request after expiry; poor UX on long forms |
| AuthService owns idle + refresh | Violates single-responsibility; hard to test and extend |
| Generalized server draft API before GRN pilot | High risk without proven shared schema; existing `/constitution/grn/draft` already implemented |
| Local-only drafts (no server) | Violates Ch.7.2 server-recognized draft; no cross-device recovery |
| Store files inside draft JSON | Bloated storage, breaks Ch.14 audit and immutability paths |

---

## 4. Consequences

### Positive

- Predictable session behavior on long data-entry screens.
- One client draft contract for all modules.
- `schemaVersion` prevents silent corruption after form schema changes.
- Temp attachment cleanup controls storage growth.

### Negative / trade-offs

- Additional frontend services to maintain (`SessionManager`, `DraftManager`).
- 48h cleanup job required on backend (scheduled task).
- Idle at 30m may require re-login on return; acceptable security trade-off.

### Compliance

- Implements / extends **7.10-05** (session expiration with unsaved changes).
- Does **not** weaken posting, audit, or period rules (Ch.29.4).

---

## 5. Evidence plan (post-ratification)

| Artifact | Location |
|----------|----------|
| SessionManager | `OSE-Frontend/src/app/core/services/session-manager.service.ts` (new) |
| DraftManager | `OSE-Frontend/src/app/core/services/draft-manager.service.ts` (new) |
| GRN wiring | `grn-create.component.ts` + `ConstitutionPlatformService` |
| Temp attachment cleanup | `OSE-backend` scheduled job + `attachmentGovernance` extension |
| Tests | `session-manager.service.spec.ts`; `session-telemetry.service.spec.ts`; `draft-manager.service.spec.ts`; GRN session-recovery E2E |
| Telemetry contract | Ch.30 §30.10; Ch.7 §7.12.8; BDR-010 §2.10 |

---

## 6. Ratification checklist

- [ ] Product owner sign-off
- [ ] Security review (idle + refresh token handling)
- [ ] Chapter 30 merged into Constitution master document (`constitution-base.md`)
- [ ] `requirements.json` entries approved
- [ ] Traceability matrix regenerated
- [ ] Phase 1 implementation ticket created

---

## 7. ملخص بالعربية

- **فصل المسؤوليات:** `AuthService` للتوكنات فقط، `SessionManager` للجلسة، الـ Interceptor كشبكة أمان عند 401.
- **المبادئ في الدستور** — **الأرقام في BDR-010 / ملف الإعدادات** (قابلة للتغيير دون تعديل الدستور).
- **استرداد كامل (REQ-SESSION-RECOVERY-001):** بعد إعادة الدخول → `returnUrl` + مسودة بدون إعادة إدخال.
- **schemaVersion:** متوافق → Restore؛ قابل للترقية → Migration؛ غير متوافق → Ignore + إشعار.
- **DraftManager:** idempotent؛ `restore()` للقراءة فقط؛ `clear()` يشمل السيرفر عند الربط.
- **Observability:** عقد أحداث SessionManager + DraftManager قابل للرصد من اليوم الأول.
- **المرحلة 1 DoD:** §2.11 — 9 معايير اختبار واضحة قبل الانتقال للمرحلة 2.
- **تنفيذ على 4 مراحل** — Session ثم Draft Framework ثم GRN ثم التعميم.
