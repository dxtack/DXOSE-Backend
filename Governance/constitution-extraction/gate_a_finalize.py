#!/usr/bin/env python3
"""Gate A FINAL — Apply governance adjudication decisions (Ask review + 5 blocks)."""

from __future__ import annotations

import csv
import hashlib
import re
from copy import deepcopy
from pathlib import Path

from constitution_semantic import (
    CAT_DESCRIPTIVE,
    CAT_GOV_DEFINITION,
    CAT_GOV_PROCESS,
    CAT_OPTIONAL,
    CAT_OUT_OF_SCOPE,
    CAT_PRODUCT,
    CAT_QA_RELEASE,
    CAT_STRONG_REC,
    CAT_UX,
    IMPL_DB,
    IMPL_GOV_DOC,
    IMPL_GOV_PROCESS,
    IMPL_MULTIPLE,
    IMPL_NA,
    IMPL_QA,
    IMPL_RUNTIME,
    IMPL_UI,
)
from gate_a_shared import ADJUDICATION_PATH, CSV_PATH, SCRIPT_DIR, utc_now

GOVERNANCE_REVIEWER = "DX OSE Governance Review (Gate A FINAL)"
STATUS_APPROVED = "Governance Approved"
STATUS_CORRECTED = "Governance Corrected"

REGISTER_COLUMNS = [
    "fresh_id", "pdf_page", "pdf_page_start", "pdf_page_end", "part", "chapter_num",
    "chapter_title", "section", "source_span_id", "exact_pdf_source_text", "source_context_text",
    "normalized_atomic_clause", "strength_classification", "category_bucket", "atomicity_status",
    "atomicity_justification", "semantic_review_status", "semantic_review_reason",
    "semantic_reviewer", "product_gap_applicability", "implementation_target",
    "applies_to", "related_sections", "verification_type", "extraction_note",
]

ADJUDICATION_COLUMNS = [
    "fresh_id", "previous_category", "approved_category", "reason",
    "applicable_layer", "reviewer", "review_timestamp", "decision_source",
]

C10_TABLE_EXACT = (
    "Class Examples Stock check at posting Inbound Goods receipt, opening balance, "
    "positive adjustment Not required Outbound Transfer, breakage, lost, issue, get pass dispatch Required"
)
C18_TABLE_ORIGINAL = (
    "Field Inline Row On row Document Summary banner Confirmation Dialog — not validation "
    "Success Chapter 20 System failure Chapter 19"
)


def _ts() -> str:
    return utc_now()


def _span_id(prefix: str, text: str) -> str:
    h = hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]
    return f"SP-{prefix}-{h}"


def _apply_fields(
    row: dict[str, str],
    *,
    category: str,
    target: str,
    product_gap: str,
    reason: str,
    previous_category: str | None = None,
    status: str | None = None,
) -> None:
    prev = previous_category or row["category_bucket"]
    row["category_bucket"] = category
    row["implementation_target"] = target
    row["product_gap_applicability"] = product_gap
    row["semantic_review_reason"] = reason
    row["semantic_reviewer"] = GOVERNANCE_REVIEWER
    row["semantic_review_status"] = status or (STATUS_CORRECTED if category != prev else STATUS_APPROVED)


def _new_row(template: dict[str, str], fresh_id: str, **fields: str) -> dict[str, str]:
    row = deepcopy(template)
    row["fresh_id"] = fresh_id
    for key, value in fields.items():
        row[key] = value
    return row


def _adjudication_entry(
    fresh_id: str,
    previous: str,
    approved: str,
    reason: str,
    layer: str,
) -> dict[str, str]:
    return {
        "fresh_id": fresh_id,
        "previous_category": previous,
        "approved_category": approved,
        "reason": reason,
        "applicable_layer": layer,
        "reviewer": GOVERNANCE_REVIEWER,
        "review_timestamp": _ts(),
        "decision_source": "Gate A FINAL adjudication",
    }


