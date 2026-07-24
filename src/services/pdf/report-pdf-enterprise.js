'use strict';

/**
 * DX OSE unified enterprise PDF reporting layer.
 * Shared brand, pills, workflow timeline, and footers for all operational PDFs.
 */
const { TOKENS } = require('./report-pdf-design-tokens');

const T = TOKENS;
const C = T.color;

const ENTERPRISE_BRAND = {
    platformName: 'DX OSE Hotels',
    platformTagline: 'DX Operational Governance Platform',
    footerControlledLine: 'System Generated Controlled Document',
    footerEvidenceLine: 'System Generated Controlled Document',
    footerAuthoritativeDisclaimer:
        'Electronic record in DX OSE is the authoritative source. Printed copy is for reference only.',
};

function normalizeConditionKey(raw) {
    const k = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/_/g, ' ');
    if (!k || k === '—' || k === '-') return 'neutral';
    if (k.includes('GOOD') || k === 'OK' || k.includes('NEW')) return 'good';
    if (k.includes('RETURN')) return 'returned';
    if (k.includes('DAMAG') || k.includes('BROKEN') || k.includes('WORN')) return 'damaged';
    if (k.includes('PART')) return 'partial';
    if (k.includes('MISS') || k.includes('LOST')) return 'missing';
    return 'neutral';
}

