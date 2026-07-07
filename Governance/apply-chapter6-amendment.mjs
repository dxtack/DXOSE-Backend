#!/usr/bin/env node
/**
 * One-time Chapter 6 D1–D12 constitutional amendment artifact updater.
 * Does NOT run remediate-ch6-11.mjs. Preserves historical evidence as superseded.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const GOV = path.join(ROOT, 'Governance');
const AMENDMENT = 'SUPERSEDED BY CHAPTER 6 D1–D12 AMENDMENT';
const CONSTITUTIONAL_STATUS =
  'CONSTITUTIONALLY APPROVED — IMPLEMENTATION PENDING — NOT YET VERIFIED';

/** @type {{ section: string, sub: number, text: string, scope: string, decision?: string, category?: string }[]} */
const CH6_REQUIREMENTS = [
  // §6.1 Purpose and Scope (D1, D11)
  { section: '6.1', sub: 1, text: 'Period Management preserves inventory integrity, financial integrity, audit integrity, and reporting consistency.', scope: 'Platform-wide', category: 'Descriptive Context' },
  { section: '6.1', sub: 2, text: 'Period Management governs when transactions may officially affect inventory and financial records.', scope: 'Platform-wide', category: 'Descriptive Context' },
  { section: '6.1', sub: 3, text: 'The sole operational close mechanism in DX OSE is Monthly Period Close. Annual Close as an independent period, process, snapshot, or lock is prohibited.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
  { section: '6.1', sub: 4, text: 'This chapter applies to all modules that create, modify, or report inventory or ledger truth, including current and future posting entry points.', scope: 'Platform-wide', category: 'Product Enforceable Requirement' },
  { section: '6.1', sub: 5, text: 'Period Management integrates with Draft Governance (Chapter 7), Access Control Catalog (Chapter 4 / ACC), and Audit requirements platform-wide.', scope: 'Platform-wide', category: 'Descriptive Context' },
  // §6.2 Period Registry (D11)
  { section: '6.2', sub: 1, text: 'Each hotel (tenant) shall maintain an explicit Period Registry record for every calendar month (month ∈ {1, 2, …, 12}) and fiscal year.', scope: 'Financial', decision: 'D11', category: 'Product Enforceable Requirement' },
  { section: '6.2', sub: 2, text: 'A period shall not be considered open merely because no registry record exists. Implicit open periods are prohibited.', scope: 'Financial', decision: 'D11', category: 'Product Enforceable Requirement' },
  { section: '6.2', sub: 3, text: 'The Period Registry is the Single Source of Truth for posting availability, Manual Close, Reopen, Re-close, Auto Close, period history, and audit references.', scope: 'Financial', decision: 'D11', category: 'Product Enforceable Requirement' },
  { section: '6.2', sub: 4, text: 'Each Period Registry record shall identify tenant (hotel), year, month (1–12; null month values are prohibited), and status (see §6.3).', scope: 'Financial', decision: 'D1,D11', category: 'Product Enforceable Requirement' },
  { section: '6.2', sub: 5, text: 'Period records shall be created and managed sequentially per hotel. Periods shall close sequentially; overlapping closed periods are prohibited.', scope: 'Financial', decision: 'D11', category: 'Product Enforceable Requirement' },
  { section: '6.2', sub: 6, text: 'Inventory Period and Financial Period shall be managed through the shared monthly Period Registry unless a future governance decision explicitly separates them.', scope: 'Financial', category: 'Descriptive Context' },
  // §6.3 Period States (D11)
  { section: '6.3', sub: 1, text: 'The official period states are OPEN, CLOSING, and CLOSED. The state Archived is not a period registry state; historical snapshots and reports use SUPERSEDED versioning (§6.11, §6.17).', scope: 'Financial', decision: 'D11', category: 'Governance Definition' },
  { section: '6.3', sub: 2, text: 'While a period is OPEN, the platform shall operate normally for all users according to ACC-granted permissions without additional close-related permissions beyond standard operational authority.', scope: 'Financial', category: 'Product Enforceable Requirement' },
  { section: '6.3', sub: 3, text: 'Transition OPEN → CLOSING applies to initial Monthly Close and Re-close after Reopen; entry shall immediately run full Close Validation (§6.8) and expose the Close Resolution Workspace (§6.9); entry does not require a clean validation result beforehand.', scope: 'Financial', decision: 'D7,D11', category: 'Product Enforceable Requirement' },
  { section: '6.3', sub: 4, text: 'Transition CLOSING → CLOSED shall occur only when Blockers = 0 (§6.8.3); upon transition the platform shall build the Closing Snapshot (§6.12) and assign snapshot version status per §6.11.', scope: 'Financial', decision: 'D3,D7', category: 'Product Enforceable Requirement' },
  { section: '6.3', sub: 5, text: 'Users holding PERIOD_CLOSE_RESOLUTION or equivalent close-workspace authority may cancel CLOSING → OPEN without completing close.', scope: 'Financial', decision: 'D9', category: 'Product Enforceable Requirement' },
  { section: '6.3', sub: 6, text: 'Reopen transition CLOSED → OPEN is governed by §6.10 and shall not delete or replace existing snapshot versions.', scope: 'Financial', decision: 'D2,D3', category: 'Product Enforceable Requirement' },
  // §6.4 Monthly Close and December (D1)
  { section: '6.4', sub: 1, text: 'Monthly Period Close shall use one Close Engine, one Validation contract (§6.8), and one ACC permission model (§6.15) for all months.', scope: 'Financial', decision: 'D1,D10', category: 'Product Enforceable Requirement' },
  { section: '6.4', sub: 2, text: 'December (month = 12) shall follow identical close logic as all other months.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
  { section: '6.4', sub: 3, text: 'The user interface shall display December using the descriptive label "December - Year End Closing". This label is presentational only and shall not introduce a separate year-end process, snapshot, lock, or permission.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
  { section: '6.4', sub: 4, text: 'The CURRENT Snapshot Version produced by closing December shall constitute the Closing Snapshot for that calendar year and the Opening Basis for January (month = 1) of the following calendar year.', scope: 'Financial', decision: 'D1,D3', category: 'Product Enforceable Requirement' },
  { section: '6.4', sub: 5, text: 'No additional annual snapshot shall be created. The platform must not maintain month = null period records.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
  { section: '6.4', sub: 6, text: 'Annual reporting shall derive from twelve closed monthly periods. A separate Annual Close step is prohibited.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
  { section: '6.4', sub: 7, text: 'If December is reopened and subsequently re-closed, the latest CURRENT Snapshot Version for December shall become the new Opening Basis for the following January.', scope: 'Financial', decision: 'D1,D2,D3', category: 'Product Enforceable Requirement' },
  // §6.5 Posting Date (D5)
  { section: '6.5', sub: 1, text: 'Every operation that affects inventory or the Inventory Ledger shall have an explicit Posting Date.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 2, text: 'Default Posting Date shall be the current calendar date at the time of posting.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 3, text: 'Users may select any Posting Date within an OPEN period, subject to §6.5.4–§6.5.6.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 4, text: 'Future Posting Dates are prohibited.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 5, text: 'Posting Dates falling within a CLOSED period are prohibited, in both user interface and backend enforcement.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 6, text: 'After a period closes, the default Posting Date shall advance to a date within the current OPEN period.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 7, text: 'Document Date represents the business event date. Document Date does not determine financial or inventory period attribution. Posting Date determines official effect.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 8, text: 'Document Date and Posting Date are independent and must never be treated as interchangeable.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 9, text: 'At posting commit, each affected document shall permanently record Posting Date and Assigned Posting Period (YYYY-MM derived from Posting Date).', scope: 'Operational', decision: 'D5,D6', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 10, text: 'Assigned Posting Period shall be immutable after posting.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 11, text: 'Posting Date restrictions apply to Posting Date only, not Document Date.', scope: 'Operational', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.5', sub: 12, text: 'The platform shall prevent invalid Posting Dates proactively in the user interface wherever date selection is offered.', scope: 'UX', decision: 'D5', category: 'Product Enforceable Requirement' },
  // §6.6 Ledger Period Attribution (D6)
  { section: '6.6', sub: 1, text: 'Every Inventory Ledger entry shall contain directly postingDate and assignedPostingPeriod.', scope: 'Financial', decision: 'D6', category: 'Product Enforceable Requirement' },
  { section: '6.6', sub: 2, text: 'createdAt shall represent system record creation time only.', scope: 'Financial', decision: 'D6', category: 'Product Enforceable Requirement' },
  { section: '6.6', sub: 3, text: 'Use of createdAt to determine financial month, inventory period, report period boundaries, snapshot reconstruction, or reconciliation period attribution is prohibited.', scope: 'Financial', decision: 'D6', category: 'Product Enforceable Requirement' },
  { section: '6.6', sub: 4, text: 'Reports, Closing Snapshots, reconciliation, and period-scoped analytics shall use Posting Date and Assigned Posting Period.', scope: 'Financial', decision: 'D6,D4', category: 'Product Enforceable Requirement' },
  { section: '6.6', sub: 5, text: 'Ledger entries shall receive Posting Date and Assigned Posting Period at creation, consistent with the posting source document or posting operation.', scope: 'Financial', decision: 'D6', category: 'Product Enforceable Requirement' },
  // §6.7 Central Period Guard (D5)
  { section: '6.7', sub: 1, text: 'Period validation shall be centralized in one Central Period Guard service layer.', scope: 'Financial', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.7', sub: 2, text: 'All modules that post to inventory or ledger shall invoke the Central Period Guard. Independent period logic within individual modules is prohibited.', scope: 'Financial', decision: 'D5', category: 'Product Enforceable Requirement' },
  { section: '6.7', sub: 3, text: 'The Central Period Guard shall enforce Period Registry state, Posting Date rules, prohibition of posting into CLOSED periods, prohibition of future Posting Dates, and Assigned Posting Period derivation and immutability after posting.', scope: 'Financial', decision: 'D5,D11', category: 'Product Enforceable Requirement' },
  { section: '6.7', sub: 4, text: 'Posting shall be permitted only when the Assigned Posting Period corresponds to a registry period in OPEN state (including periods reopened per §6.10).', scope: 'Financial', decision: 'D5,D11', category: 'Product Enforceable Requirement' },
  { section: '6.7', sub: 5, text: 'All current and future posting entry points shall register with the governed posting engine and shall not bypass the Central Period Guard.', scope: 'Financial', decision: 'D5', category: 'Product Enforceable Requirement' },
  // §6.8 Close Validation (D7)
  { section: '6.8', sub: 1, text: 'Period Close is a governed business process, not a mere validation failure response.', scope: 'Financial', decision: 'D7', category: 'Descriptive Context' },
  { section: '6.8', sub: 2, text: 'Upon transition to CLOSING, the platform shall execute full Close Validation and present all findings to users holding appropriate ACC permissions.', scope: 'Financial', decision: 'D7,D9', category: 'Product Enforceable Requirement' },
  { section: '6.8', sub: 3, text: 'Close and Re-close shall proceed to CLOSED only when Blockers = 0.', scope: 'Financial', decision: 'D7', category: 'Product Enforceable Requirement' },
  { section: '6.8', sub: 4, text: 'Conditions that do not affect close correctness may be classified as WARNING or INFO.', scope: 'Financial', decision: 'D7', category: 'Governance Definition' },
  { section: '6.8', sub: 5, text: 'Pending or incomplete documents, unposted pre-posted workflow states, incomplete transfers/GRNs/movements/counts, pending approvals, integrity failures, zero-WAC with on-hand quantity, and Get Pass conditions per §6.13 shall be BLOCKERS unless resolved through the Close Resolution Workspace.', scope: 'Financial', decision: 'D7,D8', category: 'Product Enforceable Requirement' },
  { section: '6.8', sub: 6, text: 'Use of environment flags, tenant settings, or administrative overrides to bypass BLOCKERS for Close or Re-close is prohibited.', scope: 'Financial', decision: 'D7', category: 'Product Enforceable Requirement' },
  { section: '6.8', sub: 7, text: 'Manual Close and Auto Close shall use the same Validation engine and Blocker catalog.', scope: 'Financial', decision: 'D7,D10', category: 'Product Enforceable Requirement' },
  // §6.9 Close Resolution Workspace (D7, D9)
  { section: '6.9', sub: 1, text: 'While a period is in CLOSING, the platform shall provide a Close Resolution Workspace whenever blocking or resolvable conditions exist.', scope: 'Financial', decision: 'D7', category: 'Product Enforceable Requirement' },
  { section: '6.9', sub: 2, text: 'The platform shall provide governed period-close resolution rather than merely rejecting close requests.', scope: 'Financial', decision: 'D7', category: 'Product Enforceable Requirement' },
  { section: '6.9', sub: 3, text: 'Users holding required ACC permissions may Post or Delete pending documents from the workspace when those documents had no prior stock or ledger effect.', scope: 'Financial', decision: 'D7,D9', category: 'Product Enforceable Requirement' },
  { section: '6.9', sub: 4, text: 'Post and Delete actions in the Close Resolution Workspace shall require explicit ACC permission codes. Authority shall not be hardcoded to any role name.', scope: 'Financial', decision: 'D9', category: 'Product Enforceable Requirement' },
  { section: '6.9', sub: 5, text: 'The Close Resolution Workspace shall integrate with Draft Governance (Chapter 7) for draft and pre-posted document handling.', scope: 'Financial', decision: 'D7', category: 'Product Enforceable Requirement' },
  { section: '6.9', sub: 6, text: 'The workspace shall expose Close Validation (blockers, warnings, pending documents, integrity findings) and Closed Periods / Period Details (history, snapshot versions, audit timeline).', scope: 'Financial', decision: 'D3,D7', category: 'Product Enforceable Requirement' },
  // §6.10 Reopen and Re-close (D2)
  { section: '6.10', sub: 1, text: 'Reopen shall be permitted only for the latest closed period per hotel.', scope: 'Financial', decision: 'D2', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 2, text: 'Reopen must follow reverse sequential order. Only the latest closed period may be reopened.', scope: 'Financial', decision: 'D2', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 3, text: 'Skipping a later closed period to reopen an earlier period is prohibited.', scope: 'Financial', decision: 'D2', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 4, text: 'Reopen shall require a mandatory Reason recorded in audit.', scope: 'Financial', decision: 'D2', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 5, text: 'Reopen shall transition the period from CLOSED to OPEN. Existing snapshot versions shall remain preserved (§6.11).', scope: 'Financial', decision: 'D2,D3', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 6, text: 'While reopened and OPEN, posting into that period shall be permitted subject to Posting Date rules (§6.5) and Central Period Guard (§6.7).', scope: 'Financial', decision: 'D2,D5', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 7, text: 'After corrections, Re-close shall follow OPEN → CLOSING → CLOSED; entry to CLOSING starts Re-close Validation; transition to CLOSED requires Blockers = 0.', scope: 'Financial', decision: 'D2,D7', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 8, text: 'Re-close shall create a new Snapshot Version (§6.11) using Closing Snapshot rules (§6.12).', scope: 'Financial', decision: 'D2,D3,D4', category: 'Product Enforceable Requirement' },
  { section: '6.10', sub: 9, text: 'Reopen authority shall be governed by ACC permission PERIOD_REOPEN_EXECUTE. Re-close authority shall use PERIOD_RECLOSE_EXECUTE.', scope: 'Financial', decision: 'D2,D9', category: 'Product Enforceable Requirement' },
  // §6.11 Snapshot Versioning (D3)
  { section: '6.11', sub: 1, text: 'Deletion of prior Closing Snapshots is prohibited.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  { section: '6.11', sub: 2, text: 'Every Close and every Re-close shall create a new independent Snapshot Version.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  { section: '6.11', sub: 3, text: 'Snapshot Version status shall be CURRENT (latest approved) or SUPERSEDED (prior version replaced by later Close or Re-close).', scope: 'Financial', decision: 'D3', category: 'Governance Definition' },
  { section: '6.11', sub: 4, text: 'Exactly one Snapshot Version per period shall be CURRENT at any time.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  { section: '6.11', sub: 5, text: 'All Snapshot Versions and their lines shall be read-only after creation.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  { section: '6.11', sub: 6, text: 'Reopen shall not delete or overwrite existing Snapshot Versions.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  { section: '6.11', sub: 7, text: 'Re-close shall mark the prior Snapshot Version as SUPERSEDED and the new version as CURRENT.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  { section: '6.11', sub: 8, text: 'Each Snapshot Version shall retain version number, closed by, closed at, associated Close or Re-close event, and reopen events linked in period history where applicable.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  { section: '6.11', sub: 9, text: 'The user interface shall expose snapshot history at Closed Periods → Period Details → Snapshot History.', scope: 'Financial', decision: 'D3', category: 'Product Enforceable Requirement' },
  // §6.12 Snapshot Calculation (D4)
  { section: '6.12', sub: 1, text: 'Upon Close or Re-close, the Closing Snapshot shall be calculated from Inventory Ledger postings through the last day of the closing period.', scope: 'Financial', decision: 'D4', category: 'Product Enforceable Requirement' },
  { section: '6.12', sub: 2, text: 'Snapshot construction shall use postingDate and assignedPostingPeriod (§6.6).', scope: 'Financial', decision: 'D4,D6', category: 'Product Enforceable Requirement' },
  { section: '6.12', sub: 3, text: 'Use of current live Stock Balances for Closing Snapshot calculation is prohibited when those balances include postings assigned to later periods.', scope: 'Financial', decision: 'D4', category: 'Product Enforceable Requirement' },
  { section: '6.12', sub: 4, text: 'Each Snapshot Version line shall record per item and location at minimum closing quantity, closing value, and WAC unit cost at period close basis.', scope: 'Financial', decision: 'D4', category: 'Product Enforceable Requirement' },
  // §6.13 Get Pass (D8)
  { section: '6.13', sub: 1, text: 'An open Get Pass shall not automatically constitute a Close Validation BLOCKER.', scope: 'Financial', decision: 'D8', category: 'Product Enforceable Requirement' },
  { section: '6.13', sub: 2, text: 'Get Pass with checkout in one month and expected return in a later month shall not appear as a BLOCKER for the checkout month close.', scope: 'Financial', decision: 'D8', category: 'Product Enforceable Requirement' },
  { section: '6.13', sub: 3, text: 'A Get Pass shall appear in Close Validation when expected return falls within the closing period and is overdue, when no clear expected return date exists, or when status is incomplete and requires a decision before close.', scope: 'Financial', decision: 'D8', category: 'Product Enforceable Requirement' },
  { section: '6.13', sub: 4, text: 'Users holding required ACC permissions may resolve appearing Get Pass items by Resolve (complete within period) or Carry Forward (record operation remains open into next period).', scope: 'Financial', decision: 'D8,D9', category: 'Product Enforceable Requirement' },
  { section: '6.13', sub: 5, text: 'Carry Forward shall not create phantom posting, alter the original checkout date, or create Inventory Ledger entries or Stock Balance mutations; it shall record from-period, to-period, reason, user, and timestamp in audit.', scope: 'Financial', decision: 'D8', category: 'Product Enforceable Requirement' },
  { section: '6.13', sub: 6, text: 'Get Pass resolution in close context shall require ACC permissions per §6.15.', scope: 'Financial', decision: 'D8,D9', category: 'Product Enforceable Requirement' },
  // §6.14 Auto Close (D10)
  { section: '6.14', sub: 1, text: 'Auto Close may be enabled per hotel with ON/OFF, day of next month (1–28), execution time, and tenant timezone settings.', scope: 'Financial', decision: 'D10', category: 'Optional Capability' },
  { section: '6.14', sub: 2, text: 'At scheduled time, Auto Close shall invoke the same Validation engine (§6.8) and Close Engine as Manual Close.', scope: 'Financial', decision: 'D10', category: 'Product Enforceable Requirement' },
  { section: '6.14', sub: 3, text: 'If Blockers = 0, the platform shall close the period automatically.', scope: 'Financial', decision: 'D10', category: 'Product Enforceable Requirement' },
  { section: '6.14', sub: 4, text: 'If Blockers exist, Auto Close shall not close the period; Auto Post and Auto Delete are prohibited; the platform shall notify users via In-App and Email with period, attempt time, blocker count, and workspace link.', scope: 'Financial', decision: 'D10', category: 'Product Enforceable Requirement' },
  { section: '6.14', sub: 5, text: 'Manual Close shall remain available regardless of Auto Close configuration.', scope: 'Financial', decision: 'D10', category: 'Product Enforceable Requirement' },
  { section: '6.14', sub: 6, text: 'Every Auto Close attempt shall be recorded in audit, whether successful or blocked.', scope: 'Financial', decision: 'D10', category: 'Product Enforceable Requirement' },
  { section: '6.14', sub: 7, text: 'Auto Close configuration changes shall be audited.', scope: 'Financial', decision: 'D10', category: 'Product Enforceable Requirement' },
  // §6.15 ACC Permissions (D9)
  { section: '6.15', sub: 1, text: 'ACC is the Single Source of Truth for all Period Close and Reopen authorities.', scope: 'Governance', decision: 'D9', category: 'Governance Document Requirement' },
  { section: '6.15', sub: 2, text: 'Period Close permissions shall be expressed as independent ACC permission codes including PERIOD_CLOSE_EXECUTE, PERIOD_REOPEN_EXECUTE, PERIOD_RECLOSE_EXECUTE, PERIOD_CLOSE_RESOLUTION, PERIOD_CLOSE_DOCUMENT_POST, PERIOD_CLOSE_DOCUMENT_DELETE, PERIOD_CLOSE_GET_PASS_RESOLVE, PERIOD_CLOSE_GET_PASS_CARRY_FORWARD, and PERIOD_AUTO_CLOSE_MANAGE.', scope: 'Governance', decision: 'D9', category: 'Product Enforceable Requirement' },
  { section: '6.15', sub: 3, text: 'Backend enforcement shall verify ACC permission codes. Hardcoding period authority to a specific role name is prohibited.', scope: 'Governance', decision: 'D9', category: 'Product Enforceable Requirement' },
  { section: '6.15', sub: 4, text: 'Default seed configuration may grant the above permissions to Finance Manager. Default grant shall not confer authority by role name at runtime.', scope: 'Governance', decision: 'D9', category: 'Product Enforceable Requirement' },
  { section: '6.15', sub: 5, text: 'ORG_MANAGER and other roles shall not receive period close permissions by default. Future grants or revocations shall occur through ACC only without code changes.', scope: 'Governance', decision: 'D9', category: 'Product Enforceable Requirement' },
  { section: '6.15', sub: 6, text: 'Legacy consolidated permissions (e.g. PERIOD_CLOSE_MANAGE) shall be decomposed into the granular codes above.', scope: 'Governance', decision: 'D9', category: 'Product Enforceable Requirement' },
  // §6.16 Audit
  { section: '6.16', sub: 1, text: 'The platform shall audit Start Close, Close, Reopen, Re-close, Post/Delete in Close Resolution Workspace, Get Pass Resolve, Get Pass Carry Forward, Auto Close settings changes, Auto Close attempts and results, and snapshot version superseding.', scope: 'Financial', category: 'Product Enforceable Requirement' },
  { section: '6.16', sub: 2, text: 'Each period audit record shall include acting user, timestamp, affected period (year, month), reason where applicable, outcome, and reference to affected entity.', scope: 'Financial', category: 'Product Enforceable Requirement' },
  { section: '6.16', sub: 3, text: 'Period history shall be reconstructible from audit events and Period Close events.', scope: 'Financial', category: 'Product Enforceable Requirement' },
  // §6.17 Report Versioning (D12)
  { section: '6.17', sub: 1, text: 'Official issued reports shall not be deleted or silently replaced.', scope: 'Financial', decision: 'D12', category: 'Product Enforceable Requirement' },
  { section: '6.17', sub: 2, text: 'Each official report shall retain a reference to the Snapshot Version used at issuance (snapshotVersionId).', scope: 'Financial', decision: 'D12', category: 'Product Enforceable Requirement' },
  { section: '6.17', sub: 3, text: 'After Reopen followed by Re-close, reports based on superseded snapshot versions shall be marked SUPERSEDED and reports based on the new CURRENT Snapshot Version shall be marked CURRENT.', scope: 'Financial', decision: 'D12', category: 'Product Enforceable Requirement' },
  { section: '6.17', sub: 4, text: 'SUPERSEDED reports shall remain read-only and available for review.', scope: 'Financial', decision: 'D12', category: 'Product Enforceable Requirement' },
  { section: '6.17', sub: 5, text: 'SUPERSEDED reports shall be clearly labeled as not the current version.', scope: 'Financial', decision: 'D12', category: 'Product Enforceable Requirement' },
  // §6.18 Data Migration (D1)
  { section: '6.18', sub: 1, text: 'Legacy period records with month = null (historical Annual Close) shall not persist in the operational Period Registry after migration.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
  { section: '6.18', sub: 2, text: 'If a legacy month = null record exists for the same tenant and year and a December record already exists, automatic merge or replacement is prohibited; the condition shall be flagged for mandatory review and deterministic remediation.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
  { section: '6.18', sub: 3, text: 'Migration procedures shall preserve auditability and shall not delete historical snapshot or report artifacts without explicit governed archival rules.', scope: 'Financial', decision: 'D3,D12', category: 'Product Enforceable Requirement' },
  // §6.19 Out of Scope
  { section: '6.19', sub: 1, text: 'Technology stack details, general ledger/AP modules outside inventory ledger scope, external ERP fiscal calendar configuration not required for inventory period registry, and accounting policies beyond inventory posting and snapshot rules defined herein remain out of scope.', scope: 'Platform-wide', category: 'Out of Scope' },
  { section: '6.19', sub: 2, text: 'Year-end inventory closing is in scope exclusively as December Monthly Close (§6.4). Separate annual close processes remain prohibited.', scope: 'Financial', decision: 'D1', category: 'Product Enforceable Requirement' },
];

function pad3(n) {
  return String(n).padStart(3, '0');
}

function requirementId(section, sub) {
  return `C06A-${section}-${pad3(sub)}`;
}

function freshId(section, sub) {
  return `C6A-${section}-${pad3(sub)}`;
}

function reqId(section, sub) {
  const sec = section.replace('.', '-');
  return `${sec}-${String(sub).padStart(2, '0')}`;
}

function hashSnippet(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

function buildRequirementsJson() {
  const all = JSON.parse(fs.readFileSync(path.join(GOV, 'requirements.json'), 'utf8'));
  const withoutCh6 = all.filter((r) => r.chapter !== '6');
  const ch6 = CH6_REQUIREMENTS.map((r) => ({
    reqId: reqId(r.section, r.sub),
    chapter: '6',
    section: r.section,
    requirement: r.text,
    scope: r.scope,
    requirementId: requirementId(r.section, r.sub),
    decisionRef: r.decision ?? null,
    constitutionalStatus: CONSTITUTIONAL_STATUS,
  }));
  const merged = [...withoutCh6.slice(0, withoutCh6.findIndex((r) => Number(r.chapter) > 6) >= 0 ? withoutCh6.length : 0)];
  const before7 = withoutCh6.filter((r) => Number(r.chapter) < 7);
  const from7 = withoutCh6.filter((r) => Number(r.chapter) >= 7);
  const out = [...before7, ...ch6, ...from7];
  fs.writeFileSync(path.join(GOV, 'requirements.json'), JSON.stringify(out, null, 2) + '\n');
  return ch6.map((r) => r.requirementId);
}

function buildEvidenceJson(newIds) {
  const evidencePath = path.join(GOV, 'evidence.json');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const batchPath = path.join(GOV, 'ch6-11-verification-batch.json');
  const batchRaw = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const batchEntries = Array.isArray(batchRaw) ? batchRaw : batchRaw.entries ?? [];

  // Remove any prior amendment entries (C06A-*) before rebuild
  for (const id of Object.keys(evidence)) {
    if (id.startsWith('C06A-')) delete evidence[id];
  }

  // Restore historical pre-amendment C06-* evidence from BATCH-CH6-11 (never delete)
  for (const entry of batchEntries) {
    const id = entry.requirementId;
    if (!id?.startsWith('C06-')) continue;
    const historical = { ...entry };
    historical.historicalSuperseded = AMENDMENT;
    historical.supersededAt = '2026-07-05';
    historical.supersededNote =
      'Historical BATCH-CH6-11 verification — does not prove compliance with amended Chapter 6 (D1–D12).';
    if (historical.verificationStatus === 'Verified') {
      historical.priorVerificationStatus = 'Verified';
    }
    historical.verificationStatus = 'Pending Governance';
    historical.remainingWork = `${AMENDMENT} — prior evidence retained for audit history only`;
    historical.implemented = 'No';
    evidence[id] = historical;
  }

  for (const r of CH6_REQUIREMENTS) {
    const id = requirementId(r.section, r.sub);
    const scopeMap = {
      'Platform-wide': 'Platform',
      Financial: 'Financial',
      Operational: 'Operational',
      Governance: 'Governance',
      UX: 'UX',
    };
    evidence[id] = {
      implemented: 'No',
      primaryScope: scopeMap[r.scope] ?? 'Financial',
      affectedModules: ['Period Close'],
      whereImplemented: 'Constitutional text approved — product implementation pending',
      remainingWork: CONSTITUTIONAL_STATUS,
      verificationStatus: 'Pending Governance',
      constitutionalStatus: CONSTITUTIONAL_STATUS,
      decisionRef: r.decision ?? null,
      evidence: [
        {
          layer: 'Governance',
          file: 'docs/governance/scripts/constitution-base.md',
          method: `§${r.section}.${r.sub} (Chapter 6 D1–D12 amendment, approved 2026-07-05)`,
          verification: 'Not Verified',
        },
      ],
      bdr: 'None',
      amendmentBatch: 'CH6-D1-D12-2026-07-05',
    };
  }

  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  return newIds;
}

function csvEscape(s) {
  return `"${String(s).replace(/"/g, '""')}"`;
}

function buildFreshRegisterCsv() {
  const csvPath = path.join(GOV, 'constitution-extraction/CONSTITUTION_FRESH_REGISTER.csv');
  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
  const kept = lines.filter((l) => l && !l.startsWith('"C6-') && !l.startsWith('"C6A-'));
  const header = kept[0];
  const body = kept.slice(1);

  const ch6Rows = CH6_REQUIREMENTS.map((r) => {
    const fid = freshId(r.section, r.sub);
    const cat = r.category ?? 'Product Enforceable Requirement';
    const enforceable = cat.includes('Enforceable') || cat.includes('Governance Definition');
    const cols = [
      fid,
      '19',
      '19',
      '19',
      'Part I — Governance Constitution',
      '6',
      'Period Management',
      r.section,
      `SP-${fid}-${hashSnippet(r.text)}`,
      r.text,
      '',
      r.text,
      enforceable ? 'Explicit Shall' : 'Descriptive',
      cat,
      'atomic',
      '',
      'Constitutionally Approved',
      `${CONSTITUTIONAL_STATUS}${r.decision ? ` Decision: ${r.decision}.` : ''}`,
      'Chapter 6 D1–D12 Amendment (Amr 2026-07-05)',
      enforceable ? 'Yes' : 'No',
      enforceable ? 'Multiple' : 'N/A',
      'Period Management / Backend',
      '',
      enforceable ? 'Code / Runtime / UI' : 'Documentation',
      '',
    ];
    return cols.map(csvEscape).join(',');
  });

  const ch7Idx = body.findIndex((l) => l.startsWith('"C7-'));
  const before = ch7Idx >= 0 ? body.slice(0, ch7Idx) : body;
  const after = ch7Idx >= 0 ? body.slice(ch7Idx) : [];
  const out = [header, ...before, ...ch6Rows, ...after].filter(Boolean).join('\n') + '\n';
  fs.writeFileSync(csvPath, out);
}

function buildFreshRegisterMd() {
  const mdPath = path.join(GOV, 'constitution-extraction/CONSTITUTION_FRESH_REGISTER.md');
  let md = fs.readFileSync(mdPath, 'utf8');
  const start = md.indexOf('## Chapter 6 — Period Management');
  const end = md.indexOf('## Chapter 7 — Draft & Document State Protection');
  if (start < 0 || end < 0) throw new Error('Chapter 6 section not found in FRESH_REGISTER.md');

  const rows = CH6_REQUIREMENTS.map((r) => {
    const cat = r.category ?? 'Product Enforceable Requirement';
    const target = cat.includes('Enforceable') ? 'Multiple' : cat.includes('Optional') ? 'Runtime Behavior' : 'N/A';
    return `| ${freshId(r.section, r.sub)} | 19 | ${r.section} | ${cat} | Constitutionally Approved | ${target} |`;
  }).join('\n');

  const block = `## Chapter 6 — Period Management

> **Amendment:** Chapter 6 replaced in full per D1–D12 (approved 2026-07-05). Prior C6-* rows superseded — ${AMENDMENT}.

| Fresh ID | Page | Section | Category | Review Status | Implementation Target |
|----------|------|---------|----------|---------------|----------------------|
${rows}
`;
  md = md.slice(0, start) + block + '\n' + md.slice(end);
  fs.writeFileSync(mdPath, md);
}

function buildGovernanceRequirementsCsv() {
  const csvPath = path.join(GOV, 'constitution-extraction/CONSTITUTION_GOVERNANCE_REQUIREMENTS.csv');
  const existing = fs.readFileSync(csvPath, 'utf8').trimEnd();
  const govRows = CH6_REQUIREMENTS.filter(
    (r) => r.category === 'Governance Document Requirement' || r.section === '6.15',
  );
  const lines = govRows.map((r) => {
    const cols = [
      'Product Enforceable Requirement',
      freshId(r.section, r.sub),
      '19',
      'Part I — Governance Constitution',
      '6',
      'Period Management',
      r.section,
      r.text,
      r.text,
      'Explicit Shall',
      r.category ?? 'Product Enforceable Requirement',
      'Constitutionally Approved',
      CONSTITUTIONAL_STATUS,
      'Period Close / ACC',
      'Period Close',
      'Code / Runtime',
    ];
    return cols.map(csvEscape).join(',');
  });
  if (lines.length) {
    fs.writeFileSync(csvPath, existing + '\n' + lines.join('\n') + '\n');
  }
}

function annotateBatchFiles() {
  const batchPath = path.join(GOV, 'ch6-11-verification-batch.json');
  if (fs.existsSync(batchPath)) {
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    const entries = Array.isArray(batch) ? batch : batch.entries ?? batch;
    const wrapped = {
      _historicalNotice: AMENDMENT,
      _notice:
        'This batch verified pre-amendment Chapter 6 only. Do not use for compliance of D1–D12 amended text.',
      _supersededAt: '2026-07-05',
      entries,
    };
    fs.writeFileSync(batchPath, JSON.stringify(wrapped, null, 2) + '\n');
  }

  const remediatePath = path.join(GOV, 'remediate-ch6-11.mjs');
  if (fs.existsSync(remediatePath)) {
    let src = fs.readFileSync(remediatePath, 'utf8');
    if (!src.includes(AMENDMENT)) {
      src = `/**\n * HISTORICAL ONLY — ${AMENDMENT}\n * Do not run against amended Chapter 6 requirements (CH6-D1-D12-2026-07-05).\n */\n` + src;
      fs.writeFileSync(remediatePath, src);
    }
  }
}

const newIds = buildRequirementsJson();
buildEvidenceJson(newIds);
buildFreshRegisterCsv();
buildFreshRegisterMd();
buildGovernanceRequirementsCsv();
annotateBatchFiles();

console.log(`Chapter 6 amendment applied: ${newIds.length} requirements (${newIds[0]} … ${newIds[newIds.length - 1]})`);