RECLASSIFY: dict[str, dict[str, str]] = {
    "C6-6.1-002": {"category": CAT_DESCRIPTIVE, "target": IMPL_NA, "gap": "No", "reason": "Period Management definitional context."},
    "C5-5.1-002": {"category": CAT_PRODUCT, "target": IMPL_RUNTIME, "gap": "Yes", "reason": "Posting authority rule."},
    "C5-5.1-003": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "Business immutability after Posting."},
    "C6-6.4-002": {"category": CAT_GOV_DEFINITION, "target": IMPL_NA, "gap": "No", "reason": "Closing state definition."},
    "C6-6.5-001": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "Posting period precondition."},
    "C6-6.5-002": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "Posting date restriction rule."},
    "C6-6.5-009": {"category": CAT_PRODUCT, "target": IMPL_DB, "gap": "Yes", "reason": "Assigned Posting Period immutability."},
    "C6-6.7-001": {"category": CAT_PRODUCT, "target": IMPL_RUNTIME, "gap": "Yes", "reason": "Proactive Posting Date validation."},
    "C7-7.4-002": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§7.4 platform shall define — access rights."},
    "C7-7.4-003": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§7.4 platform shall define — ownership transfer."},
    "C7-7.4-004": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§7.4 platform shall define — inactive user drafts."},
    "C9-9.3-001": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§9.3 numbering uniqueness rule."},
    "C9-9.3-002": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§9.3 number reservation rule."},
    "C9-9.3-003": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§9.3 deleted draft number rule."},
    "C9-9.3-004": {"category": CAT_GOV_DEFINITION, "target": IMPL_NA, "gap": "No", "reason": "§9.3 gap policy definition."},
    "C9-9.3-005": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§9.3 unified numbering engine."},
    "C9-9.3-006": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§9.3 prefix governance."},
    "C9-9.3-008": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§9.3 number immutability."},
    "C9-9.3-009": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "§9.3 allocation audit traceability."},
    "C9-9.3-011": {"category": CAT_GOV_DEFINITION, "target": IMPL_NA, "gap": "No", "reason": "§9.3 annual reset policy definition."},
    "C10-10.2-009": {"category": CAT_OUT_OF_SCOPE, "target": IMPL_NA, "gap": "No", "reason": "Batch/serial inventory Out of Scope v2.0."},
    "C12-12.2-002": {"category": CAT_UX, "target": IMPL_UI, "gap": "Yes", "reason": "Optional fields presentation rule."},
    "C16-16.2-002": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "Item images must not be created via transactional documents."},
    "C16-16.3-002": {"category": CAT_UX, "target": IMPL_UI, "gap": "Yes", "reason": "Thumbnails in operational screens."},
    "C16-16.3-003": {"category": CAT_UX, "target": IMPL_UI, "gap": "Yes", "reason": "Standardized placeholder presentation."},
    "C16-16.3-006": {"category": CAT_UX, "target": IMPL_UI, "gap": "Yes", "reason": "Grid thumbnail presentation."},
    "C16-16.3-007": {"category": CAT_UX, "target": IMPL_UI, "gap": "Yes", "reason": "Thumbnail resolution presentation rule."},
    "C16-16.3-008": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "1 MB image size limit."},
    "C16-16.3-009": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "Supported image formats/dimensions."},
    "C16-16.3-010": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "Unified export when image absent."},
    "C19-19.2-002": {"category": CAT_PRODUCT, "target": IMPL_MULTIPLE, "gap": "Yes", "reason": "No duplicate error channels."},
    "C19-19.7-001": {"category": CAT_UX, "target": IMPL_UI, "gap": "Yes", "reason": "Error focus and assistive technology."},
    "C20-20.5-001": {"category": CAT_PRODUCT, "target": IMPL_RUNTIME, "gap": "Yes", "reason": "Must not notify for inaccessible documents."},
    "C21-21.2-002": {"category": CAT_PRODUCT, "target": IMPL_UI, "gap": "Yes", "reason": "Must not block entire application."},
    "C23-23.6-002": {"category": CAT_PRODUCT, "target": IMPL_DB, "gap": "Yes", "reason": "Tenant isolation."},
    "C24-24.1-002": {"category": CAT_OUT_OF_SCOPE, "target": IMPL_NA, "gap": "No", "reason": "Mobile/tablet entry out of scope v2.0."},
    "C24-24.3-002": {"category": CAT_DESCRIPTIVE, "target": IMPL_NA, "gap": "No", "reason": "150% best effort — not release gate."},
    "C24-24.6-002": {"category": CAT_QA_RELEASE, "target": IMPL_QA, "gap": "Yes", "reason": "DoD responsive test matrix."},
    "C25-25.2-003": {"category": CAT_PRODUCT, "target": IMPL_UI, "gap": "Yes", "reason": "Must not invent unrelated layouts."},
    "C25-25.2-004": {"category": CAT_PRODUCT, "target": IMPL_UI, "gap": "Yes", "reason": "Must declare and follow one archetype."},
    "C25-25.4-001": {"category": CAT_STRONG_REC, "target": IMPL_UI, "gap": "Yes", "reason": "Should remain accessible per archetype."},
    "C26-26.5-001": {"category": CAT_OPTIONAL, "target": IMPL_RUNTIME, "gap": "Yes", "reason": "May be allowed with unofficial marking."},
    "C26-26.6-001": {"category": CAT_STRONG_REC, "target": IMPL_RUNTIME, "gap": "Yes", "reason": "Should log sensitive document print."},
    "C26-26.7-001": {"category": CAT_STRONG_REC, "target": IMPL_UI, "gap": "Yes", "reason": "Should support Arabic and English."},
    "C27-27.2-002": {"category": CAT_QA_RELEASE, "target": IMPL_QA, "gap": "Yes", "reason": "Performance metrics in QA acceptance criteria."},
    "C29-29.2-001": {"category": CAT_GOV_DEFINITION, "target": IMPL_GOV_PROCESS, "gap": "No", "reason": "Fully Compliant compliance level label."},
    "C29-29.2-002": {"category": CAT_QA_RELEASE, "target": IMPL_QA, "gap": "Yes", "reason": "Partially Compliant release level."},
    "C29-29.2-003": {"category": CAT_QA_RELEASE, "target": IMPL_QA, "gap": "Yes", "reason": "Non-Compliant — not releasable without waiver."},
}


