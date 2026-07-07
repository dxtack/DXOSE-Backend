#!/usr/bin/env python3
"""Gate A.3 — Validate register, atomicity, semantic adjudication."""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from constitution_adjudication import ADJUDICATION_PATH, GOVERNANCE_REVIEWER, STATUS_APPROVED, STATUS_CORRECTED
from constitution_pipeline import (
    DANGLING_END_RE,
    FRAGMENT_ONLY_RE,
    TOC_SECTIONS,
    is_valid_atomic,
    normalize_for_match,
    parse_sections,
    text_in_section_span,
)
from constitution_semantic import (
    CAT_AUTHORING,
    CAT_DESCRIPTIVE,
    CAT_EXCLUDED,
    CAT_GOV_DEFINITION,
    CAT_GOV_DOC,
    CAT_GOV_PROCESS,
    CAT_OPTIONAL,
    CAT_OUT_OF_SCOPE,
    CAT_PRODUCT,
    CAT_QA_RELEASE,
    CAT_REFERENCE,
    CAT_STRONG_REC,
    CAT_UX,
    ENGINE_ID,
    STATUS_AUTO,
    STATUS_REVIEW_REQUIRED,
    BODY_MIN_PAGE,
    TOC_DOC_CONTROL_MAX_PAGE,
)
from extract_constitution_from_pdf import load_pages, META_PATH

SCRIPT_DIR = Path(__file__).resolve().parent
CSV_PATH = SCRIPT_DIR / "CONSTITUTION_FRESH_REGISTER.csv"
JSON_PATH = SCRIPT_DIR / "CONSTITUTION_EXTRACTION_VALIDATION.json"

REQUIRED_COLUMNS = [
    "fresh_id", "pdf_page", "pdf_page_start", "pdf_page_end", "part", "chapter_num",
    "chapter_title", "section", "source_span_id", "exact_pdf_source_text", "source_context_text",
    "normalized_atomic_clause", "strength_classification", "category_bucket", "atomicity_status",
    "atomicity_justification", "semantic_review_status", "semantic_review_reason",
    "semantic_reviewer", "product_gap_applicability", "implementation_target",
    "applies_to", "related_sections", "verification_type", "extraction_note",
]

EXPORT_CATEGORIES = {CAT_PRODUCT, CAT_UX, CAT_QA_RELEASE, CAT_STRONG_REC, CAT_OPTIONAL}
GOVERNANCE_EXPORT_CATEGORIES = {CAT_GOV_PROCESS, CAT_GOV_DOC}

CHAPTER_TITLES = {
    "1": "Authority & Hierarchy", "2": "Document Lifecycle", "3": "Workflow & Actions",
    "4": "Operation Permissions", "5": "Posting", "6": "Period Management",
    "7": "Draft & Document State Protection", "8": "Concurrency", "9": "Document Numbering",
    "10": "Stock & Quantity", "11": "Display Currency", "12": "Document Header",
    "13": "Document Lines", "14": "Attachments", "15": "Notes & Comments",
    "16": "Item Images", "17": "Keyboard Navigation", "18": "Validation",
    "19": "Error Handling", "20": "Notifications", "21": "Loading & Progress",
    "22": "Audit & Timeline", "23": "Lookup Standard", "24": "Workspace & Responsive",
    "25": "Document Layout", "26": "Printing & Export", "27": "Performance",
    "28": "Accessibility", "29": "Constitution Compliance & Ratification",
    "A": "Business Decision Records (BDR) Index", "B": "Open Governance Notes",
}

MODAL_PAT = re.compile(r"\b(must not|shall not|must|shall|should|may)\b", re.I)
MULTI_SENTENCE = re.compile(r"[.!?]\s+[A-Z0-9\"(]")
ENGINE_REVIEWER_PAT = re.compile(r"(semantic-engine|gate-a\.[12]|constitution-semantic)", re.I)
APPROVED_STATUSES = {STATUS_APPROVED, STATUS_CORRECTED}


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"CSV missing columns: {missing}")
        return list(reader)


def load_adjudication() -> dict[str, dict[str, str]]:
    if not ADJUDICATION_PATH.exists():
        return {}
    with ADJUDICATION_PATH.open(encoding="utf-8", newline="") as f:
        return {r["fresh_id"]: r for r in csv.DictReader(f)}


def compound_atomic_violations(row: dict[str, str]) -> list[str]:
    reasons: list[str] = []
    exact = row["exact_pdf_source_text"]
    norm = row["normalized_atomic_clause"]
    just = row.get("atomicity_justification", "").strip()
    cat = row["category_bucket"]

    if cat in {CAT_REFERENCE, CAT_GOV_DEFINITION, CAT_DESCRIPTIVE, CAT_OUT_OF_SCOPE}:
        return reasons

    if ";" in exact and not just:
        parts = [p.strip() for p in exact.split(";") if p.strip()]
        if len(parts) > 1:
            # Allow single-thought enumeration with span_member justification
            if row.get("atomicity_status") == "span_member" and just:
                pass
            else:
                reasons.append("multi_clause_semicolon")
    if "|" in exact and not just and row.get("atomicity_status") != "span_member":
        reasons.append("multi_clause_pipe")
    if exact.count("→") > 1 and not just:
        reasons.append("multi_arrow_policy")
    if MULTI_SENTENCE.search(exact) and cat in EXPORT_CATEGORIES and not just:
        reasons.append("multi_sentence_unjustified")
    if ";" in exact and "→" in exact and len(exact) > 80 and not just:
        reasons.append("compound_policy_dimension")
    if norm != exact and ";" in norm and not just:
        reasons.append("merged_normalized_clause")
    return reasons


