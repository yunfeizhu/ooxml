param([Parameter(Mandatory = $true)][string]$OutputDirectory)
# Records what native Visio saves for whole-shape commands on stencil (master) instances.
# before.vsdx holds Process (1), Decision (2) and Document (3) of the Basic Flowchart stencil on
# page 1, a Dynamic connector glued from Process to Decision and one from Decision to Document,
# and an empty second page. Each other file is before.vsdx after one command:
#   deleted.vsdx        the Document is deleted (a connector was glued to it)
#   deleted-free.vsdx   a fourth, unconnected Data shape is dropped and deleted again
#   duplicated.vsdx     the Process is duplicated
#   copied.vsdx         the Process is dropped onto page 2 (Visio's copy without the clipboard)
#   front.vsdx          the Process is brought to the front
#   grouped.vsdx        Process and Decision are grouped; ungrouped.vsdx ungroups them again
#   replaced.vsdx       the Process is replaced by the Data master (Change Shape)
#   sized.vsdx          the Process is resized, filled red and set bold; replaced-sized.vsdx is
#                       that drawing once the Process is replaced by the Data master
#   layered.vsdx        the Process is assigned to a new layer
# Visio runs invisibly: no window is shown, no keys are sent and the clipboard is not used. The
# captures embed Microsoft's stencil masters, so they are local evidence only and are never
# committed. Point the optional test at them with VISIO_NATIVE_INSTANCE_SHAPE_DIR
# (src/core/visio/edit-instance-shape-native.test.ts).
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$out = (Resolve-Path $OutputDirectory).Path
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
try {
	$stencil = $app.Documents.OpenEx('BASFLO_U.VSSX', 64)
	$doc = $app.Documents.Add('')
	$page = $doc.Pages.Item(1)
	$process = $page.Drop($stencil.Masters.ItemU('Process'), 2, 9)
	$decision = $page.Drop($stencil.Masters.ItemU('Decision'), 2, 7)
	$document = $page.Drop($stencil.Masters.ItemU('Document'), 2, 5)
	$process.Text = 'Start'
	$process.AutoConnect($decision, 0)
	$decision.AutoConnect($document, 0)
	$doc.Pages.Add() | Out-Null
	$before = Join-Path $out 'before.vsdx'
	$doc.SaveAs($before) | Out-Null
	$ids = "Process $($process.ID), Decision $($decision.ID), Document $($document.ID)"
	$doc.Close()

	function Record([string]$name, [scriptblock]$change) {
		$copy = Join-Path $out $name
		Copy-Item $before $copy -Force
		$d = $app.Documents.Open($copy)
		try {
			& $change $d $d.Pages.Item(1)
			$d.Save() | Out-Null
		} finally {
			$d.Saved = $true
			$d.Close()
		}
	}
	Record 'deleted.vsdx' { param($d, $p) $p.Shapes.ItemFromID(3).Delete() }
	Record 'deleted-free.vsdx' {
		param($d, $p)
		$data = $p.Drop($stencil.Masters.ItemU('Data'), 6, 9)
		$data.Delete()
	}
	Record 'duplicated.vsdx' { param($d, $p) $p.Shapes.ItemFromID(1).Duplicate() | Out-Null }
	Record 'copied.vsdx' {
		param($d, $p)
		$d.Pages.Item(2).Drop($p.Shapes.ItemFromID(1), 3, 3) | Out-Null
	}
	Record 'front.vsdx' { param($d, $p) $p.Shapes.ItemFromID(1).BringToFront() }
	Record 'grouped.vsdx' {
		param($d, $p)
		$selection = $p.CreateSelection(0)
		$selection.Select($p.Shapes.ItemFromID(1), 2)
		$selection.Select($p.Shapes.ItemFromID(2), 2)
		$selection.Group() | Out-Null
	}
	Copy-Item (Join-Path $out 'grouped.vsdx') (Join-Path $out 'ungrouped.vsdx') -Force
	$d = $app.Documents.Open((Join-Path $out 'ungrouped.vsdx'))
	try {
		foreach ($shape in @($d.Pages.Item(1).Shapes)) { if ($shape.Type -eq 2) { $shape.Ungroup() } }
		$d.Save() | Out-Null
	} finally {
		$d.Saved = $true
		$d.Close()
	}
	Record 'replaced.vsdx' {
		param($d, $p)
		$p.Shapes.ItemFromID(1).ReplaceShape($stencil.Masters.ItemU('Data')) | Out-Null
	}
	Record 'replaced-sized.vsdx' {
		param($d, $p)
		$shape = $p.Shapes.ItemFromID(1)
		$shape.CellsU('Width').FormulaU = '2 in'
		$shape.CellsU('Height').FormulaU = '1.5 in'
		$shape.CellsU('FillForegnd').FormulaU = 'RGB(255,0,0)'
		$shape.CellsU('Char.Style').FormulaU = '1'
		$d.SaveAs((Join-Path $out 'sized.vsdx')) | Out-Null
		$shape.ReplaceShape($stencil.Masters.ItemU('Data')) | Out-Null
		$d.SaveAs((Join-Path $out 'replaced-sized.vsdx')) | Out-Null
	}
	Record 'layered.vsdx' {
		param($d, $p)
		$p.Layers.Add('Review').Add($p.Shapes.ItemFromID(1), 0)
	}
	"Recorded before.vsdx and eleven command captures in $out ($ids)."
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