def _replace_c3_37(template: dict[str, str]) -> list[dict[str, str]]:
    rows = []
    specs = [
        (
            "Workflow Contracts & Who; when; routing; next step",
            "Workflow Contracts & ACC | Who; when; routing; next step",
        ),
        (
            "This Constitution Meaning; behavior; terminology; confirmation rules; mandatory reasons; user expectations",
            "This Constitution | Meaning; behavior; terminology; confirmation rules; mandatory reasons; user expectations",
        ),
    ]
    for idx, (exact, norm) in enumerate(specs, start=1):
        fid = f"C3-3.7-{idx:03d}"
        row = _new_row(
            template,
            fid,
            exact_pdf_source_text=exact,
            source_context_text="",
            normalized_atomic_clause=norm,
            strength_classification="Governance Definition",
            category_bucket=CAT_GOV_DEFINITION,
            atomicity_status="atomic",
            atomicity_justification="Gate A FINAL — §3.7 table merge (Block 1).",
            semantic_review_status=STATUS_CORRECTED,
            semantic_review_reason="Block 1 — §3.7 governance definition row.",
            product_gap_applicability="No",
            implementation_target=IMPL_GOV_DOC,
            source_span_id=_span_id("C3-3.7", exact),
            verification_type="Documentation",
        )
        rows.append(row)
    return rows


def _replace_c10_101(template: dict[str, str]) -> list[dict[str, str]]:
    inbound_norm = "Inbound documents do not require a stock availability check at Posting."
    outbound_norm = "Outbound documents require a stock availability check at Posting."
    rows = []
    for idx, norm in enumerate([inbound_norm, outbound_norm], start=1):
        fid = f"C10-10.1-{idx:03d}"
        row = _new_row(
            template,
            fid,
            exact_pdf_source_text=C10_TABLE_EXACT,
            source_context_text=C10_TABLE_EXACT,
            normalized_atomic_clause=norm,
            strength_classification="Explicit Shall",
            category_bucket=CAT_PRODUCT,
            atomicity_status="span_member",
            atomicity_justification="Gate A FINAL — §10.1 stock check table split (Block 2).",
            semantic_review_status=STATUS_CORRECTED,
            semantic_review_reason="Block 2 — §10.1 stock check rule.",
            product_gap_applicability="Yes",
            implementation_target=IMPL_RUNTIME,
            source_span_id=_span_id("C10-10.1", norm),
            verification_type="Runtime",
        )
        rows.append(row)
    return rows


