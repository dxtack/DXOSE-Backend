# DX OSE — Semantic Glossary (Operational Language)

| Field | Value |
|--------|--------|
| **Version** | 1.0 |
| **Created Date** | 2026-05-14 |
| **Product Owner** | DX OSE Product Leadership *(assign named owner)* |
| **Purpose** | Establish **one operational language** for status, posting, approval, and closure across document types—while calling out **document-specific meaning** where the codebase diverges. |
| **Scope** | Product and customer-facing semantics; engineering may use additional internal names only where they do not contradict this glossary. |

**Related:** `PRODUCT_CONTRACTS.md` (Contract 1, 3), `WORKFLOW_MATRIX.md`, `EXCEPTION_REGISTER.md`.

---

## How to use this glossary

1. **Default meaning** — the canonical definition for the term in DX OSE governance narrative.  
2. **Document-specific notes** — when the same **word** on screen or in API responses means something narrower or different for a workflow.  
3. If UI/API text conflicts with this file, **update this file first** (version bump), then align UI/API (implementation phase).

---

## Core verbs and nouns

### Posting

**Default meaning:** An **authorized, atomic application** of inventory truth: creation of **`inventory_ledger`** rows that **affect stock balances** (and, where applicable, valuation) according to the posting engine, tied to a **named business transition** (not a background side effect).

**Not posting:** Saving a draft, updating counted quantities before submit, generating a PDF/Excel, or saving a report snapshot to `GeneratedReport`.

**Document-specific notes:**

| Document / surface | When posting happens (product intent) |
|--------------------|----------------------------------------|
| **GRN** | Explicit **`post`** action after approval path; status becomes `POSTED`. |
| **Store transfer** | **Finance final approval** — atomic `TRANSFER_OUT` + `TRANSFER_IN` in one transaction; status `POSTED`. |
| **Store issue** | Explicit **`post`** on the issue document. |
| **Manual movement** (`MovementDocument`) | Explicit **`post`** on the movement. |
| **Inventory count / stock count session** | **`approve`** on the session (canonical and legacy APIs) drives `postInventoryCountSession` / equivalent—**approval and posting are coupled** on this workflow (see *Approval* below). |
| **Breakage / lost** | Final approval path (service-defined); exact parity **Needs Review** per `EXCEPTION_REGISTER.md`. |
| **Get pass** | Ledger/stock mapping is **per transition**—see matrix + exception register (**Needs Review**). |
| **Requisition** | **No posting** on requisition approval; posting is on **issue**. |

---

### Approval

**Default meaning:** A **governance decision** by an authorized actor (human, via authenticated role/permission) that **allows** a document to move forward in its lifecycle. Approval may be **multi-step** (`ApprovalRequest` / chain) or **single-step** (implicit in “who may post”).

**Critical rule:** **Approval does not imply posting** unless this glossary explicitly says so for that document type.

**Document-specific notes:**

| Document | Approval vs posting |
|----------|---------------------|
| **GRN** | Approve ≠ posted; **post** is separate. |
| **Transfer** | Dept → Finance approval chain; **posting at Finance final approve** (SYS-DEC-07). Dispatch/receive retired. |
| **Requisition** | Approvals unlock **issuance**; no stock movement until **issue post**. |
| **Inventory count session** | Route-level **`approve`** both **decides** and **triggers post** (tight coupling)—treat as “approval-with-post” in SoD discussions. |
| **Store issue** | “Approval” is effectively **who may post** (`ISSUE_CREATE` on post route)—no separate approval enum on the issue. |

---

### Receive

**Default meaning:** **Physical or operational acknowledgment** that goods or authority crossed a boundary—often the **posting trigger** for transfers.

**Document-specific notes:**

| Document | “Receive” means |
|----------|-----------------|
| **Store transfer** | Destination acknowledgment is **historical-only** (pre–SYS-DEC-07). V2 posting occurs at **Finance final approval**, not receive. |
| **Get pass** | Multiple “receipt” concepts (destination receipt, return at gate, etc.)—each may have different stock impact; see workflow matrix. |

---

### Close / Closed

**Default meaning (verb):** To bring a **workflow** to a **terminal business state** where no further **normal** operational actions apply without exception paths (reopen, void where allowed).

**Default meaning (adjective):** Describes a **document** or **period** that is **locked for routine processing**.

**Collision warning:** **`CLOSED`** on a **transfer** is not the same as **`POSTED`** on a **GRN**—both are “done” but **different semantic families** (transfer lifecycle vs receipt lifecycle).

---

### Completed

**Default meaning:** Informal “done for practical purposes.” **Do not use as a schema status** unless mapped to an explicit enum value in the workflow matrix.

**Recommendation:** Prefer **posted**, **received**, **closed**, or **rejected** in UI copy instead of vague “completed.”

---

### Operational closure

**Default meaning:** The **combined** outcome that operations can stop chasing the document: **terminal state reached**, **posting done** (if applicable), **evidence** available where required, and **queues** clear. Aligns with charter “operational closure.”

---

### Closed period

**Default meaning:** A **calendar month** in the **Period Registry** (`PeriodClose`) in state **CLOSED** — routine posting into that month via Posting Date is prohibited; a **CURRENT** Closing Snapshot Version exists.

**Constitution (Ch.6 D1–D12):** States are **OPEN**, **CLOSING**, **CLOSED** only. **Archived** is not a period state. **Annual Close** / `month = null` is **prohibited**. December close uses label **December - Year End Closing** (presentational).

