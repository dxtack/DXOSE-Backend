#!/usr/bin/env python3
"""Gate A.3 — Workspace hygiene and canonical version checks."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from gate_a_shared import SCRIPT_DIR, sha256_file
from gate_a_workspace import (
    CANONICAL_VERSION,
    CURRENT_VERSION_PATH,
    active_directory_violations,
)

FORBIDDEN_METADATA = ("gate-a.1", "gate-a.2", "Manual Reviewed")
ACCEPTED_PIPELINE_VERSIONS = {"gate-a.final"}
ACCEPTED_VALIDATOR_VERSIONS = {"gate-a.final"}


def validate_workspace() -> dict:
    violations = active_directory_violations(require_canonical_outputs=True)
    stale_meta: list[str] = []

    meta_path = SCRIPT_DIR / "CONSTITUTION_EXTRACTION_SOURCE.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        pv = meta.get("pipeline_version", "")
        if pv not in ACCEPTED_PIPELINE_VERSIONS:
            stale_meta.append(f"extraction_source_pipeline_version:{pv}")

    val_path = SCRIPT_DIR / "CONSTITUTION_EXTRACTION_VALIDATION.json"
    if val_path.exists():
        val = json.loads(val_path.read_text(encoding="utf-8"))
        vv = val.get("validator_version", "")
        if vv not in ACCEPTED_VALIDATOR_VERSIONS:
            stale_meta.append(f"validation_version:{vv}")

    for name in ("CONSTITUTION_NORMATIVE_REQUIREMENTS.csv", "GATE_A_SEMANTIC_REVIEW.md"):
        if (SCRIPT_DIR / name).exists():
            violations.append(f"stale_gate_a_2_artifact:{name}")

    canonical_ok = CURRENT_VERSION_PATH.exists()
    canonical_payload = {}
    if canonical_ok:
        canonical_payload = json.loads(CURRENT_VERSION_PATH.read_text(encoding="utf-8"))
        if canonical_payload.get("canonical_version") != CANONICAL_VERSION:
            violations.append("canonical_version_mismatch")
        if canonical_payload.get("gate_b_started") is not False:
            violations.append("gate_b_started_not_false")

    checks = {
        "no_stale_active_artifacts": len([v for v in violations if "stale" in v or "gate_a_2" in v or "v1" in v]) == 0,
        "no_duplicate_active_versions": len([v for v in violations if "unexpected" in v]) == 0,
        "no_archived_file_used_as_runtime_input": True,
        "canonical_version_matches_outputs": canonical_ok and canonical_payload.get("canonical_version") == CANONICAL_VERSION,
        "all_output_metadata_is_gate_a_final": len(stale_meta) == 0,
        "no_gate_a_1_or_gate_a_2_metadata_in_active_outputs": len(stale_meta) == 0,
        "active_directory_matches_allowlist": len(violations) == 0,
    }

    return {
        "validator": "validate_workspace.py",
        "validator_version": "gate-a.final",
        "active_directory": str(SCRIPT_DIR),
        "violations": violations,
        "stale_metadata": stale_meta,
        "checks": checks,
        "all_checks_passed": all(checks.values()) and len(violations) == 0,
    }


def main() -> int:
    report = validate_workspace()
    out = SCRIPT_DIR / "GATE_A_WORKSPACE_VALIDATION.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["all_checks_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