def _replace_c22_221(template: dict[str, str]) -> list[dict[str, str]]:
    exact = "Created, last modified, submitted, approved, rejected, posted — actor and timestamp where applicable."
    norm = (
        "The platform shall maintain actor and timestamp, where applicable, for created, last modified, "
        "submitted, approved, rejected, and posted events."
    )
    row = _new_row(
        template,
        "C22-22.1-001",
        exact_pdf_source_text=exact,
        source_context_text="",
        normalized_atomic_clause=norm,
        strength_classification="Explicit Shall",
        category_bucket=CAT_PRODUCT,
        atomicity_status="atomic",
        atomicity_justification="Gate A FINAL — §22.1 audit field list within single obligation (Block 3).",
        semantic_review_status=STATUS_CORRECTED,
        semantic_review_reason="Block 3 — §22.1 unified audit timestamp obligation.",
        product_gap_applicability="Yes",
        implementation_target=IMPL_MULTIPLE,
        source_span_id=_span_id("C22-22.1", exact),
        verification_type="Code / Runtime / DB",
    )
    return [row]


def _replace_c18_181(template: dict[str, str], keep: dict[str, str]) -> list[dict[str, str]]:
    rows = [keep]
    table_rows = [
        ("Field Inline", "Field validation → Inline", "Field validation maps to Inline display channel."),
        ("Row On row", "Row validation → On row", "Row validation maps to On row display channel."),
        ("Document Summary banner", "Document validation → Summary banner", "Document validation maps to Summary banner display channel."),
        ("Confirmation Dialog — not validation", "Confirmation → Dialog and is not validation", "Confirmation maps to Dialog and is not validation."),
        ("Success Chapter 20", "Success → governed by Chapter 20", "Success feedback governed by Chapter 20."),
        ("System failure Chapter 19", "System failure → governed by Chapter 19", "System failure governed by Chapter 19."),
    ]
    for idx, (exact, norm_display, norm) in enumerate(table_rows, start=2):
        fid = f"C18-18.1-{idx:03d}"
        row = _new_row(
            template,
            fid,
            exact_pdf_source_text=exact,
            source_context_text=C18_TABLE_ORIGINAL,
            normalized_atomic_clause=norm,
            strength_classification="UX Requirement",
            category_bucket=CAT_UX,
            atomicity_status="span_member",
            atomicity_justification="Gate A FINAL — §18.1 validation channel table row (Block 4).",
            semantic_review_status=STATUS_CORRECTED,
            semantic_review_reason=f"Block 4 — §18.1 table mapping ({norm_display}).",
            product_gap_applicability="Yes",
            implementation_target=IMPL_UI,
            source_span_id=_span_id("C18-18.1", exact),
            verification_type="UI / UX",
        )
        rows.append(row)
    return rows


def _replace_c29_294(template: dict[str, str]) -> list[dict[str, str]]:
    rows = []
    specs = [
        (
            "C29-29.4-001",
            "Exceptions require documented approval, scope, expiry, and registration.",
            "Exceptions require documented approval, scope, expiry, and registration.",
            CAT_GOV_PROCESS,
            IMPL_GOV_PROCESS,
            "No",
        ),
        (
            "C29-29.4-002",
            "Architecture Exception Governance — waiver process formal",
            "Architecture Exception Governance — waiver process formal",
            CAT_GOV_DEFINITION,
            IMPL_GOV_PROCESS,
            "No",
        ),
        (
            "C29-29.4-003",
            "Exceptions must not weaken audit rules",
            "Exceptions must not weaken audit rules",
            CAT_GOV_PROCESS,
            IMPL_GOV_PROCESS,
            "No",
        ),
        (
            "C29-29.4-004",
            "Exceptions must not weaken posting rules",
            "Exceptions must not weaken posting rules",
            CAT_GOV_PROCESS,
            IMPL_GOV_PROCESS,
            "No",
        ),
        (
            "C29-29.4-005",
            "Exceptions must not weaken period rules",
            "Exceptions must not weaken period rules",
            CAT_GOV_PROCESS,
            IMPL_GOV_PROCESS,
            "No",
        ),
    ]
    for fid, exact, norm, cat, target, gap in specs:
        row = _new_row(
            template,
            fid,
            exact_pdf_source_text=exact,
            source_context_text=(
                "Architecture Exception Governance — waiver process formal; "
                "exceptions must not weaken audit, posting, or period rules."
            ),
            normalized_atomic_clause=norm,
            strength_classification="Governance Process Requirement" if cat == CAT_GOV_PROCESS else "Governance Definition",
            category_bucket=cat,
            atomicity_status="span_member" if fid != "C29-29.4-001" else "atomic",
            atomicity_justification="Gate A FINAL — §29.4 exception governance split (Block 5).",
            semantic_review_status=STATUS_CORRECTED,
            semantic_review_reason="Block 5 — §29.4 exception/waiver governance.",
            product_gap_applicability=gap,
            implementation_target=target,
            source_span_id=_span_id("C29-29.4", exact),
            verification_type="Governance QA",
        )
        rows.append(row)
    return rows


