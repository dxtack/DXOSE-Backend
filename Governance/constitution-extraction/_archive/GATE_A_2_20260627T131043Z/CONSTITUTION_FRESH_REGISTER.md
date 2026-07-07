# DX OSE Constitution v2.0 Final — Fresh Register

Generated from `CONSTITUTION_FRESH_REGISTER.csv` (not hand-authored).

## Source

- **PDF path:** `c:\Users\amrsa\Downloads\New folder\DX_OSE_CONSTITUTION_v2.0_FINAL.pdf`
- **SHA-256:** `979F6C94ADAE6D1EEEA6A578E10FC50CE1836CB330873922179C5A028C37DED1`
- **Pages:** 47
- **Extraction timestamp:** 2026-06-27T13:00:22Z
- **Tool:** pdfplumber (Python 3.12)
- **Pipeline version:** gate-a.2
- **Total register rows:** 420


## Chapter 1 — Authority & Hierarchy

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C1-1.1-001 | 11 | 1.1 | Descriptive Context | Manual Reviewed — Confirmed | This Constitution establishes the governing principles, policies, standards, and mandatory rules ... |
| C1-1.1-002 | 11 | 1.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | It defines what the platform must do from a governance perspective. |
| C1-1.1-003 | 11 | 1.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | It is technology-neutral and shall remain valid regardless of changes to frontend, backend, datab... |
| C1-1.1-004 | 11 | 1.1 | Descriptive Context | Manual Reviewed — Confirmed | This Constitution is the Single Source of Truth (SSOT) for governance across the DX OSE ERP Platf... |
| C1-1.1-005 | 11 | 1.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | All subordinate governance, UX, workflow, access control, and implementation documents shall conf... |
| C1-1.2-001 | 11 | 1.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | When documents conflict, the higher-level document shall always prevail. |
| C1-1.2-002 | 11 | 1.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | No subordinate document may override or contradict this Constitution. |
| C1-1.2-003 | 11 | 1.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | The official governance library shall maintain, at minimum: |
| C1-1.2-004 | 11 | 1.2 | Governance Definition | Manual Reviewed — Confirmed | ● DX OSE Constitution |
| C1-1.2-005 | 11 | 1.2 | Governance Definition | Manual Reviewed — Confirmed | ● DX OSE UX Constitution |
| C1-1.2-006 | 11 | 1.2 | Governance Definition | Manual Reviewed — Confirmed | ● Business Decision Records (BDR) |
| C1-1.2-007 | 11 | 1.2 | Governance Definition | Manual Reviewed — Confirmed | ● Workflow Contracts |
| C1-1.2-008 | 11 | 1.2 | Governance Definition | Manual Reviewed — Confirmed | ● Access Control Catalog |
| C1-1.2-009 | 11 | 1.2 | Governance Definition | Manual Reviewed — Confirmed | ● Architecture Guide |
| C1-1.2-010 | 11 | 1.2 | Governance Definition | Manual Reviewed — Confirmed | ● Implementation Guide |
| C1-1.3-001 | 11 | 1.3 | Descriptive Context | Manual Reviewed — Confirmed | Section 1.3 Four Tiers has been removed in its entirety per Master Review Log ratification. |
| C1-1.3-002 | 11 | 1.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | This section number is reserved and shall not be reassigned to other content without explicit gov... |
| C1-1.4-001 | 11 | 1.4 | Descriptive Context | Manual Reviewed — Confirmed | This Constitution applies to all current and future operational modules of the DX OSE ERP Platform. |
| C1-1.4-002 | 11 | 1.4 | Descriptive Context | Manual Reviewed — Confirmed | Unless explicitly stated otherwise: |
| C1-1.4-003 | 12 | 1.4 | Descriptive Context | Manual Reviewed — Confirmed | Platform-wide chapters apply to all DX OSE modules and shared user experiences. |
| C1-1.4-004 | 12 | 1.4 | Descriptive Context | Manual Reviewed — Confirmed | Document-specific chapters apply to operational documents and document entry workflows. |
| C1-1.4-005 | 12 | 1.4 | Out of Scope | Manual Reviewed — Confirmed | Out of scope for this Constitution: |
| C1-1.4-006 | 12 | 1.4 | Out of Scope | Manual Reviewed — Confirmed | Technology stack |
| C1-1.4-007 | 12 | 1.4 | Out of Scope | Manual Reviewed — Confirmed | Internal implementation details |
| C1-1.4-008 | 12 | 1.4 | Out of Scope | Manual Reviewed — Confirmed | Database architecture |
| C1-1.4-009 | 12 | 1.4 | Out of Scope | Manual Reviewed — Confirmed | Integration implementation details Implementation detail belongs in Architecture & Implementation... |
| C1-1.5-001 | 12 | 1.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Normative keywords shall be interpreted exactly as defined in this chapter. |
| C1-1.5-002 | 12 | 1.5 | Constitution Authoring Guidance | Manual Reviewed — Confirmed | ● Avoid using Must where Should is sufficient. |
| C1-1.5-003 | 12 | 1.5 | Constitution Authoring Guidance | Manual Reviewed — Confirmed | ● Use Must only when a true obligation exists. |

