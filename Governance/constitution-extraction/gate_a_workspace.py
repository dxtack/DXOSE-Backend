#!/usr/bin/env python3
"""Gate A.3 — Canonical workspace archive, allowlist, and version manifest."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from gate_a_shared import SCRIPT_DIR, sha256_file, utc_now

ARCHIVE_ROOT = SCRIPT_DIR / "_archive"
ARCHIVEABLE_OUTPUTS = [
    "CONSTITUTION_FRESH_REGISTER.csv",
    "CONSTITUTION_FRESH_REGISTER.md",
    "CONSTITUTION_FRESH_REGISTER.v1.csv",
    "CONSTITUTION_EXTRACTION_SOURCE.json",
    "CONSTITUTION_EXTRACTION_VALIDATION.json",
    "CONSTITUTION_SOURCE_FIDELITY.json",
    "CONSTITUTION_NORMATIVE_REQUIREMENTS.csv",
    "CONSTITUTION_NORMATIVE_REQUIREMENTS.meta.json",
    "CONSTITUTION_PRODUCT_REQUIREMENTS.csv",
    "CONSTITUTION_UX_QA_REQUIREMENTS.csv",
    "CONSTITUTION_GOVERNANCE_REQUIREMENTS.csv",
    "CONSTITUTION_GOVERNANCE_DEFINITIONS.csv",
    "CONSTITUTION_OPTIONAL_CAPABILITIES.csv",
    "CONSTITUTION_STRONG_RECOMMENDATIONS.csv",
    "GATE_A_FILE_INTEGRITY.json",
    "GATE_A_CHAPTER_REVIEW_SAMPLES.md",
    "GATE_A_SEMANTIC_REVIEW.md",
    "GATE_A_MD_REPRODUCTION.json",
    "GATE_A_ID_MIGRATION.json",
    "CURRENT_GATE_A_VERSION.json",
    "_sections_dump.txt",
]

ARCHIVEABLE_PATTERNS = [
    re.compile(r"\.v1\."),
    re.compile(r"\.old$"),
    re.compile(r"\.bak$"),
    re.compile(r"\(\d+\)\."),
    re.compile(r"gate-a\.1", re.I),
    re.compile(r"gate-a\.2", re.I),
]

ACTIVE_ALLOWLIST = {
    "extract_constitution_from_pdf.py",
    "constitution_pipeline.py",
    "constitution_semantic.py",
    "constitution_adjudication.py",
    "gate_a_shared.py",
    "gate_a_workspace.py",
    "gate_a_review_pack.py",
    "validate_constitution_extraction.py",
    "validate_source_fidelity.py",
    "validate_workspace.py",
    "gate_a_finalize.py",
    "run_gate_a_final.py",
    "CONSTITUTION_SEMANTIC_ADJUDICATION.csv",
    "CONSTITUTION_FRESH_REGISTER.csv",
    "CONSTITUTION_FRESH_REGISTER.md",
    "CONSTITUTION_EXTRACTION_SOURCE.json",
    "CONSTITUTION_EXTRACTION_VALIDATION.json",
    "CONSTITUTION_SOURCE_FIDELITY.json",
    "GATE_A_WORKSPACE_VALIDATION.json",
    "CONSTITUTION_PRODUCT_REQUIREMENTS.csv",
    "CONSTITUTION_UX_QA_REQUIREMENTS.csv",
    "CONSTITUTION_GOVERNANCE_REQUIREMENTS.csv",
    "CONSTITUTION_GOVERNANCE_DEFINITIONS.csv",
    "CONSTITUTION_OPTIONAL_CAPABILITIES.csv",
    "CONSTITUTION_STRONG_RECOMMENDATIONS.csv",
    "GATE_A_FILE_INTEGRITY.json",
    "GATE_A_CHAPTER_REVIEW_SAMPLES.md",
    "GATE_A_MD_REPRODUCTION.json",
    "GATE_A_ID_MIGRATION.json",
    "CURRENT_GATE_A_VERSION.json",
    "_sections_dump.txt",
}

STALE_NAME_PATTERNS = [
    re.compile(r"\.v1\.", re.I),
    re.compile(r"\.old$", re.I),
    re.compile(r"\.bak$", re.I),
    re.compile(r"backup", re.I),
    re.compile(r"\(\d+\)\.", re.I),
    re.compile(r"gate-a\.1", re.I),
    re.compile(r"gate-a\.2", re.I),
]

CANONICAL_VERSION = "Gate A FINAL"
CURRENT_VERSION_PATH = SCRIPT_DIR / "CURRENT_GATE_A_VERSION.json"


def archive_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def should_archive(path: Path) -> bool:
    if path.name in ARCHIVEABLE_OUTPUTS:
        return True
    if path.name.startswith("CONSTITUTION_NORMATIVE_"):
        return True
    return any(p.search(path.name) for p in ARCHIVEABLE_PATTERNS)


def archive_snapshot(source_gate: str = "Gate A.3", *, reason: str = "Replaced by Gate A FINAL") -> Path:
    """Copy (not move) current outputs to _archive before Gate A FINAL replacement."""
    label = source_gate.replace(" ", "_").replace(".", "_").upper()
    dest = ARCHIVE_ROOT / f"{label}_{archive_timestamp()}"
    dest.mkdir(parents=True, exist_ok=True)
    manifest_entries: list[dict] = []

    for path in sorted(SCRIPT_DIR.iterdir()):
        if path.is_dir():
            continue
        if not should_archive(path):
            continue
        target = dest / path.name
        shutil.copy2(str(path), str(target))
        manifest_entries.append(
            {
                "file_name": path.name,
                "file_size_bytes": target.stat().st_size,
                "sha256": sha256_file(target),
                "source_gate": source_gate,
                "archived_at": utc_now(),
                "archive_reason": reason,
            }
        )

    manifest = {
        "archive_version": source_gate,
        "archive_path": str(dest),
        "archived_at": utc_now(),
        "file_count": len(manifest_entries),
        "files": manifest_entries,
    }
    (dest / "ARCHIVE_MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return dest


def archive_prior_artifacts(source_gate: str = "Gate A.2") -> Path:
    dest = ARCHIVE_ROOT / f"GATE_A_2_{archive_timestamp()}"
    dest.mkdir(parents=True, exist_ok=True)
    manifest_entries: list[dict] = []

    for path in sorted(SCRIPT_DIR.iterdir()):
        if path.is_dir():
            if path.name == "_archive":
                continue
            continue
        if not should_archive(path):
            continue
        target = dest / path.name
        shutil.move(str(path), str(target))
        manifest_entries.append(
            {
                "file_name": path.name,
                "file_size_bytes": target.stat().st_size,
                "sha256": sha256_file(target),
                "source_gate": source_gate,
                "archived_at": utc_now(),
                "archive_reason": "Replaced by Gate A.3 canonical rebuild",
            }
        )

    manifest = {
        "archive_version": source_gate,
        "archive_path": str(dest),
        "archived_at": utc_now(),
        "file_count": len(manifest_entries),
        "files": manifest_entries,
    }
    (dest / "ARCHIVE_MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return dest


def active_directory_violations(*, require_canonical_outputs: bool = False) -> list[str]:
    violations: list[str] = []
    for path in SCRIPT_DIR.iterdir():
        if path.name == "_archive":
            continue
        if path.is_dir():
            if path.name in {"_archive", "__pycache__"}:
                continue
            violations.append(f"unexpected_directory:{path.name}")
            continue
        if any(p.search(path.name) for p in STALE_NAME_PATTERNS):
            violations.append(f"stale_active_artifact:{path.name}")
        if path.name in {"CONSTITUTION_NORMATIVE_REQUIREMENTS.csv", "CONSTITUTION_NORMATIVE_REQUIREMENTS.meta.json", "GATE_A_SEMANTIC_REVIEW.md", "CONSTITUTION_FRESH_REGISTER.v1.csv"}:
            violations.append(f"stale_gate_a_2_artifact:{path.name}")
        if path.suffix in {".csv", ".json", ".md"} and path.name not in ACTIVE_ALLOWLIST:
            violations.append(f"non_allowlisted_output:{path.name}")
        if path.suffix == ".py" and path.name not in ACTIVE_ALLOWLIST:
            violations.append(f"non_allowlisted_script:{path.name}")
    if require_canonical_outputs:
        for required in ACTIVE_ALLOWLIST:
            if required.endswith((".csv", ".json", ".md")) and not (SCRIPT_DIR / required).exists():
                violations.append(f"missing_required:{required}")
    return violations


def write_current_gate_version(
    *,
    pdf_sha256: str,
    register_sha256: str,
    pipeline_sha256: str,
    adjudication_sha256: str,
    validator_results: dict[str, int],
    canonical_outputs: list[str],
) -> dict:
    payload = {
        "canonical_version": CANONICAL_VERSION,
        "pdf_sha256": pdf_sha256,
        "register_sha256": register_sha256,
        "pipeline_sha256": pipeline_sha256,
        "semantic_adjudication_sha256": adjudication_sha256,
        "generation_timestamp": utc_now(),
        "canonical_outputs": canonical_outputs,
        "validator_exit_codes": validator_results,
        "gate_b_started": False,
    }
    CURRENT_VERSION_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload
