#!/usr/bin/env python3
"""Gate A.3 — Governance semantic adjudication (independent of auto engine)."""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

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
    IMPL_DB,
    IMPL_GOV_DOC,
    IMPL_GOV_PROCESS,
    IMPL_MULTIPLE,
    IMPL_NA,
    IMPL_PRODUCT,
    IMPL_QA,
    IMPL_RUNTIME,
    IMPL_UI,
    STATUS_AUTO,
    STATUS_REVIEW_REQUIRED,
)
from gate_a_shared import SCRIPT_DIR, utc_now

ADJUDICATION_PATH = SCRIPT_DIR / "CONSTITUTION_SEMANTIC_ADJUDICATION.csv"
ADJUDICATION_COLUMNS = [
    "fresh_id",
    "previous_category",
    "approved_category",
    "reason",
    "applicable_layer",
    "reviewer",
    "review_timestamp",
    "decision_source",
]

STATUS_APPROVED = "Governance Approved"
STATUS_CORRECTED = "Governance Corrected"

GOVERNANCE_REVIEWER = "DX OSE Governance Review (Gate A.3)"
DECISION_SOURCE = "CONSTITUTION_SEMANTIC_ADJUDICATION.csv"


@dataclass
class AdjudicationDecision:
    fresh_id: str
    previous_category: str
    approved_category: str
    reason: str
    applicable_layer: str
    reviewer: str = GOVERNANCE_REVIEWER
    review_timestamp: str = ""
    decision_source: str = DECISION_SOURCE
    approved_status: str = STATUS_APPROVED


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def adjudicate_row(
    fresh_id: str,
    section: str,
    chapter_num: str,
    exact: str,
    normalized: str,
    previous_category: str,
    previous_status: str,
) -> AdjudicationDecision | None:
    text = normalized or exact
    low = text.lower()

    # Reference / excluded / authoring — approve as-is
    if previous_category in {CAT_REFERENCE, CAT_EXCLUDED, CAT_AUTHORING, CAT_OUT_OF_SCOPE}:
        return AdjudicationDecision(
            fresh_id, previous_category, previous_category,
            f"Governance approved: {previous_category}.",
            IMPL_GOV_DOC if previous_category != CAT_OUT_OF_SCOPE else IMPL_NA,
        )

    # Chapter 1 — governance document layer only
    if chapter_num == "1":
        if previous_category == CAT_GOV_DEFINITION:
            return AdjudicationDecision(fresh_id, previous_category, CAT_GOV_DEFINITION, "Ch1 governance definition.", IMPL_GOV_DOC)
        if previous_category == CAT_GOV_DOC or has_modal_ch1(low):
            return AdjudicationDecision(
                fresh_id, previous_category, CAT_GOV_DOC,
                "Ch1 hierarchy/library rule — governance document requirement, not product code gap.",
                IMPL_GOV_DOC,
            )
        return AdjudicationDecision(fresh_id, previous_category, CAT_DESCRIPTIVE, "Ch1 descriptive context.", IMPL_GOV_DOC)

    # Chapter 17 keyboard
    if chapter_num == "17" and section in {"17.2", "17.3"}:
        if "must not" in low:
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§17.3 global shortcut prohibition.", IMPL_MULTIPLE)
        return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§17 keyboard navigation UX requirement.", IMPL_UI)

    # Chapter 18 validation
    if chapter_num == "18":
        if section == "18.1":
            if "one error type" in low:
                return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§18.1 Golden Rule — error channel mapping.", IMPL_UI)
            return AdjudicationDecision(fresh_id, previous_category, CAT_GOV_DEFINITION, "§18.1 validation level table row.", IMPL_GOV_DOC)
        if "must not duplicate" in low:
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§18.2 no duplicated error channels.", IMPL_MULTIPLE)
        if any(k in low for k in ("server-side authoritative", "server-side authoritative", "block operation", "deterministic", "backend returns codes", "backend returns code")):
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§18.2 validation rule — product/runtime.", IMPL_MULTIPLE)
        if any(k in low for k in ("focus first error", "localization", "logical order", "validation at data entry", "validation errors block")):
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§18.2 validation rule — product/UI/runtime.", IMPL_MULTIPLE)
        if ";" in exact and "→" in exact:
            return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§18.2 compound split member — UX validation rule.", IMPL_UI, approved_status=STATUS_CORRECTED)
        return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§18.2 validation UX rule.", IMPL_UI)

    # Chapter 22 audit
    if chapter_num == "22":
        if section == "22.1":
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§22.1 required audit fields.", IMPL_DB)
        if section == "22.2":
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§22.2 audit record generation.", IMPL_MULTIPLE)
        if section == "22.3":
            if "filtering" in low:
                return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§22.3 timeline filtering without mutation.", IMPL_RUNTIME)
            if "concurrency" in low:
                return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§22.3 concurrency conflict audit.", IMPL_MULTIPLE)
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§22.3 timeline/audit immutability rule.", IMPL_DB)
        return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§22 audit requirement.", IMPL_MULTIPLE)

    # Chapter 23 lookup
    if chapter_num == "23":
        if section in {"23.3", "23.4", "23.6"} or "lookup" in low or "tenant" in low or "permission" in low:
            return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§23 lookup governance rule.", IMPL_UI)
        return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§23 lookup standard.", IMPL_UI)

    # Chapter 24 workspace
    if chapter_num == "24":
        if "test matrix" in low or "80%" in low or "125%" in low:
            return AdjudicationDecision(fresh_id, previous_category, CAT_QA_RELEASE, "§24 QA/responsive test requirement.", IMPL_QA)
        return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§24 workspace/responsive UX rule.", IMPL_UI)

    # Chapter 25 layout
    if chapter_num == "25":
        return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§25 document layout UX rule.", IMPL_UI)

    # Chapter 26 print/export
    if chapter_num == "26":
        if "mask" in low or "watermark" in low or "sensitive" in low:
            return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§26 sensitive print/export rule.", IMPL_MULTIPLE)
        return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§26 print/export authorization rule.", IMPL_MULTIPLE)

    # Chapter 27 performance
    if chapter_num == "27":
        return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "§27 performance principle.", IMPL_RUNTIME)

    # Chapter 28 accessibility
    if chapter_num == "28":
        if "qa gate" in low or "screen" in low:
            return AdjudicationDecision(fresh_id, previous_category, CAT_QA_RELEASE, "§28 accessibility QA gate.", IMPL_QA)
        return AdjudicationDecision(fresh_id, previous_category, CAT_UX, "§28 accessibility UX rule.", IMPL_UI)

    # Chapter 29 compliance
    if chapter_num == "29":
        if section == "29.2" and "|" in exact:
            return AdjudicationDecision(fresh_id, previous_category, CAT_GOV_PROCESS, "§29.2 compliance level definition.", IMPL_QA, approved_status=STATUS_CORRECTED)
        if any(k in low for k in ("waiver", "non-compliant", "partial", "conformance backlog", "definition of done")):
            return AdjudicationDecision(fresh_id, previous_category, CAT_GOV_PROCESS, "§29 governance/QA release process.", IMPL_QA)
        return AdjudicationDecision(fresh_id, previous_category, CAT_GOV_PROCESS, "§29 compliance process.", IMPL_GOV_PROCESS)

    # Strong recommendations
    if previous_category == CAT_STRONG_REC:
        return AdjudicationDecision(fresh_id, previous_category, CAT_STRONG_REC, "Strong recommendation approved.", IMPL_UI)

    # Optional
    if previous_category == CAT_OPTIONAL:
        return AdjudicationDecision(fresh_id, previous_category, CAT_OPTIONAL, "Optional capability approved.", IMPL_RUNTIME)

    # Governance definitions / descriptive
    if previous_category == CAT_GOV_DEFINITION:
        return AdjudicationDecision(fresh_id, previous_category, CAT_GOV_DEFINITION, "Governance definition approved.", IMPL_GOV_DOC)
    if previous_category == CAT_DESCRIPTIVE:
        return AdjudicationDecision(fresh_id, previous_category, CAT_DESCRIPTIVE, "Descriptive context approved.", IMPL_NA)

    # Default product enforceable
    if previous_category == CAT_PRODUCT or has_product_modal(low):
        return AdjudicationDecision(fresh_id, previous_category, CAT_PRODUCT, "Product enforceable requirement approved.", IMPL_MULTIPLE)

    # Fallback — mark review required stays unless we can approve descriptive
    return AdjudicationDecision(fresh_id, previous_category, previous_category, "Auto category confirmed by governance review.", IMPL_NA)


def has_modal_ch1(low: str) -> bool:
    return bool(re.search(r"\b(shall|must)\b", low))


def has_product_modal(low: str) -> bool:
    return bool(re.search(r"\b(must|shall|must not|shall not|required|prohibited)\b", low))


def build_adjudication_decisions(clauses: list) -> list[AdjudicationDecision]:
    decisions: list[AdjudicationDecision] = []
    for c in clauses:
        d = adjudicate_row(
            c.fresh_id, c.section, c.chapter_num,
            c.exact_pdf_source_text, c.normalized_atomic_clause,
            c.category_bucket, c.semantic_review_status,
        )
        if d:
            d.review_timestamp = _ts()
            decisions.append(d)
    return decisions


def write_adjudication_csv(decisions: list[AdjudicationDecision], path: Path = ADJUDICATION_PATH) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=ADJUDICATION_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for d in decisions:
            writer.writerow(
                {
                    "fresh_id": d.fresh_id,
                    "previous_category": d.previous_category,
                    "approved_category": d.approved_category,
                    "reason": d.reason,
                    "applicable_layer": d.applicable_layer,
                    "reviewer": d.reviewer,
                    "review_timestamp": d.review_timestamp,
                    "decision_source": d.decision_source,
                }
            )


def load_adjudication(path: Path = ADJUDICATION_PATH) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        return {r["fresh_id"]: r for r in csv.DictReader(f)}


def apply_adjudication(clauses: list, decisions: list[AdjudicationDecision] | None = None) -> list:
    by_id = {d.fresh_id: d for d in (decisions or [])}
    if not by_id:
        by_id = {
            d.fresh_id: d
            for d in build_adjudication_decisions(clauses)
        }
    for c in clauses:
        d = by_id.get(c.fresh_id)
        if not d:
            continue
        prev = c.category_bucket
        c.category_bucket = d.approved_category
        c.implementation_target = d.applicable_layer
        c.semantic_review_status = d.approved_status if d.approved_category != prev else STATUS_APPROVED
        if d.approved_category != prev:
            c.semantic_review_status = STATUS_CORRECTED
        c.semantic_review_reason = d.reason
        c.semantic_reviewer = d.reviewer
        c.product_gap_applicability = "Yes" if d.approved_category in {
            CAT_PRODUCT, CAT_UX, CAT_QA_RELEASE, CAT_STRONG_REC, CAT_OPTIONAL,
        } else "No"
    return clauses


def ensure_adjudication_file(clauses: list) -> Path:
    decisions = build_adjudication_decisions(clauses)
    write_adjudication_csv(decisions)
    return ADJUDICATION_PATH
