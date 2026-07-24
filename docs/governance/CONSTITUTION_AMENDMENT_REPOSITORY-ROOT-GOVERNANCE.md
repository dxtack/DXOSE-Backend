# DX OSE Constitution — Amendment: Repository Root Governance

**Status:** Ratified (structural)  
**Date:** 2026-07-16  
**Chapter:** [CH31 — Repository Root Governance](chapters/CH31-REPOSITORY-ROOT-GOVERNANCE.md)

---

## Summary

This amendment permanently reserves the DX OS&E repository root for application entry points only.

### Normative rule

The repository root **must** contain only:

```
OSE-backend/
OSE-Frontend/
```

### Relocations performed (2026-07-16)

| Former root path | New location | Notes |
|------------------|--------------|-------|
| `Governance/` | `OSE-backend/docs/governance/` | Merged into existing backend governance docs SSOT |
| `.cursor/` | `OSE-Frontend/.cursor/` | Editor/agent UI rules (frontend) |
| `logs/` | Removed from root | Runtime logs belong under `OSE-backend/logs/` (Git-ignored) |

### Change control

Any future root-level structural change requires Governance documentation **before** implementation (see CH31 §31.5).
