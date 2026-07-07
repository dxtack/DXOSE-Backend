#!/usr/bin/env python3
"""Gate A.3 — Review pack: layered exports, integrity, ID migration."""

from __future__ import annotations

import csv
import difflib
import hashlib
import json
import sys
from pathlib import Path

from extract_constitution_from_pdf import write_md_from_csv
from gate_a_shared import (
    CSV_PATH,
    GOVERNANCE_DEFINITIONS_EXPORT,
    GOVERNANCE_EXPORT,
    INTEGRITY_FILES,
    MD_PATH,
    OPTIONAL_EXPORT,
    PRIORITY_CHAPTERS,
    PRODUCT_EXPORT,
    REFERENCE_CATEGORY,
    SCRIPT_DIR,
    STRONG_REC_EXPORT,
    UX_QA_EXPORT,
    classification_reason,
    line_count,
    load_csv_rows,
    load_pages,
    load_source_meta,
    page_context_snippet,
    pdf_path_from_meta,
    sha256_file,
    utc_now,
)
from gate_a_workspace import write_current_gate_version

INTEGRITY_PATH = SCRIPT_DIR / "GATE_A_FILE_INTEGRITY.json"
SAMPLES_PATH = SCRIPT_DIR / "GATE_A_CHAPTER_REVIEW_SAMPLES.md"
MD_REPRO_PATH = SCRIPT_DIR / "GATE_A_MD_REPRODUCTION.json"

EXPORT_COLUMNS = [
    "register_type", "fresh_id", "pdf_page", "part", "chapter_num", "chapter_title", "section",
    "exact_pdf_source_text", "normalized_atomic_clause", "strength_classification",
    "category_bucket", "semantic_review_status", "semantic_review_reason", "implementation_target",
    "applies_to", "verification_type",
]

LAYERED_EXPORTS = {
    PRODUCT_EXPORT: {"Product Enforceable Requirement"},
    UX_QA_EXPORT: {"UX / Presentation Requirement", "QA / Release Requirement"},
    GOVERNANCE_EXPORT: {"Governance Process Requirement", "Governance Document Requirement"},
    GOVERNANCE_DEFINITIONS_EXPORT: {"Governance Definition"},
    OPTIONAL_EXPORT: {"Optional Capability"},
    STRONG_REC_EXPORT: {"Strong Recommendation"},
}


def build_id_migration(archive_register: Path | None) -> dict:
    new_rows = load_csv_rows()
    old_rows: list[dict] = []
    old_path = archive_register
    if old_path and old_path.exists():
        old_rows = list(csv.DictReader(old_path.open(encoding="utf-8")))
    old_ids = {r["fresh_id"] for r in old_rows}
    new_ids = {r["fresh_id"] for r in new_rows}
    return {
        "generated_by": "gate_a_review_pack.py",
        "generation_timestamp": utc_now(),
        "pipeline_version": "gate-a.final",
        "prior_register_path_readonly": str(old_path) if old_path else None,
        "old_total_rows": len(old_rows),
        "new_total_rows": len(new_rows),
        "ids_removed": sorted(old_ids - new_ids),
        "ids_added": sorted(new_ids - old_ids),
        "ids_retained": sorted(old_ids & new_ids),
    }


def build_integrity_manifest() -> dict:
    files = []
    for rel in INTEGRITY_FILES:
        path = SCRIPT_DIR / rel
        if not path.exists():
            continue
        files.append({
            "relative_path": f"Governance/constitution-extraction/{rel}",
            "file_name": rel,
            "file_size_bytes": path.stat().st_size,
            "line_count": line_count(path) if rel.endswith((".csv", ".md", ".py")) else None,
            "sha256": sha256_file(path),
            "generation_timestamp": utc_now(),
        })
    return {
        "manifest_version": "gate-a.final",
        "generated_by": "gate_a_review_pack.py",
        "generation_timestamp": utc_now(),
        "directory": "Governance/constitution-extraction",
        "files": files,
    }


