RBAC + Scope Target Matrix — FOR REVIEW ONLY

Status: TARGET_FOR_APPROVAL
Generated: 2026-05-18

NO CODE / NO DB / NO USER CHANGES until you sign off on these CSV files.

Open in Excel (recommended order):
  0. SCOPE_ENGINE_PRINCIPLE.txt and DECISIONS.csv
  1. 7_USER_SCOPE_MODEL.csv, 8_SCOPE_RULES_BY_ROLE.csv, 9_MODULE_SCOPE_APPLICATION.csv
  2. 1_ROLE_CATALOG.csv and 2_PERMISSION_MATRIX.csv
  3. 3_MODULE_MATRIX.csv, 4_ADMIN_REPLACEMENT.csv, 5_ROLE_TIER_RULES.csv
  4. 10_SCOPE_UAT_ACCEPTANCE.csv and 6_UAT_FINANCE.csv

SCOPE MODEL (approved direction — review pack only):
  RBAC permissions alone are NOT sufficient.
  Every List / Detail / Export must pass through Scope Engine (see 9_MODULE_SCOPE_APPLICATION.csv).

  Role scope summary:
    FINANCE_MANAGER  = tenant-wide
    ORG_MANAGER      = tenant-wide on active property
    DEPT_MANAGER     = own department only
    STOREKEEPER      = assigned locations only
    COST_CONTROL     = tenant-wide
    AUDITOR          = tenant-wide read-only
    SECURITY         = Get Pass / gate only

  Implementation order after approval: Scope first, then RBAC (see SCOPE_ENGINE_PRINCIPLE.txt).

Permission matrix legend:
  Y = granted in TARGET state
  N = not granted
  L = legacy only (no new assign)
  A = ALL permissions (ORG_MANAGER loads full DB set from DB)

Approved inputs:
  P1 Finance manages hotel users (tenant-scoped)
  P2 Finance does NOT manage OB lock/finalize
  P3 ADMIN deprecated in UI — not deleted from database
  S1–S11 Scope decisions in DECISIONS.csv

After final approval, request implementation in Agent mode (Scope phase then RBAC phase).
