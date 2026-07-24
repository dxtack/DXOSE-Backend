$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$gov = Join-Path $PSScriptRoot '..'
$gov = (Resolve-Path $gov).Path

$exports = @(
    @{
        Docx = Join-Path $gov 'DX_OSE_CONSTITUTION_v2.2.docx'
        Pdf  = Join-Path $gov 'DX_OSE_CONSTITUTION_v2.2.pdf'
    },
    @{
        Docx = Join-Path $gov 'DX_OSE_34_Clause_Merge_Report_v1.docx'
        Pdf  = Join-Path $gov 'DX_OSE_34_Clause_Merge_Report_v1.pdf'
    }
)

foreach ($item in $exports) {
    if (-not (Test-Path -LiteralPath $item.Docx)) {
        throw "Missing DOCX: $($item.Docx)"
    }
}

$word = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    foreach ($item in $exports) {
        Write-Host "Exporting $($item.Docx) -> $($item.Pdf)"
        $doc = $null
        try {
            $doc = $word.Documents.Open($item.Docx, $false, $true)
            # 17 = wdExportFormatPDF; 0 = wdExportOptimizeForPrint
            $doc.ExportAsFixedFormat($item.Pdf, 17, $false, 0)
            Write-Host "OK $($item.Pdf)"
        }
        finally {
            if ($null -ne $doc) {
                $doc.Close($false)
                [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($doc) | Out-Null
            }
        }
    }
}
finally {
    if ($null -ne $word) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Host 'All PDF exports complete.'
