# Records what Visio's TEXTWIDTH and TEXTHEIGHT return for a table of strings, fonts, sizes and
# wrap widths, as ground truth for the core's text measurer (src/core/visio/text-extent.ts).
#
#   pwsh -File scripts/record-visio-text-extent.ps1 -Out <directory>
#
# Visio runs invisibly through COM: no window is shown, no keys are sent and nothing is captured
# from the screen. The output is JSON (numbers Visio computed) and one Visio drawing, flow.vsdx,
# which embeds a Microsoft master: never commit the directory. Point VISIO_NATIVE_TEXT_EXTENT at
# it to run the optional comparison tests.
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$strings = @(
	'Process',
	'Start with an idea',
	'Review and release',
	'Hamburgefonstiv 0123456789',
	'The quick brown fox jumps over the lazy dog',
	'WAVE To AV, Yo. (kerning)',
	"Two`nlines",
	'A longer label that has to wrap over several lines inside a narrow shape'
)
$fonts = @('Calibri', 'Arial', 'Segoe UI')
$sizes = @(8, 10, 12, 18, 24)
$widths = @(0.5, 1, 1.5, 2.5)
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
$rows = @()
try {
	$doc = $app.Documents.Add('')
	$page = $doc.Pages.Item(1)
	$shape = $page.DrawRectangle(1, 1, 3, 2)
	$shape.AddNamedRow(242, 'W', 0) | Out-Null   # visSectionUser
	$shape.AddNamedRow(242, 'H', 0) | Out-Null
	foreach ($margin in 0, 4) {
		foreach ($name in 'LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin') {
			$shape.Cells($name).FormulaU = "$margin pt"
		}
		foreach ($font in $fonts) {
			$shape.Cells('Char.Font').FormulaU = "FONT(`"$font`")"
			foreach ($bold in 0, 1) {
				$shape.Cells('Char.Style').FormulaU = "$bold"
				foreach ($size in $sizes) {
					if ($margin -ne 0 -and $size -ne 12) { continue }
					if ($bold -ne 0 -and $size -ne 12) { continue }
					$shape.Cells('Char.Size').FormulaU = "$size pt"
					foreach ($text in $strings) {
						$shape.Text = $text
						$shape.Cells('User.W').FormulaU = 'TEXTWIDTH(TheText)'
						$row = [ordered]@{
							text = $text; font = $font; size = $size; bold = $bold; margin = $margin
							width = $shape.Cells('User.W').ResultIU
							heights = [ordered]@{}
						}
						foreach ($w in $widths) {
							$shape.Cells('User.H').FormulaU = "TEXTHEIGHT(TheText,$w in)"
							$row.heights["$w"] = $shape.Cells('User.H').ResultIU
						}
						$shape.Cells('User.H').FormulaU = 'TEXTHEIGHT(TheText,100 in)'
						$row.heights['100'] = $shape.Cells('User.H').ResultIU
						$rows += $row
					}
				}
			}
		}
	}
	# A flowchart Process shape grown by its text (Resize with Text), saved as Visio writes it.
	$stencil = $app.Documents.OpenEx('BASFLO_U.VSSX', 64 + 4)
	$flow = $app.Documents.Add('')
	$process = $flow.Pages.Item(1).Drop($stencil.Masters.ItemU('Process'), 3, 3)
	$process.Text = 'A much longer label that has to wrap over several lines inside the process shape and then some more words to be sure it grows'
	$flow.SaveAs((Join-Path (Resolve-Path $Out) 'flow.vsdx'))
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
$rows | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Out 'text-extent.json') -Encoding utf8
"recorded $($rows.Count) rows"
