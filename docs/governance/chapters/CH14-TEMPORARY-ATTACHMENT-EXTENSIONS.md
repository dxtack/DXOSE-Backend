# Chapter 14 — Extensions: Temporary Attachments

**Constitution version:** v2.1 Draft  
**Status:** Draft — Pending Ratification (BDR-010)  
**Extends:** Chapter 14 (§14.3–14.9)  
**Operational defaults:** `OSE-backend/docs/governance/config/continuity-policy-defaults.json`  
**Scope:** Draft-stage attachment upload on long operational forms

---

## 14.10 Temporary attachment upload

### 14.10.1 Purpose

Long-form data entry (e.g. GRN invoice PDF) requires users to select files **before** the document is submitted or posted. This section defines how attachments are held in a **temporary** state without violating posted-document immutability (§14.3).

### 14.10.2 Upload on select

When a user selects a file on a draft-capable screen:

1. The platform SHALL upload the file immediately to temporary storage subject to §14.4 and §14.5 validation.
2. The upload response SHALL return an **`attachmentId`** (or equivalent stable reference).
3. The draft payload SHALL store **`attachmentId` only** — not embedded file bytes or blob URLs that cannot be restored after reload.

### 14.10.3 Draft and session recovery

If the user session ends (Chapter 30) or the browser reloads:

- Recovery SHALL restore the `attachmentId` reference from server or local draft
- The UI SHALL re-resolve the attachment metadata for display
- If the temporary attachment was cleaned up (§14.10.5), recovery SHALL prompt the user to re-upload

### 14.10.4 Promotion to document attachment

On successful **Save Draft** or **Submit** that creates or updates a server-recognized document:

- The temporary attachment SHALL be **linked** to the governed document record
- Linked attachments become subject to §14.3 immutability rules upon posting

Replacing a file on a draft document SHALL create a new temporary upload and update the draft reference; prior unlinked temporaries become eligible for cleanup.

### 14.10.5 Cleanup policy

Temporary attachments that are **not linked** to a server-recognized document SHALL be deleted automatically according to a **configurable retention policy**.

- Retention duration SHALL be read from approved platform configuration (BDR-010 defaults file or deployment override).
- The Constitution does not fix retention in hours.
- Minimum and maximum bounds for retention MAY be defined in BDR-010; exceeding maximum bounds requires a BDR amendment.
- A scheduled platform job SHALL perform cleanup. Manual admin cleanup MAY also be provided but SHALL NOT be the only mechanism.

### 14.10.6 Audit

Temporary upload, link, replace-on-draft, cleanup, and download events SHALL generate audit records per §14.9 and Chapter 22.

### 14.10.7 Authorization

Temporary attachment upload and download SHALL require the same family-level permission as draft edit for the owning document family (e.g. `GRN_MANAGE` for GRN invoice upload).

Cross-tenant access to temporary attachments is prohibited.
