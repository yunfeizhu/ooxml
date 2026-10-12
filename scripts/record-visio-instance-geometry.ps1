param([Parameter(Mandatory = $true)][string]$OutputDirectory)
# Records what native Visio saves when a stencil (master) instance is resized, moved or formatted.
# before.vsdx holds dropped Process, Decision, Document and Data shapes of the Basic Flowchart
# stencil; resized.vsdx is the same drawing once each has a new Width and Height; formatted.vsdx
# once the Process has a fill, a line and bold red centred text. Visio runs invisibly: no window is
# shown and no keys are sent. The captures embed Microsoft's stencil masters, so they are local
# evidence only and are never committed. Point the optional test at them with
# VISIO_NATIVE_INSTANCE_GEOMETRY_DIR (src/core/visio/edit-instance.test.ts).
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$out = (Resolve-Path $OutputDirectory).Path
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
try {
	$doc = $app.Documents.Add('')
	$stencil = $app.Documents.OpenEx('BASFLO_U.VSSX', 64)
	$page = $doc.Pages.Item(1)
	$names = 'Process', 'Decision', 'Document', 'Data'
	$shapes = @()
	$y = 9
	foreach ($name in $names) {
		$shapes += $page.Drop($stencil.Masters.ItemU($name), 2, $y)
		$y -= 2
	}
	$doc.SaveAs((Join-Path $out 'before.vsdx')) | Out-Null
	foreach ($shape in $shapes) {
		$shape.CellsU('Width').FormulaU = '2.5 in'
		$shape.CellsU('Height').FormulaU = '1.25 in'
	}
	$doc.SaveAs((Join-Path $out 'resized.vsdx')) | Out-Null
	foreach ($shape in $shapes) {
		$shape.CellsU('Width').FormulaU = '1 in'
		$shape.CellsU('Height').FormulaU = '0.75 in'
	}
	$process = $shapes[0]
	$process.CellsU('FillForegnd').FormulaU = 'RGB(255,0,0)'
	$process.CellsU('LineColor').FormulaU = 'RGB(0,0,255)'
	$process.CellsU('LineWeight').FormulaU = '2 pt'
	$process.Text = 'Formatted'
	$process.CellsU('Char.Style').FormulaU = '1'
	$process.CellsU('Char.Color').FormulaU = 'RGB(255,0,0)'
	$process.CellsU('Char.Size').FormulaU = '14 pt'
	$process.CellsU('Para.HorzAlign').FormulaU = '0'
	$process.CellsU('VerticalAlign').FormulaU = '0'
	$doc.SaveAs((Join-Path $out 'formatted.vsdx')) | Out-Null
	"Recorded before.vsdx, resized.vsdx and formatted.vsdx in $out (shapes $(($shapes | ForEach-Object { $_.ID }) -join ', '))."
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
