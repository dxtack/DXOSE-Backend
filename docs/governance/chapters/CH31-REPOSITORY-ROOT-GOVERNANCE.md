# Chapter 31 — Repository Root Governance

**Status:** Normative  
**Effective:** 2026-07-16  
**Scope:** DX OS&E repository architecture (platform-wide)

---

## 31.1 Purpose

The repository root is reserved for application entry points only. This chapter permanently forbids ad-hoc folders, runtime artifacts, editor configuration, and miscellaneous directories at the repository root without explicit architectural approval through Governance.

## 31.2 Allowed root layout

The repository root **must** contain only the following application projects:

```
DX OS&E/
├── OSE-backend/
└── OSE-Frontend/
```

The VCS metadata directory (`.git`) is an infrastructure exception and is not an application folder.

## 31.3 Prohibited at repository root

Without a prior Governance decision record (BDR/ADR) that explicitly approves a structural exception, the repository root **must not** contain:

1. Temporary or scratch folders
2. Runtime logs or other generated output
3. Editor / AI tooling configuration (for example `.cursor`, `.vscode`)
4. Platform documentation or Constitution SSOT folders
5. Miscellaneous utility, evidence, or experiment directories

## 31.4 Placement rules

| Concern | Required location |
|---------|-------------------|
| Backend application code | `OSE-backend/` |
| Frontend application code | `OSE-Frontend/` |
| Platform Constitution & governance SSOT | `OSE-backend/docs/governance/` |
| Frontend UX / conformance docs | `OSE-Frontend/docs/governance/` |
| Runtime logs | Generated under `OSE-backend/logs/` and ignored by Git |
| Editor / agent rules | Inside the relevant project (for example `OSE-Frontend/.cursor/rules/`) |

## 31.5 Change control

1. Any future structural change to the repository root **must** be documented through Governance **before** implementation.
2. Moving, adding, or renaming root-level application entry points requires an approved decision record and an update to this chapter.
3. Agents and contributors **must not** invent new root-level folders to “organize” work.

## 31.6 Compliance

Discovery of a prohibited root-level folder is a **governance violation**. Remediation is mandatory: relocate content into the approved project structure, delete ephemeral artifacts, and update references before further feature work proceeds on that tree.
