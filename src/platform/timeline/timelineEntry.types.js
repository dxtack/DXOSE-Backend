'use strict';

/** @typedef {'APPROVAL_STEP_COMPLETED'|'APPROVAL_STEP_CURRENT'|'APPROVAL_STEP_FUTURE'|'MILESTONE_COMPLETED'|'MILESTONE_CURRENT'|'LIFECYCLE_EVENT'|'SYSTEM_EVENT'|'POSTING'} TimelineEntryType */

/** @typedef {'COMPLETED'|'IN_PROGRESS'|'PENDING'|'REJECTED'|'POSTED'} TimelineEntryStatus */

/** @typedef {'SEND_BACK'|'REJECT'|'CANCEL'|'REOPEN'|'RECOUNT'|'RESUBMIT'|'SUBMIT_FOR_APPROVAL'|'VOID'} TimelineLifecycleEventType */

/**
 * @typedef {Object} TimelineEntryActor
 * @property {string} [id]
 * @property {string} name
 */

/**
 * @typedef {Object} TimelineEntrySourceRef
 * @property {string} [approvalRequestId]
 * @property {string} [approvalStepId]
 * @property {string} [auditLogId]
 */

/**
 * @typedef {Object} TimelineEntry
 * @property {number} [globalOrder]
 * @property {number} cycleNumber
 * @property {TimelineEntryType} entryType
 * @property {string} stageKey
 * @property {string} displayTitleKey
 * @property {TimelineEntryStatus} status
 * @property {TimelineEntryActor|null} [actor]
 * @property {string|null} [actedAt]
 * @property {string|null} [reason]
 * @property {string|null} [note]
 * @property {number|null} [durationMs]
 * @property {TimelineLifecycleEventType|null} [lifecycleEventType]
 * @property {number|null} [previousCycleNumber]
 * @property {number|null} [newCycleNumber]
 * @property {string|null} [impact]
 * @property {TimelineEntrySourceRef} [sourceRef]
 * @property {number} [stepNumber]
 * @property {boolean} [cycleClosed]
 * @property {number|null} [sourceStepNumber]
 * @property {string|null} [sourceStepRole]
 * @property {number|null} [targetStepNumber]
 * @property {string|null} [targetStepRole]
 * @property {string|null} [targetType] — STEP | CREATOR
 */

const TIMELINE_ENTRY_TYPES = Object.freeze([
    'APPROVAL_STEP_COMPLETED',
    'APPROVAL_STEP_CURRENT',
    'APPROVAL_STEP_FUTURE',
    'MILESTONE_COMPLETED',
    'MILESTONE_CURRENT',
    'LIFECYCLE_EVENT',
    'SYSTEM_EVENT',
    'POSTING',
]);

const TIMELINE_ENTRY_STATUSES = Object.freeze([
    'COMPLETED',
    'IN_PROGRESS',
    'PENDING',
    'REJECTED',
    'POSTED',
]);

const TIMELINE_LIFECYCLE_EVENT_TYPES = Object.freeze([
    'SEND_BACK',
    'REJECT',
    'CANCEL',
    'REOPEN',
    'RECOUNT',
    'RESUBMIT',
    'SUBMIT_FOR_APPROVAL',
    'VOID',
]);

const COMPLETED_ENTRY_TYPES = new Set([
    'APPROVAL_STEP_COMPLETED',
    'MILESTONE_COMPLETED',
    'LIFECYCLE_EVENT',
    'SYSTEM_EVENT',
    'POSTING',
]);

const CURRENT_ENTRY_TYPES = new Set(['APPROVAL_STEP_CURRENT', 'MILESTONE_CURRENT']);

const FUTURE_ENTRY_TYPES = new Set(['APPROVAL_STEP_FUTURE']);

module.exports = {
    TIMELINE_ENTRY_TYPES,
    TIMELINE_ENTRY_STATUSES,
    TIMELINE_LIFECYCLE_EVENT_TYPES,
    COMPLETED_ENTRY_TYPES,
    CURRENT_ENTRY_TYPES,
    FUTURE_ENTRY_TYPES,
};
