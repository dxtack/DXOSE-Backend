param(
  [string]$DocxPath = (Join-Path $PSScriptRoot "..\DX_OSE_CONSTITUTION_v2.0_FINAL.docx"),
  [string]$PdfPath = (Join-Path $PSScriptRoot "..\DX_OSE_CONSTITUTION_v2.0_FINAL.pdf")
)

$DocxPath = (Resolve-Path $DocxPath).Path
$PdfPath = [System.IO.Path]::GetFullPath($PdfPath)

$word = $null
$doc = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  $doc = $word.Documents.Open($DocxPath)

  # Update Table of Contents fields
  foreach ($storyRange in $doc.StoryRanges) {
    $null = $storyRange.Fields.Update()
  }
  $doc.TablesOfContents | ForEach-Object { $_.Update() }

  $doc.Save()

  # wdExportFormatPDF = 17
  $doc.ExportAsFixedFormat($PdfPath, 17)

  Write-Output "Generated PDF: $PdfPath"
}
finally {
  if ($doc -ne $null) {
    $doc.Close([ref]0)
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
  }
  if ($word -ne $null) {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
