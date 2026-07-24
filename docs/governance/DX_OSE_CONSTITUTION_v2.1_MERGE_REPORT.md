# DX OSE Constitution v2.1 — Corrected Merge Report

**Read-only source:** `DX_OSE_CONSTITUTION_v2.0_FINAL.docx`  
**Corrected outputs:** `DX_OSE_CONSTITUTION_v2.1_MERGED.docx/.pdf` and `DX_OSE_User_Rights_Permissions_v1.docx/.pdf`  
**Runtime RBAC snapshot:** 2026-07-21T10:59:39.904Z

## Approved conflict resolutions

- GM receives the full operational grant set but not period-close/reopen, platform-only, currency-configuration, or Master Data mutation authority.
- PC-IC warning alone is not a blocker; incomplete count integrity remains a blocker.
- UTC is the persistence standard; tenant timezone defines business EOD.
- Granular close/reopen permissions are constitutional. `PERIOD_CLOSE_MANAGE` is temporary legacy compatibility only.
- D11 documentation correction: The official period states are OPEN, CLOSING, and CLOSED. The state Archived is not a period registry state; historical snapshots and reports use SUPERSEDED versioning (§6.11, §6.17).
- User Rights uses effective live ACC/UR, includes flagged live noncanonical/test roles, and does not invent meanings for uncataloged permissions.

## 34-clause merge result

| # | Result after approved recommendations |
|---:|---|
| 1 | Added §4.5.1 — ADMIN retirement |
| 2 | Added §4.5.2 — full operational GM grants, excluding period, platform, currency, and Master Data authorities |
| 3 | Added §4.5.3 — ORG_MANAGER legitimacy |
| 4 | Added §11.9 — display-currency mutation reserved to SUPER_ADMIN |
| 5 | Added §4.5.4 — Master Data role allowlist |
| 6 | Added §4.5.5 — GM exclusions |
| 7 | Added §6.10 — PC-IC warning alone is nonblocking; incomplete count integrity remains blocking |
| 8 | Added §3.9 — unified mandatory Send Back target list |
| 9 | Added §5.5 — BRK/LST/GRN posting-state and timestamp integrity |
| 10 | Added §6.15 — UTC persistence with tenant-timezone EOD |
| 11 | Added §10.5 — integer-only narrowing; original §10.2 retained |
| 12 | Existing §24.4 — no horizontal page scroll except internal grids |
| 13 | Added §23.8 — location-constrained item lookup |
| 14 | Added §32.2 — Process Return restricted to three governed roles |
| 15 | Added §32.3 — Force Close service capability without enabled interactive action |
| 16 | Added §32.4 — Damaged/Lost follow BRK/LST governance |
| 17 | Added §32.5 — immediate Good return posting |
| 18 | Added §32.6 — Good/Damaged/Lost split and outstanding limit |
| 19 | Added §32.7 — optional Damaged-only photos |
| 20 | Added §32.8 — dynamic Process Return/Returned behavior |
| 21 | Added §15.7 — original notes preserved |
| 22 | Existing §§22.2–22.3 — each workflow action is an auditable chronological event |
| 23 | Added §32.9 — complete inter-hotel lifecycle |
| 24 | Added §32.10 — ordinary Process Return prohibited for inter-hotel passes |
| 25 | Added §10.4 — positive WAC whenever quantity is positive |
| 26 | Existing §§6.3 and 6.5 — Posting Date determines assigned period |
| 27 | Added §6.11 — no implicit period opening |
| 28 | Added §6.12 — snapshot only during successful Complete Close |
| 29 | Added §6.13 — closing snapshot is next opening reference |
| 30 | Added §6.14 — close neither checks nor creates the following period |
| 31 | Added §6.16 — PERIOD_CLOSE_EXECUTE is canonical; MANAGE is temporary legacy compatibility |
| 32 | Added §6.17 — PERIOD_REOPEN_EXECUTE plus reason; MANAGE is not permanent authority |
| 33 | Added §6.18 — governed seven-step monthly sequence |
| 34 | Added §33.1 — Current Stock Balance is live, not historical As-of |

## Live rights coverage

- Active live roles documented: 14
- Noncanonical/test roles included and flagged: E2E_ROLE_A_1783042125830-169d38, E2E_ROLE_B_1783042125830-169d38, E2E_VIEW_ONLY_1783042125830-169d38, RECEIVER
- Active user override rows at snapshot: 0

## Integrity statement

- No original numbered source clause was deleted. §6.4 period-state wording was corrected to the approved D11 text; all other source clauses remain preserved.
- Metadata and revision history changed only in the new copy.
- Existing historical §29.8 remains unchanged.
- The rights document reports live runtime truth separately from prospective constitutional target governance.

## P2 #32 — Chapter 6 Path A renumbering (numbering only)

Merge-inserted Chapter 6 clauses were renumbered contiguously after §6.9. Normative wording was not changed except splitting the former combined §6.22 into §6.16 (close) and §6.17 (reopen) so each merge row has a unique number:

