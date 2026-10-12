param([Parameter(Mandatory = $true)][string]$OutputDirectory)
# Records what native Visio saves when a stencil (master) instance gets text: before.vsdx holds a
# dropped Process and Decision glued by a Dynamic connector; after.vsdx is the same drawing once
# the Process has text and the Decision is wider. rich-before/after.vsdx do the same for masters
# with formatted text and with a text field. The captures embed Microsoft's stencil masters,
# so they are local evidence only and are never committed. Point the optional test at them with
# VISIO_NATIVE_INSTANCE_TEXT_DIR (src/core/visio/edit-text-instance.test.ts).
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$out = (Resolve-Path $OutputDirectory).Path
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
try {
	$doc = $app.Documents.Add('')
	$stencil = $app.Documents.OpenEx('BASFLO_U.VSSX', 64)
	$page = $doc.Pages.Item(1)
	$process = $page.Drop($stencil.Masters.ItemU('Process'), 2, 6)
	$decision = $page.Drop($stencil.Masters.ItemU('Decision'), 2, 4)
	$process.AutoConnect($decision, 2)
	$doc.SaveAs((Join-Path $out 'before.vsdx')) | Out-Null
	$process.Text = 'Typed on an instance'
	$decision.CellsU('Width').FormulaU = '2 in'
	$doc.SaveAs((Join-Path $out 'after.vsdx')) | Out-Null
	"Recorded before.vsdx and after.vsdx in $out (Process is shape $($process.ID))."
	foreach ($d in @($app.Documents)) { $d.Saved = $true; $d.Close() }

	# rich-before/after.vsdx: instances of a master with bold text and of one whose text holds a
	# field, then text typed over each and edited around the field.
	$doc = $app.Documents.Add('')
	$page = $doc.Pages.Item(1)
	$bold = $page.DrawRectangle(1, 1, 3, 2)
	$bold.Text = 'Bold label'
	$bold.CellsU('Char.Style').FormulaU = '1'
	$boldMaster = $doc.Masters.Add()
	$boldMaster.Name = 'BoldMaster'
	$copy = $boldMaster.Open()
	$bold.Copy(); $copy.Paste() | Out-Null
	$copy.Close()
	$field = $page.DrawRectangle(4, 1, 6, 2)
	$field.Text = 'Page '
	$chars = $field.Characters
	$chars.Begin = 5; $chars.End = 5
	$chars.AddField(3, 0, 0)
	$fieldMaster = $doc.Masters.Add()
	$fieldMaster.Name = 'FieldMaster'
	$copy = $fieldMaster.Open()
	$field.Copy(); $copy.Paste() | Out-Null
	$copy.Close()
	$bold.Delete(); $field.Delete()
	$overBold = $page.Drop($doc.Masters.ItemU('BoldMaster'), 2, 6)
	$overField = $page.Drop($doc.Masters.ItemU('FieldMaster'), 5, 6)
	$aroundField = $page.Drop($doc.Masters.ItemU('FieldMaster'), 5, 4)
	$doc.SaveAs((Join-Path $out 'rich-before.vsdx')) | Out-Null
	$overBold.Text = 'Typed over bold'
	$overField.Text = 'Typed over a field'
	$span = $aroundField.Characters; $span.Begin = 0; $span.End = 4; $span.Text = 'Sheet'
	$doc.SaveAs((Join-Path $out 'rich-after.vsdx')) | Out-Null
	"Recorded rich-before.vsdx and rich-after.vsdx (shapes $($overBold.ID), $($overField.ID), $($aroundField.ID))."
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
