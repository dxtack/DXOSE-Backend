#!/usr/bin/env python3
"""Gate A.3 — Shared helpers for constitution extraction pipeline."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PDF = Path(r"c:\Users\amrsa\Downloads\New folder\DX_OSE_CONSTITUTION_v2.0_FINAL.pdf")
CSV_PATH = SCRIPT_DIR / "CONSTITUTION_FRESH_REGISTER.csv"
MD_PATH = SCRIPT_DIR / "CONSTITUTION_FRESH_REGISTER.md"
SOURCE_META_PATH = SCRIPT_DIR / "CONSTITUTION_EXTRACTION_SOURCE.json"
ADJUDICATION_PATH = SCRIPT_DIR / "CONSTITUTION_SEMANTIC_ADJUDICATION.csv"

REFERENCE_CATEGORY = "Reference Index"

PRODUCT_EXPORT = "CONSTITUTION_PRODUCT_REQUIREMENTS.csv"
UX_QA_EXPORT = "CONSTITUTION_UX_QA_REQUIREMENTS.csv"
GOVERNANCE_EXPORT = "CONSTITUTION_GOVERNANCE_REQUIREMENTS.csv"
GOVERNANCE_DEFINITIONS_EXPORT = "CONSTITUTION_GOVERNANCE_DEFINITIONS.csv"
OPTIONAL_EXPORT = "CONSTITUTION_OPTIONAL_CAPABILITIES.csv"
STRONG_REC_EXPORT = "CONSTITUTION_STRONG_RECOMMENDATIONS.csv"

PRIORITY_CHAPTERS = {2, 4, 5, 6, 7, 8, 10, 16, 17, 18, 22, 24, 25, 26, 28, 29}

INTEGRITY_FILES = [
    "CONSTITUTION_FRESH_REGISTER.csv",
    "CONSTITUTION_FRESH_REGISTER.md",
    "CONSTITUTION_EXTRACTION_VALIDATION.json",
    "CONSTITUTION_SOURCE_FIDELITY.json",
    "GATE_A_WORKSPACE_VALIDATION.json",
    "CONSTITUTION_SEMANTIC_ADJUDICATION.csv",
    "CONSTITUTION_PRODUCT_REQUIREMENTS.csv",
    "CONSTITUTION_UX_QA_REQUIREMENTS.csv",
    "CONSTITUTION_GOVERNANCE_REQUIREMENTS.csv",
    "CONSTITUTION_GOVERNANCE_DEFINITIONS.csv",
    "CONSTITUTION_OPTIONAL_CAPABILITIES.csv",
    "CONSTITUTION_STRONG_RECOMMENDATIONS.csv",
    "CURRENT_GATE_A_VERSION.json",
    "validate_constitution_extraction.py",
    "validate_source_fidelity.py",
    "validate_workspace.py",
    "constitution_semantic.py",
    "constitution_adjudication.py",
    "gate_a_finalize.py",
    "run_gate_a_final.py",
    "CONSTITUTION_EXTRACTION_SOURCE.json",
    "extract_constitution_from_pdf.py",
    "GATE_A_CHAPTER_REVIEW_SAMPLES.md",
    "GATE_A_FILE_INTEGRITY.json",
    "GATE_A_ID_MIGRATION.json",
    "GATE_A_MD_REPRODUCTION.json",
]

LIGATURE_MAP = {
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi",
    "\ufb04": "ffl", "\ufb05": "ft", "\ufb06": "st",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def line_count(path: Path) -> int:
    with path.open(encoding="utf-8", errors="replace") as f:
        return sum(1 for _ in f)


def load_csv_rows(path: Path = CSV_PATH) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_source_meta() -> dict:
    return json.loads(SOURCE_META_PATH.read_text(encoding="utf-8"))


def pdf_path_from_meta() -> Path:
    return Path(load_source_meta()["source_pdf_path"])


def clean_page_text(raw: str) -> str:
    text = raw.replace("\r", "\n")
    text = re.sub(r"DX OSE Document Constitution v2\.0 Final\s*\n?", "", text)
    text = re.sub(r"Page \d+ of 47\s*\n?", "", text)
    text = re.sub(r"-- \d+ of 47 --\s*\n?", "", text)
    text = re.sub(r"^\s*Part [^\n]+\nChapter \d+[^\n]+\n", "", text, count=1, flags=re.M)
    text = text.replace("\u2014", "—").replace("\u2013", "–")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def load_pages(pdf_path: Path) -> dict[int, str]:
    pages: dict[int, str] = {}
    with pdfplumber.open(str(pdf_path)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            pages[idx] = clean_page_text(page.extract_text() or "")
    return pages


def normalize_for_fidelity(text: str) -> str:
    t = text.replace("\u2014", "—").replace("\u2013", "–")
    t = re.sub(r"[\r\n]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t.casefold()


def classification_reason(row: dict[str, str]) -> str:
    reason = row.get("semantic_review_reason", "").strip()
    if reason:
        return reason
    return f"{row['category_bucket']} — {row.get('semantic_review_status', '')}"


def page_context_snippet(page_text: str, source_text: str, window: int = 200) -> tuple[str, str]:
    norm_page = normalize_for_fidelity(page_text)
    norm_source = normalize_for_fidelity(source_text)
    idx = norm_page.find(norm_source)
    if idx < 0:
        words = norm_source.split()
        if len(words) >= 4:
            idx = norm_page.find(" ".join(words[:4]))
    if idx < 0:
        return "(source not located on page)", "(source not located on page)"
    flat = re.sub(r"\s+", " ", page_text.replace("\n", " "))
    norm_flat = normalize_for_fidelity(flat)
    idx_flat = norm_flat.find(norm_source)
    if idx_flat < 0:
        return "(context unavailable)", "(context unavailable)"
    start = max(0, idx_flat - window)
    end = min(len(flat), idx_flat + len(source_text) + window)
    return flat[start:idx_flat].strip(), flat[idx_flat + len(source_text): end].strip()
