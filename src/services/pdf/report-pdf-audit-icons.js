'use strict';

/**
 * Vector icons — Golden Reference literal spec (PDFKit paths).
 */

const GOLDEN_NAVY = '#002060';
const LOSS_RED = '#991b1b';

function drawIconBox(doc, x, y, size, strokeColor, fillColor = '#ffffff') {
    doc.fillColor(fillColor).roundedRect(x, y, size, size, 2).fill();
    doc.strokeColor(strokeColor).lineWidth(0.55).roundedRect(x, y, size, size, 2).stroke();
}

function drawIconBoxPackage(doc, x, y, size, color) {
    drawIconBox(doc, x, y, size, color);
    const p = size * 0.24;
    const w = size - p * 2;
    const h = size - p * 2;
    doc.strokeColor(color).lineWidth(0.5);
    doc.rect(x + p, y + p + h * 0.12, w, h * 0.72).stroke();
    doc.moveTo(x + p, y + p + h * 0.32).lineTo(x + p + w / 2, y + p + h * 0.12).lineTo(x + p + w, y + p + h * 0.32).stroke();
}

function drawIconClipboard(doc, x, y, size, color) {
    drawIconBox(doc, x, y, size, color);
    const cx = x + size / 2;
    doc.strokeColor(color).lineWidth(0.5);
    doc.roundedRect(cx - size * 0.13, y + size * 0.17, size * 0.26, size * 0.11, 1).stroke();
    doc.roundedRect(x + size * 0.25, y + size * 0.27, size * 0.5, size * 0.5, 1.5).stroke();
    doc.moveTo(x + size * 0.35, y + size * 0.4).lineTo(x + size * 0.65, y + size * 0.4).stroke();
    doc.moveTo(x + size * 0.35, y + size * 0.5).lineTo(x + size * 0.58, y + size * 0.5).stroke();
}

function drawIconCoins(doc, x, y, size, color) {
    drawIconBox(doc, x, y, size, color, '#fef2f2');
    const cx = x + size / 2;
    const cy = y + size * 0.58;
    doc.strokeColor(color).lineWidth(0.5);
    for (let i = 0; i < 3; i += 1) {
        doc.ellipse(cx, cy - i * size * 0.1, size * 0.19, size * 0.065).stroke();
    }
}

function drawIconBuilding(doc, x, y, size, color) {
    drawIconBox(doc, x, y, size, color);
    const bx = x + size * 0.28;
    const by = y + size * 0.24;
    const bw = size * 0.44;
    const bh = size * 0.52;
    doc.fillColor(color).rect(bx, by, bw, bh).fill();
    doc.fillColor('#ffffff');
    const win = size * 0.075;
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 2; col += 1) {
            doc.rect(
                bx + size * 0.08 + col * (win + size * 0.055),
                by + size * 0.08 + row * (win + size * 0.055),
                win,
                win,
            ).fill();
        }
    }
}

/** Outline person silhouette inside workflow circle — golden reference style */
function drawIconPersonOutline(doc, cx, cy, r, color) {
    doc.strokeColor(color).lineWidth(0.65);
    doc.circle(cx, cy - r * 0.22, r * 0.28).stroke();
    doc.moveTo(cx - r * 0.38, cy + r * 0.52)
        .lineTo(cx + r * 0.38, cy + r * 0.52)
        .lineTo(cx + r * 0.32, cy + r * 0.08)
        .lineTo(cx - r * 0.32, cy + r * 0.08)
        .closePath()
        .stroke();
}

function drawApprovalCheckBadge(doc, cx, cy, nodeR) {
    const bx = cx + nodeR * 0.64;
    const by = cy + nodeR * 0.64;
    const br = nodeR * 0.36;
    doc.fillColor('#15803d').circle(bx, by, br).fill();
    doc.strokeColor('#ffffff').lineWidth(0.75)
        .moveTo(bx - br * 0.38, by + br * 0.02)
        .lineTo(bx - br * 0.06, by + br * 0.32)
        .lineTo(bx + br * 0.4, by - br * 0.26)
        .stroke();
}

function drawWorkflowArrow(doc, x1, y, x2, lineWidth = 1.05) {
    const head = 5;
    doc.strokeColor('#1e293b').lineWidth(lineWidth).moveTo(x1, y).lineTo(x2 - head + 1, y).stroke();
    doc.fillColor('#1e293b')
        .moveTo(x2, y)
        .lineTo(x2 - head, y - 2.8)
        .lineTo(x2 - head, y + 2.8)
        .closePath()
        .fill();
}

function drawIconDocument(doc, x, y, size, color) {
    doc.strokeColor(color).lineWidth(0.45);
    doc.roundedRect(x, y, size * 0.72, size, 1).stroke();
    doc.moveTo(x + size * 0.18, y + size * 0.34).lineTo(x + size * 0.52, y + size * 0.34).stroke();
    doc.moveTo(x + size * 0.18, y + size * 0.5).lineTo(x + size * 0.52, y + size * 0.5).stroke();
}

function drawIconCalendar(doc, x, y, size, color) {
    doc.strokeColor(color).lineWidth(0.45);
    doc.roundedRect(x, y + size * 0.14, size, size * 0.82, 1).stroke();
    doc.moveTo(x, y + size * 0.34).lineTo(x + size, y + size * 0.34).stroke();
    doc.moveTo(x + size * 0.25, y + size * 0.04).lineTo(x + size * 0.25, y + size * 0.2).stroke();
    doc.moveTo(x + size * 0.75, y + size * 0.04).lineTo(x + size * 0.75, y + size * 0.2).stroke();
}

function drawIconPaperclip(doc, x, y, size, color) {
    doc.strokeColor(color).lineWidth(0.5);
    doc.moveTo(x + size * 0.55, y + size * 0.04)
        .lineTo(x + size * 0.24, y + size * 0.34)
        .lineTo(x + size * 0.44, y + size * 0.84)
        .lineTo(x + size * 0.74, y + size * 0.54)
        .lineTo(x + size * 0.55, y + size * 0.04)
        .stroke();
}

function drawIconShield(doc, x, y, size, color) {
    const cx = x + size / 2;
    doc.fillColor(color);
    doc.moveTo(cx, y)
        .lineTo(x + size, y + size * 0.2)
        .lineTo(x + size * 0.82, y + size * 0.86)
        .lineTo(cx, y + size)
        .lineTo(x + size * 0.18, y + size * 0.86)
        .lineTo(x, y + size * 0.2)
        .closePath()
        .fill();
    doc.strokeColor('#ffffff').lineWidth(0.45)
        .moveTo(cx - size * 0.11, y + size * 0.4)
        .lineTo(cx - size * 0.02, y + size * 0.52)
        .lineTo(cx + size * 0.14, y + size * 0.3)
        .stroke();
}

const KPI_ICONS = {
    items: drawIconBoxPackage,
    qty: drawIconClipboard,
    loss: drawIconCoins,
    department: drawIconBuilding,
};

const META_BAR_ICONS = {
    document: drawIconDocument,
    date: drawIconCalendar,
    attachments: drawIconPaperclip,
    classification: drawIconShield,
};

module.exports = {
    GOLDEN_NAVY,
    LOSS_RED,
    KPI_ICONS,
    META_BAR_ICONS,
    drawIconPersonOutline,
    drawApprovalCheckBadge,
    drawWorkflowArrow,
    drawIconShield,
};
