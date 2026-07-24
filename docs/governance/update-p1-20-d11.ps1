$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$governanceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $governanceDir)
$sourcePath = Join-Path $repoRoot 'Governance\apply-chapter6-amendment.mjs'
$docxPath = Join-Path $governanceDir 'DX_OSE_CONSTITUTION_v2.2.docx'
$constitutionPdfPath = Join-Path $governanceDir 'DX_OSE_CONSTITUTION_v2.2.pdf'
$mergeMarkdownPath = Join-Path $governanceDir 'DX_OSE_CONSTITUTION_v2.1_MERGE_REPORT.md'
$mergePdfPath = Join-Path $governanceDir 'DX_OSE_34_Clause_Merge_Report_v1.pdf'

$section = [char]0x00A7
$emDash = [char]0x2014
$bullet = [char]0x2022
$legacyWording = 'Open, Closing, Closed, Archived.'
$approvedWording = "The official period states are OPEN, CLOSING, and CLOSED. The state Archived is not a period registry state; historical snapshots and reports use SUPERSEDED versioning ($section" + "6.11, $section" + '6.17).'
$correctionBullet = "- D11 documentation correction: $approvedWording"
$oldIntegrity = '- No original numbered source clause was deleted or rewritten.'
$newIntegrity = "- No original numbered source clause was deleted. $section" + '6.4 period-state wording was corrected to the approved D11 text; all other source clauses remain preserved.'
$oldIndexHeading = "## Full source-clause index $emDash verbatim"
$newIndexHeading = "## Full source-clause index $emDash D11-corrected"
$oldIndexIntro = 'The following is the complete numbered normative body extracted from the read-only v2.0 source. Wording and original numbering are preserved; table cells are tab-separated.'
$newIndexIntro = 'The following is the complete numbered normative body extracted from the read-only v2.0 source. Original numbering is preserved, and wording is preserved except for the approved D11 correction to ' + $section + '6.4; table cells are tab-separated.'

function Assert-Path([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file is missing: $path"
    }
}

function Get-Count([string]$text, [string]$needle) {
    return ([regex]::Matches($text, [regex]::Escape($needle))).Count
}

function Replace-ExactlyOnceOrAssertCurrent(
    [string]$text,
    [string]$oldValue,
    [string]$newValue,
    [string]$label
) {
    $oldCount = Get-Count $text $oldValue
    $newCount = Get-Count $text $newValue
    if ($oldCount -eq 1 -and $newCount -eq 0) {
        return $text.Replace($oldValue, $newValue)
    }
    if ($oldCount -eq 0 -and $newCount -eq 1) {
        return $text
    }
    throw "$label fail-closed: expected exactly one legacy value or exactly one current value; legacy=$oldCount current=$newCount"
}

@($sourcePath, $docxPath, $mergeMarkdownPath) | ForEach-Object { Assert-Path $_ }

$source = Get-Content -LiteralPath $sourcePath -Raw -Encoding UTF8
if ((Get-Count $source $approvedWording) -ne 1) {
    throw 'Approved D11 wording does not occur exactly once in governance-evidence-archive/apply-chapter6-amendment.mjs'
}

$markdown = Get-Content -LiteralPath $mergeMarkdownPath -Raw -Encoding UTF8
$markdown = Replace-ExactlyOnceOrAssertCurrent $markdown $legacyWording $approvedWording 'Merge report §6.4'
$markdown = Replace-ExactlyOnceOrAssertCurrent $markdown $oldIntegrity $newIntegrity 'Merge report integrity statement'
$markdown = Replace-ExactlyOnceOrAssertCurrent $markdown $oldIndexHeading $newIndexHeading 'Merge report source-index heading'
$markdown = Replace-ExactlyOnceOrAssertCurrent $markdown $oldIndexIntro $newIndexIntro 'Merge report source-index introduction'

