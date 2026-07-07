#!/usr/bin/env python3
"""Gate A.3 — Verify source fidelity within section spans."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from constitution_pipeline import normalize_for_match, parse_sections, text_in_section_span
from constitution_semantic import CAT_REFERENCE, TOC_DOC_CONTROL_MAX_PAGE
from extract_constitution_from_pdf import CSV_PATH, META_PATH, load_pages

OUTPUT_PATH = Path(__file__).resolve().parent / "CONSTITUTION_SOURCE_FIDELITY.json"


def check_fidelity() -> dict:
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    pdf_path = Path(meta["source_pdf_path"])
    pages = load_pages(pdf_path)
    sec_map = {(str(s.chapter_num), s.section): s for s in parse_sections(pages)}

    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    constitutional = [r for r in rows if r["category_bucket"] != CAT_REFERENCE]
    reference = [r for r in rows if r["category_bucket"] == CAT_REFERENCE]

    matched = 0
    unmatched: list[dict] = []
    toc_sourced: list[str] = []

    for row in constitutional:
        fid = row["fresh_id"]
        exact = row["exact_pdf_source_text"]
        context = row.get("source_context_text", "")
        ps, pe = int(row["pdf_page_start"]), int(row["pdf_page_end"])

        if row["chapter_num"] in {"A", "B"}:
            norm = normalize_for_match(exact)
            if any(norm in normalize_for_match(pages.get(p, "")) for p in range(ps, pe + 1)):
                matched += 1
            else:
                unmatched.append({"fresh_id": fid, "reason": "appendix"})
            continue

        sec = sec_map.get((row["chapter_num"], row["section"]))
        if not sec:
            unmatched.append({"fresh_id": fid, "reason": "no_section"})
            continue
        ok, found_p, _ = text_in_section_span(exact, sec.body, ps, pe, pages, context)
        if ok:
            matched += 1
            if row["chapter_num"].isdigit() and int(row["pdf_page"]) <= TOC_DOC_CONTROL_MAX_PAGE:
                toc_sourced.append(fid)
        else:
            unmatched.append({"fresh_id": fid, "reason": "not_in_span"})

    ref_ok = sum(1 for r in reference if normalize_for_match(r["exact_pdf_source_text"]) in normalize_for_match(pages.get(int(r["pdf_page"]), "")))

    total = len(constitutional)
    pct = round(matched / total * 100, 2) if total else 100.0

    return {
        "validator": "validate_source_fidelity.py",
        "validator_version": "gate-a.final",
        "pdf_path": str(pdf_path),
        "total_constitutional_rows_checked": total,
        "matched_within_section_span": matched,
        "unmatched_rows": len(unmatched),
        "unmatched_details": unmatched,
        "body_sourced_from_toc": toc_sourced,
        "reference_index_matched": ref_ok,
        "reference_index_total": len(reference),
        "match_percentage": pct,
        "all_matched": len(unmatched) == 0 and len(toc_sourced) == 0,
    }


def main() -> int:
    report = check_fidelity()
    OUTPUT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["all_matched"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