def _split_c8_84(template: dict[str, str]) -> list[dict[str, str]]:
    parts = [
        ("Concurrent edits must be detected.", "Concurrent edits must be detected."),
        ("Last write wins is prohibited.", "Last write wins is prohibited."),
        ("Conflicting operation shall be rejected", "Conflicting operation shall be rejected"),
        ("user shall reload latest version.", "user shall reload latest version."),
    ]
    rows = []
    for idx, (exact, norm) in enumerate(parts, start=1):
        fid = f"C8-8.4-{idx:03d}"
        row = _new_row(
            template,
            fid,
            exact_pdf_source_text=exact,
            normalized_atomic_clause=norm,
            strength_classification="Explicit Shall",
            category_bucket=CAT_PRODUCT,
            atomicity_status="span_member",
            atomicity_justification="Gate A FINAL — §8.4 concurrency rule atomic split.",
            semantic_review_status=STATUS_CORRECTED,
            semantic_review_reason="Ask review — §8.4 atomic concurrency rules.",
            product_gap_applicability="Yes",
            implementation_target=IMPL_MULTIPLE if idx < 4 else IMPL_UI,
            source_span_id=_span_id("C8-8.4", exact),
            verification_type="Code / Runtime / UI",
        )
        rows.append(row)
    return rows


def _split_c26_261(template: dict[str, str], tail: dict[str, str]) -> list[dict[str, str]]:
    parts = [
        ("Print and PDF export must match.", "Print and PDF export must match."),
        ("Status watermarks (draft, posted, void, etc.).", "Status watermarks (draft, posted, void, etc.)."),
        ("Header/footer with organization identity", "Header/footer with organization identity"),
    ]
    rows = []
    for idx, (exact, norm) in enumerate(parts, start=1):
        fid = f"C26-26.1-{idx:03d}"
        row = _new_row(
            template,
            fid,
            exact_pdf_source_text=exact,
            normalized_atomic_clause=norm,
            strength_classification="Product Requirement",
            category_bucket=CAT_PRODUCT,
            atomicity_status="span_member",
            atomicity_justification="Gate A FINAL — §26.1 print rule atomic split.",
            semantic_review_status=STATUS_CORRECTED,
            semantic_review_reason="Ask review — §26.1 print fidelity rule.",
            product_gap_applicability="Yes",
            implementation_target=IMPL_MULTIPLE,
            source_span_id=_span_id("C26-26.1", exact),
            verification_type="Code / Runtime / UI",
        )
        rows.append(row)
    tail = deepcopy(tail)
    tail["fresh_id"] = "C26-26.1-004"
    tail["semantic_reviewer"] = GOVERNANCE_REVIEWER
    rows.append(tail)
    return rows


def _split_c18_182(rows_by_id: dict[str, dict[str, str]]) -> None:
    splits = {
        "C18-18.2-003": [
            ("Many errors: banner shows count", "Many errors: banner shows count"),
            ("details at fields/rows", "details at fields/rows"),
        ],
        "C18-18.2-005": [
            ("Backend returns codes", "Backend returns codes"),
            ("platform presents translated text", "platform presents translated text"),
        ],
        "C18-18.2-008": [
            ("Client-side assists", "Client-side assists"),
            ("server-side authoritative", "server-side authoritative"),
        ],
        "C18-18.2-010": [
            ("Warnings informational unless governed", "Warnings informational unless governed"),
            ("validation errors block operation", "validation errors block operation"),
        ],
    }
    for parent_id, parts in splits.items():
        template = rows_by_id[parent_id]
        new_rows = []
        for idx, (exact, norm) in enumerate(parts, start=1):
            suffix = "" if idx == 1 else "b"
            fid = f"{parent_id}{suffix}" if suffix else parent_id
            row = _new_row(
                template,
                fid,
                exact_pdf_source_text=exact,
                normalized_atomic_clause=norm,
                category_bucket=CAT_PRODUCT if parent_id != "C18-18.2-003" else CAT_UX,
                atomicity_status="span_member",
                atomicity_justification="Gate A FINAL — §18.2 semicolon atomic split.",
                semantic_review_status=STATUS_CORRECTED,
                semantic_review_reason="Ask review — §18.2 validation rule split.",
                product_gap_applicability="Yes",
                implementation_target=IMPL_UI if parent_id == "C18-18.2-003" else IMPL_MULTIPLE,
                source_span_id=_span_id(parent_id, exact),
            )
            if parent_id == "C18-18.2-003":
                row["category_bucket"] = CAT_UX
                row["implementation_target"] = IMPL_UI
            new_rows.append(row)
        rows_by_id[parent_id] = new_rows[0]
        if len(new_rows) > 1:
            rows_by_id[f"{parent_id}b"] = new_rows[1]


