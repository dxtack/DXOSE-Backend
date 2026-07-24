#!/usr/bin/env python3
"""Gate A.3 — Archive prior artifacts and rebuild canonical outputs."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from gate_a_shared import SCRIPT_DIR, sha256_file
from gate_a_workspace import archive_prior_artifacts, write_current_gate_version

PY = Path(sys.executable)


def run(script: str) -> int:
    r = subprocess.run([str(PY), str(SCRIPT_DIR / script)], cwd=str(SCRIPT_DIR))
    return r.returncode


def main() -> int:
    archive_dir = archive_prior_artifacts("Gate A.2")
    print(json.dumps({"archived_to": str(archive_dir)}, indent=2))

    steps = [
        "extract_constitution_from_pdf.py",
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

    meta = json.loads((SCRIPT_DIR / "CONSTITUTION_EXTRACTION_SOURCE.json").read_text(encoding="utf-8"))
    write_current_gate_version(
        pdf_sha256=meta["sha256"],
        register_sha256=sha256_file(SCRIPT_DIR / "CONSTITUTION_FRESH_REGISTER.csv"),
        pipeline_sha256=sha256_file(SCRIPT_DIR / "constitution_pipeline.py"),
        adjudication_sha256=sha256_file(SCRIPT_DIR / "CONSTITUTION_SEMANTIC_ADJUDICATION.csv"),
        validator_results=results,
        canonical_outputs=[
            "CONSTITUTION_FRESH_REGISTER.csv",
            "CONSTITUTION_SEMANTIC_ADJUDICATION.csv",
            "CONSTITUTION_PRODUCT_REQUIREMENTS.csv",
            "CONSTITUTION_UX_QA_REQUIREMENTS.csv",
            "CONSTITUTION_GOVERNANCE_REQUIREMENTS.csv",
            "CONSTITUTION_STRONG_RECOMMENDATIONS.csv",
            "CURRENT_GATE_A_VERSION.json",
        ],
    )
    print(json.dumps({"gate_a_3_complete": True, "exit_codes": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
