import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const basePath = path.join(__dirname, "constitution-base.md");
const outPath = path.join(__dirname, "constitution-final.md");
let text = fs.readFileSync(basePath, "utf8");

// Correction 2: Chapter 1 numbering — reserve §1.3, renumber Scope and Mandatory Language
const ch1Old = `### 1.3 Scope

This Constitution applies to **all current and future operational modules** of the DX OSE ERP Platform.

Unless explicitly stated otherwise:

- **Platform-wide chapters** apply to all DX OSE modules and shared user experiences.  
- **Document-specific chapters** apply to operational documents and document entry workflows.

**Out of scope for this Constitution:**

- Technology stack  
- Internal implementation details  
- Database architecture  
- Integration implementation details  
- Super-admin platform internals (unless separately governed)  

Implementation detail belongs in **Architecture & Implementation Guides**.

### 1.4 Mandatory Language`;

const ch1New = `### 1.3 Deleted / Reserved — Four Tiers Removed

Section 1.3 Four Tiers has been removed in its entirety per Master Review Log ratification. This section number is reserved and shall not be reassigned to other content without explicit governance decision.

### 1.4 Scope

This Constitution applies to **all current and future operational modules** of the DX OSE ERP Platform.

Unless explicitly stated otherwise:

- **Platform-wide chapters** apply to all DX OSE modules and shared user experiences.  
- **Document-specific chapters** apply to operational documents and document entry workflows.

**Out of scope for this Constitution:**

- Technology stack  
- Internal implementation details  
- Database architecture  
- Integration implementation details  

Implementation detail belongs in **Architecture & Implementation Guides**.

### 1.5 Mandatory Language`;

if (!text.includes(ch1Old)) {
  throw new Error("Chapter 1 block not found for replacement");
}
text = text.replace(ch1Old, ch1New);

// Correction 4: Remove Zero Price from Chapter 10
text = text.replace(
  /- Zero price may be allowed at draft\/submit per document policy; valuation at Posting per Chapter 5\.\s*\n/g,
  ""
);

// Correction 5: Chapter 14 immutability
text = text.replace(
  "**Posted attachments** shall not be modified, replaced, or deleted except by explicit admin governance.",
  "**Posted attachments** shall not be modified, replaced, or deleted."
);

// Correction 6: Chapter 14 numbering
text = text.replace("### 14.9 Out of Scope", "### 14.10 Out of Scope");

// Correction 7: BDR-009 Active without pending
text = text.replace(
  "| BDR-009 | Item Business Rules (v1 ITM-1): duplicate messaging, supplier/warehouse change, base unit immutability after first movement | Active — pending dedicated chapter decision |",
  "| BDR-009 | Item Business Rules (v1 ITM-1): duplicate messaging, supplier/warehouse change, base unit immutability after first movement | Active |"
);

// Correction 8: Chapter 19 — remove error code families from Constitution
text = text.replace(
  "**Standard code families:** VAL-*, BUS-*, SEC-*, SYS-*, PER-*, STK-*, CC-* (implementation catalog in Architecture Guide).",
  "Structured error codes and families are defined in the Architecture & Implementation Guide, not in this Constitution."
);

// Add Appendix B and TOC entry if missing
if (!text.includes("Appendix B — Open Governance Notes")) {
  text = text.replace(
    "**Appendix A — Business Decision Records (BDR) Index**",
    "**Appendix A — Business Decision Records (BDR) Index**  \n**Appendix B — Open Governance Notes**"
  );

  text = text.replace(
    "| BDR-009 | Item Business Rules (v1 ITM-1): duplicate messaging, supplier/warehouse change, base unit immutability after first movement | Active |\n\n---",
    `| BDR-009 | Item Business Rules (v1 ITM-1): duplicate messaging, supplier/warehouse change, base unit immutability after first movement | Active |

---

# Appendix B — Open Governance Notes

The following items remain **Under Review** and are explicitly excluded from normative SHALL/MUST requirements until ratified:

- **BDR-007 — Void vs Cancelled user-facing label** — Under Review

---`
  );
}

// Cover page metadata at top
const cover = `# DX OSE Document Constitution

## Version 2.0 — Final

| Field | Value |
|--------|--------|
| **Document Title** | DX OSE Document Constitution |
| **Version** | 2.0 Final |
| **Status** | Ratified — Chapters 1–29 |
| **Classification** | Internal — Governance |
| **Platform** | DX OSE Enterprise ERP Platform |
| **Supersedes** | DX OSE Document Constitution v1.0 |
| **Effective Upon** | Governance Ratification |

---

`;

if (!text.startsWith("# DX OSE Document Constitution")) {
  text = cover + text;
}

fs.writeFileSync(outPath, text, "utf8");
console.log("Wrote corrected constitution:", outPath);

// Validation
const checks = [
  ["§1.3 reserved", text.includes("### 1.3 Deleted / Reserved — Four Tiers Removed")],
  ["§1.4 Scope", text.includes("### 1.4 Scope")],
  ["§1.5 Mandatory Language", text.includes("### 1.5 Mandatory Language")],
  ["No §1.3 Scope", !text.includes("### 1.3 Scope")],
  ["No Super-admin", !text.includes("Super-admin")],
  ["No Zero price", !text.includes("Zero price")],
  ["No admin exception", !text.includes("except by explicit admin governance")],
  ["14.10 Out of Scope", text.includes("### 14.10 Out of Scope")],
  ["No duplicate 14.9 OOS", !text.includes("### 14.9 Out of Scope")],
  ["BDR-009 Active", text.includes("| BDR-009 |") && !text.toLowerCase().includes("pending dedicated")],
  ["No VAL-* in Ch19", !text.includes("VAL-*")],
  ["Appendix B", text.includes("Appendix B — Open Governance Notes")],
  ["29 chapters", (text.match(/^## Chapter \d+/gm) || []).length === 29],
];

for (const [name, ok] of checks) {
  console.log(ok ? "PASS" : "FAIL", name);
}
const failed = checks.filter(([, ok]) => !ok);
if (failed.length) process.exit(1);