if ((Get-Count $markdown $correctionBullet) -eq 0) {
    $anchor = '- Granular close/reopen permissions are constitutional. `PERIOD_CLOSE_MANAGE` is temporary legacy compatibility only.'
    if ((Get-Count $markdown $anchor) -ne 1) {
        throw 'Merge report fail-closed: approved-conflict-resolution insertion anchor is not unique'
    }
    $markdown = $markdown.Replace($anchor, "$anchor`r`n$correctionBullet")
}
elseif ((Get-Count $markdown $correctionBullet) -ne 1) {
    throw 'Merge report fail-closed: D11 correction bullet is duplicated'
}

[System.IO.File]::WriteAllText($mergeMarkdownPath, $markdown, [System.Text.UTF8Encoding]::new($false))

$word = $null
$constitution = $null
$report = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $constitution = $word.Documents.Open($docxPath, $false, $false)
    $constitutionText = $constitution.Content.Text
    $legacyCount = Get-Count $constitutionText $legacyWording
    $currentCount = Get-Count $constitutionText $approvedWording
    if ($legacyCount -eq 1 -and $currentCount -eq 0) {
        $find = $constitution.Content.Find
        $find.ClearFormatting()
        $find.Replacement.ClearFormatting()
        $find.Text = $legacyWording
        $find.Replacement.Text = $approvedWording
        $replaced = $find.Execute(
            $legacyWording, $false, $false, $false, $false, $false,
            $true, 1, $false, $approvedWording, 2
        )
        if (-not $replaced) {
            throw 'Word COM did not replace the unique legacy §6.4 sentence'
        }
        $constitution.Save()
    }
    elseif (-not ($legacyCount -eq 0 -and $currentCount -eq 1)) {
        throw "DOCX fail-closed: expected exactly one legacy value or exactly one current value; legacy=$legacyCount current=$currentCount"
    }

    # 17 = wdExportFormatPDF; 0 = wdExportOptimizeForPrint
    $constitution.ExportAsFixedFormat($constitutionPdfPath, 17, $false, 0)
    $constitution.Close($false)
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($constitution) | Out-Null
    $constitution = $null

    # Render the durable Markdown source into its PDF counterpart.
    $report = $word.Documents.Add()
    $report.PageSetup.TopMargin = $word.CentimetersToPoints(1.5)
    $report.PageSetup.BottomMargin = $word.CentimetersToPoints(1.5)
    $report.PageSetup.LeftMargin = $word.CentimetersToPoints(1.5)
    $report.PageSetup.RightMargin = $word.CentimetersToPoints(1.5)
    $report.Styles.Item('Normal').Font.Name = 'Aptos'
    $report.Styles.Item('Normal').Font.Size = 9

    $inFence = $false
    foreach ($line in ($markdown -split "\r?\n")) {
        if ($line -match '^`````') {
            $inFence = -not $inFence
            continue
        }

        $selection = $word.Selection
        if ($line -match '^(#{1,3})\s+(.+)$') {
            $level = $Matches[1].Length
            $selection.Style = "Heading $level"
            $selection.TypeText($Matches[2])
        }
        elseif ($line -match '^\s*-\s+(.+)$' -and -not $inFence) {
            $selection.Style = 'Normal'
            $selection.TypeText("$bullet $($Matches[1])")
        }
        elseif ($line -match '^\|(.+)\|$' -and -not $inFence) {
            $selection.Style = 'Normal'
            $selection.Font.Name = 'Aptos Narrow'
            $selection.Font.Size = 8
            $selection.TypeText(($Matches[1] -replace '\s*\|\s*', "`t").Trim())
        }
        else {
            $selection.Style = 'Normal'
            if ($inFence) {
                $selection.Font.Name = 'Consolas'
                $selection.Font.Size = 7
            }
            $selection.TypeText($line)
        }
        $selection.TypeParagraph()
    }

    $report.ExportAsFixedFormat($mergePdfPath, 17, $false, 0)
    $report.Close($false)
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($report) | Out-Null
    $report = $null
}
finally {
    if ($null -ne $constitution) {
        $constitution.Close($false)
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($constitution) | Out-Null
    }
    if ($null -ne $report) {
        $report.Close($false)
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($report) | Out-Null
    }
    if ($null -ne $word) {
        $word.Quit()
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output 'P1 #20 D11 governance documents regenerated successfully.'