def write_layered_exports(rows: list[dict[str, str]]) -> dict:
    meta: dict = {}
    for filename, categories in LAYERED_EXPORTS.items():
        export_rows = [r for r in rows if r["category_bucket"] in categories and r["semantic_review_status"] in {"Governance Approved", "Governance Corrected"}]
        path = SCRIPT_DIR / filename
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=EXPORT_COLUMNS, quoting=csv.QUOTE_ALL)
            writer.writeheader()
            for r in export_rows:
                writer.writerow({col: r.get(col, "") if col != "register_type" else r["category_bucket"] for col in EXPORT_COLUMNS})
        ch1_product = [r["fresh_id"] for r in export_rows if r["chapter_num"] == "1" and filename == PRODUCT_EXPORT]
        meta[filename] = {
            "row_count": len(export_rows),
            "chapter_1_rows": ch1_product,
            "no_chapter_1_in_product": len(ch1_product) == 0,
        }
    return meta


def build_chapter_samples_md(rows: list[dict[str, str]], pages: dict[int, str]) -> None:
    lines = [
        "# Gate A FINAL — Chapter Review Samples",
        "",
        f"Generated at {utc_now()}.",
        "",
    ]
    for ch in map(str, range(1, 30)):
        ch_rows = [r for r in rows if r["chapter_num"] == ch]
        if not ch_rows:
            continue
        title = ch_rows[0]["chapter_title"]
        priority = " **[PRIORITY]**" if int(ch) in PRIORITY_CHAPTERS else ""
        lines.extend([f"## Chapter {ch} — {title}{priority}", ""])
        for label, pred in [
            ("Product/UX sample", lambda r: r["category_bucket"] in {"Product Enforceable Requirement", "UX / Presentation Requirement"}),
            ("Governance sample", lambda r: r["category_bucket"] in {"Governance Document Requirement", "Governance Process Requirement"}),
        ]:
            sample = next((r for r in ch_rows if pred(r)), None)
            if not sample:
                continue
            before, after = page_context_snippet(pages.get(int(sample["pdf_page"]), ""), sample["exact_pdf_source_text"])
            lines.extend([
                f"### {label}: `{sample['fresh_id']}`",
                f"- Category: {sample['category_bucket']}",
                f"- Status: {sample['semantic_review_status']}",
                f"- Implementation target: {sample['implementation_target']}",
                f"- Reason: {classification_reason(sample)}",
                "",
                "```text", sample["exact_pdf_source_text"], "```", "",
            ])
    SAMPLES_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def check_md_reproduction(source_meta: dict) -> dict:
    existing = MD_PATH.read_bytes().decode("utf-8")
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False, encoding="utf-8") as tmp:
        tmp_path = Path(tmp.name)
    write_md_from_csv(CSV_PATH, tmp_path, source_meta)
    regenerated = tmp_path.read_text(encoding="utf-8")
    tmp_path.unlink(missing_ok=True)
    norm_existing = hashlib.sha256(existing.replace("\r\n", "\n").encode()).hexdigest().upper()
    norm_regenerated = hashlib.sha256(regenerated.replace("\r\n", "\n").encode()).hexdigest().upper()
    return {"match": norm_existing == norm_regenerated, "normalized_text_sha256": norm_existing}


def main() -> int:
    rows = load_csv_rows()
    source_meta = load_source_meta()
    pages = load_pages(pdf_path_from_meta())

    export_meta = write_layered_exports(rows)
    integrity = build_integrity_manifest()
    INTEGRITY_PATH.write_text(json.dumps(integrity, indent=2), encoding="utf-8")
    build_chapter_samples_md(rows, pages)
    md_repro = check_md_reproduction(source_meta)
    MD_REPRO_PATH.write_text(json.dumps({**md_repro, "generation_timestamp": utc_now()}, indent=2), encoding="utf-8")

    archive_reg = None
    for d in sorted((SCRIPT_DIR / "_archive").glob("GATE_A_*")) if (SCRIPT_DIR / "_archive").exists() else []:
        candidate = d / "CONSTITUTION_FRESH_REGISTER.csv"
        if candidate.exists():
            archive_reg = candidate
            break
    migration = build_id_migration(archive_reg)
    (SCRIPT_DIR / "GATE_A_ID_MIGRATION.json").write_text(json.dumps(migration, indent=2), encoding="utf-8")

    all_exports_ok = all(m["no_chapter_1_in_product"] for fn, m in export_meta.items() if fn == PRODUCT_EXPORT)
    return 0 if md_repro["match"] and all_exports_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

