#!/usr/bin/env python3
"""Gate A FINAL — Archive, apply adjudication, rebuild exports, validate."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from extract_constitution_from_pdf import write_md_from_csv
from gate_a_finalize import run_finalize
from gate_a_shared import ADJUDICATION_PATH, CSV_PATH, MD_PATH, SCRIPT_DIR, load_source_meta, sha256_file
from gate_a_workspace import archive_snapshot, write_current_gate_version

PY = Path(sys.executable)


def run(script: str) -> int:
    r = subprocess.run([str(PY), str(SCRIPT_DIR / script)], cwd=str(SCRIPT_DIR))
    return r.returncode


def main() -> int:
    archive_dir = archive_snapshot("Gate A.3", reason="Snapshot before Gate A FINAL adjudication apply")
    print(json.dumps({"archived_to": str(archive_dir)}, indent=2))

    row_count = len(run_finalize())
    source_meta = load_source_meta()
    source_meta["pipeline_version"] = "gate-a.final"
    source_meta["total_register_rows"] = row_count + 1  # include header line count convention
    (SCRIPT_DIR / "CONSTITUTION_EXTRACTION_SOURCE.json").write_text(
        json.dumps(source_meta, indent=2), encoding="utf-8"
    )
    write_md_from_csv(CSV_PATH, MD_PATH, source_meta)
    print(json.dumps({"final_register_rows": row_count}, indent=2))

    steps = [
        "validate_constitution_extraction.py",
        "validate_source_fidelity.py",
        "gate_a_review_pack.py",
        "validate_workspace.py",
    ]
    results: dict[str, int] = {}
    for step in steps:
        code = run(step)
        results[step] = code
        if code != 0:
            print(json.dumps({"failed_at": step, "exit_codes": results}, indent=2))
            return code

    meta = load_source_meta()
    canonical_outputs = [
        "CONSTITUTION_FRESH_REGISTER.csv",
        "CONSTITUTION_FRESH_REGISTER.md",
        "CONSTITUTION_SEMANTIC_ADJUDICATION.csv",
        "CONSTITUTION_PRODUCT_REQUIREMENTS.csv",
        "CONSTITUTION_UX_QA_REQUIREMENTS.csv",
        "CONSTITUTION_GOVERNANCE_REQUIREMENTS.csv",
        "CONSTITUTION_GOVERNANCE_DEFINITIONS.csv",
        "CONSTITUTION_OPTIONAL_CAPABILITIES.csv",
        "CONSTITUTION_STRONG_RECOMMENDATIONS.csv",
        "CURRENT_GATE_A_VERSION.json",
        "GATE_A_FILE_INTEGRITY.json",
    ]
    write_current_gate_version(
        pdf_sha256=meta["sha256"],
        register_sha256=sha256_file(CSV_PATH),
        pipeline_sha256=sha256_file(SCRIPT_DIR / "constitution_pipeline.py"),
        adjudication_sha256=sha256_file(ADJUDICATION_PATH),
        validator_results=results,
        canonical_outputs=canonical_outputs,
    )
    print(json.dumps({"gate_a_final_complete": True, "exit_codes": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
