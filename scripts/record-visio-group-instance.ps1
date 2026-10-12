param([Parameter(Mandatory = $true)][string]$OutputDirectory)
# Records what native Visio saves for stencil instances of group masters (Can, Cube and the
# nested Pyramid of Basic Shapes, Folder - closed of Workflow Objects): dropped (before.vsdx), resized (resized.vsdx), rotated and
# flipped (turned.vsdx), filled through the ribbon's Fill button with the whole group selected
# (filled.vsdx) and with one sub-shape sub-selected (subfilled.vsdx), with text typed on one
# sub-shape (subtext.vsdx), and a drop of a master that has two top-level shapes (multiroot.vsdx).
# Visio runs invisibly with its window off screen; no keys are sent and nothing is captured. The
# ribbon button is pressed through UI Automation. The files embed Microsoft's stencil masters, so
# they are local evidence only and are never committed. Point the optional test at them with
# VISIO_NATIVE_GROUP_INSTANCE_DIR (src/core/visio/edit-instance-group-native.test.ts).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public class VisioGroupRecorder {
	[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
	[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint f);
}
"@
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$out = (Resolve-Path $OutputDirectory).Path
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
$h = [IntPtr]$app.WindowHandle32
[VisioGroupRecorder]::SetWindowPos($h, [IntPtr]1, -6000, -6000, 1920, 1000, 0x10) | Out-Null
[VisioGroupRecorder]::ShowWindow($h, 4) | Out-Null
[VisioGroupRecorder]::SetWindowPos($h, [IntPtr]1, -6000, -6000, 1920, 1000, 0x10) | Out-Null
function Invoke-Ribbon([string]$name) {
	$root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
	$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
	# A split button holds an invokable part of the same name.
	foreach ($item in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
		$pattern = $null
		if ($item.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) {
			$pattern.Toggle()
			Start-Sleep -Milliseconds 800
			return
		}
		if ($item.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
			$pattern.Invoke()
			Start-Sleep -Milliseconds 800
			return
		}
		foreach ($child in $item.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
			if ($child.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
				$pattern.Invoke()
				Start-Sleep -Milliseconds 800
				return
			}
		}
	}
	throw "Ribbon button '$name' cannot be pressed."
}
try {
	$doc = $app.Documents.Add('')
	$basic = $app.Documents.OpenEx('BASIC_U.VSSX', 64)
	$objects = $app.Documents.OpenEx('WFOBJ_U.VSSX', 64)
	$page = $doc.Pages.Item(1)
	$can = $page.Drop($basic.Masters.ItemU('Can'), 2, 9)
	$cube = $page.Drop($basic.Masters.ItemU('Cube'), 2, 6)
	$folder = $page.Drop($objects.Masters.ItemU('Folder - closed'), 6, 9)
	$pyramid = $page.Drop($basic.Masters.ItemU('Pyramid'), 6, 6)
	$doc.SaveAs((Join-Path $out 'before.vsdx')) | Out-Null
	foreach ($shape in $can, $cube, $folder, $pyramid) {
		$shape.CellsU('Width').FormulaU = '2.5 in'
		$shape.CellsU('Height').FormulaU = '1.75 in'
	}
	$doc.SaveAs((Join-Path $out 'resized.vsdx')) | Out-Null
	$can.CellsU('Angle').FormulaU = '30 deg'
	$cube.FlipHorizontal()
	$folder.CellsU('PinX').FormulaU = '7 in'
	$doc.SaveAs((Join-Path $out 'turned.vsdx')) | Out-Null
	$can.CellsU('Angle').FormulaU = '0 deg'
	$cube.FlipHorizontal()
	foreach ($shape in $can, $cube, $folder, $pyramid) {
		$shape.CellsU('Width').FormulaU = '1 in'
		$shape.CellsU('Height').FormulaU = '1 in'
	}
	$window = $app.ActiveWindow
	$window.Page = $page
	$window.DeselectAll()
	$window.Select($can, 2)
	Start-Sleep -Milliseconds 500
	Invoke-Ribbon 'Fill'
	Invoke-Ribbon 'Line'
	Invoke-Ribbon 'Bold'
	$doc.SaveAs((Join-Path $out 'filled.vsdx')) | Out-Null
	$window.DeselectAll()
	# visSubSelect: one sub-shape of the group, as a second click selects it.
	$window.Select($cube.Shapes.Item(1), 3)
	Start-Sleep -Milliseconds 500
	Invoke-Ribbon 'Fill'
	Invoke-Ribbon 'Line'
	$doc.SaveAs((Join-Path $out 'subfilled.vsdx')) | Out-Null
	$cube.Shapes.Item($cube.Shapes.Count).Text = 'Sub text'
	$can.Text = 'Group text'
	$doc.SaveAs((Join-Path $out 'subtext.vsdx')) | Out-Null
	# A master with two top-level shapes: Visio groups them when the master is dropped.
	$second = $app.Documents.Add('')
	$master = $second.Masters.Add()
	$master.Name = 'Pair'
	$master.DrawRectangle(0, 0, 1, 0.5) | Out-Null
	$master.DrawOval(1.25, 0, 2, 0.5) | Out-Null
	$second.Pages.Item(1).Drop($master, 4, 5) | Out-Null
	$second.SaveAs((Join-Path $out 'multiroot.vsdx')) | Out-Null
	$subs = @($cube.Shapes | ForEach-Object { $_.ID }) -join ', '
	"Recorded in ${out}: Folder $($folder.ID), Pyramid $($pyramid.ID), Can $($can.ID) (sub-shapes $(@($can.Shapes | ForEach-Object { $_.ID }) -join ', ')), Cube $($cube.ID) (sub-shapes $subs)."
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
}
