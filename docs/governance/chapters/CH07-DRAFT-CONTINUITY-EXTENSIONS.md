# Chapter 7 — Extensions: Local Draft Layer & DraftManager

**Constitution version:** v2.1 Draft  
**Status:** Draft — Pending Ratification (BDR-010)  
**Extends:** Chapter 7 (§7.1–7.11)  
**Operational defaults:** `OSE-backend/docs/governance/config/continuity-policy-defaults.json`  
**Scope:** Platform-wide client draft infrastructure; server drafts per document family

---

## 7.12 Unified client DraftManager

### 7.12.1 Purpose

Chapter 7.7–7.10 govern **when** drafts must be saved and protected. This section defines **how** the frontend SHALL persist and restore draft payloads through one platform service.

Modules SHALL NOT implement independent `localStorage` keys or ad-hoc debounce timers for operational drafts.

### 7.12.2 Platform API

The DraftManager SHALL expose the following operations:

| Operation | Signature | Behavior |
|-----------|-----------|----------|
| Save | `save(screenKey, draftId?, payload)` | Persist payload under the storage key (§7.12.3) |
| Restore | `restore(screenKey, draftId?)` | Return the latest or specified draft payload, or null — **read-only** (§7.12.5) |
| List | `list(screenKey)` | Return all non-expired drafts for the screen (supports multi-draft future) |
| Delete | `delete(screenKey, draftId)` | Remove one draft |
| Clear | `clear(screenKey, draftId?)` | Remove local draft(s); when `draftId` identifies a linked server draft, also remove the server draft per family policy (§7.12.5) |

`screenKey` SHALL be a stable platform identifier (e.g. `grn-create`, `transfer-create`).

### 7.12.3 Storage key

Local and client-side draft indexes SHALL be keyed by:

```text
tenantId + userId + screenKey + entityId? + schemaVersion
```

| Component | Required | Description |
|-----------|----------|-------------|
| `tenantId` | Yes | Active tenant scope |
| `userId` | Yes | Authenticated user |
| `screenKey` | Yes | Screen identifier |
| `entityId` | No | Server document id when continuing an existing server draft |
| `schemaVersion` | Yes | Integer version of the screen payload schema |

### 7.12.4 Schema version compatibility contract

Each screen SHALL declare a `schemaVersion` constant and MAY register a migration function.

When a stored draft is encountered, the platform SHALL classify it and act as follows:

| Classification | Condition | Required behavior |
|----------------|-----------|-------------------|
| **Compatible** | Stored `schemaVersion` equals current screen version | **Restore** — return payload to caller |
| **Upgradeable** | Stored version is lower and a registered migration exists | **Migrate** — run migration, then restore migrated payload |
| **Incompatible** | No migration path to current version | **Ignore** — do not apply payload; notify user with a translated message |

Silent partial restore of incompatible drafts is prohibited. All screens SHALL use this contract; module-specific discard rules are prohibited.

### 7.12.5 Operation contract

All DraftManager operations SHALL obey the following rules:

1. **Idempotency** — `save`, `delete`, and `clear` SHALL be idempotent where possible (repeated calls with the same inputs produce the same end state without error).
2. **Restore is read-only** — `restore()` SHALL NOT mutate stored draft state, server draft state, or screen dirty flags. Applying restored data to the UI is the caller's responsibility after Chapter 7.8 gating.
3. **Clear scope** — `clear(screenKey, draftId)` SHALL remove the matching local draft. When `draftId` corresponds to a server-recognized draft linked by `entityId`, `clear` SHALL also delete that server draft through the governed family API. `clear(screenKey)` without `draftId` SHALL remove all local drafts for the screen; server drafts SHALL be deleted only when explicitly linked by `draftId` in each local index entry.

### 7.12.6 Persistence cadence

The DraftManager SHALL persist local drafts:

- On meaningful business events (Chapter 7.7), using a **configurable debounce interval**
- On a **configurable periodic snapshot interval** while the document remains dirty

Debounce and snapshot intervals SHALL be read from approved platform configuration (BDR-010 defaults file). Navigation and session-end flush (Chapter 7.10, Chapter 30.6) SHALL trigger an immediate save attempt.

### 7.12.7 Relationship to server drafts

Local drafts are a **recovery cache**. They SHALL NOT replace server-recognized drafts required by Chapter 7.2.

When a server draft exists, the client SHALL treat the server document id as `entityId` and synchronize local cache after successful server save.

### 7.12.8 Observability and telemetry

DraftManager SHALL emit observable events per a platform contract. No specific telemetry provider is mandated.

| Event | When emitted | Minimum payload |
|-------|--------------|-----------------|
| `draft.saved.local` | Local debounce or snapshot persists | `tenantId`, `userId`, `screenKey`, `draftId?`, `schemaVersion` |
| `draft.saved.server` | Server draft save succeeds | `tenantId`, `userId`, `screenKey`, `entityId`, `family` |
| `draft.restored` | restore() returns payload to caller | `tenantId`, `userId`, `screenKey`, `draftId?`, `schemaVersion`, `source` |
| `draft.migration.performed` | Upgradeable schema migrated | `tenantId`, `userId`, `screenKey`, `fromVersion`, `toVersion` |
| `draft.ignored.incompatible` | Incompatible schema skipped | `tenantId`, `userId`, `screenKey`, `storedVersion`, `currentVersion` |
| `draft.recovery.failed` | Recovery cannot apply draft | `tenantId`, `userId`, `screenKey`, `failureReason` |
| `draft.cleared` | delete/clear removes draft | `tenantId`, `userId`, `screenKey`, `draftId?`, `scope` |

Events SHALL NOT include full draft payloads or secrets. Emission SHALL occur at the DraftManager service boundary.

---

## 7.13 Server draft pilot and generalization

### 7.13.1 Pilot scope

The first end-to-end integration of DraftManager with server drafts SHALL be **GRN Create**, using the constitution routes:

- `POST /constitution/grn/draft`
- `PATCH /constitution/grn/draft/:id`
- `GET /constitution/grn/draft/:id/recover`
- `GET /constitution/drafts/grn`

### 7.13.2 Recovery gate

Recovered drafts (local or server) SHALL comply with Chapter 7.8:

- Continue/Discard prompt before applying recovered data
- Full current validation before continue or submit

### 7.13.3 Generalization order

After GRN pilot sign-off, the platform SHALL extend the same pattern to:

1. Transfer Create
2. Stock Count
3. Adjustment Create
4. Purchase Order Create
5. Other long-form operational screens as registered in Chapter 29

Modules in Phase 4 SHALL register `screenKey`, `schemaVersion`, and applicable Chapter 7 sections before production release.

### 7.13.4 Prohibited patterns

- Local-only drafts on governed document families that require server recognition
- Module-specific debounce implementations outside DraftManager
- Storing binary attachment content inside draft JSON (see Chapter 14 §14.10)
- Module-specific `schemaVersion` mismatch behavior outside §7.12.4
