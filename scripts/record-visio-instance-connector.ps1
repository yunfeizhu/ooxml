param([Parameter(Mandatory = $true)][string]$OutputDirectory)
# Records what native Visio writes for its own Dynamic connector (a master instance) glued to
# stencil shapes: a straight run, one bend, a detour, a rotated target, a connection-point glue
# and the three connector styles. Each step is saved as its own drawing so the connector's page
# XML can be compared before and after a glued shape moves. The captures embed Microsoft masters,
# so they are local evidence only and are never committed. The findings are asserted in
# src/core/visio/edit-instance-connector.test.ts (optionally against VISIO_NATIVE_CONNECTOR_DIR).
# COM only: an invisible application, no keystrokes and no screen capture.
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$out = (Resolve-Path $OutputDirectory).Path
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
try {
	$doc = $app.Documents.Add('')
	$stencil = $app.Documents.OpenEx('BASFLO_U.VSSX', 64 + 2)   # hidden, read-only
	$process = $stencil.Masters.ItemU('Process')
	$page = $doc.Pages.Item(1)
	$a = $page.Drop($process, 2, 6)
	$b = $page.Drop($process, 6, 6)
	$a.AutoConnect($b, 0)
	$conn = $page.Shapes.Item($page.Shapes.Count)
	function Save($name) {
		$doc.SaveAs((Join-Path $out "$name.vsdx")) | Out-Null
		"$name Begin=($($conn.CellsU('BeginX').ResultIU),$($conn.CellsU('BeginY').ResultIU)) End=($($conn.CellsU('EndX').ResultIU),$($conn.CellsU('EndY').ResultIU)) Width=$($conn.CellsU('Width').FormulaU) Height=$($conn.CellsU('Height').FormulaU)"
	}
	function SetCell($shape, $cell, $value) { $shape.CellsU($cell).ResultIU = [double]$value }
	function Put($shape, $x, $y) { SetCell $shape 'PinX' $x; SetCell $shape 'PinY' $y }
	Save '01-straight'
	Put $b 7 6
	Save '02-straight-longer'
	Put $b 6 3
	Save '03-bend'
	Put $b 2 3
	Save '04-vertical'
	Put $b 6 8
	Save '05-bend-up'
	SetCell $b 'Width' 2
	Save '06-target-resized'
	SetCell $b 'Angle' 0.5235987755982988
	Save '07-target-rotated'
	SetCell $b 'Angle' 0
	SetCell $b 'Width' 1
	Put $b 8 6
	$c = $page.Drop($process, 5, 6)
	SetCell $c 'Height' 3
	Put $b 8 6.0001
	Put $b 8 6
	Save '08-detour'
	$c.Delete()
	Put $b 6 6
	Save '09-straight-again'
	$conn.CellsU('ShapeRouteStyle').FormulaU = '16'
	Put $b 6 3
	Save '10-straight-style'
	$conn.CellsU('ShapeRouteStyle').FormulaU = '1'
	$conn.CellsU('ConLineRouteExt').FormulaU = '2'
	Put $b 6 3.0001
	Save '11-curved-style'
	$conn.CellsU('ConLineRouteExt').FormulaU = '1'
	Put $b 6 3
	Save '12-right-angle-again'
	# Connection-point glue: the end is glued to the target's first connection point.
	if ($b.SectionExists(7, 0)) {
		$conn.CellsU('EndX').GlueTo($b.CellsSRC(7, 0, 0))
		Save '13-point-glue'
		Put $b 7 4
		Save '14-point-glue-moved'
	}
	# A connector dropped from the document stencil between two free points.
	$master = $doc.Masters.ItemU('Dynamic connector')
	$free = $page.Drop($master, 1, 1)
	SetCell $free 'BeginX' 1; SetCell $free 'BeginY' 1
	SetCell $free 'EndX' 3; SetCell $free 'EndY' 2
	Save '15-free-drop'
	# An unglued end: setting a constant is how automation (and a drag in the UI) breaks glue.
	$conn.CellsU('EndX').FormulaForceU = '6.5'
	$conn.CellsU('EndY').FormulaForceU = '4.5'
	Save '16-end-unglued'
	# Both ends on connection points at the same height with a shape between them.
	$d = $page.Drop($process, 2, 10)
	$e = $page.Drop($process, 8, 10)
	$u = $page.Drop($master, 5, 11)
	$u.CellsU('BeginX').GlueTo($d.CellsSRC(7, 1, 0))
	$u.CellsU('EndX').GlueTo($e.CellsSRC(7, 0, 0))
	$conn = $u
	Save '17-level-points'
	$f = $page.Drop($process, 5, 10)
	SetCell $f 'Height' 2
	Put $e 8 10.0001
	Put $e 8 10
	Save '18-level-detour'
	"Recorded in $out."
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