## Chapter 2 — Document Lifecycle

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C2-2.1-001 | 13 | 2.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | DX OSE shall provide one consistent document lifecycle experience across all operational modules. |
| C2-2.1-002 | 13 | 2.1 | Descriptive Context | Manual Reviewed — Confirmed | Principle: The user experience is the contract. |
| C2-2.1-003 | 13 | 2.1 | Descriptive Context | Manual Reviewed — Confirmed | The implementation is an internal concern. |
| C2-2.1-004 | 13 | 2.1 | Optional Capability | Manual Reviewed — Confirmed | Modules may implement different internal workflows, provided that the user-facing lifecycle remai... |
| C2-2.1-005 | 13 | 2.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Internal workflow implementation, workflow step names, and internal status codes must never be ex... |
| C2-2.2-001 | 13 | 2.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Each user-facing lifecycle state shall represent one consistent business meaning across the entir... |
| C2-2.2-002 | 13 | 2.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | No module may redefine these meanings. |
| C2-2.2-003 | 13 | 2.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | No module may introduce additional user-facing lifecycle states unless they are first ratified in... |
| C2-2.2-004 | 13 | 2.2 | Governance Definition | Manual Reviewed — Confirmed | Draft Editable; no official operational or financial effect |
| C2-2.2-005 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | Submitted Sent into review |
| C2-2.2-006 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | In Review In an approval chain |
| C2-2.2-007 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | Approved *Optional.* Used only when a document has a distinct business stage between final approv... |
| C2-2.2-008 | 13 | 2.2 | Governance Definition | Manual Reviewed — Confirmed | Posted Official operational and financial effects applied |
| C2-2.2-009 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | Rejected Terminated; no resubmission of the same document |
| C2-2.2-010 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | Returned Sent back to creator for correction (Send Back) |
| C2-2.2-011 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | Void Formally cancelled before becoming part of the permanent business record |
| C2-2.2-012 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | Cancel is an action. |
| C2-2.2-013 | 13 | 2.2 | Descriptive Context | Manual Reviewed — Confirmed | Void is the lifecycle state resulting from cancellation before the document enters the governed p... |
| C2-2.2-014 | 13 | 2.2 | Excluded Pending Ratification | Manual Reviewed — Confirmed | A separate user-facing state named Cancelled shall not be introduced unless ratified in this Cons... |
| C2-2.3-001 | 13 | 2.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Each module shall provide a consistent mapping between internal workflow states and standardized ... |
| C2-2.3-002 | 13 | 2.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Internal workflow identifiers, status codes, enum names, workflow step names, and other implement... |
| C2-2.3-003 | 13 | 2.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Identical business outcomes shall always resolve to the same standardized user-facing lifecycle s... |
| C2-2.4.1-001 | 14 | 2.4.1 | Descriptive Context | Manual Reviewed — Confirmed | Posting is the single business commit point for all operational and financial effects within the ... |
| C2-2.4.1-002 | 14 | 2.4.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | No operational or financial effect shall be considered official before Posting unless this Consti... |
| C2-2.4.2-001 | 14 | 2.4.2 | Descriptive Context | Manual Reviewed — Confirmed | Operational reports represent official business results, including stock balance, inventory ledge... |
| C2-2.4.2-002 | 14 | 2.4.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Rule: Operational reports shall derive operational and financial results exclusively from Posted ... |
| C2-2.4.3-001 | 14 | 2.4.3 | Descriptive Context | Manual Reviewed — Confirmed | Workflow reports represent workflow progress and operational monitoring (pending approvals, finan... |
| C2-2.4.3-002 | 14 | 2.4.3 | Optional Capability | Manual Reviewed — Confirmed | Rule: Workflow reports may include Draft, Submitted, In Review, Returned, Rejected, Posted, and o... |
| C2-2.4.4-001 | 14 | 2.4.4 | Descriptive Context | Manual Reviewed — Confirmed | Evidence Package is not a reporting category. |
| C2-2.4.4-002 | 14 | 2.4.4 | Descriptive Context | Manual Reviewed — Confirmed | It comprises document-level proof artifacts (PDF, print output, evidence export, timeline, audit ... |
| C2-2.4.4-003 | 14 | 2.4.4 | Descriptive Context | Manual Reviewed — Confirmed | It is governed under Document Composition and Audit chapters. |
| C2-2.4.5-001 | 14 | 2.4.5 | Descriptive Context | Manual Reviewed — Confirmed | Inventory reservation is governed by business policy. |
| C2-2.4.5-002 | 14 | 2.4.5 | Descriptive Context | Manual Reviewed — Confirmed | The default DX OSE behavior is no reservation before Posting unless explicitly defined by a ratif... |
| C2-2.5-001 | 14 | 2.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Editability shall be governed exclusively by document lifecycle state, not by individual screen i... |
| C2-2.6-001 | 14 | 2.6 | Descriptive Context | Manual Reviewed — Confirmed | Delete is permitted only while the document is in Draft. |
| C2-2.6-002 | 14 | 2.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Once a document leaves Draft, Delete must not be available. |
| C2-2.6-003 | 14 | 2.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Business termination shall use governed lifecycle actions (Cancel, Reject, Void, Close, etc.). |
| C2-2.6-004 | 15 | 2.6 | Descriptive Context | Manual Reviewed — Confirmed | Deletion permanently removes a document before it becomes part of the business record. |
| C2-2.6-005 | 15 | 2.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Once a document enters the governed lifecycle, business termination actions shall replace deletion. |
| C2-2.7-001 | 15 | 2.7 | Descriptive Context | Manual Reviewed — Confirmed | After Return: Edit → Submit. |
| C2-2.7-002 | 15 | 2.7 | Product Enforceable Requirement | Manual Reviewed — Confirmed | There shall be no separate action named Re-submit. |
| C2-2.7-003 | 15 | 2.7 | Descriptive Context | Manual Reviewed — Confirmed | Submit always represents entering the workflow, whether for the first time or after Return. |
| C2-2.7-004 | 15 | 2.7 | Product Enforceable Requirement | Manual Reviewed — Confirmed | After Reject, the same document must not re-enter workflow. |
| C2-2.7-005 | 15 | 2.7 | Descriptive Context | Manual Reviewed — Confirmed | A new document is required. |
| C2-2.8-001 | 15 | 2.8 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Every document detail view shall present a unified timeline showing, as applicable: current state... |
| C2-2.9-001 | 15 | 2.9 | Descriptive Context | Manual Reviewed — Confirmed | Cancel Creator action Void (per Ch. 2.2) |
| C2-2.9-002 | 15 | 2.9 | Descriptive Context | Manual Reviewed — Confirmed | Reject Reviewer workflow action Rejected |
| C2-2.9-003 | 15 | 2.9 | Descriptive Context | Manual Reviewed — Confirmed | Close Lifecycle completion action Closed |
| C2-2.10-001 | 15 | 2.10 | Out of Scope | Manual Reviewed — Confirmed | Workflow engine implementation, state machine design, database schema, API contracts, technical i... |

## Chapter 3 — Workflow & Actions

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C3-3.1-001 | 16 | 3.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Users shall see only the actions they need for their role and document state. |
| C3-3.1-002 | 16 | 3.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Action behavior shall remain consistent across all DX OSE modules regardless of workflow implemen... |
| C3-3.1-003 | 16 | 3.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | No module may invent alternative names for standard actions unless ratified in this Constitution. |
| C3-3.2-001 | 16 | 3.2 | Descriptive Context | Manual Reviewed — Confirmed | Save Draft, Submit, Cancel. |
| C3-3.2-002 | 16 | 3.2 | Descriptive Context | Manual Reviewed — Confirmed | Cancel is an action, not a lifecycle state. |
| C3-3.2-003 | 16 | 3.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Alternative labels with the same meaning (Abort, Discard, Cancel Document) must not be used. |
| C3-3.3-001 | 16 | 3.3 | Descriptive Context | Manual Reviewed — Confirmed | Approve, Send Back, Reject. |
| C3-3.3-002 | 16 | 3.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Reviewer actions shall be available only while the document is actively assigned to the current r... |
| C3-3.4-001 | 16 | 3.4 | Descriptive Context | Manual Reviewed — Confirmed | Ends document No Yes |
| C3-3.4-002 | 16 | 3.4 | Descriptive Context | Manual Reviewed — Confirmed | Allows edit Yes No |
| C3-3.4-003 | 16 | 3.4 | Descriptive Context | Manual Reviewed — Confirmed | Reason required Yes Yes |
| C3-3.4-004 | 16 | 3.4 | Governance Definition | Manual Reviewed — Confirmed | Next step Edit → Submit New document if operation repeats |
| C3-3.4-005 | 16 | 3.4 | Descriptive Context | Manual Reviewed — Confirmed | Business transaction Continues Terminates |
| C3-3.5-001 | 16 | 3.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | There shall be only one primary action for the current document state. |
| C3-3.6-001 | 16 | 3.6 | Descriptive Context | Manual Reviewed — Confirmed | Primary → Secondary → Neutral → Danger |
| C3-3.7-001 | 16 | 3.7 | Descriptive Context | Manual Reviewed — Confirmed | Layer Determines Workflow Contracts & Who; when; routing; next step ACC This Constitution Meaning... |
| C3-3.8-001 | 16 | 3.8 | Out of Scope | Manual Reviewed — Confirmed | Icons, colors, visual styling, animations — DX OSE UX Constitution. |

## Chapter 4 — Operation Permissions

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C4-4.1-001 | 17 | 4.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Operation permissions govern authorization only and shall never replace workflow validation, life... |
| C4-4.1-002 | 17 | 4.1 | Descriptive Context | Manual Reviewed — Confirmed | The Access Control Catalog (ACC) is the single source of truth for permissions. |
| C4-4.2-001 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | View |
| C4-4.2-002 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Create |
| C4-4.2-003 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Edit |
| C4-4.2-004 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Delete |
| C4-4.2-005 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Submit |
| C4-4.2-006 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Approve |
| C4-4.2-007 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Reject |
| C4-4.2-008 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Send Back |
| C4-4.2-009 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Cancel |
| C4-4.2-010 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Post |
| C4-4.2-011 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Reopen |
| C4-4.2-012 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Close |
| C4-4.2-013 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Archive |
| C4-4.2-014 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Print |
| C4-4.2-015 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Export |
| C4-4.2-016 | 17 | 4.2 | Governance Definition | Manual Reviewed — Confirmed | Attach |
| C4-4.2-017 | 17 | 4.2 | Descriptive Context | Manual Reviewed — Confirmed | View Audit. |
| C4-4.2-018 | 17 | 4.2 | Descriptive Context | Manual Reviewed — Confirmed | Evidence Package is part of document representation, not an independent business operation, and d... |
| C4-4.3-001 | 17 | 4.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Permissions shall never bypass document lifecycle rules. |
| C4-4.3-002 | 17 | 4.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Permissions grant eligibility, not execution authority. |
| C4-4.3-003 | 17 | 4.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Action Allowed = Permission + Workflow + Lifecycle + Business Rules + Scope. |
| C4-4.3-004 | 17 | 4.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Modules shall not introduce alternative operation names for standardized operations. |
| C4-4.4-001 | 17 | 4.4 | Out of Scope | Manual Reviewed — Confirmed | Permission key naming, role matrix maintenance, role hierarchy, permission inheritance, technical... |

## Chapter 5 — Posting

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C5-5.1-001 | 18 | 5.1 | Descriptive Context | Manual Reviewed — Confirmed | Posting is the single irreversible business commit point for all operational and financial effect... |
| C5-5.1-002 | 18 | 5.1 | Descriptive Context | Manual Reviewed — Confirmed | Posting is the only operation permitted to create official operational and financial business eff... |
| C5-5.1-003 | 18 | 5.1 | Descriptive Context | Manual Reviewed — Confirmed | Documents become business-immutable after Posting except through formally governed reversal or ad... |
| C5-5.2-001 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | user authority |
| C5-5.2-002 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | valid workflow state |
| C5-5.2-003 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | open inventory/financial period (Posting Date) |
| C5-5.2-004 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | full document revalidation |
| C5-5.2-005 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | stock availability for outbound documents |
| C5-5.2-006 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Final validation — full revalidation immediately before Posting regardless of prior validation. |
| C5-5.2-007 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Transaction boundary — single transactional boundary; partial posting prohibited. |
| C5-5.2-008 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Atomicity — any failure leaves document and related business data completely unchanged. |
| C5-5.2-009 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Idempotency — repeating the same posting request shall never create additional effects. |
| C5-5.2-010 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Posting trigger — Posting is automatically triggered upon successful final workflow approval unle... |
| C5-5.2-011 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Final Workflow Approval = business authorization for Posting. |
| C5-5.2-012 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | No additional posting confirmation is required by default. |
| C5-5.2-013 | 18 | 5.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Posting behavior shall remain deterministic and repeat-safe throughout the platform. |
| C5-5.3-001 | 18 | 5.3 | Descriptive Context | Manual Reviewed — Confirmed | Approval authorizes progression within workflow. |
| C5-5.3-002 | 18 | 5.3 | Descriptive Context | Manual Reviewed — Confirmed | Posting applies official operational and financial effects. |
| C5-5.3-003 | 18 | 5.3 | Descriptive Context | Manual Reviewed — Confirmed | Workflow Contracts define whether final approval leads directly to Posting or to an optional Appr... |
| C5-5.4-001 | 18 | 5.4 | Out of Scope | Manual Reviewed — Confirmed | Reversal procedures, inventory recalculation, ledger repair, historical data correction — separat... |

## Chapter 6 — Period Management

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C6-6.1-001 | 19 | 6.1 | Descriptive Context | Manual Reviewed — Confirmed | Period Management preserves inventory integrity, financial integrity, audit integrity, and report... |
| C6-6.1-002 | 19 | 6.1 | Optional Capability | Manual Reviewed — Confirmed | It governs when transactions may officially affect inventory and financial records. |
| C6-6.2-001 | 19 | 6.2 | Descriptive Context | Manual Reviewed — Confirmed | DX OSE formally recognizes Inventory Period and Financial Period. |
| C6-6.2-002 | 19 | 6.2 | Optional Capability | Manual Reviewed — Confirmed | The current implementation may manage both using a shared calendar while allowing future separation. |
| C6-6.3-001 | 19 | 6.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Each document shall permanently maintain Document Date, Posting Date, and Assigned Posting Period. |
| C6-6.3-002 | 19 | 6.3 | Descriptive Context | Manual Reviewed — Confirmed | Document Date — actual business event date. |
| C6-6.3-003 | 19 | 6.3 | Descriptive Context | Manual Reviewed — Confirmed | Posting Date — official accounting and inventory recognition date. |
| C6-6.3-004 | 19 | 6.3 | Descriptive Context | Manual Reviewed — Confirmed | Assigned Posting Period — determined at Posting, permanently recorded. |
| C6-6.3-005 | 19 | 6.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Document Date and Posting Date are independent and must never be treated as interchangeable. |
| C6-6.4-001 | 19 | 6.4 | Descriptive Context | Manual Reviewed — Confirmed | Open, Closing, Closed, Archived |
| C6-6.4-002 | 19 | 6.4 | Optional Capability | Manual Reviewed — Confirmed | Closing — controlled validation phase before period may close. |
| C6-6.5-001 | 19 | 6.5 | Descriptive Context | Manual Reviewed — Confirmed | Posting permitted only when Posting Period is Open and all validations pass. |
| C6-6.5-002 | 19 | 6.5 | Descriptive Context | Manual Reviewed — Confirmed | Future posting restrictions apply to Posting Date only, not Document Date. |
| C6-6.5-003 | 19 | 6.5 | Optional Capability | Manual Reviewed — Confirmed | Historical Document Date may be accepted if business policy allows and posting period is open. |
| C6-6.5-004 | 19 | 6.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Posting into Closed period prohibited. |
| C6-6.5-005 | 19 | 6.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Periods close sequentially; periods must not overlap. |
| C6-6.5-006 | 19 | 6.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Period validation is centralized; modules shall not implement independent period logic. |
| C6-6.5-007 | 19 | 6.5 | Descriptive Context | Manual Reviewed — Confirmed | Assigned Posting Period is immutable after Posting. |
| C6-6.6-001 | 19 | 6.6 | Descriptive Context | Manual Reviewed — Confirmed | Period Close is a governed business process, not a simple validation failure. |
| C6-6.6-002 | 19 | 6.6 | Descriptive Context | Manual Reviewed — Confirmed | Validation phase: centralized validation with progress indication when Close Period is initiated. |
| C6-6.6-003 | 19 | 6.6 | Descriptive Context | Manual Reviewed — Confirmed | Resolution workspace when blocking conditions exist: |
| C6-6.6-004 | 19 | 6.6 | Descriptive Context | Manual Reviewed — Confirmed | Tab 1 — Close Validation: draft documents, pending workflow, approved-not-posted, validation fail... |
| C6-6.6-005 | 19 | 6.6 | Descriptive Context | Manual Reviewed — Confirmed | Tab 2 — Closed Periods: history (period, closed by, closed at, notes, audit). |
| C6-6.6-006 | 19 | 6.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Principle: The platform shall provide governed period-close resolution whenever blocking conditio... |
| C6-6.6-007 | 19 | 6.6 | Descriptive Context | Manual Reviewed — Confirmed | Integrates with Draft Governance (Chapter 7). |
| C6-6.7-001 | 19 | 6.7 | Descriptive Context | Manual Reviewed — Confirmed | Prevent invalid Posting Dates proactively where possible. |
| C6-6.8-001 | 20 | 6.8 | Descriptive Context | Manual Reviewed — Confirmed | Governed by separate financial governance policy — intentionally deferred from this Constitution. |
| C6-6.9-001 | 20 | 6.9 | Out of Scope | Manual Reviewed — Confirmed | Fiscal calendar configuration, accounting policies, year-end financial closing, financial reopeni... |

## Chapter 7 — Draft & Document State Protection

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C7-7.1-001 | 21 | 7.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | These must remain separate policies. |
| C7-7.2-001 | 21 | 7.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Every operational document shall begin as a server-recognized draft unless Workflow Contracts def... |
| C7-7.3-001 | 21 | 7.3 | Descriptive Context | Manual Reviewed — Confirmed | Temporary buffer (not official draft) → Server draft → Workflow document after Submit. |
| C7-7.4-001 | 21 | 7.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | The platform shall define: draft owner; access rights; ownership transfer (if permitted); handlin... |
| C7-7.5-001 | 21 | 7.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Rules for opening the same draft from multiple sessions or devices shall align with Chapter 8 (Co... |
| C7-7.6-001 | 21 | 7.6 | Optional Capability | Manual Reviewed — Confirmed | Internal draft lifecycle states (e.g. active, submitted, discarded, expired) may exist; not all n... |
| C7-7.7-001 | 21 | 7.7 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Auto-save shall occur on meaningful business events (add/delete row, qty/price change, supplier/w... |
| C7-7.7-002 | 21 | 7.7 | Descriptive Context | Manual Reviewed — Confirmed | Not on fixed timers defined in this Constitution. |
| C7-7.8-001 | 21 | 7.8 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Recovered drafts shall not bypass current validation. |
| C7-7.8-002 | 21 | 7.8 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Restored documents must be revalidated before continue or submit. |
| C7-7.8-003 | 21 | 7.8 | Descriptive Context | Manual Reviewed — Confirmed | Recovery prompt: Continue or Discard. |
| C7-7.8-004 | 21 | 7.8 | Strong Recommendation | Manual Reviewed — Confirmed | Last saved indicator should be visible. |
| C7-7.9-001 | 21 | 7.9 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Draft registry required per document family. |
| C7-7.9-002 | 21 | 7.9 | Descriptive Context | Manual Reviewed — Confirmed | Default retention 30 days. |
| C7-7.9-003 | 21 | 7.9 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Expiration policy (delete, archive, expired state) shall be defined by platform policy. |
| C7-7.10-001 | 21 | 7.10 | Descriptive Context | Manual Reviewed — Confirmed | Applies to: route navigation, browser refresh, browser/tab close, back navigation, session expira... |
| C7-7.10-002 | 21 | 7.10 | Descriptive Context | Manual Reviewed — Confirmed | Successful Save Draft or Submit returns to clean state. |
| C7-7.11-001 | 22 | 7.11 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Upon successful creation of the first Server Draft, the System Document Number becomes permanentl... |
| C7-7.12-001 | 22 | 7.12 | Descriptive Context | Manual Reviewed — Confirmed | Not supported — cloud ERP. |
| C7-7.13-001 | 22 | 7.13 | Out of Scope | Manual Reviewed — Confirmed | Storage technology, sync intervals, local cache design. |

## Chapter 8 — Concurrency

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C8-8.1-001 | 23 | 8.1 | Descriptive Context | Manual Reviewed — Confirmed | Prevent silent overwrites when multiple users affect the same document. |
| C8-8.2-001 | 23 | 8.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Every editable document shall maintain a Concurrency Version for conflict detection. |
| C8-8.2-002 | 23 | 8.2 | Descriptive Context | Manual Reviewed — Confirmed | The Constitution does not mandate a specific technical mechanism. |
| C8-8.3-001 | 23 | 8.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Concurrency applies to the entire governed document, not isolated fields only. |
| C8-8.4-001 | 23 | 8.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Concurrent edits must be detected. |
| C8-8.4-002 | 23 | 8.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Last write wins is prohibited. |
| C8-8.4-003 | 23 | 8.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Conflicting operation shall be rejected; user shall reload latest version. |
| C8-8.5-001 | 23 | 8.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Document is read-only except via Return workflow. |
| C8-8.6-001 | 23 | 8.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Save Draft, Submit, Approve, Reject, Send Back, Cancel, Post — must not execute twice on the same... |
| C8-8.7-001 | 23 | 8.7 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Posting must not execute except on the latest valid document version after concurrency verification. |
| C8-8.8-001 | 23 | 8.8 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Reject conflicting update; do not overwrite another user's changes; require reload before retry. |
| C8-8.8-002 | 23 | 8.8 | Product Enforceable Requirement | Manual Reviewed — Confirmed | The platform shall reject conflicting updates using the platform's concurrency mechanism (impleme... |
| C8-8.9-001 | 23 | 8.9 | Descriptive Context | Manual Reviewed — Confirmed | Draft ownership and draft locking — Chapter 7. |
| C8-8.9-002 | 23 | 8.9 | Descriptive Context | Manual Reviewed — Confirmed | Conflict detection during operations — this chapter. |
| C8-8.10-001 | 23 | 8.10 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Concurrency conflicts shall be recorded in audit when appropriate. |
| C8-8.11-001 | 23 | 8.11 | Out of Scope | Manual Reviewed — Confirmed | Specific HTTP codes, database locking mechanisms. |

## Chapter 9 — Document Numbering

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C9-9.1-001 | 24 | 9.1 | Descriptive Context | Manual Reviewed — Confirmed | One auditable numbering policy for all document types. |
| C9-9.2-001 | 24 | 9.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Assigned by the platform only; users must not enter or edit. |
| C9-9.2-002 | 24 | 9.2 | Descriptive Context | Manual Reviewed — Confirmed | Assigned at first Server Draft Save (Chapter 7.11). |
| C9-9.2-003 | 24 | 9.2 | Descriptive Context | Manual Reviewed — Confirmed | Format: `{Type Prefix}-{Year}-{Sequence}` (e.g. GRN-2026-00001). |
| C9-9.2-004 | 24 | 9.2 | Descriptive Context | Manual Reviewed — Confirmed | External references (e.g. supplier invoice number) are separate fields. |
| C9-9.3-001 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Uniqueness — unique within governed numbering scope. |
| C9-9.3-002 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Reservation — upon first Server Draft, number permanently reserved. |
| C9-9.3-003 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Deleted drafts — number never released or recycled. |
| C9-9.3-004 | 24 | 9.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Gap policy — gaps acceptable; numbers must not be reused. |
| C9-9.3-005 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Unified engine — all creation channels (manual, import, integration, future) use same numbering g... |
| C9-9.3-006 | 24 | 9.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Prefix governance — prefixes governed centrally; modules must not configure independently unless ... |
| C9-9.3-007 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Failed allocation — gaps from failed/rolled-back operations acceptable. |
| C9-9.3-008 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Immutability — once assigned, number immutable for entire lifecycle. |
| C9-9.3-009 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Audit — allocation traceable through platform audit mechanisms. |
| C9-9.3-010 | 24 | 9.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Manual override — prohibited. |
| C9-9.3-011 | 24 | 9.3 | Descriptive Context | Manual Reviewed — Confirmed | Annual reset — per prefix per year (or fiscal year per platform policy). |
| C9-9.4-001 | 24 | 9.4 | Out of Scope | Manual Reviewed — Confirmed | Branch or property prefixes embedded in document numbers. |

## Chapter 10 — Stock & Quantity

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C10-10.1-001 | 25 | 10.1 | Descriptive Context | Manual Reviewed — Confirmed | Class Examples Stock check at posting Inbound Goods receipt, opening balance, positive adjustment... |
| C10-10.2-001 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Stock availability validated against latest committed inventory state at Posting. |
| C10-10.2-002 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Negative inventory prohibited in DX OSE v2.0. |
| C10-10.2-003 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Quantity must be greater than zero; zero-quantity lines prohibited. |
| C10-10.2-004 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Quantity precision per platform settings; validation uses precise values. |
| C10-10.2-005 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Stock validation against source inventory location defined by transaction. |
| C10-10.2-006 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | All calculations use base unit. |
| C10-10.2-007 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Batch-controlled and serial-controlled inventory — Out of Scope v2.0. |
| C10-10.2-008 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | No transaction shall violate constitutional stock integrity rules. |
| C10-10.2-009 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Inventory movements generated exclusively by Posted transactions. |
| C10-10.2-010 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Posted inventory movements shall never be edited; corrections via new governed transactions. |
| C10-10.2-011 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Inbound: ●  no stock check |
| C10-10.2-012 | 25 | 10.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Outbound: authoritative on platform; client may warn only |
| C10-10.3-001 | 25 | 10.3 | Out of Scope | Manual Reviewed — Confirmed | Unit conversion within inventory movements; reservation (Chapter 2.4.5). |

## Chapter 11 — Display Currency

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C11-11.1-001 | 26 | 11.1 | Descriptive Context | Manual Reviewed — Confirmed | Display formatting only — not accounting or conversion. |
| C11-11.2-001 | 26 | 11.2 | Descriptive Context | Manual Reviewed — Confirmed | Property-level display currency. |
| C11-11.3-001 | 26 | 11.3 | Descriptive Context | Manual Reviewed — Confirmed | Changing display currency changes symbol and format only. |
| C11-11.3-002 | 26 | 11.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | It must not convert amounts, alter stored values, ledger, valuation, historical posted documents,... |
| C11-11.4-001 | 26 | 11.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Display Currency shall apply consistently across all user interfaces, reports, dashboards, export... |
| C11-11.4-002 | 26 | 11.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Reports and PDF shall use property display currency as each channel is brought under this standard. |
| C11-11.5-001 | 26 | 11.5 | Descriptive Context | Manual Reviewed — Confirmed | Decimal places per currency rules (SAR/USD 2, JPY 0, KWD 3). |
| C11-11.6-001 | 26 | 11.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Changing Property Display Currency must not modify historical posted documents or stored business... |
| C11-11.7-001 | 26 | 11.7 | Descriptive Context | Manual Reviewed — Confirmed | Property settings — not inventory module settings. |
| C11-11.8-001 | 26 | 11.8 | Out of Scope | Manual Reviewed — Confirmed | Exchange rates, multi-currency purchasing, multi-currency accounting. |

## Chapter 12 — Document Header

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C12-12.1-001 | 27 | 12.1 | Descriptive Context | Manual Reviewed — Confirmed | The document header represents the business identity of the document throughout its lifecycle. |
| C12-12.2-001 | 27 | 12.2 | Descriptive Context | Manual Reviewed — Confirmed | Fixed order where applicable: document number, status, workflow step, created by/date, property, ... |
| C12-12.2-002 | 27 | 12.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Optional fields omitted when not applicable; positions must not shift arbitrarily. |
| C12-12.3-001 | 27 | 12.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | System fields (document number, status, created by/at, posted by/at, etc.) — must not be useredit... |
| C12-12.3-002 | 27 | 12.3 | Descriptive Context | Manual Reviewed — Confirmed | Business fields — subject to document rules and lifecycle. |
| C12-12.3-003 | 27 | 12.3 | Descriptive Context | Manual Reviewed — Confirmed | Mandatory vs optional — per document type in Workflow Contracts / module policy. |
| C12-12.4-001 | 27 | 12.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Header fields shall become read-only once the document enters a non-editable lifecycle state unle... |
| C12-12.5-001 | 27 | 12.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Changes to property, department, warehouse after lines exist or after workflow progress must requ... |
| C12-12.6-001 | 27 | 12.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Header information and document lines shall remain logically consistent throughout the lifecycle ... |
| C12-12.7-001 | 27 | 12.7 | Optional Capability | Manual Reviewed — Confirmed | Modules may add header fields provided standard header order and positions are preserved. |

## Chapter 13 — Document Lines

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C13-13.1-001 | 28 | 13.1 | Descriptive Context | Manual Reviewed — Confirmed | Unified grid behavior for all line-based documents. |
| C13-13.2-001 | 28 | 13.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Each line shall maintain a unique internal identity independent of display order or row number. |
| C13-13.2-002 | 28 | 13.2 | Descriptive Context | Manual Reviewed — Confirmed | Display order is presentation only. |
| C13-13.3-001 | 28 | 13.3 | Descriptive Context | Manual Reviewed — Confirmed | Column order, alignment, editable vs read-only, required columns, row validation, footer totals, ... |
| C13-13.4-001 | 28 | 13.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Posted document lines shall be immutable. |
| C13-13.4-002 | 28 | 13.4 | Descriptive Context | Manual Reviewed — Confirmed | Corrections via new governed business transactions. |
| C13-13.5-001 | 28 | 13.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Line values and calculated fields shall recalculate automatically per governed business rules whe... |
| C13-13.6-001 | 28 | 13.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | All lines shall remain consistent with governing business context in the header unless explicitly... |
| C13-13.7-001 | 28 | 13.7 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Document and line totals are system-calculated; must not be directly user-editable. |
| C13-13.8-001 | 28 | 13.8 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Duplicate line behavior shall be defined by each business document according to functional requir... |
| C13-13.9-001 | 28 | 13.9 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Significant line-level business changes shall be auditable per platform audit policy. |
| C13-13.10-001 | 28 | 13.10 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Large datasets shall not degrade usability (Chapter 27). |

## Chapter 14 — Attachments

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C14-14.1-001 | 29 | 14.1 | Descriptive Context | Manual Reviewed — Confirmed | Consistent attachment experience via unified platform attachment capability (one behavior, module... |
| C14-14.2-001 | 29 | 14.2 | Descriptive Context | Manual Reviewed — Confirmed | Invoice, evidence, supporting document, line photo, excel import, generated report, other — per m... |
| C14-14.3-001 | 29 | 14.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | State Typical rights Draft Add, replace, delete In review View, download Posted Read-only Posted ... |
| C14-14.3-002 | 29 | 14.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Required attachments must block submit when missing. |
| C14-14.4-001 | 29 | 14.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Platform shall enforce allowed types, maximum size, and maximum count (values in platform policy,... |
| C14-14.5-001 | 29 | 14.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Uploaded files shall comply with platform security validation policy. |
| C14-14.6-001 | 29 | 14.6 | Descriptive Context | Manual Reviewed — Confirmed | Download subject to same authorization as document view (and finer where required). |
| C14-14.7-001 | 29 | 14.7 | Descriptive Context | Manual Reviewed — Confirmed | Attachment lifecycle follows linked entity (document or line). |
| C14-14.8-001 | 29 | 14.8 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Original filename may display; platform defines internal storage identity — filenames must not se... |
| C14-14.9-001 | 29 | 14.9 | Descriptive Context | Manual Reviewed — Confirmed | All attachment operations auditable. |
| C14-14.10-001 | 29 | 14.10 | Out of Scope | Manual Reviewed — Confirmed | Preview UX details — UX Constitution. |

## Chapter 15 — Notes & Comments

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C15-15.1-001 | 30 | 15.1 | Descriptive Context | Manual Reviewed — Confirmed | Workflow comment, internal note, system note, audit comment. |
| C15-15.2-001 | 30 | 15.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Reject, Send Back, Cancel — reason required where defined. |
| C15-15.3-001 | 30 | 15.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Workflow comments, system notes, and audit comments shall become immutable once recorded. |
| C15-15.3-002 | 30 | 15.3 | Descriptive Context | Manual Reviewed — Confirmed | Internal notes visibility governed by platform authorization model. |
| C15-15.4-001 | 30 | 15.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Generated exclusively by the platform; users must not manually create or modify. |
| C15-15.5-001 | 30 | 15.5 | Descriptive Context | Manual Reviewed — Confirmed | Notes and comments in chronological order within unified timeline (Chapter 22). |
| C15-15.6-001 | 30 | 15.6 | Descriptive Context | Manual Reviewed — Confirmed | Per type policy; workflow comments in timeline; print inclusion per module policy. |

## Chapter 16 — Item Images

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C16-16.1-001 | 31 | 16.1 | Descriptive Context | Manual Reviewed — Confirmed | Images support operational accuracy (especially count), not decoration. |
| C16-16.2-001 | 31 | 16.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Item images are Item Master data; must not be created or modified through transactional documents. |
| C16-16.3-001 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Single source: Item Master |
| C16-16.3-002 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Thumbnails in operational screens where valuable |
| C16-16.3-003 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Standardized placeholder when no image |
| C16-16.3-004 | 31 | 16.3 | Optional Capability | Manual Reviewed — Confirmed | Bulk upload may be supported |
| C16-16.3-005 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Count sheet export/import compatibility when images included |
| C16-16.3-006 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Thumbnails in grids; not full resolution |
| C16-16.3-007 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Maximum 1 MB per image |
| C16-16.3-008 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Supported formats/dimensions per platform media policy |
| C16-16.3-009 | 31 | 16.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Unified export behavior when image absent |

## Chapter 17 — Keyboard Navigation

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C17-17.1-001 | 32 | 17.1 | Descriptive Context | Manual Reviewed — Confirmed | All modules and shared experiences: documents, master data, settings, reports, dialogs. |
| C17-17.2-001 | 32 | 17.2 | Descriptive Context | Manual Reviewed — Confirmed | Keyboard-first |
| C17-17.2-002 | 32 | 17.2 | Descriptive Context | Manual Reviewed — Confirmed | Enter → next field (not submit/post/delete) |
| C17-17.2-003 | 32 | 17.2 | Descriptive Context | Manual Reviewed — Confirmed | Enter at row end → next row or add row |
| C17-17.2-004 | 32 | 17.2 | Descriptive Context | Manual Reviewed — Confirmed | Shift+Enter → previous |
| C17-17.2-005 | 32 | 17.2 | Descriptive Context | Manual Reviewed — Confirmed | Enter in textarea → new line |
| C17-17.2-006 | 32 | 17.2 | Descriptive Context | Manual Reviewed — Confirmed | Esc closes lookup/calendar/small overlay |
| C17-17.2-007 | 32 | 17.2 | Descriptive Context | Manual Reviewed — Confirmed | Tab standard browser order |
| C17-17.3-001 | 32 | 17.3 | Descriptive Context | Manual Reviewed — Confirmed | Keyboard behavior consistent across all modules |
| C17-17.3-002 | 32 | 17.3 | Descriptive Context | Manual Reviewed — Confirmed | Focus visually distinguishable |
| C17-17.3-003 | 32 | 17.3 | Descriptive Context | Manual Reviewed — Confirmed | Skip disabled and hidden controls |
| C17-17.3-004 | 32 | 17.3 | Descriptive Context | Manual Reviewed — Confirmed | Dialogs assign initial focus to primary interactive element |
| C17-17.3-005 | 32 | 17.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Global shortcuts centrally governed — modules must not introduce independent global shortcuts |
| C17-17.4-001 | 32 | 17.4 | Out of Scope | Manual Reviewed — Confirmed | Global shortcut catalog (future amendment). |

## Chapter 18 — Validation

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C18-18.1-001 | 33 | 18.1 | Descriptive Context | Manual Reviewed — Confirmed | One error type → one display channel. |
| C18-18.1-002 | 33 | 18.1 | Descriptive Context | Manual Reviewed — Confirmed | Field Inline Row On row Document Summary banner Confirmation Dialog — not validation Success Chap... |
| C18-18.2-001 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Errors disappear when fixed; submit → focus first error |
| C18-18.2-002 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Many errors: banner shows count; details at fields/rows |
| C18-18.2-003 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | All messages support localization |
| C18-18.2-004 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Backend returns codes; platform presents translated text |
| C18-18.2-005 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Deterministic — same input + conditions → same result |
| C18-18.2-006 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Validation at data entry, workflow actions, posting per business rules |
| C18-18.2-007 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Client-side assists; server-side authoritative |
| C18-18.2-008 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Messages in logical order (header → lines → document) |
| C18-18.2-009 | 33 | 18.2 | Descriptive Context | Manual Reviewed — Confirmed | Warnings informational unless governed; validation errors block operation |
| C18-18.2-010 | 33 | 18.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Must not duplicate same error across channels |
| C18-18.3-001 | 33 | 18.3 | Out of Scope | Manual Reviewed — Confirmed | Individual message wording catalog. |

## Chapter 19 — Error Handling

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C19-19.1-001 | 34 | 19.1 | Descriptive Context | Manual Reviewed — Confirmed | Information, warning, validation error, blocking business error, system error. |
| C19-19.2-001 | 34 | 19.2 | Descriptive Context | Manual Reviewed — Confirmed | Matches severity; no duplicate channels. |
| C19-19.3-001 | 34 | 19.3 | Descriptive Context | Manual Reviewed — Confirmed | Clear, actionable, free of technical implementation details. |
| C19-19.3-002 | 34 | 19.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Sensitive information (stack traces, SQL, internal IDs) must never be exposed to end users. |
| C19-19.4-001 | 34 | 19.4 | Descriptive Context | Manual Reviewed — Confirmed | Suggest next action; retry only when safe and meaningful. |
| C19-19.5-001 | 34 | 19.5 | Descriptive Context | Manual Reviewed — Confirmed | Equivalent conditions → consistent codes and experience. |
| C19-19.5-002 | 34 | 19.5 | Descriptive Context | Manual Reviewed — Confirmed | Structured error codes and families are defined in the Architecture & Implementation Guide, not i... |
| C19-19.6-001 | 34 | 19.6 | Descriptive Context | Manual Reviewed — Confirmed | System errors logged per platform operational logging policy. |
| C19-19.7-001 | 34 | 19.7 | Descriptive Context | Manual Reviewed — Confirmed | First error focusable and announced to assistive technology. |

## Chapter 20 — Notifications

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C20-20.1-001 | 35 | 20.1 | Descriptive Context | Manual Reviewed — Confirmed | Success, information, warning, error, progress, reminder. |
| C20-20.2-001 | 35 | 20.2 | Descriptive Context | Manual Reviewed — Confirmed | Unified dictionary |
| C20-20.3-001 | 35 | 20.3 | Descriptive Context | Manual Reviewed — Confirmed | Critical > Error > Warning > Success > Info. |
| C20-20.4-001 | 35 | 20.4 | Descriptive Context | Manual Reviewed — Confirmed | Transient notifications expire; critical items persist until user interaction where appropriate. |
| C20-20.5-001 | 35 | 20.5 | Descriptive Context | Manual Reviewed — Confirmed | Must not notify user to open document they cannot access. |
| C20-20.6-001 | 35 | 20.6 | Descriptive Context | Manual Reviewed — Confirmed | Notifications ≠ Validation ≠ Error Handling. |

## Chapter 21 — Loading & Progress

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C21-21.1-001 | 36 | 21.1 | Governance Definition | Manual Reviewed — Confirmed | Loading scope matches operation |
| C21-21.2-001 | 36 | 21.2 | Descriptive Context | Manual Reviewed — Confirmed | Skeleton (content), inline (buttons, lookups), progress (upload/import/export/print). |
| C21-21.2-002 | 36 | 21.2 | Descriptive Context | Manual Reviewed — Confirmed | Must not block entire application for partial operations (aligned with UX Constitution). |
| C21-21.3-001 | 36 | 21.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | If loading exceeds reasonable duration, user shall be informed operation continues. |
| C21-21.4-001 | 36 | 21.4 | Strong Recommendation | Manual Reviewed — Confirmed | Long operations should support cancel where safe; pages should render progressively. |
| C21-21.5-001 | 36 | 21.5 | Out of Scope | Manual Reviewed — Confirmed | Exact timeout values — Architecture Guide. |

## Chapter 22 — Audit & Timeline

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C22-22.1-001 | 37 | 22.1 | Descriptive Context | Manual Reviewed — Confirmed | Created, last modified, submitted, approved, rejected, posted — actor and timestamp where applica... |
| C22-22.2-001 | 37 | 22.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Every workflow action and significant attachment/line change must generate audit record. |
| C22-22.3-001 | 37 | 22.3 | Descriptive Context | Manual Reviewed — Confirmed | Single chronological timeline; immutable audit records; UTC internally, display per user time zone. |
| C22-22.3-002 | 37 | 22.3 | Descriptive Context | Manual Reviewed — Confirmed | Timeline filtering permitted without altering records. |
| C22-22.3-003 | 37 | 22.3 | Descriptive Context | Manual Reviewed — Confirmed | Concurrency conflicts recorded when appropriate (Chapter 8.10). |
| C22-22.4-001 | 37 | 22.4 | Strong Recommendation | Manual Reviewed — Confirmed | Official print should include approval/audit summary where appropriate. |

## Chapter 23 — Lookup Standard

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C23-23.1-001 | 38 | 23.1 | Descriptive Context | Manual Reviewed — Confirmed | One lookup behavior for items, parties, locations, and references. |
| C23-23.2-001 | 38 | 23.2 | Descriptive Context | Manual Reviewed — Confirmed | Receiving, stock-based, catalog, issue — same UX; data scope differs. |
| C23-23.3-001 | 38 | 23.3 | Descriptive Context | Manual Reviewed — Confirmed | Code, name, barcode; ranking: exact code → exact barcode → prefix → contains; debounce before sea... |
| C23-23.4-001 | 38 | 23.4 | Descriptive Context | Manual Reviewed — Confirmed | Keyboard ↑↓ Enter Esc Tab; close on select, outside click, field exit; one lookup open; focus to ... |
| C23-23.5-001 | 38 | 23.5 | Descriptive Context | Manual Reviewed — Confirmed | Loading, no results, error+retry — unified messaging; unified empty states. |
| C23-23.6-001 | 38 | 23.6 | Descriptive Context | Manual Reviewed — Confirmed | Permission filtering — only authorized data |
| C23-23.6-002 | 38 | 23.6 | Descriptive Context | Manual Reviewed — Confirmed | Tenant isolation — no cross-tenant data |
| C23-23.6-003 | 38 | 23.6 | Descriptive Context | Manual Reviewed — Confirmed | Large results — paging or infinite scroll per platform policy |
| C23-23.6-004 | 38 | 23.6 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Large catalogs — server-side search; loading entire catalogs prohibited |
| C23-23.7-001 | 38 | 23.7 | Out of Scope | Manual Reviewed — Confirmed | Recent items, favorites. |

## Chapter 24 — Workspace & Responsive

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C24-24.1-001 | 39 | 24.1 | Descriptive Context | Manual Reviewed — Confirmed | Desktop only for v2.0 operational data entry. |
| C24-24.1-002 | 39 | 24.1 | Descriptive Context | Manual Reviewed — Confirmed | Mobile/tablet entry out of scope unless future amendment. |
| C24-24.2-001 | 39 | 24.2 | Descriptive Context | Manual Reviewed — Confirmed | Minimum 1366×768; reference design 1920×1080 @ 100%; supported 1440, 1600, 1920. |
| C24-24.3-001 | 39 | 24.3 | Descriptive Context | Manual Reviewed — Confirmed | 80%–125%: required for release acceptance. |
| C24-24.3-002 | 39 | 24.3 | Descriptive Context | Manual Reviewed — Confirmed | 150%: best effort — not release gate. |
| C24-24.4-001 | 39 | 24.4 | Descriptive Context | Manual Reviewed — Confirmed | No horizontal page scroll except inside grids |
| C24-24.5-001 | 39 | 24.5 | Descriptive Context | Manual Reviewed — Confirmed | Supported browsers per platform browser support matrix (Architecture Guide). |
| C24-24.5-002 | 39 | 24.5 | Descriptive Context | Manual Reviewed — Confirmed | High DPI (2K/4K) supported. |
| C24-24.5-003 | 39 | 24.5 | Descriptive Context | Manual Reviewed — Confirmed | Multi-monitor consistency. |
| C24-24.6-001 | 39 | 24.6 | Descriptive Context | Manual Reviewed — Confirmed | 1366×768 @ 80/90/100/110/125%; 1440/1600/1920 @ 100% — Definition of Done (Chapter 29). |
| C24-24.7-001 | 39 | 24.7 | Descriptive Context | Manual Reviewed — Confirmed | Geometry tokens — UX Constitution; this chapter — acceptance criteria. |

## Chapter 25 — Document Layout

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C25-25.1-001 | 40 | 25.1 | Descriptive Context | Manual Reviewed — Confirmed | One document page pattern for create/edit; one for detail/workflow. |
| C25-25.2-001 | 40 | 25.2 | Descriptive Context | Manual Reviewed — Confirmed | Create/Edit: masthead, alert band, body (header + lines), fixed action area. |
| C25-25.2-002 | 40 | 25.2 | Descriptive Context | Manual Reviewed — Confirmed | Detail/Workflow: masthead, status, alert band, action bar, content, timeline. |
| C25-25.2-003 | 40 | 25.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Modules must not invent unrelated layouts. |
| C25-25.2-004 | 40 | 25.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | All modules must declare and follow one archetype. |
| C25-25.3-001 | 40 | 25.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Primary scroll owner defined per archetype — must be consistent (details: UX Constitution + Archi... |
| C25-25.4-001 | 40 | 25.4 | Strong Recommendation | Manual Reviewed — Confirmed | Header, action bar, and primary actions should remain accessible per archetype without losing con... |
| C25-25.5-001 | 40 | 25.5 | Descriptive Context | Manual Reviewed — Confirmed | Unified empty states; spacing/density per UX Constitution. |
| C25-25.6-001 | 40 | 25.6 | Descriptive Context | Manual Reviewed — Confirmed | Collapsible sections behave consistently across modules. |
| C25-25.7-001 | 40 | 25.7 | Descriptive Context | Manual Reviewed — Confirmed | Goods receipt create (after conformance) — create/edit reference; goods receipt detail — workflow... |
| C25-25.8-001 | 40 | 25.8 | Out of Scope | Manual Reviewed — Confirmed | Exact pixel tokens — UX Constitution. |

## Chapter 26 — Printing & Export

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C26-26.1-001 | 41 | 26.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Print and PDF export must match. |
| C26-26.1-002 | 41 | 26.1 | Descriptive Context | Manual Reviewed — Confirmed | Status watermarks (draft, posted, void, etc.). |
| C26-26.1-003 | 41 | 26.1 | Descriptive Context | Manual Reviewed — Confirmed | Header/footer with organization identity; page numbers and print metadata. |
| C26-26.2-001 | 41 | 26.2 | Descriptive Context | Manual Reviewed — Confirmed | Platform electronic record is authoritative; printed/exported copies are representations. |
| C26-26.3-001 | 41 | 26.3 | Descriptive Context | Manual Reviewed — Confirmed | Print and export subject to same permission model as view; export authorization explicit. |
| C26-26.4-001 | 41 | 26.4 | Descriptive Context | Manual Reviewed — Confirmed | Sensitive data masked per authorization on export/print. |
| C26-26.5-001 | 41 | 26.5 | Descriptive Context | Manual Reviewed — Confirmed | May be allowed with unofficial marking. |
| C26-26.6-001 | 41 | 26.6 | Strong Recommendation | Manual Reviewed — Confirmed | Print of sensitive documents should be logged. |
| C26-26.7-001 | 41 | 26.7 | Strong Recommendation | Manual Reviewed — Confirmed | Arabic and English should be supported per property or user preference. |

## Chapter 27 — Performance

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C27-27.1-001 | 42 | 27.1 | Descriptive Context | Manual Reviewed — Confirmed | Large lists — paging or virtual presentation |
| C27-27.2-001 | 42 | 27.2 | Descriptive Context | Manual Reviewed — Confirmed | Document entry responsive under normal hotel operations; exact metrics in QA acceptance criteria ... |

## Chapter 28 — Accessibility

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C28-28.1-001 | 43 | 28.1 | Descriptive Context | Manual Reviewed — Confirmed | Interactive elements labeled; color not sole state indicator; contrast per agreed targets; access... |
| C28-28.2-001 | 43 | 28.2 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Platform shall support screen reader compatibility for governed interactions. |
| C28-28.3-001 | 43 | 28.3 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Validation and error messages shall be accessible to assistive technology. |
| C28-28.4-001 | 43 | 28.4 | Descriptive Context | Manual Reviewed — Confirmed | Keyboard/focus — Chapter 17; perception/assistive tech — this chapter. |
| C28-28.5-001 | 43 | 28.5 | Out of Scope | Manual Reviewed — Confirmed | Full WCAG certification program — separate initiative. |

## Chapter 29 — Constitution Compliance & Ratification

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| C29-29.1-001 | 44 | 29.1 | Product Enforceable Requirement | Manual Reviewed — Confirmed | New and revised capabilities must declare applicable chapters and demonstrate compliance before r... |
| C29-29.2-001 | 44 | 29.2 | Descriptive Context | Manual Reviewed — Confirmed | Fully Compliant \| Partially Compliant (documented gaps + remediation plan) \| Non-Compliant (not... |
| C29-29.3-001 | 44 | 29.3 | Governance Process Requirement | Manual Reviewed — Confirmed | A screen/capability is compliant when all mandatory rules in applicable chapters are satisfied, i... |
| C29-29.4-001 | 44 | 29.4 | Descriptive Context | Manual Reviewed — Confirmed | Exceptions require documented approval, scope, expiry, and registration. |
| C29-29.4-002 | 44 | 29.4 | Product Enforceable Requirement | Manual Reviewed — Confirmed | Architecture Exception Governance — waiver process formal; exceptions must not weaken audit, post... |
| C29-29.5-001 | 44 | 29.5 | Product Enforceable Requirement | Manual Reviewed — Confirmed | New operational modules must undergo constitutional review before production approval. |
| C29-29.6-001 | 44 | 29.6 | Descriptive Context | Manual Reviewed — Confirmed | QA validates against this Constitution and UX Constitution. |
| C29-29.6-002 | 44 | 29.6 | Descriptive Context | Manual Reviewed — Confirmed | Methods — Architecture Guide. |
| C29-29.7-001 | 44 | 29.7 | Governance Process Requirement | Manual Reviewed — Confirmed | Non-compliance tracked; backlog does not override Constitution. |
| C29-29.8-001 | 44 | 29.8 | Governance Process Requirement | Manual Reviewed — Confirmed | This Constitution v2.0 Final is ratified upon approval by Product & Governance and Enterprise Arc... |
| C29-29.8-002 | 44 | 29.8 | Descriptive Context | Manual Reviewed — Confirmed | Supersedes: DX OSE Document Constitution v1.0. |
| C29-29.8-003 | 44 | 29.8 | Descriptive Context | Manual Reviewed — Confirmed | Subordinate: Architecture & Implementation Guides, BDR. |

## Chapter A — Business Decision Records (BDR) Index

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| CA-A-001 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Reject terminates document; Return → edit → Submit; no Re-submit Active |
| CA-A-002 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Draft-first for operational documents Active |
| CA-A-003 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- No automatic line merge; duplicate rules per document type Active |
| CA-A-004 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Final Workflow Approval triggers Posting by default Active |
| CA-A-005 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Evidence Package is not a separate permission Active |
| CA-A-006 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Period Close uses Resolution Workspace Active |
| CA-A-007 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Void vs Cancelled user-facing label Under |
| CA-A-008 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Approved state optional — distinct stage before Posting only Active |
| CA-A-009 | 45 | A | Reference Index | Manual Reviewed — Confirmed | BDR- Item Business Rules (v1 ITM-1): duplicate messaging, supplier/warehouse change, Active |

## Chapter B — Open Governance Notes

| Fresh ID | Page | Section | Category | Semantic Review | Exact Source |
|----------|------|---------|----------|-----------------|--------------|
| CB-B-002 | 46 | B | Excluded Pending Ratification | Manual Reviewed — Confirmed | BDR-007 — Void vs Cancelled user-facing label — Under Review |
