'use strict';

/** Bilingual labels for enterprise PDF (EN primary, AR secondary — LTR layout). */
const LEVEL_LABELS = {
    session: { en: 'Session', ar: 'جلسة' },
    location: { en: 'Location', ar: 'موقع' },
    department: { en: 'Department', ar: 'قسم' },
    category: { en: 'Category', ar: 'فئة' },
    document: { en: 'Document', ar: 'مستند' },
    module: { en: 'Module', ar: 'وحدة' },
    transfer: { en: 'Transfer', ar: 'تحويل' },
    date: { en: 'Date', ar: 'تاريخ' },
    default: { en: 'Group', ar: 'مجموعة' },
};

const DOC_LABELS = {
    classification: { en: 'INTERNAL USE', ar: 'للاستخدام الداخلي' },
    auditCopy: { en: 'AUDIT COPY', ar: 'نسخة تدقيق' },
    generatedFrom: { en: 'GENERATED FROM DX OSE', ar: 'صادر من DX OSE' },
    confidential: { en: 'CONFIDENTIAL', ar: 'سري' },
    continued: { en: 'Continued', ar: 'تابع' },
    subtotal: { en: 'Subtotal', ar: 'المجموع الفرعي' },
    grandTotal: { en: 'Grand total', ar: 'الإجمالي العام' },
    preparedBy: { en: 'Prepared by', ar: 'أعدّه' },
    reviewedBy: { en: 'Reviewed by', ar: 'راجعه' },
    approvedBy: { en: 'Approved by', ar: 'اعتمده' },
    page: { en: 'Page', ar: 'صفحة' },
    of: { en: 'of', ar: 'من' },
};

function levelLabel(levelType) {
    return LEVEL_LABELS[levelType] || LEVEL_LABELS.default;
}

function bilingual(levelType, groupLabel) {
    const lvl = levelLabel(levelType);
    return { en: `${lvl.en}: ${groupLabel}`, ar: `${lvl.ar}: ${groupLabel}` };
}

function columnHeaderBilingual(column) {
    const en = column.header || column.key;
    const arMap = {
        sessionNo: 'جلسة',
        countDate: 'تاريخ الجرد',
        locationName: 'الموقع',
        itemCode: 'الرمز',
        itemName: 'الصنف',
        bookQty: 'كمية الدفتر',
        countedQty: 'كمية الجرد',
        varianceQty: 'فرق الكمية',
        varianceValue: 'قيمة الفرق',
        date: 'التاريخ',
        docNo: 'المستند',
        qtyIn: 'كمية واردة',
        qtyOut: 'كمية صادرة',
        lineValue: 'قيمة السطر',
        documentNo: 'المستند',
        category: 'الفئة',
        qty: 'الكمية',
        unitCost: 'تكلفة الوحدة',
        openingQty: 'كمية افتتاحية',
        closingQty: 'كمية ختامية',
        inQty: 'وارد',
        outQty: 'صادر',
    };
    const ar = arMap[column.key] || '';
    return { en, ar };
}

module.exports = {
    LEVEL_LABELS,
    DOC_LABELS,
    levelLabel,
    bilingual,
    columnHeaderBilingual,
};