| Former (merge output) | Current (Path A) |
|---|---|
| §6.16 PC-IC Warning Classification | **§6.10** |
| §6.17 Explicit Period Opening | **§6.11** |
| §6.18 Snapshot Creation Boundary | **§6.12** |
| §6.19 Closing Snapshot and Next Opening Reference | **§6.13** |
| §6.20 Separation from the Following Period | **§6.14** |
| §6.21 UTC Storage and Tenant End-of-Day | **§6.15** |
| §6.22 Granular Close and Reopen Authority (combined) | **§6.16** Granular Close Authority + **§6.17** Granular Reopen Authority |
| §6.23 Governed Monthly Sequence | **§6.18** |

### Deferred note — D11 broken cross-reference

The approved D11 sentence in §6.4 still cites SUPERSEDED versioning as `(§6.11, §6.17)`. Those citations were written for consolidated Snapshot Versioning / Report Versioning content (`scripts/constitution-base.md`), which is **not present** in the currently ratified DOCX body. After Path A, ratified §6.11 and §6.17 are Explicit Period Opening and Granular Reopen Authority — **not** the Snapshot/Report Versioning targets. Per governance decision: the D11 citation is **deferred** for a later review; it must not be rewritten to a different meaning, and the missing Snapshot/Report Versioning clauses must not be merged in this step.

### Reserved / not merged — Chapters 30 and 31

Chapters **32** (Get Pass Governance) and **33** (Documented Report Behavior) retain their current numbers. Chapters **30** (Unified Visual Language) and **31** (Repository Root Governance) remain **reserved / not merged** into the official ratified constitution DOCX at this time; they exist in consolidated/amendment sources but are outside the Path A numbering change.

## Full source-clause index — D11-corrected

The following is the complete numbered normative body extracted from the read-only v2.0 source. Original numbering is preserved, and wording is preserved except for the approved D11 correction to §6.4; table cells are tab-separated.

