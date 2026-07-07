#!/usr/bin/env python3
"""Gate A.3 — Auto-proposed semantic classification (engine never approves)."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Category buckets
CAT_PRODUCT = "Product Enforceable Requirement"
CAT_GOV_PROCESS = "Governance Process Requirement"
CAT_GOV_DOC = "Governance Document Requirement"
CAT_UX = "UX / Presentation Requirement"
CAT_QA_RELEASE = "QA / Release Requirement"
CAT_STRONG_REC = "Strong Recommendation"
CAT_OPTIONAL = "Optional Capability"
CAT_GOV_DEFINITION = "Governance Definition"
CAT_DESCRIPTIVE = "Descriptive Context"
CAT_AUTHORING = "Constitution Authoring Guidance"
CAT_OUT_OF_SCOPE = "Out of Scope"
CAT_EXCLUDED = "Excluded Pending Ratification"
CAT_REFERENCE = "Reference Index"

# Review statuses — engine may only emit Auto Proposed or Governance Review Required
STATUS_AUTO = "Auto Proposed"
STATUS_REVIEW_REQUIRED = "Governance Review Required"

ENGINE_ID = "constitution-semantic-engine"

# Implementation targets
IMPL_PRODUCT = "Product Code"
IMPL_RUNTIME = "Runtime Behavior"
IMPL_UI = "UI / UX"
IMPL_DB = "Database Integrity"
IMPL_QA = "QA / Release Gate"
IMPL_GOV_DOC = "Governance Documentation"
IMPL_GOV_PROCESS = "Governance Process"
IMPL_MULTIPLE = "Multiple"
IMPL_NA = "N/A"

BODY_MIN_PAGE = 11
TOC_DOC_CONTROL_MAX_PAGE = 10

RULES_SECTIONS = {
    "4.3", "5.2", "6.5", "7.8", "8.4", "8.5", "8.8", "9.3", "10.2", "11.6",
    "12.6", "13.9", "14.9", "15.2", "16.3", "17.2", "17.3", "18.2", "19.5",
    "20.2", "21.1", "22.1", "22.2", "23.6", "24.4", "24.6", "25.2", "25.3",
    "26.3", "26.4", "27.1", "28.2", "29.2", "29.3", "29.4", "29.7", "29.8",
}

PRINCIPLES_SECTIONS = {
    "17.2", "18.1", "24.1", "25.1", "27.1", "28.1", "28.2", "28.3",
}

UX_QA_SECTIONS = {
    "17.1", "17.2", "17.3", "18.1", "18.2", "24.1", "24.2", "24.4", "24.6",
    "25.1", "25.2", "25.3", "26.3", "26.4", "27.1", "28.1", "28.2", "28.3",
}

GOV_DOC_CH1_SECTIONS = {"1.1", "1.2", "1.3"}


@dataclass
class SemanticResult:
    strength_classification: str
    category_bucket: str
    semantic_review_status: str
    semantic_review_reason: str
    semantic_reviewer: str
    product_gap_applicability: str
    implementation_target: str
    verification_type: str


def has_real_modal(text: str) -> bool:
    low = text.lower().strip()
    if low.startswith(("must /", "should ", "may ", "must not ", "will ", "term meaning")):
        return False
    if "avoid using must" in low or "use must only when" in low:
        return False
    if re.search(r"\bmust\b", text, re.I) and not re.search(r"\b(mandatory requirement|must /)", low):
        return True
    if re.search(r"\bshall\b", text, re.I):
        return True
    if re.search(r"\b(must not|shall not)\b", text, re.I):
        return True
    if re.search(r"\bshould\b", text, re.I):
        return True
    if re.search(r"\bmay\b", text, re.I):
        return True
    return False


def classify_semantic(
    exact: str,
    normalized: str,
    section: str,
    chapter_num: str,
    section_title: str,
    source_context_text: str = "",
    atomicity_status: str = "atomic",
    atomicity_justification: str = "",
) -> SemanticResult:
    text = normalized or exact
    low = text.lower()

    def propose(
        strength: str,
        cat: str,
        reason: str,
        gap: str,
        impl: str,
        verify: str,
        status: str = STATUS_AUTO,
    ) -> SemanticResult:
        return SemanticResult(strength, cat, status, reason, ENGINE_ID, gap, impl, verify)

    # --- Appendix / exclusion ---
    if chapter_num == "A":
        return propose("Reference Index Entry", CAT_REFERENCE, "Appendix A BDR index row.", "No", IMPL_GOV_DOC, "BDR index review")
    if chapter_num == "B" and ("bdr-007" in low or "cancelled shall not be introduced" in low):
        return propose("Explicitly Excluded Pending Ratification", CAT_EXCLUDED, "BDR-007 excluded pending ratification.", "No", IMPL_NA, "Exclusion register")
    if chapter_num == "B":
        return propose("Governance Definition", CAT_GOV_DEFINITION, "Appendix B governance note.", "No", IMPL_GOV_DOC, "Governance register")
    if "cancelled shall not be introduced" in low and "bdr-007" in low:
        return propose("Explicitly Excluded Pending Ratification", CAT_EXCLUDED, "§2.2 BDR-007 exclusion clause.", "No", IMPL_NA, "Exclusion register")

    # --- Chapter 1 governance document layer ---
    if chapter_num == "1" and section in GOV_DOC_CH1_SECTIONS:
        if section == "1.2" and exact.lstrip("● ").strip() in {
            "DX OSE Constitution", "DX OSE UX Constitution", "Business Decision Records (BDR)",
            "Workflow Contracts", "Access Control Catalog", "Architecture Guide", "Implementation Guide",
        }:
            return propose("Governance Definition", CAT_GOV_DEFINITION, "§1.2 governance library catalog entry.", "No", IMPL_GOV_DOC, "Documentation")
        if has_real_modal(text):
            return propose(
                "Explicit Shall" if "shall" in low else "Explicit Must",
                CAT_GOV_DOC,
                "§1.x governance hierarchy/document-library rule — not product code gap.",
                "No",
                IMPL_GOV_DOC,
                "Governance documentation",
            )
        if re.match(r"^\d+\s+DX OSE", exact.strip()):
            return propose("Governance Definition", CAT_GOV_DEFINITION, "§1.2 normative stack hierarchy row.", "No", IMPL_GOV_DOC, "Documentation")

    # --- §1.5 ---
    if section == "1.5" and (low.startswith("avoid using must") or low.startswith("use must only when") or low.startswith("● avoid") or low.startswith("● use must")):
        return propose("Constitution Authoring Guidance", CAT_AUTHORING, "§1.5 authoring guidance.", "No", IMPL_GOV_DOC, "Authoring guidance")
    if section == "1.5":
        return propose("Governance Definition", CAT_GOV_DEFINITION, "§1.5 normative keyword definition.", "No", IMPL_GOV_DOC, "Documentation")

    # --- Out of scope ---
    if section == "1.4":
        if "out of scope for this constitution" in low or exact.strip() in {
            "Technology stack", "Internal implementation details", "Database architecture", "Integration implementation details",
        }:
            return propose("Out of Scope", CAT_OUT_OF_SCOPE, "§1.4 out-of-scope item.", "No", IMPL_NA, "N/A")
        return propose("Governance Definition", CAT_GOV_DEFINITION, "§1.4 applicability statement.", "No", IMPL_GOV_DOC, "Documentation")
    if section != "1.4" and ("out of scope" in section_title.lower() or (section.endswith(".3") or section.endswith(".4") or section.endswith(".10")) and "out of scope" in low):
        return propose("Out of Scope", CAT_OUT_OF_SCOPE, f"§{section} out-of-scope.", "No", IMPL_NA, "N/A")

    # --- §4.2 operation names ---
    if section == "4.2" and exact.strip().rstrip(".") in {
        "View", "Create", "Edit", "Delete", "Submit", "Approve", "Reject", "Send Back",
        "Cancel", "Post", "Reopen", "Close", "Archive", "Print", "Export", "Attach", "View Audit",
    }:
        return propose("Governance Definition", CAT_GOV_DEFINITION, "§4.2 standard operation name.", "No", IMPL_GOV_DOC, "Documentation")

    # --- Product posting / ACC / stock (clear product) ---
    if section == "4.3":
        return propose("Explicit Shall", CAT_PRODUCT, "§4.3 ACC permission rule.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")
    if section == "5.2":
        return propose("Explicit Shall", CAT_PRODUCT, "§5.2 posting rule.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")
    if section == "10.2":
        if "may be supported" in low or (low.startswith("outbound:") and "may warn" in low):
            return propose("Explicit Shall", CAT_PRODUCT, "§10.2 stock authority rule.", "Yes", IMPL_RUNTIME, "Runtime")
        if "may" in low and "bulk" in low:
            return propose("Explicit May", CAT_OPTIONAL, "§10.2/16 optional capability.", "Yes", IMPL_RUNTIME, "Runtime")
        return propose("Explicit Shall", CAT_PRODUCT, "§10.2 inventory rule.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")
    if section == "16.3" and "bulk upload may be supported" in low:
        return propose("Explicit May", CAT_OPTIONAL, "§16.3 optional bulk upload.", "Yes", IMPL_RUNTIME, "Runtime")

    # --- Ch 17–18 UX/product interaction (auto-propose UX; adjudication confirms) ---
    if chapter_num == "17":
        return propose("UX Requirement", CAT_UX, f"§{section} keyboard navigation rule.", "Yes", IMPL_UI, "UI / UX", STATUS_REVIEW_REQUIRED)
    if chapter_num == "18":
        if "must not" in low or "shall" in low:
            return propose("Explicit Shall", CAT_PRODUCT, f"§{section} validation rule.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI", STATUS_REVIEW_REQUIRED)
        return propose("UX Requirement", CAT_UX, f"§{section} validation UX rule.", "Yes", IMPL_UI, "UI / UX", STATUS_REVIEW_REQUIRED)

    # --- Ch 22 audit ---
    if chapter_num == "22":
        if has_real_modal(text):
            return propose("Explicit Shall", CAT_PRODUCT, f"§{section} audit requirement.", "Yes", IMPL_MULTIPLE, "Code / Runtime / DB", STATUS_REVIEW_REQUIRED)
        return propose("Product Requirement", CAT_PRODUCT, f"§{section} audit/timeline rule.", "Yes", IMPL_MULTIPLE, "Code / Runtime / DB", STATUS_REVIEW_REQUIRED)

    # --- Ch 23 lookup ---
    if chapter_num == "23":
        return propose("UX Requirement", CAT_UX, f"§{section} lookup standard rule.", "Yes", IMPL_UI, "UI / Runtime", STATUS_REVIEW_REQUIRED)

    # --- Ch 24–28 presentation / QA ---
    if chapter_num == "24":
        return propose("UX Requirement", CAT_UX, f"§{section} workspace/responsive rule.", "Yes", IMPL_UI, "UI / QA", STATUS_REVIEW_REQUIRED)
    if chapter_num == "25":
        return propose("UX Requirement", CAT_UX, f"§{section} document layout rule.", "Yes", IMPL_UI, "UI / UX", STATUS_REVIEW_REQUIRED)
    if chapter_num == "26":
        return propose("Product Requirement", CAT_PRODUCT, f"§{section} print/export rule.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI", STATUS_REVIEW_REQUIRED)
    if chapter_num == "27":
        return propose("Performance Requirement", CAT_PRODUCT, f"§{section} performance principle.", "Yes", IMPL_RUNTIME, "Runtime", STATUS_REVIEW_REQUIRED)
    if chapter_num == "28":
        return propose("Accessibility Requirement", CAT_UX, f"§{section} accessibility rule.", "Yes", IMPL_QA, "QA / Accessibility", STATUS_REVIEW_REQUIRED)

    # --- Ch 29 governance / QA release ---
    if chapter_num == "29":
        return propose("Governance Process Requirement", CAT_GOV_PROCESS, f"§{section} compliance/ratification rule.", "No", IMPL_QA, "Governance QA", STATUS_REVIEW_REQUIRED)

    # --- Ch 7/8 product ---
    if section in {"7.8", "7.9", "7.11", "8.3", "8.5", "8.8"}:
        return propose("Explicit Shall", CAT_PRODUCT, f"§{section} platform requirement.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")

    # --- Rules sections default ---
    if section in RULES_SECTIONS or section in PRINCIPLES_SECTIONS or "rules" in section_title.lower() or "principles" in section_title.lower():
        if "may" in low and any(k in low for k in ("may exist", "may define", "may include", "may implement", "may be supported")):
            return propose("Explicit May", CAT_OPTIONAL, f"§{section} optional capability.", "Yes", IMPL_RUNTIME, "Runtime")
        if re.search(r"\b(prohibited|must not|shall not|must|shall|required)\b", text, re.I):
            return propose("Explicit Shall", CAT_PRODUCT, f"§{section} normative rule.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")
        if "should" in low:
            return propose("Explicit Should", CAT_STRONG_REC, f"§{section} recommendation.", "Yes", IMPL_UI, "UI / Runtime")

    if re.search(r"\bno .+?\bmay\b", text, re.I) or re.search(r"\bprohibited\b", text, re.I):
        return propose("Explicit Must Not", CAT_PRODUCT, "Explicit prohibition.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")

    if has_real_modal(text):
        if re.search(r"\b(must not|shall not)\b", text, re.I):
            return propose("Explicit Must Not", CAT_PRODUCT, "Explicit must/shall not.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")
        if re.search(r"\bmust\b", text, re.I):
            return propose("Explicit Must", CAT_PRODUCT, "Explicit must.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")
        if re.search(r"\bshall\b", text, re.I):
            return propose("Explicit Shall", CAT_PRODUCT, "Explicit shall.", "Yes", IMPL_MULTIPLE, "Code / Runtime / UI")
        if re.search(r"\bshould\b", text, re.I):
            return propose("Explicit Should", CAT_STRONG_REC, "Explicit should.", "Yes", IMPL_UI, "UI / Runtime")
        if re.search(r"\bmay\b", text, re.I):
            return propose("Explicit May", CAT_OPTIONAL, "Optional may capability.", "Yes", IMPL_RUNTIME, "Runtime")

    if atomicity_status == "span_member" and any(k in low for k in ("editable", "meaning", "state ", "concern", "determines", "operation")):
        return propose("Governance Definition", CAT_GOV_DEFINITION, "Table/definition row.", "No", IMPL_GOV_DOC, "Documentation")

    return propose("Descriptive", CAT_DESCRIPTIVE, "Descriptive context.", "No", IMPL_NA, "Documentation")
