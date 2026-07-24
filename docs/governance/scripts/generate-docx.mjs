import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  TableOfContents,
  PageBreak,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(__dirname, "constitution-final.md");
const outDir = path.resolve(__dirname, "..");
const docxPath = path.join(outDir, "DX_OSE_CONSTITUTION_v2.0_FINAL.docx");

function parseInline(text) {
  const runs = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)));
    runs.push(new TextRun({ text: m[1], bold: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  if (runs.length === 0) runs.push(new TextRun(text));
  return runs;
}

function headingLevel(line) {
  if (line.startsWith("### ")) return HeadingLevel.HEADING_3;
  if (line.startsWith("## ")) return HeadingLevel.HEADING_2;
  if (line.startsWith("# ")) return HeadingLevel.HEADING_1;
  return null;
}

function headingText(line) {
  return line.replace(/^#{1,3}\s+/, "").trim();
}

function isTableRow(line) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function parseTableRow(line) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

function buildTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, rowIdx) =>
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: parseInline(cell),
                    spacing: { after: 60 },
                  }),
                ],
              })
          ),
        })
    ),
  });
}

function mdToDocx(md) {
  const lines = md.split(/\r?\n/);
  const children = [];
  let i = 0;
  let tocInserted = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "---") {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      i++;
      continue;
    }

    if (trimmed === "## Table of Contents" && !tocInserted) {
      children.push(
        new Paragraph({
          text: "Table of Contents",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        })
      );
      children.push(
        new TableOfContents("Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-3",
        })
      );
      children.push(new Paragraph({ children: [new PageBreak()] }));
      tocInserted = true;
      i++;
      while (i < lines.length && lines[i].trim() !== "---") i++;
      continue;
    }

    if (trimmed.startsWith("## Table of Contents")) {
      i++;
      while (i < lines.length && lines[i].trim() !== "---") i++;
      if (i < lines.length) i++;
      continue;
    }

    const hl = headingLevel(trimmed);
    if (hl) {
      children.push(
        new Paragraph({
          text: headingText(trimmed),
          heading: hl,
          spacing: { before: hl === HeadingLevel.HEADING_1 ? 240 : 120, after: 120 },
        })
      );
      i++;
      continue;
    }

    if (isTableRow(trimmed)) {
      const tableRows = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        const cells = parseTableRow(lines[i]);
        const isSep = cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")));
        if (!isSep) tableRows.push(cells);
        i++;
      }
      if (tableRows.length) {
        children.push(buildTable(tableRows));
        children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      }
      continue;
    }

    if (trimmed.startsWith("- ")) {
      children.push(
        new Paragraph({
          children: parseInline(trimmed.slice(2)),
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
      i++;
      continue;
    }

    if (trimmed === "") {
      i++;
      continue;
    }

    children.push(
      new Paragraph({
        children: parseInline(trimmed),
        spacing: { after: 100 },
      })
    );
    i++;
  }

  return new Document({
    creator: "DX OSE Governance",
    title: "DX OSE Document Constitution v2.0 Final",
    description: "Final ratifiable DX OSE Document Constitution",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "DX OSE Document Constitution v2.0 Final",
                    italics: true,
                    size: 18,
                    color: "666666",
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                  new TextRun({ text: " of ", size: 18 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

const md = fs.readFileSync(mdPath, "utf8");
const doc = mdToDocx(md);
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(docxPath, buffer);
console.log("Generated DOCX:", docxPath);
