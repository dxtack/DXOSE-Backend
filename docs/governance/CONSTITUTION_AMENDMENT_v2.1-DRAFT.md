# DX OSE Constitution — Amendment v2.1 Draft

**Status:** Draft — Pending Ratification  
**Date:** 2026-07-12 (revised per review)  
**Decision record:** [BDR-010 Session & Draft Continuity](decisions/BDR-010-SESSION-DRAFT-CONTINUITY.md)  
**Operational defaults:** [config/continuity-policy-defaults.json](config/continuity-policy-defaults.json)

---

## Summary

This amendment introduces **session continuity** and strengthens **draft recovery** for long operational forms. It does not change posting, period, audit, or permission rules.

| Addition | Type | File |
|----------|------|------|
| **Chapter 30** — Session Continuity | New chapter | [chapters/CH30-SESSION-CONTINUITY.md](chapters/CH30-SESSION-CONTINUITY.md) |
| **Chapter 7 §7.12–7.13** — DraftManager & rollout | Extension | [chapters/CH07-DRAFT-CONTINUITY-EXTENSIONS.md](chapters/CH07-DRAFT-CONTINUITY-EXTENSIONS.md) |
| **Chapter 14 §14.10** — Temporary attachments | Extension | [chapters/CH14-TEMPORARY-ATTACHMENT-EXTENSIONS.md](chapters/CH14-TEMPORARY-ATTACHMENT-EXTENSIONS.md) |

**Note:** Chapter 23 remains **Lookup & Search UX**. Session Continuity is assigned **Chapter 30**.

---

## Design principle: principles in Constitution, numbers in configuration

| Layer | Contains |
|-------|----------|
| **Constitution (Ch.7, 14, 30)** | Principles, contracts, required behaviors |
| **BDR-010** | Architectural decisions, rollout phases, default bounds |
| **continuity-policy-defaults.json** | Numeric defaults (3m refresh margin, 30m idle, 48h retention, etc.) |

Changing defaults within BDR bounds does **not** require a Constitution amendment.

---

## Frozen decisions (BDR-010)

1. **AuthService / SessionManager / Interceptor** separation of concerns
2. **Proactive refresh** before expiry via configurable safety margin (default 3m)
3. **Idle policy** configurable (default 30m); suspend proactive refresh while idle
4. **REQ-SESSION-RECOVERY-001** — full returnUrl + draft restore after session-expiry re-login
5. **DraftManager API** with `list()` and optional `draftId`
6. **schemaVersion contract** — Compatible → Restore; Upgradeable → Migrate; Incompatible → Ignore + notify
7. **DraftManager operation contract** — idempotent ops; read-only `restore()`; `clear()` includes linked server draft
8. **GRN-first server draft pilot** on existing `/constitution/grn/draft` routes
9. **Temporary attachment upload** with configurable retention (default 48h)
10. **Observability contract** — SessionManager + DraftManager events per Ch.30 §30.10 / Ch.7 §7.12.8
11. **Four-phase rollout** with **Phase 1 Definition of Done** (BDR-010 §2.11)

---

## Traceability chain

Every new requirement in `requirements.json` (chapters 7, 14, 30) is linked to:

1. **BDR-010** — architectural decision
2. **Constitution chapter** — normative rule (`OSE-backend/docs/governance/chapters/CH*.md`)
3. **Verification plan** — test or E2E named in `evidence.json` `gap` field

Regenerate the implementation register:

```bash
node OSE-backend/docs/governance/build-register.mjs
```

---

## Ratification checklist

- [ ] Stakeholder review of BDR-010 (including operational defaults file)
- [ ] Merge chapter text into master `constitution-base.md` (when available in governance library)
- [ ] Approve `requirements.json` additions (**32 new requirements**)
- [ ] Confirm `evidence.json` verification plans per requirement
- [ ] Create implementation epics for Phases 1–4

---

## Implementation status at draft time

| Capability | Code today | After ratification |
|------------|------------|-------------------|
| Reactive 401 refresh | `auth.interceptor.ts` | Keep as fallback |
| Server GRN draft API | `constitution.routes.js` | Wire to GRN Create UI |
| Draft recovery service | `draft-recovery.service.ts` | Wire + extend to DraftManager |
| SessionManager | — | **New** (Phase 1) |
| DraftManager | — | **New** (Phase 2) |
| Temp attachment cleanup | — | **New** (Phase 3) |
| Policy defaults file | `continuity-policy-defaults.json` | **Ratified** with BDR-010 |
