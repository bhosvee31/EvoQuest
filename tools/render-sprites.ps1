# Dev-only helper: renders the pixel-art sprite data embedded in index.html
# to a PNG contact sheet so the art can be eyeballed without a browser.
#
#   powershell -ExecutionPolicy Bypass -File tools\render-sprites.ps1
#
param(
  [string]$Html   = (Join-Path $PSScriptRoot "..\index.html"),
  [string]$Out    = (Join-Path $env:TEMP "opencode\evoquest-sprites.png"),
  [int]$Zoom      = 6
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$raw = [System.IO.File]::ReadAllText($Html, [System.Text.Encoding]::UTF8)
$m = [regex]::Match($raw, '(?s)<script id="sprites-data" type="application/json">(.*?)</script>')
if (-not $m.Success) { throw "Could not find the sprites-data block in $Html" }

$defs = $m.Groups[1].Value | ConvertFrom-Json

$order = @(
  "plankton","fish","butterfly","bee","crab",
  "sparrow","pigeon","wasp","owl","vampire",
  "algae","berry","krill","mushroom"
)

$cols = 7
$rowsCount = [Math]::Ceiling($order.Count / $cols)
$cellW = 190
$cellH = 175
$sheetW = $cols * $cellW
$sheetH = $rowsCount * $cellH

$bmp = New-Object System.Drawing.Bitmap $sheetW, $sheetH
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 12, 22, 34))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$font = New-Object System.Drawing.Font("Consolas", 10, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Gainsboro
$dim   = [System.Drawing.Brushes]::DimGray

$problems = New-Object System.Collections.ArrayList

for ($i = 0; $i -lt $order.Count; $i++) {
    $id = $order[$i]
    $def = $defs.$id
    if ($null -eq $def) { [void]$problems.Add("MISSING SPRITE: $id"); continue }

    $r = $def.rows
    $h = $r.Count
    # widest row, and any row that disagrees with the declared width
    $w = 0
    foreach ($row in $r) { if ($row.Length -gt $w) { $w = $row.Length } }
    if ($w -ne $def.w) { [void]$problems.Add(("{0,-10} declared w={1} but widest row={2}" -f $id, $def.w, $w)) }

    $ox = ($i % $cols) * $cellW
    $oy = [Math]::Floor($i / $cols) * $cellH

    $g.DrawRectangle([System.Drawing.Pens]::SteelBlue, $ox + 6, $oy + 6, $cellW - 12, $cellH - 12)

    $zoom = $Zoom
    $drawW = $w * $zoom
    $drawH = $h * $zoom
    if ($drawW -gt $cellW - 26) { $zoom = [Math]::Floor(($cellW - 26) / $w) }
    if ($drawH -gt $cellH - 40) { $zoom = [Math]::Min($zoom, [Math]::Floor(($cellH - 40) / $h)) }
    $drawW = $w * $zoom
    $drawH = $h * $zoom
    $dx = $ox + [Math]::Floor(($cellW - $drawW) / 2)
    $dy = $oy + 22

    for ($y = 0; $y -lt $h; $y++) {
        $row = [string]$r[$y]
        for ($x = 0; $x -lt $row.Length; $x++) {
            $ch = $row.Substring($x, 1)
            if ($ch -eq ".") { continue }
            $hex = $def.pal.$ch
            if (-not $hex) {
                [void]$problems.Add(("{0}: unknown palette char '{1}' at {2},{3}" -f $id, $ch, $x, $y))
                continue
            }
            $col = [System.Drawing.ColorTranslator]::FromHtml([string]$hex)
            $g.FillRectangle(
                (New-Object System.Drawing.SolidBrush $col),
                ($dx + $x * $zoom), ($dy + $y * $zoom), $zoom, $zoom)
        }
    }

    $g.DrawString(("{0}  [{1}x{2}]" -f $id, $w, $h), $font, $brush, $ox + 12, $oy + $cellH - 24)
}

$g.DrawString("EvoQuest sprite sheet  (zoom $($Zoom)x)", (New-Object System.Drawing.Font("Consolas", 11, [System.Drawing.FontStyle]::Bold)), [System.Drawing.Brushes]::CornflowerBlue, 8, ($sheetH + 6))

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

Write-Output "wrote $Out"
if ($problems.Count -eq 0) {
    Write-Output "sprite data: all rows/palette keys OK"
} else {
    Write-Output "--- $($problems.Count) issue(s) ---"
    $problems | ForEach-Object { Write-Output $_ }
}