**Document-specific notes:** Implementation may lag constitution until dedicated wave. Prior BATCH-CH6-11 verification is **SUPERSEDED BY CHAPTER 6 D1–D12 AMENDMENT**.

---

### Period Registry

**Default meaning:** Explicit per-tenant, per-year, per-month (`1–12`) record set governing period state, close/reopen, and posting availability. **Implicit open** (no row = open) is **prohibited**.

---

### Posting Date

**Default meaning:** Official date on which inventory/ledger effect is recognized. Determines **Assigned Posting Period** (`YYYY-MM`). Distinct from **Document Date**. Future dates and dates in **CLOSED** periods are **prohibited**.

**Constitution (Ch.6):** Ledger period attribution uses `postingDate` / `assignedPostingPeriod` — **not** `createdAt`.

---

### Snapshot Version

**Default meaning:** Immutable closing balance capture for a period. Status **CURRENT** or **SUPERSEDED**. Deletion on re-close is **prohibited**. Calculated from **ledger through period end**, not live stock balances when later-period postings exist.

---

### Reconciliation

**Default meaning:** The **disciplined comparison** of two or more **declared truth sources** (e.g. ledger replay vs snapshot, physical count vs book, OMC identity) with **explained differences** (timing, scope, unposted documents).

**Product bar (reviewer-grade):** Reconciliation packs should state **both sides** of the comparison and **which documents** explain the gap.

---

## Variance

**Default meaning:** **Counted or measured quantity minus book quantity** (or equivalent signed difference) for a defined scope—**may exist before posting**.

**Document-specific notes:**

| Surface | Variance meaning |
|---------|------------------|
| **Inventory count session** | Per line/location: `countedQty - bookQty` (blind phases may hide until reveal); **value** often estimated at **current WAC at posting** (`valuationBasis` in services). |
| **SUMMARY / DETAIL generated reports** | Uses period **theoretical vs physical** construction in `generateVarianceReport`—**not identical** to live count session screen. |
| **Summary inventory (`/reports/summary-inventory`)** | Variance tied to **`COUNT_ADJUSTMENT`** ledger lines in period per `summaryReport.service.js` comments—**different construction** from count session UI. |

---

## Adjustment

**Default meaning:** A **signed correction** to on-hand quantity and ledger, typically materialized as ledger movement types such as **`COUNT_ADJUSTMENT`** or **`ADJUSTMENT`** (see OMC buckets in `report.service.js`).

**Document-specific notes:** “Adjustment” on screen must say whether it is **proposed** (pre-post count), **posted** (ledger exists), or **historical report bucket**.

---

## In-transit

**Default meaning (historical):** Pre–SYS-DEC-07 transfers could show **`IN_TRANSIT`** after dispatch. **V2 (SYS-DEC-07):** posting occurs at **Finance final approval**; `IN_TRANSIT` is **read-only historical** only—no new documents enter this state.

**Not in-transit:** Approved GRN not yet posted is **not** “in-transit” in transfer semantics; use **approved-unposted** or similar copy.

---

## Lifecycle state words

### Draft

**Default meaning:** Editable by authorized users; **no posting**; may be deletable per document rules.

**Document-specific:** Universal pattern across transfers, GRN, requisitions, issues, get passes, count sessions (where `DRAFT` exists).

---

### Submitted

**Default meaning:** Author has **frozen intent** and requested **downstream action** (approval, validation). Not necessarily posted.

**Document-specific:** Used on **requisitions** and **transfers** (`SUBMITTED`); GRN uses **`VALIDATED`** / **`PENDING_APPROVAL`** path—**do not equate** “submitted” across modules without checking matrix.

---

### Approved

**Default meaning:** **At least one required approver** (or final approver, per policy) has **accepted** the document for the current gate.

**Critical ambiguity (enterprise risk):**

| Document | “Approved” implies posted? |
|----------|----------------------------|
| **GRN** | **No**—still needs **`post`**. |
| **Transfer** | **No** on create/submit. **Yes** once at Finance final approve → `POSTED`. Legacy `IN_TRANSIT`/`RECEIVED`/`CLOSED` are historical read-only. |
| **Requisition** | **No**—posting via **issue**. |
| **Inventory count** | **Ambiguous**—`APPROVED` may precede finance **`approve`** that posts; treat **“Approved for posting”** vs **“Posted”** as separate user-visible concepts where possible. |

---

### Posted

**Default meaning:** **Ledger posting** for this document (or session) has run successfully; stock balances updated per engine rules; further edits restricted by immutability rules.

**Document-specific:** `POSTED` appears on **GRN**, **issues**, **movement documents**, **count sessions**—**same word, different posting triggers** (see `EXCEPTION_REGISTER.md`).

---

## Status vocabulary collision: `MovementStatus`

The enum **`MovementStatus`** is shared by **stock count sessions** and **movement-class documents** (breakage, lost, manual). **Same label, different lifecycle story.**

| Label | Count session meaning (typical) | Movement document meaning (typical) |
|-------|----------------------------------|--------------------------------------|
| `COUNTING` / `REVEAL_REVIEW` / `RECOUNTING` | Count workflow phases | **Not used** for breakage-style flows |
| `DEPT_APPROVED` / `FINANCE_APPROVED` / … | May appear in **count approval chain** | Breakage/lost **approval gates** |
| `POSTED` | Count adjustments applied | Movement posted |

**UI rule:** Always show **document type + state** together; never show raw enum alone to end users.

---

## Version history

| Version | Date | Notes |
|---------|------|------|
| 1.0 | 2026-05-14 | Initial glossary for Governance Closure phase |
