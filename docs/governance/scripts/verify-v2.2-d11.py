#!/usr/bin/env python3
"""Fail-closed verifier for Constitution v2.2 D11 § Period States wording."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

EXPECTED = (
    "The official period states are OPEN, CLOSING, and CLOSED. "
    "The state Archived is not a period registry state; historical snapshots and reports "
    "use SUPERSEDED versioning (§6.11, §6.17)."
)
FORBIDDEN = "Open, Closing, Closed, Archived"


def _paragraphs_docx(path: Path) -> list[str]:
    from docx import Document

    doc = Document(str(path))
    return [(p.text or "").strip() for p in doc.paragraphs if (p.text or "").strip()]


def _text_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover
        from PyPDF2 import PdfReader

    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _check_docx(path: Path) -> list[str]:
    errors: list[str] = []
    paragraphs = _paragraphs_docx(path)
    if EXPECTED not in paragraphs:
        errors.append(f"{path.name}: missing exact D11 Period States paragraph")
    for text in paragraphs:
        if FORBIDDEN in text:
            errors.append(f"{path.name}: forbidden four-state phrase present: {text[:120]}")
    return errors


def _check_pdf(path: Path) -> list[str]:
    errors: list[str] = []
    text = _text_pdf(path)
    if EXPECTED not in text:
        errors.append(f"{path.name}: missing exact D11 Period States wording")
    if FORBIDDEN in text:
        errors.append(f"{path.name}: forbidden four-state phrase still present")
    return errors


def _check_markdown(path: Path) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    if EXPECTED not in text:
        errors.append(f"{path.name}: missing exact D11 Period States wording")
    if FORBIDDEN in text:
        errors.append(f"{path.name}: forbidden four-state phrase still present")
    return errors


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--docx",
        type=Path,
        default=root / "DX_OSE_CONSTITUTION_v2.2.docx",
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        default=root / "DX_OSE_CONSTITUTION_v2.2.pdf",
    )
    parser.add_argument(
        "--merge-report",
        type=Path,
        default=root / "DX_OSE_CONSTITUTION_v2.1_MERGE_REPORT.md",
    )
    parser.add_argument("--skip-pdf", action="store_true")
    args = parser.parse_args()

    errors: list[str] = []
    for path, checker in (
        (args.docx, _check_docx),
        (args.merge_report, _check_markdown),
    ):
        if not path.exists():
            errors.append(f"missing required artifact: {path}")
            continue
        errors.extend(checker(path))

    if not args.skip_pdf:
        if not args.pdf.exists():
            errors.append(f"missing required artifact: {args.pdf}")
        else:
            errors.extend(_check_pdf(args.pdf))

    if errors:
        print("D11 verification FAILED:")
        for err in errors:
            print(f" - {err}")
        return 1

    print("D11 verification PASSED")
    print(f" - docx: {args.docx}")
    if not args.skip_pdf:
        print(f" - pdf: {args.pdf}")
    print(f" - merge-report: {args.merge_report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