SKIP_IDS = {
    "C3-3.7-002", "C3-3.7-003", "C3-3.7-004", "C3-3.7-005",
    "C3-3.7-006", "C3-3.7-007", "C3-3.7-008", "C3-3.7-009",
    "C10-10.1-001",
    "C22-22.1-002", "C22-22.1-003", "C22-22.1-004", "C22-22.1-005", "C22-22.1-006",
    "C18-18.1-002",
    "C8-8.4-001", "C8-8.4-002",
    "C26-26.1-001", "C26-26.1-002",
    "C29-29.4-001",
}

def finalize_register(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    rows_by_id = {r["fresh_id"]: r for r in rows}
    c26_tail = deepcopy(rows_by_id["C26-26.1-002"])

    for fid, spec in RECLASSIFY.items():
        if fid not in rows_by_id:
            continue
        prev = rows_by_id[fid]["category_bucket"]
        _apply_fields(
            rows_by_id[fid],
            category=spec["category"],
            target=spec["target"],
            product_gap=spec["gap"],
            reason=spec["reason"],
            previous_category=prev,
        )

    _split_c18_182(rows_by_id)
    split_extras = {f"{pid}b" for pid in ("C18-18.2-003", "C18-18.2-005", "C18-18.2-008", "C18-18.2-010")}

    out: list[dict[str, str]] = []
    for row in rows:
        fid = row["fresh_id"]
        if fid in SKIP_IDS:
            continue
        if fid in split_extras:
            continue

        if fid == "C3-3.7-001":
            out.extend(_replace_c3_37(row))
        elif fid == "C10-10.1-001":
            out.extend(_replace_c10_101(row))
        elif fid == "C22-22.1-001":
            out.extend(_replace_c22_221(row))
        elif fid == "C18-18.1-001":
            out.extend(_replace_c18_181(row, rows_by_id[fid]))
        elif fid == "C8-8.4-001":
            out.extend(_split_c8_84(row))
        elif fid == "C26-26.1-001":
            out.extend(_split_c26_261(row, c26_tail))
        elif fid == "C29-29.4-001":
            out.extend(_replace_c29_294(row))
        else:
            current = rows_by_id[fid]
            out.append(current)
            extra_id = f"{fid}b"
            if extra_id in rows_by_id:
                out.append(rows_by_id[extra_id])

    return out


def build_adjudication(rows: list[dict[str, str]], prior: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for row in rows:
        fid = row["fresh_id"]
        prev = prior.get(fid, {}).get("previous_category") or prior.get(fid, {}).get("approved_category") or row["category_bucket"]
        entries.append(
            _adjudication_entry(
                fid,
                prev,
                row["category_bucket"],
                row["semantic_review_reason"],
                row["implementation_target"],
            )
        )
    return entries


def write_register(rows: list[dict[str, str]]) -> None:
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=REGISTER_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, "") for col in REGISTER_COLUMNS})


def write_adjudication(entries: list[dict[str, str]]) -> None:
    with ADJUDICATION_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=ADJUDICATION_COLUMNS, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for entry in entries:
            writer.writerow(entry)


def load_prior_adjudication() -> dict[str, dict[str, str]]:
    if not ADJUDICATION_PATH.exists():
        return {}
    with ADJUDICATION_PATH.open(encoding="utf-8", newline="") as f:
        return {r["fresh_id"]: r for r in csv.DictReader(f)}


def run_finalize() -> list[dict[str, str]]:
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    prior_adj = load_prior_adjudication()
    finalized = finalize_register(rows)
    write_register(finalized)
    write_adjudication(build_adjudication(finalized, prior_adj))
    return finalized


if __name__ == "__main__":
    result = run_finalize()
    print(f"Gate A FINAL register rows: {len(result)}")