`````text
Part 0 — Authority
Chapter 1 — Authority & Hierarchy
1.1 Purpose
This Constitution establishes the governing principles, policies, standards, and mandatory rules for the DX OSE Enterprise ERP Platform.
It defines what the platform must do from a governance perspective. It is technology-neutral and shall remain valid regardless of changes to frontend, backend, database, or integration technologies.
This Constitution is the Single Source of Truth (SSOT) for governance across the DX OSE ERP Platform. All subordinate governance, UX, workflow, access control, and implementation documents shall conform to this Constitution.
1.2 Normative Stack
When documents conflict, the higher-level document shall always prevail.
No subordinate document may override or contradict this Constitution.
Order	Document	Governs
1	DX OSE Constitution	Principles, policies, standards, and mandatory rules — SSOT
2	DX OSE UX Constitution	User experience, layout geometry, scroll ownership, visual rhythm
3	Business Decision Records (BDR)	Formal Product/Governance decisions that interpret or extend this Constitution without amending it
4	Workflow Contracts	Document cycles, internal states, transitions, and routing
5	Access Control Catalog (ACC)	Who may execute each operation or transition
6	Architecture & Implementation Guides	How governance is implemented — non-normative for governance
Governance Library
The official governance library shall maintain, at minimum:
DX OSE Constitution
DX OSE UX Constitution
Business Decision Records (BDR)
Workflow Contracts
Access Control Catalog
Architecture Guide
Implementation Guide
1.3 Deleted / Reserved — Four Tiers Removed
Section 1.3 Four Tiers has been removed in its entirety per Master Review Log ratification. This section number is reserved and shall not be reassigned to other content without explicit governance decision.
1.4 Scope
This Constitution applies to all current and future operational modules of the DX OSE ERP Platform.
Unless explicitly stated otherwise:
Platform-wide chapters apply to all DX OSE modules and shared user experiences.
Document-specific chapters apply to operational documents and document entry workflows.
Out of scope for this Constitution:
Technology stack
Internal implementation details
Database architecture
Integration implementation details
Implementation detail belongs in Architecture & Implementation Guides.
1.5 Mandatory Language
Normative keywords shall be interpreted exactly as defined in this chapter.
Term	Meaning
Must / Shall	Mandatory requirement
Should	Strong recommendation; exception requires recorded approval in BDR or governance register
May	Optional
Must not	Prohibited
Will	Descriptive statement of expected behavior after requirements are met — not a requirement by itself
Guidance:
Avoid using Must where Should is sufficient.
Use Must only when a true obligation exists.
Part I — Governance Constitution
Chapter 2 — Document Lifecycle
2.1 Purpose
DX OSE shall provide one consistent document lifecycle experience across all operational modules.
Principle: The user experience is the contract. The implementation is an internal concern.
Modules may implement different internal workflows, provided that the user-facing lifecycle remains consistent across the platform.
Internal workflow implementation, workflow step names, and internal status codes must never be exposed to end users.
2.2 Common User-Facing States
Each user-facing lifecycle state shall represent one consistent business meaning across the entire DX OSE ERP Platform. No module may redefine these meanings.
No module may introduce additional user-facing lifecycle states unless they are first ratified in this Constitution.
State	Meaning
Draft	Editable; no official operational or financial effect
Submitted	Sent into review
In Review	In an approval chain
Approved	*Optional.* Used only when a document has a distinct business stage between final approval and posting
Posted	Official operational and financial effects applied
Rejected	Terminated; no resubmission of the same document
Returned	Sent back to creator for correction (Send Back)
Void	Formally cancelled before becoming part of the permanent business record
Closed	Operationally complete without Posted being the final state (e.g. custody returned, get-pass completed, loan ended)
Cancel and Void
Cancel is an action.
Void is the lifecycle state resulting from cancellation before the document enters the governed permanent record.
A separate user-facing state named Cancelled shall not be introduced unless ratified in this Constitution (*see BDR-007*).
2.3 Status Mapping
Each module shall provide a consistent mapping between internal workflow states and standardized user-facing lifecycle states.
Internal workflow identifiers, status codes, enum names, workflow step names, and other implementation details must never be exposed to end users.
Identical business outcomes shall always resolve to the same standardized user-facing lifecycle state across the DX OSE platform.
2.4 Business Effects
#### 2.4.1 Business Commit Point
Posting is the single business commit point for all operational and financial effects within the DX OSE ERP Platform.
No operational or financial effect shall be considered official before Posting unless this Constitution explicitly states otherwise.
#### 2.4.2 Operational Reports
Operational reports represent official business results, including stock balance, inventory ledger, inventory movement history, inventory valuation, and financial inventory reports.
Rule: Operational reports shall derive operational and financial results exclusively from Posted documents.
#### 2.4.3 Workflow Reports
Workflow reports represent workflow progress and operational monitoring (pending approvals, finance/GM queues, reviewer packs, SLA dashboards, draft monitoring).
Rule: Workflow reports may include Draft, Submitted, In Review, Returned, Rejected, Posted, and other lifecycle states according to business requirements.
#### 2.4.4 Evidence Package
Evidence Package is not a reporting category.
It comprises document-level proof artifacts (PDF, print output, evidence export, timeline, audit trail, supporting attachments) for one document. It is governed under Document Composition and Audit chapters.
#### 2.4.5 Reservation
Inventory reservation is governed by business policy. The default DX OSE behavior is no reservation before Posting unless explicitly defined by a ratified business policy.
2.5 Editability
Editability shall be governed exclusively by document lifecycle state, not by individual screen implementations.
State	Editable
Draft	Yes
Returned	Yes
Submitted	No
In Review	No
Posted	No
Rejected	No
Void	No
Closed	No
2.6 Deletion
Delete is permitted only while the document is in Draft.
Once a document leaves Draft, Delete must not be available. Business termination shall use governed lifecycle actions (Cancel, Reject, Void, Close, etc.).
Deletion permanently removes a document before it becomes part of the business record. Once a document enters the governed lifecycle, business termination actions shall replace deletion.
2.7 Resubmission
After Return: Edit → Submit. There shall be no separate action named Re-submit.
Submit always represents entering the workflow, whether for the first time or after Return.
After Reject, the same document must not re-enter workflow. A new document is required.
2.8 Lifecycle Visibility
Every document detail view shall present a unified timeline showing, as applicable: current state, workflow step, actor, date and time, mandatory reasons, workflow comments, system events, and duration (when applicable).
2.9 Lifecycle Termination Model
Action	Type	Resulting state
Cancel	Creator action	Void (per Ch. 2.2)
Reject	Reviewer workflow action	Rejected
Close	Lifecycle completion action	Closed
2.10 Out of Scope
Workflow engine implementation, state machine design, database schema, API contracts, technical implementation details — Architecture & Implementation Guides.
Chapter 3 — Workflow & Actions
3.1 Purpose
Users shall see only the actions they need for their role and document state.
Action behavior shall remain consistent across all DX OSE modules regardless of workflow implementation.
No module may invent alternative names for standard actions unless ratified in this Constitution.
3.2 Creator Actions
Save Draft, Submit, Cancel.
Cancel is an action, not a lifecycle state. Alternative labels with the same meaning (Abort, Discard, Cancel Document) must not be used.
3.3 Reviewer Actions
Approve, Send Back, Reject.
Reviewer actions shall be available only while the document is actively assigned to the current reviewer according to workflow definition and the permission model.
3.4 Send Back vs Reject
Attribute	Send Back	Reject
Ends document	No	Yes
Allows edit	Yes	No
Reason required	Yes	Yes
Next step	Edit → Submit	New document if operation repeats
Business transaction	Continues	Terminates
3.5 Primary Action
There shall be only one primary action for the current document state.
3.6 Button Order
Primary → Secondary → Neutral → Danger
3.7 Separation of Concerns
Layer	Determines
Workflow Contracts & ACC	Who; when; routing; next step
This Constitution	Meaning; behavior; terminology; confirmation rules; mandatory reasons; user expectations
3.8 Out of Scope
Icons, colors, visual styling, animations — DX OSE UX Constitution.
Chapter 4 — Operation Permissions
4.1 Purpose
Operation permissions govern authorization only and shall never replace workflow validation, lifecycle validation, or business rule enforcement.
The Access Control Catalog (ACC) is the single source of truth for permissions.
4.2 Standard Operations
View, Create, Edit, Delete, Submit, Approve, Reject, Send Back, Cancel, Post, Reopen, Close, Archive, Print, Export, Attach, View Audit.
Evidence Package is part of document representation, not an independent business operation, and does not require a separate permission in the current DX OSE release.
4.3 Rules
1. Permissions shall never bypass document lifecycle rules.
2. Permissions grant eligibility, not execution authority.
3. Action Allowed = Permission + Workflow + Lifecycle + Business Rules + Scope.
4. Modules shall not introduce alternative operation names for standardized operations.
4.4 Out of Scope
Permission key naming, role matrix maintenance, role hierarchy, permission inheritance, technical authorization implementation — ACC.
Chapter 5 — Posting
5.1 Purpose
Posting is the single irreversible business commit point for all operational and financial effects within the DX OSE Platform.
Posting is the only operation permitted to create official operational and financial business effects.
Documents become business-immutable after Posting except through formally governed reversal or adjustment procedures.
5.2 Posting Rules
Before Posting, the platform shall verify: user authority; valid workflow state; open inventory/financial period (Posting Date); full document revalidation; stock availability for outbound documents.
Rules:
1. Final validation — full revalidation immediately before Posting regardless of prior validation.
2. Transaction boundary — single transactional boundary; partial posting prohibited.
3. Atomicity — any failure leaves document and related business data completely unchanged.
4. Idempotency — repeating the same posting request shall never create additional effects.
5. Posting trigger — Posting is automatically triggered upon successful final workflow approval unless a document-specific governance policy defines otherwise. Final Workflow Approval = business authorization for Posting. No additional posting confirmation is required by default.
Posting behavior shall remain deterministic and repeat-safe throughout the platform.
5.3 Approve vs Post
Approval authorizes progression within workflow. Posting applies official operational and financial effects. Workflow Contracts define whether final approval leads directly to Posting or to an optional Approved stage.
5.4 Out of Scope
Reversal procedures, inventory recalculation, ledger repair, historical data correction — separate governance documents.
Chapter 6 — Period Management
6.1 Purpose
Period Management preserves inventory integrity, financial integrity, audit integrity, and reporting consistency. It governs when transactions may officially affect inventory and financial records.
6.2 Period Model
DX OSE formally recognizes Inventory Period and Financial Period. The current implementation may manage both using a shared calendar while allowing future separation.
6.3 Document Dates
Each document shall permanently maintain Document Date, Posting Date, and Assigned Posting Period.
Document Date — actual business event date.
Posting Date — official accounting and inventory recognition date.
Assigned Posting Period — determined at Posting, permanently recorded.
Document Date and Posting Date are independent and must never be treated as interchangeable.
6.4 Period States
The official period states are OPEN, CLOSING, and CLOSED. The state Archived is not a period registry state; historical snapshots and reports use SUPERSEDED versioning (§6.11, §6.17).

6.5 Posting Rules
Posting permitted only when Posting Period is Open and all validations pass.
Future posting restrictions apply to Posting Date only, not Document Date.
Historical Document Date may be accepted if business policy allows and posting period is open.
Posting into Closed period prohibited.
Periods close sequentially; periods must not overlap.
Period validation is centralized; modules shall not implement independent period logic.
Assigned Posting Period is immutable after Posting.
6.6 Period Close
Period Close is a governed business process, not a simple validation failure.
Validation phase: centralized validation with progress indication when Close Period is initiated.
Resolution workspace when blocking conditions exist:
Tab 1 — Close Validation: draft documents, pending workflow, approved-not-posted, validation failures, integrity issues; authorized resolution; then Revalidate & Close.
Tab 2 — Closed Periods: history (period, closed by, closed at, notes, audit).
Principle: The platform shall provide governed period-close resolution whenever blocking conditions exist, rather than merely rejecting the request.
Integrates with Draft Governance (Chapter 7).
6.7 User Experience
Prevent invalid Posting Dates proactively where possible.
6.8 Reopen Closed Period
Governed by separate financial governance policy — intentionally deferred from this Constitution.
6.9 Out of Scope
Fiscal calendar configuration, accounting policies, year-end financial closing, financial reopening policies.
Chapter 7 — Draft & Document State Protection
7.1 Two Independent Concerns
Concern	Governs
Document State Protection	Dirty detection; warnings before navigation, refresh, close tab, back, session expiration with unsaved changes
Draft & Recovery	Persisting, restoring, governing drafts
These must remain separate policies.
7.2 Draft Philosophy
Every operational document shall begin as a server-recognized draft unless Workflow Contracts define otherwise.
7.3 Draft Levels
Temporary buffer (not official draft) → Server draft → Workflow document after Submit.
7.4 Draft Ownership Governance
The platform shall define: draft owner; access rights; ownership transfer (if permitted); handling of drafts for inactive or departed users.
7.5 Draft Lock Governance
Rules for opening the same draft from multiple sessions or devices shall align with Chapter 8 (Concurrency).
7.6 Draft Lifecycle
Internal draft lifecycle states (e.g. active, submitted, discarded, expired) may exist; not all need be user-visible.
7.7 Auto-Save Governance
Auto-save shall occur on meaningful business events (add/delete row, qty/price change, supplier/warehouse change, attachment, notes, before navigation). Not on fixed timers defined in this Constitution.
7.8 Recovery Governance
Recovered drafts shall not bypass current validation. Restored documents must be revalidated before continue or submit.
Recovery prompt: Continue or Discard. Last saved indicator should be visible.
7.9 Draft Registry & Retention
Draft registry required per document family. Default retention 30 days. Expiration policy (delete, archive, expired state) shall be defined by platform policy.
7.10 Document State Protection Scope
Applies to: route navigation, browser refresh, browser/tab close, back navigation, session expiration with unsaved changes.
Successful Save Draft or Submit returns to clean state.
7.11 Link to Document Numbering
Upon successful creation of the first Server Draft, the System Document Number becomes permanently reserved per Chapter 9.
7.12 Offline
Not supported — cloud ERP.
7.13 Out of Scope
Storage technology, sync intervals, local cache design.
Chapter 8 — Concurrency
8.1 Purpose
Prevent silent overwrites when multiple users affect the same document.
8.2 Concurrency Version
Every editable document shall maintain a Concurrency Version for conflict detection. The Constitution does not mandate a specific technical mechanism.
8.3 Scope
Concurrency applies to the entire governed document, not isolated fields only.
8.4 Draft Stage
Concurrent edits must be detected. Last write wins is prohibited. Conflicting operation shall be rejected; user shall reload latest version.
8.5 After Submit
Document is read-only except via Return workflow.
8.6 Protected Mutations
Save Draft, Submit, Approve, Reject, Send Back, Cancel, Post — must not execute twice on the same version without detection.
8.7 Posting Protection
Posting must not execute except on the latest valid document version after concurrency verification.
8.8 Conflict Resolution
Reject conflicting update; do not overwrite another user's changes; require reload before retry.
The platform shall reject conflicting updates using the platform's concurrency mechanism (implementation: Architecture Guide).
8.9 Relationship with Chapter 7
Draft ownership and draft locking — Chapter 7. Conflict detection during operations — this chapter.
8.10 Audit Integration
Concurrency conflicts shall be recorded in audit when appropriate.
8.11 Out of Scope
Specific HTTP codes, database locking mechanisms.
Part II — Document Identity
Chapter 9 — Document Numbering
9.1 Purpose
One auditable numbering policy for all document types.
9.2 System Document Number
Assigned by the platform only; users must not enter or edit.
Assigned at first Server Draft Save (Chapter 7.11).
Format: `{Type Prefix}-{Year}-{Sequence}` (e.g. GRN-2026-00001).
External references (e.g. supplier invoice number) are separate fields.
9.3 Rules
1. Uniqueness — unique within governed numbering scope.
2. Reservation — upon first Server Draft, number permanently reserved.
3. Deleted drafts — number never released or recycled.
4. Gap policy — gaps acceptable; numbers must not be reused.
5. Unified engine — all creation channels (manual, import, integration, future) use same numbering governance.
6. Prefix governance — prefixes governed centrally; modules must not configure independently unless authorized.
7. Failed allocation — gaps from failed/rolled-back operations acceptable.
8. Immutability — once assigned, number immutable for entire lifecycle.
9. Audit — allocation traceable through platform audit mechanisms.
10. Manual override — prohibited.
11. Annual reset — per prefix per year (or fiscal year per platform policy).
9.4 Out of Scope v2.0
Branch or property prefixes embedded in document numbers.
Part III — Data Integrity
Chapter 10 — Stock & Quantity
10.1 Movement Classes
Class	Examples	Stock check at posting
Inbound	Goods receipt, opening balance, positive adjustment	Not required
Outbound	Transfer, breakage, lost, issue, get pass dispatch	Required
10.2 Rules
Stock availability validated against latest committed inventory state at Posting.
Negative inventory prohibited in DX OSE v2.0.
Quantity must be greater than zero; zero-quantity lines prohibited.
Quantity precision per platform settings; validation uses precise values.
Stock validation against source inventory location defined by transaction.
All calculations use base unit.
Batch-controlled and serial-controlled inventory — Out of Scope v2.0.
No transaction shall violate constitutional stock integrity rules.
Inventory movements generated exclusively by Posted transactions.
Posted inventory movements shall never be edited; corrections via new governed transactions.
Inbound: no stock check. Outbound: authoritative on platform; client may warn only.
10.3 Out of Scope v2.0
Unit conversion within inventory movements; reservation (Chapter 2.4.5).
Chapter 11 — Display Currency
11.1 Purpose
Display formatting only — not accounting or conversion.
11.2 Scope
Property-level display currency.
11.3 Display Only
Changing display currency changes symbol and format only. It must not convert amounts, alter stored values, ledger, valuation, historical posted documents, or participate in financial calculations, inventory valuation, posting logic, taxation, or accounting transactions.
11.4 Application Scope
Display Currency shall apply consistently across all user interfaces, reports, dashboards, exported documents, and printed outputs unless explicitly governed otherwise.
Reports and PDF shall use property display currency as each channel is brought under this standard.
11.5 Format & Precision
Consistent presentation (e.g. SAR 150.00). Decimal places per currency rules (SAR/USD 2, JPY 0, KWD 3).
11.6 Immutability
Changing Property Display Currency must not modify historical posted documents or stored business data.
11.7 Configuration
Property settings — not inventory module settings.
11.8 Out of Scope v2.0
Exchange rates, multi-currency purchasing, multi-currency accounting.
Part IV — Document Composition
Chapter 12 — Document Header
12.1 Purpose
The document header represents the business identity of the document throughout its lifecycle.
12.2 Standard Fields
Fixed order where applicable: document number, status, workflow step, created by/date, property, department, warehouse, related party, period, display currency, total value, quick actions.
Optional fields omitted when not applicable; positions must not shift arbitrarily.
12.3 Field Classification
System fields (document number, status, created by/at, posted by/at, etc.) — must not be user-editable.
Business fields — subject to document rules and lifecycle.
Mandatory vs optional — per document type in Workflow Contracts / module policy.
12.4 Header Lock
Header fields shall become read-only once the document enters a non-editable lifecycle state unless explicitly governed otherwise.
12.5 Business Context
Changes to property, department, warehouse after lines exist or after workflow progress must require confirmation and shall follow document business rules (see BDR for line-clear policies).
12.6 Header–Line Consistency
Header information and document lines shall remain logically consistent throughout the lifecycle unless explicitly governed otherwise.
12.7 Extensibility
Modules may add header fields provided standard header order and positions are preserved.
Chapter 13 — Document Lines
13.1 Purpose
Unified grid behavior for all line-based documents.
13.2 Line Identity
Each line shall maintain a unique internal identity independent of display order or row number.
Display order is presentation only.
13.3 Governed Aspects
Column order, alignment, editable vs read-only, required columns, row validation, footer totals, add/delete, empty state, large datasets, keyboard navigation (Chapter 17).
13.4 Line Immutability
Posted document lines shall be immutable. Corrections via new governed business transactions.
13.5 Automatic Recalculation
Line values and calculated fields shall recalculate automatically per governed business rules when relevant data changes.
13.6 Header–Line Consistency
All lines shall remain consistent with governing business context in the header unless explicitly governed otherwise.
13.7 Calculated Totals
Document and line totals are system-calculated; must not be directly user-editable.
13.8 Duplicate Line Governance
Duplicate line behavior shall be defined by each business document according to functional requirements (not one global merge/prevent policy).
13.9 Line Audit
Significant line-level business changes shall be auditable per platform audit policy.
13.10 Performance
Large datasets shall not degrade usability (Chapter 27).
Chapter 14 — Attachments
14.1 Purpose
Consistent attachment experience via unified platform attachment capability (one behavior, module configuration only).
14.2 Categories
Invoice, evidence, supporting document, line photo, excel import, generated report, other — per module.
14.3 Lifecycle
State	Typical rights
Draft	Add, replace, delete
In review	View, download
Posted	Read-only
Posted attachments shall not be modified, replaced, or deleted.
Required attachments must block submit when missing.
14.4 File Validation Policy
Platform shall enforce allowed types, maximum size, and maximum count (values in platform policy, not this Constitution).
14.5 Security
Uploaded files shall comply with platform security validation policy.
14.6 Download Authorization
Download subject to same authorization as document view (and finer where required).
14.7 Attachment Lifecycle vs Entity
Attachment lifecycle follows linked entity (document or line).
14.8 Filename Governance
Original filename may display; platform defines internal storage identity — filenames must not serve as internal identifiers.
14.9 Audit
All attachment operations auditable.
14.10 Out of Scope
Preview UX details — UX Constitution.
Chapter 15 — Notes & Comments
15.1 Types
Workflow comment, internal note, system note, audit comment.
15.2 Mandatory Comments
Reject, Send Back, Cancel — reason required where defined.
15.3 Immutability
Workflow comments, system notes, and audit comments shall become immutable once recorded.
Internal notes visibility governed by platform authorization model.
15.4 System Notes
Generated exclusively by the platform; users must not manually create or modify.
15.5 Timeline
Notes and comments in chronological order within unified timeline (Chapter 22).
15.6 Visibility & Print
Per type policy; workflow comments in timeline; print inclusion per module policy.
Chapter 16 — Item Images
16.1 Purpose
Images support operational accuracy (especially count), not decoration.
16.2 Master Data Ownership
Item images are Item Master data; must not be created or modified through transactional documents.
16.3 Rules
Single source: Item Master
Thumbnails in operational screens where valuable
Standardized placeholder when no image
Bulk upload may be supported
Count sheet export/import compatibility when images included
Thumbnails in grids; not full resolution
Maximum 1 MB per image
Supported formats/dimensions per platform media policy
Unified export behavior when image absent
Part V — System Interaction Standards
Chapter 17 — Keyboard Navigation
17.1 Scope
All modules and shared experiences: documents, master data, settings, reports, dialogs.
17.2 Principles
Keyboard-first; Enter → next field (not submit/post/delete); Enter at row end → next row or add row; Shift+Enter → previous; Enter in textarea → new line; Esc closes lookup/calendar/small overlay; Tab standard browser order; invalid field retains focus; after item pick → quantity.
17.3 Additional Rules
Keyboard behavior consistent across all modules
Focus visually distinguishable
Skip disabled and hidden controls
Dialogs assign initial focus to primary interactive element
Global shortcuts centrally governed — modules must not introduce independent global shortcuts
17.4 Out of Scope
Global shortcut catalog (future amendment).
Chapter 18 — Validation
18.1 Golden Rule
One error type → one display channel.
Level	Channel
Field	Inline
Row	On row
Document	Summary banner
Confirmation	Dialog — not validation
Success	Chapter 20
System failure	Chapter 19
18.2 Rules
Errors disappear when fixed; submit → focus first error
Many errors: banner shows count; details at fields/rows
All messages support localization
Backend returns codes; platform presents translated text
Deterministic — same input + conditions → same result
Validation at data entry, workflow actions, posting per business rules
Client-side assists; server-side authoritative
Messages in logical order (header → lines → document)
Warnings informational unless governed; validation errors block operation
Must not duplicate same error across channels
18.3 Out of Scope
Individual message wording catalog.
Chapter 19 — Error Handling
19.1 Severity
Information, warning, validation error, blocking business error, system error.
19.2 Placement
Matches severity; no duplicate channels.
19.3 User Messages
Clear, actionable, free of technical implementation details.
Sensitive information (stack traces, SQL, internal IDs) must never be exposed to end users.
19.4 Recovery & Retry
Suggest next action; retry only when safe and meaningful.
19.5 Consistency
Equivalent conditions → consistent codes and experience.
Structured error codes and families are defined in the Architecture & Implementation Guide, not in this Constitution.
19.6 Logging
System errors logged per platform operational logging policy.
19.7 Accessibility
First error focusable and announced to assistive technology.
Chapter 20 — Notifications
20.1 Types
Success, information, warning, error, progress, reminder.
20.2 Principles
Unified dictionary; deduplication for same event; duration by severity; actionable links (open document, retry) where appropriate; must not rely on color alone.
20.3 Priority
Critical > Error > Warning > Success > Info.
20.4 Expiration
Transient notifications expire; critical items persist until user interaction where appropriate.
20.5 Permission Awareness
Must not notify user to open document they cannot access.
20.6 Separation
Notifications ≠ Validation ≠ Error Handling.
Chapter 21 — Loading & Progress
21.1 Principles
Loading scope matches operation; long operations show progress or status; action buttons disabled during action; double submission prohibited; sensible focus after completion.
21.2 Types
Skeleton (content), inline (buttons, lookups), progress (upload/import/export/print).
Must not block entire application for partial operations (aligned with UX Constitution).
21.3 Timeout
If loading exceeds reasonable duration, user shall be informed operation continues.
21.4 Cancel & Progressive Loading
Long operations should support cancel where safe; pages should render progressively.
21.5 Out of Scope
Exact timeout values — Architecture Guide.
Chapter 22 — Audit & Timeline
22.1 Required Audit Fields
Created, last modified, submitted, approved, rejected, posted — actor and timestamp where applicable.
22.2 Events
Every workflow action and significant attachment/line change must generate audit record.
22.3 Timeline
Single chronological timeline; immutable audit records; UTC internally, display per user time zone.
Timeline filtering permitted without altering records.
Concurrency conflicts recorded when appropriate (Chapter 8.10).
22.4 Print
Official print should include approval/audit summary where appropriate.
Part VI — Lookup & Search
Chapter 23 — Lookup Standard
23.1 Purpose
One lookup behavior for items, parties, locations, and references.
23.2 Profiles
Receiving, stock-based, catalog, issue — same UX; data scope differs.
23.3 Search
Code, name, barcode; ranking: exact code → exact barcode → prefix → contains; debounce before search; normalization (case/space insensitive).
23.4 Interaction
Keyboard ↑↓ Enter Esc Tab; close on select, outside click, field exit; one lookup open; focus to quantity after item pick in line entry.
23.5 States
Loading, no results, error+retry — unified messaging; unified empty states.
23.6 Governance
Permission filtering — only authorized data
Tenant isolation — no cross-tenant data
Large results — paging or infinite scroll per platform policy
Large catalogs — server-side search; loading entire catalogs prohibited
23.7 Out of Scope v2.0
Recent items, favorites.
Part VII — Presentation Standards
Chapter 24 — Workspace & Responsive
24.1 Device Policy
Desktop only for v2.0 operational data entry. Mobile/tablet entry out of scope unless future amendment.
24.2 Resolutions
Minimum 1366×768; reference design 1920×1080 @ 100%; supported 1440, 1600, 1920.
24.3 Zoom
80%–125%: required for release acceptance. 150%: best effort — not release gate.
24.4 Rules
No horizontal page scroll except inside grids; no clipped titles/overlapping buttons; create screens primary actions visible @ 1366/100%; dialogs fit viewport with internal scroll; tables scroll internally.
24.5 Browser & Display
Supported browsers per platform browser support matrix (Architecture Guide). High DPI (2K/4K) supported. Multi-monitor consistency.
24.6 Test Matrix
1366×768 @ 80/90/100/110/125%; 1440/1600/1920 @ 100% — Definition of Done (Chapter 29).
24.7 Relationship to UX Constitution
Geometry tokens — UX Constitution; this chapter — acceptance criteria.
Chapter 25 — Document Layout
25.1 Purpose
One document page pattern for create/edit; one for detail/workflow.
25.2 Archetypes
Create/Edit: masthead, alert band, body (header + lines), fixed action area.
Detail/Workflow: masthead, status, alert band, action bar, content, timeline.
Modules must not invent unrelated layouts. All modules must declare and follow one archetype.
25.3 Scroll Ownership
Primary scroll owner defined per archetype — must be consistent (details: UX Constitution + Architecture Guide).
25.4 Sticky Regions
Header, action bar, and primary actions should remain accessible per archetype without losing context.
25.5 Empty States & Density
Unified empty states; spacing/density per UX Constitution.
25.6 Section Collapse
Collapsible sections behave consistently across modules.
25.7 Golden Reference
Goods receipt create (after conformance) — create/edit reference; goods receipt detail — workflow reference.
25.8 Out of Scope
Exact pixel tokens — UX Constitution.
Chapter 26 — Printing & Export
26.1 Principles
Print and PDF export must match. Status watermarks (draft, posted, void, etc.). Header/footer with organization identity; page numbers and print metadata.
26.2 SSOT
Platform electronic record is authoritative; printed/exported copies are representations.
26.3 Authorization
Print and export subject to same permission model as view; export authorization explicit.
26.4 Sensitive Data
Sensitive data masked per authorization on export/print.
26.5 Draft Print
May be allowed with unofficial marking.
26.6 Audit
Print of sensitive documents should be logged.
26.7 Language
Arabic and English should be supported per property or user preference.
Part VIII — Platform Principles
Chapter 27 — Performance
27.1 Principles
Large lists — paging or virtual presentation; server-assisted search when warranted; debounce and cancel in-flight requests; heavy export/print asynchronous with user feedback.
27.2 Targets
Document entry responsive under normal hotel operations; exact metrics in QA acceptance criteria and Architecture Guide.
Chapter 28 — Accessibility
28.1 Principles
Interactive elements labeled; color not sole state indicator; contrast per agreed targets; accessibility in QA gates.
28.2 Screen Reader
Platform shall support screen reader compatibility for governed interactions.
28.3 Accessible Errors
Validation and error messages shall be accessible to assistive technology.
28.4 Relationship to Chapter 17
Keyboard/focus — Chapter 17; perception/assistive tech — this chapter.
28.5 Out of Scope v2.0
Full WCAG certification program — separate initiative.
Part IX — Conformance
Chapter 29 — Constitution Compliance & Ratification
29.1 Purpose
New and revised capabilities must declare applicable chapters and demonstrate compliance before release.
29.2 Compliance Levels
Fully Compliant | Partially Compliant (documented gaps + remediation plan) | Non-Compliant (not releasable without waiver).
29.3 Definition of Done
A screen/capability is compliant when all mandatory rules in applicable chapters are satisfied, including responsive test matrix where applicable.
29.4 Exceptions & Waivers
Exceptions require documented approval, scope, expiry, and registration. Architecture Exception Governance — waiver process formal; exceptions must not weaken audit, posting, or period rules.
29.5 Constitutional Review
New operational modules must undergo constitutional review before production approval.
29.6 Verification
QA validates against this Constitution and UX Constitution. Methods — Architecture Guide.
29.7 Conformance Backlog
Non-compliance tracked; backlog does not override Constitution.
29.8 Ratification
This Constitution v2.0 Final is ratified upon approval by Product & Governance and Enterprise Architecture.
Supersedes: DX OSE Document Constitution v1.0.
Subordinate: Architecture & Implementation Guides, BDR.
Appendix A — Business Decision Records (BDR) Index
ID	Title	Status
BDR-001	Reject terminates document; Return → edit → Submit; no Re-submit	Active
BDR-002	Draft-first for operational documents	Active
BDR-003	No automatic line merge; duplicate rules per document type	Active
BDR-004	Final Workflow Approval triggers Posting by default	Active
BDR-005	Evidence Package is not a separate permission	Active
BDR-006	Period Close uses Resolution Workspace	Active
BDR-007	Void vs Cancelled user-facing label	Active — user-facing terminal state = Void/Voided; action label = Cancel
BDR-008	Approved state optional — distinct stage before Posting only	Active
BDR-009	Item Business Rules (v1 ITM-1): duplicate messaging, supplier/warehouse change, base unit immutability after first movement	Active
Appendix B — Open Governance Notes
The following items remain Under Review and are explicitly excluded from normative SHALL/MUST requirements until ratified:
BDR-007 — Void vs Cancelled user-facing label — Active (Void/Voided state; Cancel action)
`````
