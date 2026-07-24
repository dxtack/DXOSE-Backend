# Gate C — Gate B Runtime Artifact Incident

**Scope:** Gate C remediation only. Gate B Summary / Findings / Matrix are **unchanged**.

## File

| Field | Value |
|---|---|
| **Full path** | `Governance/gate-b-audit/final/GATE_B_RUNTIME_RESULTS.json` |
| **Closeout target SHA-256** | `C8F624E730DB1C0B9CA5BF3F455BDC42323C078EB6C8D9B1A0441D0BB8AED038` |
| **Closeout target size** | 3184 bytes |
| **Current SHA-256** | `43640F0C459626FCD0BAD2E57980A4424F960F00FAF40D82AF07C926F5D625EB` |
| **Current size** | 3066 bytes |

## Byte-exact restoration search (documented)

| Source searched | Result |
|---|---|
| `Governance/gate-b-audit/final/GATE_B_RUNTIME_RESULTS.json` (working tree) | SHA `43640F0C…` — **mismatch** |
| `Governance/gate-b-audit/_rejected/GATE_B_FINAL_PRE_CLOSEOUT_20260627T195432Z/GATE_B_RUNTIME_RESULTS.json` | SHA `E13356C6…` (2921 bytes) — **mismatch** |
| Recursive repo scan for all `GATE_B_RUNTIME_RESULTS.json` copies | Only the two files above |
| `git log --all --full-history -- Governance/gate-b-audit/final/GATE_B_RUNTIME_RESULTS.json` | **No commits** (artifact never committed) |
| `git stash list` | **Empty** |
| CRLF/LF variant re-hash of restored semantic content | **No match** to `C8F624E…` |
| Agent/workspace temp files | **No byte-exact copy found** |

## When and how the change occurred

1. Gate B closeout recorded `C8F624E…` in `GATE_B_FILE_INTEGRITY.json` (2026-06-27T16:57:03Z).
2. During Gate C regression re-runs, Gate C verification scripts re-executed cross-tenant scenarios and **rewrote** `GATE_B_RUNTIME_RESULTS.json` with post-remediation HTTP outcomes (RS-XT-001 → 404).
3. Gate C remediation subsequently restored **semantic** closeout content (RS-XT-001 Failed HTTP 500, counts 4 Passed / 2 Failed, closeout session fields) from the rejected pre-closeout archive plus closeout correction metadata — but the serialized JSON bytes differ from the closeout fingerprint.

## Disposition

- **Byte-exact restoration:** **Not possible** after exhaustive search.
- **Semantic restoration:** Applied; scenario meanings match Gate B closeout decision state.
- **Gate B artifacts:** **Not modified further** during this incident closeout.
- **Gate B Summary / Findings / Matrix:** **Unchanged** (per Gate C scope rule).

## Gate C impact

Gate C verification uses **`GATE_C_FINAL_RUNTIME_RESULTS.json`** as the authoritative post-remediation runtime artifact. The Gate B runtime file mismatch is **historical integrity only** and does not affect Gate C finding closure.
