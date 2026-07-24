#!/usr/bin/env python3
"""Gate A.3 — Extract atomic constitutional clauses from DX OSE Constitution v2.0 Final PDF."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import pdfplumber

from constitution_pipeline import (
    ClauseRecord,
    clean_page_text,
    build_register,
)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PDF = Path(r"c:\Users\amrsa\Downloads\New folder\DX_OSE_CONSTITUTION_v2.0_FINAL.pdf")
CSV_PATH = SCRIPT_DIR / "CONSTITUTION_FRESH_REGISTER.csv"
MD_PATH = SCRIPT_DIR / "CONSTITUTION_FRESH_REGISTER.md"
META_PATH = SCRIPT_DIR / "CONSTITUTION_EXTRACTION_SOURCE.json"

CSV_COLUMNS = [
    "fresh_id",
    "pdf_page",
    "pdf_page_start",
    "pdf_page_end",
    "part",
    "chapter_num",
    "chapter_title",
    "section",
    "source_span_id",
    "exact_pdf_source_text",
    "source_context_text",
    "normalized_atomic_clause",
    "strength_classification",
    "category_bucket",
    "atomicity_status",
    "atomicity_justification",
    "semantic_review_status",
    "semantic_review_reason",
    "semantic_reviewer",
    "product_gap_applicability",
    "implementation_target",
    "applies_to",
    "related_sections",
    "verification_type",
    "extraction_note",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def load_pages(pdf_path: Path) -> dict[int, str]:
    pages: dict[int, str] = {}
    with pdfplumber.open(str(pdf_path)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            pages[idx] = clean_page_text(page.extract_text() or "")
    return pages


def write_csv(clauses: Iterable[ClauseRecord], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for c in clauses:
            writer.writerow({col: getattr(c, col, "") for col in CSV_COLUMNS})


def write_md_from_csv(csv_path: Path, md_path: Path, source_meta: dict) -> None:
    rows = list(csv.DictReader(csv_path.open(encoding="utf-8")))
    lines = [
        "# DX OSE Constitution v2.0 Final — Fresh Register",
        "",
        "Generated from `CONSTITUTION_FRESH_REGISTER.csv` (Gate A.3).",
        "",
        "## Source",
        "",
        f"- **PDF path:** `{source_meta['source_pdf_path']}`",
        f"- **SHA-256:** `{source_meta['sha256']}`",
        f"- **Pages:** {source_meta['page_count']}",
        f"- **Extraction timestamp:** {source_meta['extraction_timestamp']}",
        f"- **Pipeline version:** {source_meta.get('pipeline_version', 'gate-a.3')}",
        f"- **Total register rows:** {len(rows)}",
        "",
    ]

    current_ch = None
    for row in rows:
        ch = row["chapter_num"]
        if ch != current_ch:
            current_ch = ch
            lines.extend(["", f"## Chapter {ch} — {row['chapter_title']}", ""])
            lines.append("| Fresh ID | Page | Section | Category | Review Status | Implementation Target |")
            lines.append("|----------|------|---------|----------|---------------|----------------------|")
        lines.append(
            f"| {row['fresh_id']} | {row['pdf_page']} | {row['section']} | {row['category_bucket']} | {row['semantic_review_status']} | {row['implementation_target']} |"
        )

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    pdf_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_PDF
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sha = sha256_file(pdf_path)
    pages = load_pages(pdf_path)

    if len(pages) != 47:
        print(f"Expected 47 pages, got {len(pages)}", file=sys.stderr)
        return 1

    clauses = build_register(pages)
    write_csv(clauses, CSV_PATH)

    source_meta = {
        "source_pdf_path": str(pdf_path),
        "source_file_name": pdf_path.name,
        "source_file_size_bytes": pdf_path.stat().st_size,
        "page_count": len(pages),
        "sha256": sha,
        "document_title": "DX OSE Document Constitution",
        "version": "2.0 Final",
        "status": "Ratified — Chapters 1–29",
        "extraction_timestamp": ts,
        "extraction_tool": "pdfplumber (Python 3.12)",
        "pipeline_version": "gate-a.3",
        "total_register_rows": len(clauses),
    }
    META_PATH.write_text(json.dumps(source_meta, indent=2), encoding="utf-8")
    write_md_from_csv(CSV_PATH, MD_PATH, source_meta)

    print(json.dumps(source_meta, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
