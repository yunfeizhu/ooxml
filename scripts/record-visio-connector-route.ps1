param([Parameter(Mandatory = $true)][string]$OutputDirectory)
# Records how native Visio routes its Dynamic connector around other shapes: which shapes it
# treats as obstacles (ObjType) and the clearance it keeps. Prints the connector's Geometry rows
# for each step and saves the drawings. The captures embed Microsoft's Dynamic connector master,
# so they are local evidence only and are never committed. The findings are asserted in
# src/core/visio/edit-connector-obstacles.test.ts.
# COM only: an invisible application, no keystrokes and no screen capture.
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$out = (Resolve-Path $OutputDirectory).Path
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
try {
	$doc = $app.Documents.Add('')
	$page = $doc.Pages.Item(1)
	# One-inch squares centred at (2,4) and (8,4); DrawRectangle takes two corners.
	$a = $page.DrawRectangle(1.5, 3.5, 2.5, 4.5)
	$b = $page.DrawRectangle(7.5, 3.5, 8.5, 4.5)
	"before glue: ObjType a=$($a.CellsU('ObjType').FormulaU) b=$($b.CellsU('ObjType').FormulaU)"
	$a.AutoConnect($b, 0)
	$conn = $page.Shapes.Item($page.Shapes.Count)
	"after glue:  ObjType a=$($a.CellsU('ObjType').FormulaU) b=$($b.CellsU('ObjType').FormulaU)"
	function Dump($tag) {
		"$tag Begin=($($conn.CellsU('BeginX').ResultIU),$($conn.CellsU('BeginY').ResultIU)) Width=$($conn.CellsU('Width').FormulaU) Height=$($conn.CellsU('Height').FormulaU)"
		for ($r = 1; $r -lt $conn.RowCount(10); $r++) {
			"  row $r X=$($conn.CellsSRC(10, $r, 0).ResultIU) Y=$($conn.CellsSRC(10, $r, 1).ResultIU)"
		}
	}
	Dump 'direct'
	$doc.SaveAs((Join-Path $out 'direct.vsdx')) | Out-Null
	# A three-inch-tall rectangle between them, left at ObjType 0: Visio keeps the straight run.
	$c = $page.DrawRectangle(4.5, 2.5, 5.5, 5.5)
	$b.CellsU('PinY').ResultIU = 4.0001
	Dump 'undecided blocker (ObjType 0), end shape nudged'
	$doc.SaveAs((Join-Path $out 'blocker-undecided.vsdx')) | Out-Null
	# The same rectangle made placeable: Visio routes around it.
	$c.CellsU('ObjType').FormulaU = '1'
	$b.CellsU('PinY').ResultIU = 4
	Dump 'placeable blocker (ObjType 1), end shape nudged back'
	$doc.SaveAs((Join-Path $out 'blocker-placeable.vsdx')) | Out-Null
	$b.CellsU('PinY').ResultIU = 5
	Dump 'placeable blocker, end shape one inch up'
	$doc.SaveAs((Join-Path $out 'blocker-placeable-moved.vsdx')) | Out-Null
	"Recorded four drawings in $out."
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
