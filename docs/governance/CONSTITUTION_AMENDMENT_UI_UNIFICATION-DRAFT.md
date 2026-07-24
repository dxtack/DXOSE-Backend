# Constitution Amendment — UI Unification (Draft)

**Status:** Draft / In Progress  
**Scope:** Visual chrome, action vocabulary, typography tokens  
**Reference screens:** Breakage Detail + Breakage Create  
**Related:** Ch.2 lifecycle presentation, Ch.3 actions, Ch.17 UX

## Purpose

Ratify a single user-facing visual and naming contract across operational document modules (Breakage, Lost, GRN, Transfer, Get Pass, Inventory Count) so modules cannot invent parallel button chrome, type scales, or action synonyms.

## Clauses

### 2.2.A — User-facing status vocabulary

Status badges shall use standardized user-facing lifecycle meanings. Modules may map internal workflow states to those meanings only. Modules shall not invent parallel user-facing wording for the same business meaning unless ratified in this Constitution.

### 3.1.A — Shared action keys

Every standard document action shall be presented through `COMMON.ACTIONS.*` (EN/AR) as the single vocabulary source. A module shall not own a synonym key for the same meaning for primary chrome (detail action bars, create footers, list primary CTAs).

### 3.1.B — Canonical action labels

| Key | EN | AR |
|-----|----|----|
| CANCEL | Cancel | إلغاء |
| BACK | Back | رجوع |
| SAVE | Save | حفظ |
| SAVE_DRAFT | Save draft | حفظ كمسودة |
| SUBMIT_FOR_APPROVAL | Submit for approval | إرسال للموافقة |
| RESUBMIT | Resubmit | إعادة إرسال |
| APPROVE | Approve | اعتماد |
| APPROVE_AND_POST | Approve & post | اعتماد وترحيل |
| REJECT | Reject | رفض |
| SEND_BACK | Send back | إرجاع |
| DOWNLOAD_PDF | Download PDF | تنزيل PDF |
| PRINT | Print | طباعة |
| CREATE | Create | إنشاء |
| EDIT | Edit | تعديل |
| DELETE | Delete | حذف |
| VOID | Void | إبطال |
| REFRESH | Refresh | تحديث |

### 3.5.A — Button intent colors

| Intent | Pattern |
|--------|---------|
| Primary (forward workflow) | `nzType="primary"` |
| Neutral / secondary | `nzType="default"` |
| Toolbar danger (Reject / Void / Delete) | `nzDanger` + `nzType="default"` |
| Modal confirm destructive | `nzDanger` + `nzType="primary"` |

There shall be only one primary action for the current document state (Ch.3.5).

### 3.6.A — Detail action placement

Detail pages shall use `.document-action-bar`:
- Workflow actions in `.document-action-bar__left`
- Download / Print / evidence in `.document-action-bar__right`
- Collapse toggle immediately after title + status badge (`.document-page__header-toggle`)

### 3.6.B — Create footer order

Create / form footers shall order actions: **Cancel → Save draft (when offered) → Submit/Create**.

### 3.7 — Button height

Document and form chrome buttons shall use `--ose-btn-h` (**40px**). Modules shall not override document-action-bar or form-footer button heights to 32px / 36px / `nzSize="small"` except icon/text controls inside tables or dense line editors.

### 3.8 — Send Back color

**Send Back** is always Neutral (`nzType="default"`). It shall never use `nzDanger`.

### 17.A — Typography family and tokens

Font family is Cairo via `--font-main` / `--ose-font`. Title, section, label, helper, table, and button type sizes shall come from `--ose-type-*` tokens on `:root`. Feature SCSS shall not introduce ad-hoc type scales.

### 17.B — No local type overrides without tokens

Feature SCSS shall not hardcode `font-size` / `font-weight` for page chrome when an `--ose-type-*` token exists, except documented Matrix exceptions.

## Implementation waves

| Wave | Modules |
|------|---------|
| Foundation | tokens, `COMMON.ACTIONS`, global `.ant-btn` |
| W1 | Breakage + Lost |
| W2 | Transfer + GRN |
| W3 | Get Pass |
| W4 | Inventory Count |
| W5 | Lists + create footers |

## Audit

Frontend scripts under `OSE-Frontend/scripts/` shall flag local `font-size` without `var(--ose-`, Send Back + `nzDanger`, and EN keys missing in AR within unification scope.
