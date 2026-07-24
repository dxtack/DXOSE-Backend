import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcript = path.resolve(
  "C:/Users/amrsa/.cursor/projects/c-DX-OS-E/agent-transcripts/1bcc7efd-a7ee-412a-89e1-e6ff1edba1f9/1bcc7efd-a7ee-412a-89e1-e6ff1edba1f9.jsonl"
);
const lines = fs.readFileSync(transcript, "utf8").split(/\n/).filter(Boolean);

for (let i = 0; i < lines.length; i++) {
  try {
    const row = JSON.parse(lines[i]);
    const text = row?.message?.content?.find((c) => c.type === "text")?.text ?? "";
    if (text.includes("### 1.3 Scope") && text.includes("Chapter 29 — Constitution Compliance")) {
      const start = text.indexOf("## Document Control");
      const end = text.indexOf("# Architecture & Implementation Guide");
      const altStart = text.indexOf("# Final DX OSE Constitution v2.0");
      const bodyStart = start >= 0 ? start : altStart;
      if (bodyStart >= 0) {
        const endIdx = end >= 0 ? end : text.indexOf("# Appendix A");
        const sliceEnd =
          endIdx >= 0 ? endIdx : text.indexOf("---\n\n# للحصول على Word");
        const body = text.slice(bodyStart, sliceEnd > bodyStart ? sliceEnd : undefined).trim();
        const out = path.join(__dirname, "constitution-base.md");
        fs.writeFileSync(out, body, "utf8");
        console.log("Found at line", i + 1, "chars:", body.length);
        process.exit(0);
      }
    }
  } catch {
    // skip
  }
}

console.error("Constitution base not found in transcript");
process.exit(1);
