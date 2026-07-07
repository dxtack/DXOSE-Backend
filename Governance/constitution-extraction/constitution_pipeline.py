#!/usr/bin/env python3
"""Gate A.1 — Constitution extraction pipeline (parser, atomicity, classification)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Iterator

# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

CHAPTER_META: dict[int, tuple[str, str]] = {
    1: ("Part 0 — Authority", "Authority & Hierarchy"),
    2: ("Part I — Governance Constitution", "Document Lifecycle"),
    3: ("Part I — Governance Constitution", "Workflow & Actions"),
    4: ("Part I — Governance Constitution", "Operation Permissions"),
    5: ("Part I — Governance Constitution", "Posting"),
    6: ("Part I — Governance Constitution", "Period Management"),
    7: ("Part I — Governance Constitution", "Draft & Document State Protection"),
    8: ("Part I — Governance Constitution", "Concurrency"),
    9: ("Part II — Document Identity", "Document Numbering"),
    10: ("Part III — Data Integrity", "Stock & Quantity"),
    11: ("Part III — Data Integrity", "Display Currency"),
    12: ("Part IV — Document Composition", "Document Header"),
    13: ("Part IV — Document Composition", "Document Lines"),
    14: ("Part IV — Document Composition", "Attachments"),
    15: ("Part IV — Document Composition", "Notes & Comments"),
    16: ("Part IV — Document Composition", "Item Images"),
    17: ("Part V — System Interaction Standards", "Keyboard Navigation"),
    18: ("Part V — System Interaction Standards", "Validation"),
    19: ("Part V — System Interaction Standards", "Error Handling"),
    20: ("Part V — System Interaction Standards", "Notifications"),
    21: ("Part V — System Interaction Standards", "Loading & Progress"),
    22: ("Part V — System Interaction Standards", "Audit & Timeline"),
    23: ("Part VI — Lookup & Search", "Lookup Standard"),
    24: ("Part VII — Presentation Standards", "Workspace & Responsive"),
    25: ("Part VII — Presentation Standards", "Document Layout"),
    26: ("Part VII — Presentation Standards", "Printing & Export"),
    27: ("Part VIII — Platform Principles", "Performance"),
    28: ("Part VIII — Platform Principles", "Accessibility"),
    29: ("Part IX — Conformance", "Constitution Compliance & Ratification"),
}

TOC_SECTIONS: dict[int, list[str]] = {
    1: ["1.1", "1.2", "1.3", "1.4", "1.5"],
    2: ["2.1", "2.2", "2.3", "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10"],
    3: ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"],
    4: ["4.1", "4.2", "4.3", "4.4"],
    5: ["5.1", "5.2", "5.3", "5.4"],
    6: ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"],
    7: ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10", "7.11", "7.12", "7.13"],
    8: ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "8.11"],
    9: ["9.1", "9.2", "9.3", "9.4"],
    10: ["10.1", "10.2", "10.3"],
    11: ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8"],
    12: ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7"],
    13: ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9", "13.10"],
    14: ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8", "14.9", "14.10"],
    15: ["15.1", "15.2", "15.3", "15.4", "15.5", "15.6"],
    16: ["16.1", "16.2", "16.3"],
    17: ["17.1", "17.2", "17.3", "17.4"],
    18: ["18.1", "18.2", "18.3"],
    19: ["19.1", "19.2", "19.3", "19.4", "19.5", "19.6", "19.7"],
    20: ["20.1", "20.2", "20.3", "20.4", "20.5", "20.6"],
    21: ["21.1", "21.2", "21.3", "21.4", "21.5"],
    22: ["22.1", "22.2", "22.3", "22.4"],
    23: ["23.1", "23.2", "23.3", "23.4", "23.5", "23.6", "23.7"],
    24: ["24.1", "24.2", "24.3", "24.4", "24.5", "24.6", "24.7"],
    25: ["25.1", "25.2", "25.3", "25.4", "25.5", "25.6", "25.7", "25.8"],
    26: ["26.1", "26.2", "26.3", "26.4", "26.5", "26.6", "26.7"],
    27: ["27.1", "27.2"],
    28: ["28.1", "28.2", "28.3", "28.4", "28.5"],
    29: ["29.1", "29.2", "29.3", "29.4", "29.5", "29.6", "29.7", "29.8"],
}

OUT_OF_SCOPE_SECTIONS = {
    "1.4", "2.10", "3.8", "4.4", "5.4", "6.9", "7.13", "8.11", "9.4",
    "10.3", "11.8", "14.10", "17.4", "18.3", "21.5", "23.7", "25.8", "28.5",
}

NORMATIVE_CONTEXT_SECTIONS = {
    "1.1", "1.2", "2.1", "2.3", "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5",
    "2.6", "2.7", "2.8", "3.1", "3.2", "3.3", "3.5", "3.6", "4.1", "4.2", "4.3",
    "5.1", "5.2", "5.3", "6.1", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8",
    "7.2", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.11",
    "8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10",
    "9.1", "9.2", "9.3", "10.1", "10.2", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7",
    "12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7",
    "13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9", "13.10",
    "14.1", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8", "14.9",
    "15.1", "15.2", "15.3", "15.4", "15.5", "15.6",
    "16.1", "16.2", "16.3", "17.1", "17.2", "17.3", "18.1", "18.2",
    "19.1", "19.2", "19.3", "19.4", "19.5", "19.6", "19.7",
    "20.1", "20.2", "20.3", "20.4", "20.5", "20.6",
    "21.1", "21.2", "21.3", "21.4", "22.1", "22.2", "22.3", "22.4",
    "23.1", "23.2", "23.3", "23.4", "23.5", "23.6",
    "24.1", "24.2", "24.3", "24.4", "24.5", "24.6", "24.7",
    "25.1", "25.2", "25.3", "25.4", "25.5", "25.6", "25.7",
    "26.1", "26.2", "26.3", "26.4", "26.5", "26.6", "26.7",
    "27.1", "27.2", "28.1", "28.2", "28.3", "28.4",
    "29.1", "29.2", "29.3", "29.4", "29.5", "29.6", "29.7", "29.8",
}

GOVERNANCE_TABLE_SECTIONS = {
    "1.2", "2.2", "2.5", "2.9", "3.4", "3.7", "4.2", "6.2", "6.4", "7.1", "7.3",
    "14.3", "16.3", "18.1", "29.2",
}

# Only full chapter headings — NOT cross-references like "Chapter 8 (Concurrency)"
CHAPTER_HEADING_RE = re.compile(r"^Chapter (\d+)\s+[—–-]\s+(.+)$", re.M)
SECTION_HEADING_RE = re.compile(r"^(?:####\s+)?(\d+)\.(\d+)(?:\.(\d+))?\s+(.+)$", re.M)
SECTION_BOUNDARY_RE = re.compile(
    r"(?=^(?:####\s+)?\d+\.\d+(?:\.\d+)?\s+|Chapter \d+\s+[—–-]\s+|Appendix [AB]\b|\Z)",
    re.M,
)

DANGLING_END_RE = re.compile(
    r"(?:\b(with|per|and|or|to|for|the|a|an|of|in|on|at|by|from|into|upon|get-)\s*$|[(]$|\s[-–—]$)",
    re.I,
)
FRAGMENT_ONLY_RE = re.compile(
    r"^(?:workflows\.|approval and posting|before continue or submit|architecture\.|shall align with|reserved per)\.?$",
    re.I,
)

LIGATURE_MAP = {
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
}


@dataclass
class ParsedSection:
    chapter_num: int
    section: str
    section_title: str
    body: str
    page_start: int
    page_end: int


@dataclass
class AtomicCandidate:
    exact_pdf_source_text: str
    source_context_text: str = ""
    normalized_atomic_clause: str = ""
    source_span_id: str = ""
    atomicity_status: str = "atomic"
    atomicity_justification: str = ""
    page_start: int = 0
    page_end: int = 0


@dataclass
class ClauseRecord:
    fresh_id: str
    pdf_page: int
    pdf_page_start: int
    pdf_page_end: int
    part: str
    chapter_num: str
    chapter_title: str
    section: str
    source_span_id: str
    exact_pdf_source_text: str
    source_context_text: str
    normalized_atomic_clause: str
    strength_classification: str
    category_bucket: str
    atomicity_status: str
    atomicity_justification: str
    semantic_review_status: str = "Auto Proposed"
    semantic_review_reason: str = ""
    semantic_reviewer: str = ""
    product_gap_applicability: str = "N/A"
    implementation_target: str = "N/A"
    applies_to: str = "Platform"
    related_sections: str = ""
    verification_type: str = "Documentation"
    extraction_note: str = ""


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def normalize_unicode(text: str) -> str:
    t = text.replace("\u2014", "—").replace("\u2013", "–")
    t = t.replace("\u2018", "'").replace("\u2019", "'")
    t = t.replace("\u201c", '"').replace("\u201d", '"')
    t = t.replace("\u00a0", " ")
    t = t.replace("\u00ad", "")
    for lig, repl in LIGATURE_MAP.items():
        t = t.replace(lig, repl)
    return t


def normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalize_for_match(text: str) -> str:
    t = normalize_unicode(text)
    t = re.sub(r"-\s*\n\s*", "", t)
    t = re.sub(r"-\s+", "-", t)
    t = re.sub(r"[\r\n]+", " ", t)
    t = re.sub(r"[\u25cf\u2022●○◦]\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t.casefold()


def clean_page_text(raw: str) -> str:
    text = raw.replace("\r", "\n")
    text = re.sub(r"DX OSE Document Constitution v2\.0 Final\s*\n?", "", text)
    text = re.sub(r"Page \d+ of 47\s*\n?", "", text)
    text = re.sub(r"-- \d+ of 47 --\s*\n?", "", text)
    text = re.sub(r"^\s*Part [^\n]+\nChapter \d+[^\n]+\n", "", text, count=1, flags=re.M)
    text = normalize_unicode(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_corpus(pages: dict[int, str], start: int = 11, end: int = 44) -> tuple[str, list[tuple[int, int, int]]]:
    parts: list[str] = []
    offsets: list[tuple[int, int, int]] = []
    pos = 0
    for p in range(start, end + 1):
        chunk = pages.get(p, "")
        parts.append(chunk)
        offsets.append((p, pos, pos + len(chunk)))
        pos += len(chunk) + 1
    return "\n".join(parts), offsets


def page_range_for_span(start: int, end: int, offsets: list[tuple[int, int, int]]) -> tuple[int, int]:
    ps = pe = offsets[0][0]
    for pg, s, e in offsets:
        if s <= start < e:
            ps = pg
        if s <= end <= e or (s <= end and end <= e + 1):
            pe = pg
    for pg, s, e in offsets:
        if s <= end:
            pe = pg
    return ps, pe


def page_for_pos(pos: int, offsets: list[tuple[int, int, int]]) -> int:
    for pg, s, e in offsets:
        if s <= pos < e:
            return pg
    return offsets[-1][0]


def text_in_section_span(
    exact: str,
    section_body: str,
    page_start: int,
    page_end: int,
    pages: dict[int, str],
    source_context: str = "",
) -> tuple[bool, int, int]:
    """Search ONLY within section body text and pages [page_start, page_end]."""
    norm_exact = normalize_for_match(exact)
    if not norm_exact:
        return False, 0, 0

    search_norms = [norm_exact]
    if source_context:
        search_norms.append(normalize_for_match(f"{source_context} {exact}"))

    norm_body = normalize_for_match(section_body)
    if not any(s in norm_body for s in search_norms):
        return False, 0, 0

    for p in range(page_start, page_end + 1):
        np = normalize_for_match(pages.get(p, ""))
        for s in search_norms:
            if s in np:
                return True, p, p

    return True, page_start, page_end


def text_in_corpus(exact: str, corpus: str, pages: dict[int, str]) -> tuple[bool, int, int]:
    """Deprecated global search — kept for compatibility; prefer text_in_section_span."""
    norm_exact = normalize_for_match(exact)
    if not norm_exact:
        return False, 0, 0
    for p in range(11, 45):
        if norm_exact in normalize_for_match(pages.get(p, "")):
            return True, p, p
    return False, 0, 0


def reflow_body(body: str) -> str:
    """Join PDF line-wrap and hyphenation breaks; preserve paragraph/bullet/numbered boundaries."""
    raw_lines = body.split("\n")
    merged: list[str] = []
    i = 0
    while i < len(raw_lines):
        line = raw_lines[i].strip()
        if not line:
            merged.append("")
            i += 1
            continue
        while line.endswith("-") and i + 1 < len(raw_lines):
            nxt = raw_lines[i + 1].strip()
            if nxt:
                line = line[:-1] + nxt
                i += 1
            else:
                break
        while i + 1 < len(raw_lines):
            nxt = raw_lines[i + 1].strip()
            if not nxt:
                break
            if re.match(r"^(?:####\s+)?\d+\.\d+", nxt) or CHAPTER_HEADING_RE.match(nxt):
                break
            cont = (
                nxt[0].islower()
                or (not line.endswith((".", ":", ";", "—", "–")) and not re.match(r"^[\u25cf\u2022●○◦\d]", nxt))
            )
            if cont and not re.match(r"^(Chapter \d+|Appendix [AB])\b", nxt):
                line = f"{line} {nxt}"
                i += 1
                continue
            break
        merged.append(line)
        i += 1

    blocks: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            blocks.append(normalize_ws(" ".join(buf)))
            buf.clear()

    for line in merged:
        if not line:
            flush()
            continue
        if re.match(r"^[\u25cf\u2022●○◦\-–—]\s*", line) or re.match(r"^\d+\.\s+", line):
            flush()
            blocks.append(line)
            continue
        if re.match(r"^(State|Order|Concern|Layer|Attribute|Action|Level|Movement|Device|Resolution|Class)\s", line):
            flush()
            blocks.append(line)
            continue
        if buf and not buf[-1].rstrip().endswith((".", ":", ";")):
            buf.append(line)
        else:
            flush()
            buf.append(line)
    flush()
    return "\n\n".join(blocks)


def is_valid_atomic(text: str, allow_lowercase_list_item: bool = False) -> bool:
    t = normalize_ws(text)
    if len(t) < 4:
        return False
    if FRAGMENT_ONLY_RE.match(t):
        return False
    if DANGLING_END_RE.search(t):
        return False
    if t.count("(") != t.count(")"):
        return False
    if re.match(r"^[a-z]", t) and not allow_lowercase_list_item:
        if not t.startswith(("e.g.", "i.e.", "via ", "per ")):
            return False
    return True


def new_span_id(ch: int | str, section: str) -> str:
    return f"SP-C{ch}-{section}-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Section parser
# ---------------------------------------------------------------------------

def parse_sections(pages: dict[int, str]) -> list[ParsedSection]:
    corpus, offsets = build_corpus(pages)
    results: list[ParsedSection] = []
    seen: set[str] = set()

    oos_re = re.compile(
        rf"(?m)^(?:####\s+)?(\d+)\.(\d+)(?:\.(\d+))?\s+(Out of Scope(?: v2\.0)?)\s*\n(.*?){SECTION_BOUNDARY_RE.pattern}",
        re.S,
    )
    gen_re = re.compile(
        rf"(?m)^(?:####\s+)?(\d+)\.(\d+)(?:\.(\d+))?\s+([^\n]+)\n(.*?){SECTION_BOUNDARY_RE.pattern}",
        re.S,
    )

    def add(major: str, minor: str, sub: str | None, title: str, body: str, start: int) -> None:
        section = f"{major}.{minor}" + (f".{sub}" if sub else "")
        key = section
        if key in seen:
            return
        seen.add(key)
        body = re.sub(r"Page \d+ of 47\s*$", "", body.strip()).strip()
        ps = page_for_pos(start, offsets)
        pe = page_for_pos(start + len(body), offsets)
        results.append(
            ParsedSection(
                chapter_num=int(major),
                section=section,
                section_title=title.strip(),
                body=body,
                page_start=ps,
                page_end=max(ps, pe),
            )
        )

    for m in oos_re.finditer(corpus):
        add(m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.start())

    for m in gen_re.finditer(corpus):
        title = m.group(4).strip()
        if title.startswith("Out of Scope"):
            continue
        add(m.group(1), m.group(2), m.group(3), title, m.group(5), m.start())

    results.sort(key=lambda r: (r.chapter_num, [int(x) for x in r.section.split(".")]))
    return results


# ---------------------------------------------------------------------------
# Atomic splitting
# ---------------------------------------------------------------------------

def split_sentences(text: str) -> list[str]:
    """Split on sentence boundaries while keeping exact substrings."""
    parts: list[str] = []
    buf = ""
    for i, ch in enumerate(text):
        buf += ch
        if ch == "." and i + 1 < len(text):
            nxt = text[i + 1 : i + 3]
            if nxt.startswith(" ") and (len(nxt) < 2 or nxt[1].isupper() or nxt[1].isdigit()):
                parts.append(buf.strip())
                buf = ""
    if buf.strip():
        parts.append(buf.strip())
    return [p for p in parts if p.strip()]


def split_semicolon_parts(text: str) -> list[str]:
    return [p.strip() for p in text.split(";") if p.strip()]


def split_pipe_parts(text: str) -> list[str]:
    return [p.strip() for p in text.split("|") if p.strip()]


def split_labeled_semicolon(text: str) -> list[str]:
    """Split 'Label — clause; clause' into atomic labeled clauses."""
    text = normalize_ws(text)
    if " — " not in text or ";" not in text:
        return [text]
    label, _, rest = text.partition(" — ")
    parts = split_semicolon_parts(rest)
    if not parts:
        return [text]
    out = [f"{label} — {parts[0]}"]
    for p in parts[1:]:
        out.append(f"{label} — {p}")
    return out


def split_atoms(section: str, body: str, section_title: str, page_start: int, page_end: int) -> list[AtomicCandidate]:
    raw_body = body.strip()
    body = reflow_body(body)
    if not body and not raw_body:
        return []

    atoms: list[AtomicCandidate] = []

    def emit(exact: str, context: str = "", normalized: str = "", span: str = "", status: str = "atomic", just: str = "") -> None:
        exact = exact.strip()
        if not is_valid_atomic(exact, allow_lowercase_list_item=bool(context) or status == "span_member"):
            return
        norm = normalized or exact
        atoms.append(
            AtomicCandidate(
                exact_pdf_source_text=exact,
                source_context_text=context,
                normalized_atomic_clause=norm,
                source_span_id=span or new_span_id(section.split(".")[0], section),
                atomicity_status=status,
                atomicity_justification=just,
                page_start=page_start,
                page_end=page_end,
            )
        )

    if section == "2.9":
        for line in raw_body.split("\n"):
            line = line.strip()
            if line.startswith(("Cancel ", "Reject ", "Close ")):
                emit(line, status="span_member", just="§2.9 lifecycle termination table row.")
        return atoms

    if section == "3.4":
        for line in raw_body.split("\n"):
            line = line.strip()
            if not line or line.startswith("Attribute"):
                continue
            emit(line, status="span_member", just="§3.4 Send Back vs Reject table row.")
        return atoms

    # --- §1.4 applicability vs out-of-scope ---
    if section == "1.4":
        pre, _, post = body.partition("Out of scope for this Constitution:")
        for block in pre.split("\n\n"):
            block = block.strip()
            if not block:
                continue
            bullets = re.findall(r"[\u25cf\u2022●]\s*(.+?)(?=[\u25cf\u2022●]|$)", block, re.S)
            if bullets:
                for b in bullets:
                    emit(normalize_ws(b), status="span_member", just="§1.4 applicability bullet.")
            else:
                for sent in split_sentences(block):
                    emit(sent)
        emit("Out of scope for this Constitution:")
        for block in post.split("\n\n"):
            for b in re.findall(r"[\u25cf\u2022●]\s*(.+?)(?=[\u25cf\u2022●]|$)", block, re.S):
                emit(normalize_ws(b), status="span_member", just="§1.4 out-of-scope bullet.")
            block = block.strip()
            if block and "●" not in block and "Out of scope" not in block:
                for line in re.split(r"(?<=\.)\s+(?=[A-Z])", block):
                    line = line.strip()
                    if line:
                        emit(line, status="span_member", just="§1.4 out-of-scope bullet.")
        return atoms

    # --- §5.2 Posting preconditions (preferred model) ---
    if section == "5.2" and "Before Posting" in body:
        verify_match = re.search(
            r"(Before Posting, the platform shall verify:\s*.+?)(?:\nRules:|\.\nRules:|Rules:)",
            body,
            re.S,
        )
        if verify_match:
            full_verify = normalize_ws(verify_match.group(1).rstrip("."))
            span = new_span_id("5", "5.2-verify")
            items_text = full_verify.split(":", 1)[-1].strip()
            for item in items_text.split(";"):
                item = item.strip().rstrip(".")
                if item:
                    emit(
                        item,
                        context="Before Posting, the platform shall verify:",
                        normalized=f"Before Posting, the platform shall verify: {item}",
                        span=span,
                        status="span_member",
                        just="Semicolon-separated posting precondition from §5.2 verify list.",
                    )
        rules_part = body.split("Rules:", 1)[-1] if "Rules:" in body else ""
        for _, rule in re.findall(r"(?:^|\n)(\d+)\.\s+([^\n]+(?:\n(?!\d+\.)[^\n]+)*)", rules_part):
            rule_norm = normalize_ws(rule)
            if rule_norm.lower().startswith("posting trigger"):
                for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z])", rule_norm):
                    sent = sent.strip()
                    if sent:
                        emit(sent, status="span_member", just="§5.2 rule 5 posting trigger — atomic sentence split.")
                continue
            for part in split_labeled_semicolon(rule_norm):
                emit(part, status="span_member", just="§5.2 numbered rule — atomic split.")
            continue
        if "Posting behavior shall remain deterministic" in body:
            m = re.search(r"(Posting behavior shall remain deterministic and repeat-safe throughout the platform\.)", body)
            if m:
                emit(m.group(1))
        return atoms

    # --- §1.2 normative stack ---
    if section == "1.2":
        blocks = body.split("\n\n")
        for block in blocks:
            block = block.strip()
            if block.startswith("Order Document"):
                continue
            if "Governance Library" in block or block.startswith("The official governance"):
                if "shall maintain" in block:
                    emit("The official governance library shall maintain, at minimum:")
                continue
            if "shall always prevail" in block or "may override" in block:
                for sent in split_sentences(block):
                    emit(sent)
                continue
            if re.match(r"^\d+\s+DX OSE", block):
                emit(block)
                continue
            for sent in split_sentences(block):
                emit(sent)
        lib_lines = re.findall(r"^([A-Za-z0-9][^\n]+)$", body, re.M)
        in_lib = False
        for line in lib_lines:
            if "shall maintain, at minimum" in line:
                in_lib = True
                continue
            if in_lib and line.strip() in {
                "DX OSE Constitution", "DX OSE UX Constitution", "Business Decision Records (BDR)",
                "Workflow Contracts", "Access Control Catalog", "Architecture Guide", "Implementation Guide",
            }:
                emit(line.strip(), status="span_member", just="Governance library catalog entry.")
        return atoms

    # --- §1.5 keywords ---
    if section == "1.5":
        for block in body.split("\n\n"):
            b = normalize_ws(block)
            if not b or b.startswith("Guidance:"):
                continue
            if "Term Meaning" in block:
                for line in block.split("\n"):
                    line = line.strip()
                    if line in {"Term Meaning", "Must /", "Shall"}:
                        continue
                    if line.startswith(("Must /", "Should ", "May ", "Must not ", "Will ")):
                        emit(line)
                continue
            emit(b)
        return atoms

    if section == "10.2":
        for block in body.split("\n\n"):
            block = block.strip()
            if not block:
                continue
            if "Inbound:" in block and "Outbound:" in block:
                pre, _, post = block.partition("Outbound:")
                inbound = pre.replace("Inbound:", "").strip().rstrip(".")
                outbound = post.strip().rstrip(".")
                if inbound:
                    emit(f"Inbound: {inbound}")
                if outbound:
                    for part in split_semicolon_parts(outbound):
                        p = part.strip()
                        if p:
                            emit(f"Outbound: {p}" if not p.lower().startswith("outbound") else p)
                continue
            bullets = re.findall(r"[\u25cf\u2022●]\s*(.+?)(?=[\u25cf\u2022●]|$)", block, re.S)
            if bullets:
                for b in bullets:
                    b = normalize_ws(b)
                    if "; " in b or (b.count(";") >= 1 and "Inbound:" not in b and "Outbound:" not in b):
                        parts = split_labeled_semicolon(b) if " — " in b else split_semicolon_parts(b)
                        if len(parts) > 1:
                            span = new_span_id("10", "10.2-bullet")
                            for part in parts:
                                p = part.strip()
                                if p:
                                    emit(p, span=span, status="span_member", just="§10.2 bullet semicolon — atomic split.")
                            continue
                    emit(normalize_ws(b))
                continue
            emit(normalize_ws(block))
        return atoms

    # --- §2.2 lifecycle states ---
    if section == "2.2":
        if "State Meaning" in body:
            pre, rest = body.split("State Meaning", 1)
            for para in pre.split("\n\n"):
                for sent in split_sentences(normalize_ws(para)):
                    emit(sent)
            table_part = rest.split("Cancel and Void", 1)[0] if "Cancel and Void" in rest else rest
            state_names = [
                "Draft", "Submitted", "In Review", "Approved", "Posted",
                "Rejected", "Returned", "Void", "Closed",
            ]
            flat_table = normalize_ws(table_part)
            for idx, state in enumerate(state_names):
                nxt = state_names[idx + 1] if idx + 1 < len(state_names) else None
                pat = rf"{re.escape(state)}\s+(.+?)(?=\s{re.escape(nxt)}\s|$)" if nxt else rf"{re.escape(state)}\s+(.+)$"
                m = re.search(pat, flat_table)
                if m:
                    emit(f"{state} {m.group(1).strip()}", status="span_member", just="Lifecycle state table row.")
            if "Cancel and Void" in rest:
                post = rest.split("Cancel and Void", 1)[1]
                for bullet in re.findall(r"[\u25cf\u2022●]\s*(.+?)(?=[\u25cf\u2022●]|$)", post, re.S):
                    b = normalize_ws(bullet)
                    if b and is_valid_atomic(b):
                        emit(b)
        return atoms

    # --- §2.5 editability table ---
    if section == "2.5":
        if "Editability shall" in body:
            m = re.search(r"(Editability shall[^\n]+(?:\n[^\n]+)?)", body)
            if m:
                emit(normalize_ws(m.group(1)))
        for line in body.split("\n"):
            line = line.strip()
            if re.match(r"^(Draft|Submitted|In Review|Approved|Posted|Rejected|Returned|Void|Closed)\s", line):
                emit(line, status="span_member", just="Editability table row.")
        return atoms

    # --- §3.4 table ---
    if section == "3.4":
        for line in body.split("\n"):
            line = line.strip()
            if not line or line.startswith("Attribute"):
                continue
            if line.startswith(("Send Back", "Reject")):
                emit(line, status="span_member", just="Send Back vs Reject table row.")
            else:
                emit(line)
        return atoms

    # --- §4.2 operations ---
    if section == "4.2":
        for block in body.split("\n\n"):
            b = block.strip()
            if b.startswith("View,"):
                for op in [x.strip() for x in b.split(",")]:
                    if op:
                        emit(op, status="span_member", just="Standard operation list item.")
            else:
                for sent in split_sentences(b):
                    emit(sent)
        return atoms

    # --- §6.4 period states ---
    if section == "6.4":
        m = re.search(r"(Open, Closing, Closed, Archived\.)", body)
        if m:
            emit(m.group(1).rstrip("."), normalized="Open, Closing, Closed, Archived.")
        m2 = re.search(r"(Closing — controlled validation phase before period may close\.)", body)
        if m2:
            emit(m2.group(1))
        return atoms

    # --- §7.1 table ---
    if section == "7.1":
        if "These must remain separate policies." in body:
            emit("These must remain separate policies.")
        return atoms

    # --- Gate A.3 compound section splits ---
    if section == "22.1":
        for part in re.split(r",\s*(?=[a-z])", normalize_ws(body)):
            part = part.strip()
            if part:
                emit(part, status="span_member", just="§22.1 audit field — atomic split.")
        return atoms

    if section == "22.3":
        for line in body.split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.count(";") >= 2:
                span = new_span_id("22", "22.3-compound")
                for part in split_semicolon_parts(line):
                    emit(part, span=span, status="span_member", just="§22.3 semicolon-separated timeline rule.")
            else:
                emit(line)
        return atoms

    if section == "23.3":
        text = normalize_ws(body)
        span = new_span_id("23", "23.3-compound")
        if "ranking:" in text:
            pre, _, rest = text.partition("ranking:")
            if pre.strip():
                emit(pre.strip().rstrip(";"), span=span, status="span_member", just="§23.3 search field dimensions.")
            ranking = rest.split(";")[0].strip()
            emit(f"ranking: {ranking}", span=span, status="span_member", just="§23.3 search ranking order.")
            for part in split_semicolon_parts(";".join(rest.split(";", 1)[1:]) if ";" in rest else ""):
                emit(part, span=span, status="span_member", just="§23.3 lookup behavior rule.")
        else:
            for part in split_semicolon_parts(text):
                emit(part, span=span, status="span_member", just="§23.3 lookup rule.")
        return atoms

    if section == "23.4":
        text = normalize_ws(body)
        span = new_span_id("23", "23.4-compound")
        parts = split_semicolon_parts(text)
        if len(parts) >= 3:
            emit(parts[0], span=span, status="span_member", just="§23.4 keyboard interaction rule.")
            emit(parts[1], span=span, status="span_member", just="§23.4 lookup close behavior.")
            emit(parts[2], span=span, status="span_member", just="§23.4 one lookup open rule.")
            if len(parts) > 3:
                emit(parts[3], span=span, status="span_member", just="§23.4 item-pick focus rule.")
        else:
            for part in parts:
                emit(part, span=span, status="span_member", just="§23.4 lookup interaction rule.")
        return atoms

    if section == "24.2":
        span = new_span_id("24", "24.2-compound")
        for part in split_semicolon_parts(normalize_ws(body)):
            emit(part, span=span, status="span_member", just="§24.2 resolution specification — atomic split.")
        return atoms

    if section == "26.3":
        span = new_span_id("26", "26.3-compound")
        for part in split_semicolon_parts(normalize_ws(body)):
            emit(part, span=span, status="span_member", just="§26.3 print/export rule — atomic split.")
        return atoms

    if section == "28.1":
        span = new_span_id("28", "28.1-compound")
        for part in split_semicolon_parts(normalize_ws(body)):
            emit(part, span=span, status="span_member", just="§28.1 accessibility principle — atomic split.")
        return atoms

    if section == "29.2":
        span = new_span_id("29", "29.2-compound")
        text = normalize_ws(body)
        if "|" in text:
            for part in split_pipe_parts(text):
                emit(part, span=span, status="span_member", just="§29.2 compliance level — atomic split.")
        else:
            emit(text)
        return atoms

    if section == "24.4":
        span = new_span_id("24", "24.4-compound")
        for part in split_semicolon_parts(normalize_ws(body)):
            emit(part, span=span, status="span_member", just="§24.4 workspace rule — atomic split.")
        return atoms

    if section == "27.1":
        span = new_span_id("27", "27.1-compound")
        for part in split_semicolon_parts(normalize_ws(body)):
            emit(part, span=span, status="span_member", just="§27.1 performance principle — atomic split.")
        return atoms

    # --- §18.2 validation rules (semicolon bullets) ---
    if section == "18.2":
        span = new_span_id("18", "18.2-rules")
        for bullet in re.findall(r"[\u25cf\u2022●]\s*(.+?)(?=[\u25cf\u2022●]|$)", body, re.S):
            b = normalize_ws(bullet)
            if ";" in b and "→" in b:
                for part in split_semicolon_parts(b):
                    emit(part, span=span, status="span_member", just="§18.2 validation rule — semicolon split.")
            else:
                emit(b, span=span, status="span_member", just="§18.2 validation rule bullet.")
        return atoms

    # --- §18.1 golden rule table ---
    if section == "18.1":
        pre = body.split("Level Channel")[0].strip()
        for sent in split_sentences(pre):
            emit(sent)
        table = body.split("Level Channel", 1)[-1] if "Level Channel" in body else ""
        for line in table.split("\n"):
            line = line.strip()
            if not line or line in {"Level Channel", "Field Inline", "Row On row", "Document Summary banner"}:
                continue
            emit(line, status="span_member", just="Validation level table row.")
        return atoms

    if section == "14.8":
        text = normalize_ws(body)
        span = new_span_id("14", "14.8-compound")
        for part in split_semicolon_parts(text):
            emit(part, span=span, status="span_member", just="§14.8 filename rule — atomic split.")
        return atoms

    if section == "24.6":
        text = normalize_ws(body)
        span = new_span_id("24", "24.6-compound")
        for part in split_semicolon_parts(text):
            emit(part, span=span, status="span_member", just="§24.6 responsive test matrix — atomic split.")
        return atoms

    # --- Generic splitting ---
    blocks = body.split("\n\n")
    for block in blocks:
        block = block.strip()
        if not block:
            continue

        bullets = re.findall(r"[\u25cf\u2022●]\s*(.+?)(?=[\u25cf\u2022●]|$)", block, re.S)
        if bullets:
            for b in bullets:
                b = normalize_ws(b)
                if "; " in b or (b.count(";") >= 1 and "Inbound:" not in b and "Outbound:" not in b):
                    parts = split_labeled_semicolon(b) if " — " in b else split_semicolon_parts(b)
                    if len(parts) > 1:
                        span = new_span_id(section.split(".")[0], f"{section}-bullet")
                        for part in parts:
                            p = part.strip()
                            if p:
                                emit(p, span=span, status="span_member", just="Bullet semicolon — atomic split.")
                        continue
                emit(b)
            continue

        numbered = re.findall(r"(?:^|\n)(\d+)\.\s+([^\n]+(?:\n(?!\d+\.)[^\n]+)*)", block)
        if numbered:
            for _, item in numbered:
                item_norm = normalize_ws(item)
                parts = split_labeled_semicolon(item_norm) if ";" in item_norm else [item_norm]
                for part in parts:
                    emit(part, status="span_member", just="Numbered rule — atomic split.")
            continue

        if section in GOVERNANCE_TABLE_SECTIONS and "\n" in block:
            for line in block.split("\n"):
                line = line.strip()
                if line and len(line) > 12:
                    emit(line, status="span_member", just=f"Table/list row in §{section}.")
            continue

        if ";" in block and section in {"17.2", "20.2", "21.1", "24.4", "27.1", "29.8"}:
            span = new_span_id(section.split(".")[0], section)
            for part in block.split(";"):
                part = part.strip()
                if part and is_valid_atomic(part):
                    emit(part, span=span, status="span_member", just="Semicolon-separated list item.")
            continue

        block_norm = normalize_ws(block)
        if "; " in block_norm or (block_norm.count(";") >= 1 and " — " not in block_norm):
            parts = split_labeled_semicolon(block_norm) if " — " in block_norm else split_semicolon_parts(block_norm)
            if len(parts) > 1 and not block_norm.lower().startswith("before posting"):
                span = new_span_id(section.split(".")[0], f"{section}-semi")
                for part in parts:
                    p = part.strip()
                    if p:
                        emit(p, span=span, status="span_member", just="Semicolon-separated rule — atomic split.")
                continue

        sents = split_sentences(block)
        if len(sents) > 1:
            for sent in sents:
                emit(sent)
        else:
            emit(normalize_ws(block))

    return atoms


# ---------------------------------------------------------------------------
# Semantic classification (per atomic clause)
# ---------------------------------------------------------------------------

def is_bdr007_excluded(text: str, section: str) -> bool:
    low = text.lower()
    if section == "2.2" and "cancelled shall not be introduced" in low:
        return True
    if "bdr-007" in low and ("under review" in low or "cancelled" in low):
        return True
    return False


def classify_atomic(
    exact: str,
    normalized: str,
    section: str,
    chapter_num: str,
    section_title: str,
) -> tuple[str, str]:
    text = normalized or exact
    low = text.lower()

    if chapter_num == "A":
        return "Reference Index Entry", "Reference Index Entry"
    if chapter_num == "B" and is_bdr007_excluded(text, section):
        return "Explicitly Excluded Pending Ratification", "Explicitly Excluded Pending Ratification"
    if chapter_num == "B":
        return "Governance Definition", "Descriptive Governance Statements"
    if is_bdr007_excluded(text, section):
        return "Explicitly Excluded Pending Ratification", "Explicitly Excluded Pending Ratification"

    if section == "1.4":
        if "out of scope for this constitution" in low or exact.strip() in {
            "Technology stack", "Internal implementation details", "Database architecture",
            "Integration implementation details",
        } or "implementation detail belongs in architecture" in low:
            return "Out of Scope", "Out-of-Scope Clauses"
        return "Governance Definition", "Descriptive Governance Statements"

    if section in OUT_OF_SCOPE_SECTIONS and section != "1.4":
        if "out of scope" in low or section_title.lower().startswith("out of scope"):
            return "Out of Scope", "Out-of-Scope Clauses"

    if re.search(r"\bno .+?\bmay\b", text, re.I):
        return "Explicit Must Not", "Enforceable Normative Requirements"

    # Enforceable patterns BEFORE optional "may"
    if re.search(r"\bprohibited\b", text, re.I):
        return "Explicit Must Not", "Enforceable Normative Requirements"

    if re.search(r"\brequired for\b", low) or re.search(r"\d+%\s*[–-]\s*\d+%", text):
        return "Normative Rule by Section/Table Context", "Enforceable Normative Requirements"

    if re.search(r"\b(must not|shall not)\b", text, re.I):
        return "Explicit Must Not", "Enforceable Normative Requirements"
    if re.search(r"\bmust\b", text, re.I):
        return "Explicit Must", "Enforceable Normative Requirements"
    if re.search(r"\bshall\b", text, re.I):
        return "Explicit Shall", "Enforceable Normative Requirements"
    if re.search(r"\bshould\b", text, re.I):
        return "Explicit Should", "Strong Recommendations"

    # Conditional "may" — governance timing, not optional capability
    if re.search(r"\bmay\b", text, re.I):
        optional_patterns = (
            r"modules may implement",
            r"may exist",
            r"may include draft",
            r"may be accepted",
            r"may define otherwise",
            r"may be used",
            r"may optionally",
        )
        governance_may = (
            r"may officially affect",
            r"before period may close",
            r"may close",
            r"governs when",
        )
        if any(re.search(p, low) for p in governance_may):
            return "Governance Definition", "Descriptive Governance Statements"
        if any(re.search(p, low) for p in optional_patterns):
            return "Explicit May", "Optional Capabilities"
        if section in NORMATIVE_CONTEXT_SECTIONS:
            return "Normative Rule by Section/Table Context", "Enforceable Normative Requirements"
        return "Explicit May", "Optional Capabilities"

    if section in {"29.2", "29.3", "29.4", "29.7", "29.8"} or "test matrix" in section_title.lower() or "definition of done" in section_title.lower():
        return "Normative Rule by Section/Table Context", "Enforceable Normative Requirements"

    if section in {"24.1", "24.2", "24.3", "24.5", "24.6", "24.7", "25.1", "25.2", "25.3", "25.4", "25.5", "25.6", "25.7", "26.1", "28.1", "28.2", "28.3", "28.4"}:
        if "policy" in section_title.lower() or "rules" in section_title.lower() or "principles" in section_title.lower():
            return "Normative Rule by Section/Table Context", "Enforceable Normative Requirements"

    if section in GOVERNANCE_TABLE_SECTIONS and section not in OUT_OF_SCOPE_SECTIONS:
        if any(k in low for k in ("editable", "meaning", "governs", "determines", "state ", "concern")):
            return "Governance Definition", "Descriptive Governance Statements"

    if section in NORMATIVE_CONTEXT_SECTIONS and ("rule:" in low or "principle:" in low):
        return "Normative Rule by Section/Table Context", "Enforceable Normative Requirements"

    if "purpose" in section_title.lower() and section in NORMATIVE_CONTEXT_SECTIONS:
        return "Governance Definition", "Descriptive Governance Statements"

    return "Descriptive", "Descriptive Governance Statements"


def infer_applies_to(chapter_num: str) -> str:
    mapping = {
        "2": "Operational Documents / Shared UX", "3": "Workflow / Shared UX",
        "4": "ACC / Backend Authorization", "5": "Posting / Backend",
        "6": "Period Management / Backend", "7": "Draft Governance / Shared UX",
        "8": "Concurrency / Backend", "9": "Document Numbering / Platform",
        "10": "Inventory / Stock", "11": "Display Currency / Shared UX",
        "12": "Document Header / All Documents", "13": "Document Lines / All Documents",
        "14": "Attachments / Platform", "15": "Notes & Comments / All Documents",
        "16": "Item Master / Shared UX", "17": "Keyboard Navigation / Shared UX",
        "18": "Validation / Shared UX", "19": "Error Handling / Shared UX",
        "20": "Notifications / Shared UX", "21": "Loading & Progress / Shared UX",
        "22": "Audit & Timeline / Platform", "23": "Lookup Standard / Shared UX",
        "24": "Workspace & Responsive / Shared UX", "25": "Document Layout / Shared UX",
        "26": "Printing & Export / Reports", "27": "Performance / Platform",
        "28": "Accessibility / Shared UX", "29": "Governance / QA",
        "A": "Governance / BDR Index", "B": "Governance / Open Notes",
    }
    return mapping.get(chapter_num, "Platform")


def infer_verification(strength: str, category: str) -> str:
    if category == "Reference Index Entry":
        return "BDR index review"
    if category == "Out-of-Scope Clauses":
        return "N/A"
    if category == "Explicitly Excluded Pending Ratification":
        return "Exclusion register verification"
    if strength in {"Explicit Must", "Explicit Shall", "Explicit Must Not", "Normative Rule by Section/Table Context"}:
        return "Code / Runtime / UI"
    if strength == "Explicit Should":
        return "UI / Runtime"
    if strength == "Explicit May":
        return "Runtime"
    return "Documentation"


# ---------------------------------------------------------------------------
# Build register
# ---------------------------------------------------------------------------

def extract_appendix_a(pages: dict[int, str]) -> list[ClauseRecord]:
    lines = [ln.strip() for ln in normalize_unicode(pages.get(45, "")).split("\n") if ln.strip()]
    rows: list[ClauseRecord] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.startswith("BDR-"):
            i += 1
            continue
        exact_line = line
        content = line[4:].strip()
        num = ""
        status = ""
        title = ""
        if content.endswith(" Active"):
            status = "Active"
            title = content[:-6].strip()
            if i + 1 < len(lines):
                nxt = lines[i + 1]
                if re.match(r"^\d{3}$", nxt):
                    num = nxt
                    i += 2
                elif re.match(r"^(\d{3})\s+(.+)$", nxt):
                    num = re.match(r"^(\d{3})\s+(.+)$", nxt).group(1)
                    title = f"{title} {re.match(r'^(\d{3})\s+(.+)$', nxt).group(2)}"
                    i += 2
                else:
                    i += 1
            else:
                i += 1
        elif content.endswith(" Under"):
            status = "Under Review"
            title = content[:-6].strip()
            if i + 1 < len(lines):
                nxt = lines[i + 1]
                m_review = re.match(r"^(\d{3})\s+Review$", nxt)
                if m_review:
                    num = m_review.group(1)
                    i += 2
                elif re.match(r"^\d{3}$", nxt):
                    num = nxt
                    i += 2
                else:
                    i += 1
            else:
                i += 1
        else:
            i += 1
            continue
        if num and title and status:
            bdr_id = f"BDR-{num}"
            rows.append(
                ClauseRecord(
                    fresh_id=f"CA-A-{int(num):03d}",
                    pdf_page=45,
                    pdf_page_start=45,
                    pdf_page_end=45,
                    part="Appendix A",
                    chapter_num="A",
                    chapter_title="Business Decision Records (BDR) Index",
                    section="A",
                    source_span_id=f"SP-A-{bdr_id}",
                    exact_pdf_source_text=exact_line,
                    source_context_text=f"bdr_id={bdr_id}; title={title}; status={status}; number_line={num}",
                    normalized_atomic_clause=f"BDR index entry {bdr_id}: {title} ({status})",
                    strength_classification="Reference Index Entry",
                    category_bucket="Reference Index Entry",
                    atomicity_status="atomic",
                    atomicity_justification="Appendix A BDR index row.",
                    applies_to="Governance / BDR Index",
                    related_sections="Appendix B",
                    verification_type="BDR index review",
                    extraction_note="Reference index; not constitutional clause",
                )
            )
            continue
        i += 1
    return rows


def extract_appendix_b(pages: dict[int, str]) -> list[ClauseRecord]:
    text = pages.get(46, "")
    rows: list[ClauseRecord] = []
    intro_m = re.search(
        r"(The following items remain Under Review and are explicitly excluded from normative SHALL/MUST requirements until ratified:)",
        text,
        re.I,
    )
    if intro_m:
        exact = intro_m.group(1)
        rows.append(
            ClauseRecord(
                fresh_id="CB-B-001",
                pdf_page=46,
                pdf_page_start=46,
                pdf_page_end=46,
                part="Appendix B",
                chapter_num="B",
                chapter_title="Open Governance Notes",
                section="B",
                source_span_id="SP-B-intro",
                exact_pdf_source_text=exact,
                source_context_text="",
                normalized_atomic_clause="Under Review items excluded from SHALL/MUST until ratified",
                strength_classification="Governance Definition",
                category_bucket="Descriptive Governance Statements",
                atomicity_status="atomic",
                atomicity_justification="Appendix B intro statement.",
                applies_to="Governance process",
                related_sections="2.2",
                verification_type="Governance register review",
            )
        )
    bdr_m = re.search(r"(BDR-007 — Void vs Cancelled user-facing label — Under Review)", text)
    if bdr_m:
        exact = bdr_m.group(1)
        rows.append(
            ClauseRecord(
                fresh_id="CB-B-002",
                pdf_page=46,
                pdf_page_start=46,
                pdf_page_end=46,
                part="Appendix B",
                chapter_num="B",
                chapter_title="Open Governance Notes",
                section="B",
                source_span_id="SP-B-BDR-007",
                exact_pdf_source_text=exact,
                source_context_text="",
                normalized_atomic_clause="BDR-007 excluded pending ratification",
                strength_classification="Explicitly Excluded Pending Ratification",
                category_bucket="Explicitly Excluded Pending Ratification",
                atomicity_status="atomic",
                atomicity_justification="Appendix B explicit BDR-007 exclusion.",
                applies_to="User-facing lifecycle labeling",
                related_sections="2.2",
                verification_type="Exclusion register verification",
                extraction_note="BDR-007 excluded from enforceable requirements",
            )
        )
    return rows


def build_register(pages: dict[int, str]) -> list[ClauseRecord]:
    from constitution_semantic import classify_semantic

    clauses: list[ClauseRecord] = []
    counters: dict[tuple[str, str], int] = {}

    def next_id(ch: int | str, section: str) -> str:
        key = (str(ch), section)
        counters[key] = counters.get(key, 0) + 1
        return f"C{ch}-{section}-{counters[key]:03d}"

    for sec in parse_sections(pages):
        part, chapter_title = CHAPTER_META.get(sec.chapter_num, ("", f"Chapter {sec.chapter_num}"))
        candidates = split_atoms(sec.section, sec.body, sec.section_title, sec.page_start, sec.page_end)

        for cand in candidates:
            ok, ps, pe = text_in_section_span(
                cand.exact_pdf_source_text,
                sec.body,
                sec.page_start,
                sec.page_end,
                pages,
                cand.source_context_text,
            )
            if not ok:
                continue

            sem = classify_semantic(
                cand.exact_pdf_source_text,
                cand.normalized_atomic_clause or cand.exact_pdf_source_text,
                sec.section,
                str(sec.chapter_num),
                sec.section_title,
                cand.source_context_text,
                cand.atomicity_status,
                cand.atomicity_justification,
            )

            clauses.append(
                ClauseRecord(
                    fresh_id=next_id(sec.chapter_num, sec.section),
                    pdf_page=ps,
                    pdf_page_start=sec.page_start,
                    pdf_page_end=sec.page_end,
                    part=part,
                    chapter_num=str(sec.chapter_num),
                    chapter_title=chapter_title,
                    section=sec.section,
                    source_span_id=cand.source_span_id,
                    exact_pdf_source_text=cand.exact_pdf_source_text,
                    source_context_text=cand.source_context_text,
                    normalized_atomic_clause=cand.normalized_atomic_clause or cand.exact_pdf_source_text,
                    strength_classification=sem.strength_classification,
                    category_bucket=sem.category_bucket,
                    atomicity_status=cand.atomicity_status,
                    atomicity_justification=cand.atomicity_justification,
                    semantic_review_status=sem.semantic_review_status,
                    semantic_review_reason=sem.semantic_review_reason,
                    semantic_reviewer=sem.semantic_reviewer,
                    product_gap_applicability=sem.product_gap_applicability,
                    implementation_target=sem.implementation_target,
                    applies_to=infer_applies_to(str(sec.chapter_num)),
                    verification_type=sem.verification_type,
                )
            )

    clauses.extend(extract_appendix_a(pages))
    clauses.extend(extract_appendix_b(pages))
    clauses = _apply_appendix_semantics(clauses)

    from constitution_adjudication import apply_adjudication, ensure_adjudication_file

    ensure_adjudication_file(clauses)
    return apply_adjudication(clauses)


def _apply_appendix_semantics(clauses: list[ClauseRecord]) -> list[ClauseRecord]:
    from constitution_semantic import classify_semantic

    out: list[ClauseRecord] = []
    for c in clauses:
        if c.chapter_num in {"A", "B"}:
            sem = classify_semantic(
                c.exact_pdf_source_text, c.normalized_atomic_clause,
                c.section, c.chapter_num, c.chapter_title,
                c.source_context_text, c.atomicity_status, c.atomicity_justification,
            )
            c.strength_classification = sem.strength_classification
            c.category_bucket = sem.category_bucket
            c.semantic_review_status = sem.semantic_review_status
            c.semantic_review_reason = sem.semantic_review_reason
            c.semantic_reviewer = sem.semantic_reviewer
            c.product_gap_applicability = sem.product_gap_applicability
            c.implementation_target = sem.implementation_target
            c.verification_type = sem.verification_type
        out.append(c)
    return out
