param(
	[Parameter(Mandatory = $true)][string]$File,
	# Optional: save the drawing again with Visio, to edit that copy further with this package.
	[string]$SaveAs = ''
)
# Opens a drawing written by this package in native Visio and lists what Visio sees: the masters
# of its document stencil, and for every page its layers and each shape's name, master, size, pin
# and layers. Use it on a drawing with shapes dropped from the built-in stencils
# (`drop-stencil-master`): every instance must name its master, and the masters must be listed.
# Visio runs invisibly on a copy of the file: no window is shown, no keys are sent and nothing is
# captured from the screen. A copy Visio saves holds only this package's own masters.
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path $File).Path
$copy = Join-Path ([System.IO.Path]::GetTempPath()) ("visio-masters-" + [DateTime]::Now.Ticks + ".vsdx")
Copy-Item $source $copy
$app = New-Object -ComObject Visio.InvisibleApp
$app.AlertResponse = 7
try {
	$doc = $app.Documents.OpenEx($copy, 0)
	"opened: masters=$($doc.Masters.Count) pages=$($doc.Pages.Count)"
	foreach ($m in $doc.Masters) {
		"master: ID=$($m.ID) NameU=$($m.NameU) shapes=$($m.Shapes.Count) UniqueID=$($m.UniqueID)"
	}
	foreach ($p in $doc.Pages) {
		$sheet = $p.PageSheet
		"page: $($p.Name) $($sheet.Cells('PageWidth').ResultIU) x $($sheet.Cells('PageHeight').ResultIU) in. layers=$(($p.Layers | ForEach-Object { $_.Name }) -join ';')"
		foreach ($s in $p.Shapes) {
			$master = if ($s.Master) { $s.Master.NameU } else { '(none)' }
			$layers = @()
			for ($i = 1; $i -le $s.LayerCount; $i++) { $layers += $s.Layer($i).Name }
			$round = { param($cell) [math]::Round($s.Cells($cell).ResultIU, 4) }
			"  shape: ID=$($s.ID) NameU=$($s.NameU) master=$master size=$(& $round 'Width') x $(& $round 'Height') pin=$(& $round 'PinX'),$(& $round 'PinY') glued=$($s.Connects.Count) layers=$($layers -join ';') text='$($s.Text)'"
		}
	}
	if ($SaveAs) {
		$doc.SaveAs($SaveAs) | Out-Null
		"saved again by Visio: $SaveAs"
	}
} finally {
	foreach ($d in @($app.Documents)) { $d.Saved = $true }
	$app.Quit()
	Start-Sleep -Milliseconds 500
	Remove-Item $copy -ErrorAction SilentlyContinue
}
