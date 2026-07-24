# Constitution policy — former exceptions EX-004 / EX-006 / EX-007 / EX-008

| Field | Value |
|--------|--------|
| **Status** | **Adopted as policy intent** — to be mirrored into Constitution Ch.2 / Ch.5 (and Get Pass domain docs) |
| **Date** | 2026-07-17 |
| **Source** | Exception Register v2.0 ratification |

These items are **no longer exceptions**. They describe **approved business behavior**.

---

## EX-004 → Policy: posting trigger verbs differ by document family

**Shall:** Each document family may use a domain-accurate verb to reach Posting (e.g. explicit Post, Receive, Approve-that-posts, multi-step approval completion).

**Shall not:** UI or training assume “Approve always posts” or “Posted always means finance approved” across all modules.

**Constitution target:** Ch.2 (lifecycle) + Ch.5 (posting).

---

## EX-006 → Policy: approval outcome vs posting effect

**Shall:** Every `ApprovalRequest` type has an explicit matrix row: approval final outcome → posts / does not post / deferred.

**Shall:** Orphan or undocumented types are tracked as **bugs**, not silent exceptions.

**Constitution target:** Ch.5 + approval/posting matrix appendix.

---

## EX-007 → Policy: Breakage / Lost intentional parity

**Shall:** Shared `MovementDocument` patterns where intentional.

**Shall:** Documented differences (permissions, evidence, terminal nuance) are **policy**, not defects.

**Shall:** Undocumented drift is a **bug**.

**Constitution target:** Ch.2 + breakage/lost domain notes.

---

## EX-008 → Policy: Get Pass distributed ledger effects

**Shall:** Stock/ledger effects are **transition-scoped** across Get Pass lifecycle (not a single Post button).

**Shall:** A published **state × ledger-effect** matrix is the SSOT for alerts and reconciliation.

**Shall not:** Confuse this policy with **Get Pass Logistics** product scope (out of this release).

**Constitution target:** Get Pass domain + Ch.5 posting narrative.

---

## Follow-up (docs, not this code batch)

- Mirror the four policies into Constitution chapter text / SSOT matrices.
- Keep Exception Register free of these IDs.
