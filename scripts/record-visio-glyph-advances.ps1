# Records the advance width Visio's TEXTWIDTH gives each printable ASCII character, per font and
# weight, plus the constant TEXTWIDTH adds to every line. Ground truth for
# src/core/visio/text-advances.generated.ts.
#
#   pwsh -File scripts/record-visio-glyph-advances.ps1 -Out <directory> [-Fonts Calibri,Arial]
#
# Method: at 100 pt with zero margins, TEXTWIDTH of a character repeated 10 and 30 times differ by
# twenty advances; what is left of the shorter run is the per-line constant. Visio runs invisibly
# through COM: no window, no keystrokes, no screen capture. The output is JSON numbers.
param(
	[Parameter(Mandatory = $true)][string]$Out,
	[string[]]$Fonts = @('Calibri', 'Arial', 'Segoe UI', 'Times New Roman', 'Calibri Light')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
$result = [ordered]@{}
try {
	$doc = $app.Documents.Add('')
	$shape = $doc.Pages.Item(1).DrawRectangle(1, 1, 3, 2)
	$shape.AddNamedRow(242, 'W', 0) | Out-Null   # visSectionUser
	$shape.Cells('User.W').FormulaU = 'TEXTWIDTH(TheText)'
	foreach ($name in 'LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin') { $shape.Cells($name).FormulaU = '0 pt' }
	$shape.Cells('Char.Size').FormulaU = '100 pt'
	foreach ($font in $Fonts) {
		$shape.Cells('Char.Font').FormulaU = "FONT(`"$font`")"
		foreach ($bold in 0, 1) {
			$shape.Cells('Char.Style').FormulaU = "$bold"
			$advances = [ordered]@{}
			$constants = @()
			foreach ($code in 33..126) {
				$ch = [string][char]$code
				$shape.Text = $ch * 10
				$short = $shape.Cells('User.W').ResultIU * 72
				$shape.Text = $ch * 30
				$long = $shape.Cells('User.W').ResultIU * 72
				$advance = ($long - $short) / 20
				$advances["$code"] = [math]::Round($advance * 10, 3)   # per 1000 em at 100 pt
				$constants += ($short - 10 * $advance)
			}
			# A space is trimmed at the end of a line, so it is measured between two letters.
			$shape.Text = 'x' + (' ' * 10) + 'x'
			$short = $shape.Cells('User.W').ResultIU * 72
			$shape.Text = 'x' + (' ' * 30) + 'x'
			$long = $shape.Cells('User.W').ResultIU * 72
			$advances['32'] = [math]::Round(($long - $short) / 2, 3)
			$sorted = $constants | Sort-Object
			$result["$font|$bold"] = [ordered]@{
				font = $font; bold = $bold
				constant = [math]::Round($sorted[[int]($sorted.Count / 2)] * 10, 3)
				constantMin = [math]::Round($sorted[0] * 10, 3)
				constantMax = [math]::Round($sorted[-1] * 10, 3)
				advances = $advances
			}
		}
	}
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
$result | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Out 'glyph-advances.json') -Encoding utf8
"recorded $($result.Count) tables"
