# PDF fonts



Reporting PDFs prefer **Calibri** (licensed, from Windows/Office) or **Carlito** (open metric-compatible substitute).



**Production / dev (licensed):**



- `calibri.ttf` + `calibrib.ttf` — copy from `%WINDIR%\Fonts` on Windows hosts with a valid license (do not redistribute in public repos unless permitted).



**Open fallback:**



- [Carlito](https://fonts.google.com/specimen/Carlito) — `Carlito-Regular.ttf`, `Carlito-Bold.ttf`



**Legacy fallbacks:** Noto Sans, Arial Unicode, DejaVu, then Helvetica.



Loader order is defined in `src/services/pdf/report-pdf-fonts.js`.


