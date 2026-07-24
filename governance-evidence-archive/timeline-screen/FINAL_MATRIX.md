# Final Module Matrix — Canonical Screen Timeline

| Module | Send Back (active PENDING) | Posted actor | Creator step=0 | From/To/Round UI | Terminal projection | Status |
|--------|------------------------------|--------------|----------------|------------------|----------------------|--------|
| GRN | Constitutional audit metadata via `buildApprovalTimelineRawEntries` on active request | Auto posted by DX | Via shared approval builder | Yes | POSTED last; no future after | **CLOSED** |
| Transfer | Shared `approvalTimeline.builder` | Auto posted by DX | Creator pending entry | Yes | REJECTED/VOID: no pending | **CLOSED** |
| Breakage | Shared builder | Auto posted by DX | Creator pending entry | Yes | VOID/REJECT terminal | **CLOSED** |
| Lost Items | Shared builder | Auto posted by DX | Creator pending entry | Yes | POSTED terminal | **CLOSED** |
| Get Pass | `sendBackLifecycleFromAudit` + ApprovalRequest steps | N/A (no Posted lifecycle) | Via ApprovalRequest adapter | Yes | OUT/RETURNED/CLOSED: no approval placeholders | **CLOSED** |
| Inventory Count | Unchanged Send Back impl | Already Auto posted by DX | Creator pending entry | Yes | Cancel/Void/Reject/Posted rules preserved | **CLOSED** |

## i18n

- EN: `TIMELINE.FROM`, `TO`, `CREATOR`, `ROUND`, `CREATOR_PENDING_CORRECTION`, `VOID`
- AR: unified title **الجدول الزمني لسير العمل** across module detail screens