function formatConditionLabel(raw) {
    const text = String(raw || '').trim();
    if (!text || text === '—') return '—';
    return text
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Subtle condition/status pill palette (low saturation). */
function getConditionPillStyle(raw) {
    const key = normalizeConditionKey(raw);
    const palette = C.condition || {};
    return palette[key] || palette.neutral || { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
}

/**
 * Draw a compact status pill; returns rendered width.
 */
function drawEnterprisePill(doc, x, y, text, maxW, style = null) {
    const label = String(text || '—');
    const colors = style || getConditionPillStyle(label);
    const pillH = T.space.pillHeight || 12;
    doc.fontSize(T.type.pill || 5.5).font('Helvetica-Bold');
    const textW = Math.min(Math.max(doc.widthOfString(label) + 14, 28), maxW);
    doc.fillColor(colors.bg).roundedRect(x, y, textW, pillH, T.space.radius.badge).fill();
    if (colors.border) {
        doc.strokeColor(colors.border).lineWidth(0.35).roundedRect(x, y, textW, pillH, T.space.radius.badge).stroke();
    }
    doc.fillColor(colors.text).fontSize(T.type.pill || 5.5).font('Helvetica-Bold')
        .text(label, x + 7, y + 3, { width: textW - 14, ellipsis: true, height: pillH - 5 });
    return textW;
}

function isWorkflowStepComplete(status) {
    return ['APPROVED', 'PREPARED', 'REVIEWED', 'POSTED', 'OUT', 'COMPLETE', 'COMPLETED'].includes(
        String(status || '').toUpperCase(),
    );
}

function shortWorkflowLabel(label = '') {
    const text = String(label || '');
    if (text.length <= 16) return text;
    const first = text.split(' ')[0];
    return first.length <= 16 ? first : `${text.slice(0, 14)}…`;
}

/**
 * Unified approval workflow timeline (operational document style).
 */
function drawEnterpriseWorkflowTimeline(doc, layout, theme, slots = [], options = {}) {
    if (!slots.length) return;

    const compact = options.compactEvidence === true;
    const accent = theme?.sectionAccent || theme?.accent || C.navy.primary;
    const { marginLeft, pageWidth, beginSection } = layout;
    const n = slots.length;
    const blockH = compact
        ? Math.max(T.space.approvalRowHeight + 2, 42)
        : Math.max(T.space.approvalRowHeight + 8, 50);
    const startY = beginSection(options.sectionTitle || 'Approval Workflow', blockH, accent);

    const padX = compact ? T.space.approvalPadX : T.space.approvalPadX + 2;
    const usableW = pageWidth - padX * 2;
    const stepW = usableW / n;
    const baseX = marginLeft + padX;
    const nodeR = compact ? (T.space.approvalNodeR || 4.8) : (T.space.approvalNodeR || 5.5);
    const laneY = startY + (compact ? 8 : 12);
    const textW = Math.max(stepW - (compact ? 4 : 6), compact ? 34 : 38);
    const connectorW = compact ? 0.25 : 0.5;

    if (n > 1) {
        doc.strokeColor(compact ? '#e8ecf0' : C.border.subtle).lineWidth(connectorW)
            .moveTo(baseX + stepW / 2, laneY)
            .lineTo(baseX + usableW - stepW / 2, laneY)
            .stroke();
    }

    slots.forEach((slot, i) => {
        const cx = baseX + stepW * i + stepW / 2;
        const textX = cx - textW / 2;
        const done = isWorkflowStepComplete(slot.status);
        const stepNum = i + 1;
        const labelKey = String(slot.label || slot.labelEn || '').toLowerCase();
        const isPostedFinal = i === n - 1 && (labelKey.includes('post') || slot.status === 'POSTED');

        if (done && isPostedFinal) {
            doc.fillColor('#dce4ec').circle(cx, laneY, nodeR).fill();
            doc.strokeColor(C.navy.primary).lineWidth(0.45).circle(cx, laneY, nodeR).stroke();
            doc.strokeColor(C.navy.primary).lineWidth(compact ? 0.65 : 0.8)
                .moveTo(cx - 2.4, laneY + 0.4).lineTo(cx - 0.5, laneY + 2.2).lineTo(cx + 2.8, laneY - 2.1).stroke();
        } else if (done) {
            doc.fillColor(C.navy.primary).circle(cx, laneY, nodeR).fill();
            doc.strokeColor(C.navy.primary).lineWidth(0.4).circle(cx, laneY, nodeR).stroke();
            doc.strokeColor(C.text.onDark).lineWidth(compact ? 0.7 : 0.85)
                .moveTo(cx - 2.4, laneY + 0.4).lineTo(cx - 0.5, laneY + 2.2).lineTo(cx + 2.8, laneY - 2.1).stroke();
        } else {
            doc.fillColor(C.surface.page).circle(cx, laneY, nodeR).fill();
            doc.strokeColor(C.border.default).lineWidth(0.4).circle(cx, laneY, nodeR).stroke();
        }

        const numR = compact ? 2.2 : 3;
        const numY = laneY + nodeR + (compact ? 3 : 4);
        doc.fillColor(C.surface.muted).circle(cx, numY, numR).fill();
        doc.fillColor(C.text.muted).fontSize(compact ? 3.6 : 4).font('Helvetica')
            .text(String(stepNum), cx - numR, numY - 1.6, { width: numR * 2, align: 'center' });

        const roleLabel = shortWorkflowLabel(slot.label || slot.labelEn || '—');
        const labelBaseY = numY + numR + (compact ? 2 : 3);
        doc.fillColor(C.text.label || C.text.muted).fontSize(compact ? 4.1 : 4.8).font('Helvetica')
            .text(roleLabel, textX, labelBaseY, { width: textW, align: 'center', height: 5 });

        const name = slot.name || (done ? '—' : 'Pending');
        doc.fillColor(C.text.primary).fontSize(compact ? 5.4 : 6).font('Helvetica-Bold')
            .text(name, textX, labelBaseY + 7, { width: textW, align: 'center', ellipsis: true, height: 7 });

        const dateStr = slot.date ? layout.formatDate(slot.date) : null;
        const statusFallback =
            slot.status === 'PREPARED' ? 'Submitted' : slot.status === 'APPROVED' ? 'Approved' : slot.status || '';
        const subLine = dateStr || (options.showStatusWhenNoDate !== false && statusFallback ? statusFallback : '');

        if (subLine) {
            doc.fillColor(C.text.faint || C.text.muted).fontSize(compact ? 4.1 : 4.8).font('Helvetica')
                .text(String(subLine), textX, labelBaseY + 15, { width: textW, align: 'center', height: 5 });
        }
    });

    doc.y = startY + blockH + (compact ? 2 : 4);
}

/**
 * Unified enterprise footer (controlled + evidence packs).
 */
function stampEnterpriseDocumentFooters(doc, layout, meta = {}) {
    const range = doc.bufferedPageRange();
    const count = range.count;
    const marginLeft = layout.marginLeft ?? 40;
    const pageWidth = layout.pageWidth ?? doc.page.width - 80;
    const mode = meta.mode || 'controlled';
    const printedAt = meta.printedAt || meta.generatedAt || new Date().toISOString();
    const fmtTime = layout.formatDateTime
        ? layout.formatDateTime(printedAt)
        : new Date(printedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' });

    const primaryLine = meta.footerPrimaryLine || ENTERPRISE_BRAND.footerControlledLine;
    const identityLine =
        meta.documentIdentity
        || `${ENTERPRISE_BRAND.platformName}${meta.documentSuffix ? ` — ${meta.documentSuffix}` : ''}`;

    for (let i = 0; i < count; i++) {
        doc.switchToPage(range.start + i);
        const fy = doc.page.height - 40;

        doc.save();
        doc.strokeColor('#e5e7eb').lineWidth(0.3)
            .moveTo(marginLeft, fy - 2).lineTo(marginLeft + pageWidth, fy - 2).stroke();

        if (mode === 'evidence') {
            const classification = meta.classification || 'INTERNAL AUDIT';
            doc.fillColor(C.text.muted).fontSize(T.type.footer).font('Helvetica-Bold')
                .text(primaryLine, marginLeft, fy, { width: pageWidth, align: 'center', height: 6 });
            doc.font('Helvetica').fontSize(T.type.footer)
                .text(
                    [
                        ENTERPRISE_BRAND.platformName,
                        classification,
                        meta.reportReference || meta.documentNo || '',
                        `Page ${i + 1} of ${count}`,
                    ]
                        .filter(Boolean)
                        .join('   ·   '),
                    marginLeft,
                    fy + 4,
                    { width: pageWidth, align: 'center', height: 7 },
                );
            doc.fillColor('#c4cad4').fontSize(4.3).font('Helvetica')
                .text(
                    `${ENTERPRISE_BRAND.footerAuthoritativeDisclaimer}   ·   Printed ${fmtTime}${meta.goldenShellRev ? ` · Shell ${meta.goldenShellRev}` : ''}`,
                    marginLeft,
                    fy + 11,
                    { width: pageWidth, align: 'center', height: 5 },
                );
        } else {
            doc.fillColor(C.text.secondary).fontSize(T.type.footer).font('Helvetica-Bold')
                .text(primaryLine, marginLeft, fy, { width: pageWidth * 0.52, height: 7 });
            doc.font('Helvetica').fontSize(T.type.footer)
                .text(identityLine, marginLeft, fy + 8, { width: pageWidth * 0.52, height: 7 });

            const shellTag = meta.goldenShellRev ? ` · Shell ${meta.goldenShellRev}` : '';
            doc.fillColor(C.text.muted).fontSize(4.8).font('Helvetica')
                .text(ENTERPRISE_BRAND.footerAuthoritativeDisclaimer, marginLeft, fy + 16, {
                    width: pageWidth * 0.52,
                    height: 6,
                });
            doc.fillColor(C.text.muted).fontSize(5).font('Helvetica')
                .text(`Printed ${fmtTime}${shellTag}`, marginLeft + pageWidth * 0.55, fy + 1, {
                    width: pageWidth * 0.45,
                    align: 'right',
                    height: 6,
                });
            doc.fillColor(C.text.muted).fontSize(T.type.footer).font('Helvetica')
                .text(`Page ${i + 1} of ${count}`, marginLeft + pageWidth * 0.55, fy + 9, {
                    width: pageWidth * 0.45,
                    align: 'right',
                    height: 7,
                });
        }

        doc.restore();
        doc.x = marginLeft;
        doc.y = Math.min(doc.y, fy - 10);
    }
}

module.exports = {
    ENTERPRISE_BRAND,
    normalizeConditionKey,
    formatConditionLabel,
    getConditionPillStyle,
    drawEnterprisePill,
    isWorkflowStepComplete,
    drawEnterpriseWorkflowTimeline,
    stampEnterpriseDocumentFooters,
};