def validate(rows: list[dict[str, str]], pages: dict[int, str], meta: dict, adjudication: dict[str, dict]) -> dict:
    issues: list[str] = []
    sec_map = {(str(s.chapter_num), s.section): s for s in parse_sections(pages)}

    reference_rows = [r for r in rows if r["category_bucket"] == CAT_REFERENCE]
    constitutional_rows = [r for r in rows if r["category_bucket"] != CAT_REFERENCE]

    engine_approved = [
        r["fresh_id"] for r in rows
        if r["semantic_review_status"] in APPROVED_STATUSES
        and ENGINE_REVIEWER_PAT.search(r.get("semantic_reviewer", ""))
    ]
    fake_manual = [
        r["fresh_id"] for r in rows
        if "Manual Reviewed" in r.get("semantic_review_status", "")
    ]
    approved_without_adj = [
        r["fresh_id"] for r in rows
        if r["semantic_review_status"] in APPROVED_STATUSES and r["fresh_id"] not in adjudication
    ]
    auto_proposed_export = [
        r["fresh_id"] for r in rows
        if r["category_bucket"] in EXPORT_CATEGORIES | GOVERNANCE_EXPORT_CATEGORIES
        and r["semantic_review_status"] in {STATUS_AUTO, STATUS_REVIEW_REQUIRED}
    ]
    ch1_in_product = [
        r["fresh_id"] for r in rows
        if r["chapter_num"] == "1" and r["category_bucket"] == CAT_PRODUCT
    ]

    compound_rows: list[str] = []
    for r in constitutional_rows:
        v = compound_atomic_violations(r)
        if v:
            compound_rows.append(r["fresh_id"])

    open_review = sorted(set(auto_proposed_export + compound_rows + engine_approved + fake_manual + approved_without_adj + ch1_in_product))

    unmatched: list[dict] = []
    not_in_section_span: list[dict] = []
    body_from_toc: list[str] = []

    for r in constitutional_rows:
        if r["chapter_num"] in {"A", "B"}:
            ps, pe = int(r["pdf_page_start"]), int(r["pdf_page_end"])
            norm = normalize_for_match(r["exact_pdf_source_text"])
            found = any(norm in normalize_for_match(pages.get(p, "")) for p in range(ps, pe + 1))
            if not found:
                unmatched.append({"fresh_id": r["fresh_id"], "reason": "appendix_not_on_page"})
            continue
        if r["chapter_num"].isdigit() and int(r["pdf_page"]) <= TOC_DOC_CONTROL_MAX_PAGE:
            body_from_toc.append(r["fresh_id"])
        key = (r["chapter_num"], r["section"])
        sec = sec_map.get(key)
        if not sec:
            unmatched.append({"fresh_id": r["fresh_id"], "reason": "section_not_parsed"})
            continue
        ps, pe = int(r["pdf_page_start"]), int(r["pdf_page_end"])
        ok, found_p, _ = text_in_section_span(r["exact_pdf_source_text"], sec.body, ps, pe, pages, r.get("source_context_text", ""))
        if not ok:
            unmatched.append({"fresh_id": r["fresh_id"], "reason": "not_in_section_body"})
        elif found_p < ps or found_p > pe:
            not_in_section_span.append({"fresh_id": r["fresh_id"], "found_page": found_p, "span": [ps, pe]})

    match_pct = round(100 * (len(constitutional_rows) - len(unmatched)) / len(constitutional_rows), 2) if constitutional_rows else 100.0

    meta_ok = meta.get("pipeline_version") in {"gate-a.3", "gate-a.final"}

    checks = {
        "metadata_is_gate_a_final": meta_ok,
        "no_engine_governance_approved": len(engine_approved) == 0,
        "no_manual_reviewed_status": len(fake_manual) == 0,
        "all_approved_have_adjudication_row": len(approved_without_adj) == 0,
        "zero_auto_proposed_on_export_categories": len(auto_proposed_export) == 0,
        "chapter_1_not_in_product_code_gap": len(ch1_in_product) == 0,
        "zero_compound_atomic_violations": len(compound_rows) == 0,
        "zero_unmatched_source_rows": len(unmatched) == 0,
        "source_within_assigned_section_span": len(not_in_section_span) == 0,
        "no_body_clause_sourced_from_toc_or_document_control_pages": len(body_from_toc) == 0,
        "source_fidelity_100_percent": match_pct == 100.0,
        "zero_open_review_queue": len(open_review) == 0,
        "adjudication_file_present": ADJUDICATION_PATH.exists(),
    }

    if engine_approved:
        issues.append(f"engine_approved: {engine_approved[:10]}")
    if fake_manual:
        issues.append(f"fake_manual: {fake_manual[:10]}")
    if compound_rows:
        issues.append(f"compound_atomic: {compound_rows[:20]}")
    if auto_proposed_export:
        issues.append(f"auto_proposed_export: {auto_proposed_export[:20]}")
    if ch1_in_product:
        issues.append(f"ch1_product: {ch1_in_product}")

    return {
        "validator_version": "gate-a.final",
        "csv_path": str(CSV_PATH),
        "total_register_rows": len(rows),
        "total_constitutional_clause_rows": len(constitutional_rows),
        "reference_index_rows": len(reference_rows),
        "rows_by_category": dict(Counter(r["category_bucket"] for r in rows)),
        "rows_by_semantic_review_status": dict(Counter(r["semantic_review_status"] for r in rows)),
        "product_enforceable_requirements": sum(1 for r in rows if r["category_bucket"] == CAT_PRODUCT),
        "ux_presentation_requirements": sum(1 for r in rows if r["category_bucket"] == CAT_UX),
        "qa_release_requirements": sum(1 for r in rows if r["category_bucket"] == CAT_QA_RELEASE),
        "governance_document_requirements": sum(1 for r in rows if r["category_bucket"] == CAT_GOV_DOC),
        "governance_process_requirements": sum(1 for r in rows if r["category_bucket"] == CAT_GOV_PROCESS),
        "strong_recommendations": sum(1 for r in rows if r["category_bucket"] == CAT_STRONG_REC),
        "source_fidelity_match_percentage": match_pct,
        "engine_approved_rows": engine_approved,
        "fake_manual_reviewed_rows": fake_manual,
        "approved_without_adjudication": approved_without_adj,
        "compound_atomic_violation_rows": compound_rows,
        "auto_proposed_export_rows": auto_proposed_export,
        "chapter_1_product_rows": ch1_in_product,
        "open_review_queue_ids": open_review,
        "checks": checks,
        "all_checks_passed": all(checks.values()),
        "issues": issues,
    }


def main() -> int:
    if not CSV_PATH.exists():
        print(f"CSV not found: {CSV_PATH}", file=sys.stderr)
        return 2
    rows = load_rows(CSV_PATH)
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    pages = load_pages(Path(meta["source_pdf_path"]))
    report = validate(rows, pages, meta, load_adjudication())
    JSON_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["all_checks_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
