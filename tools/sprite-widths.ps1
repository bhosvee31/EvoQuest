# Dev-only helper: prints the length of every sprite row so width
# mistakes in the pixel data are easy to spot.
param([string]$Html = (Join-Path $PSScriptRoot "..\index.html"))

$raw = Get-Content -LiteralPath $Html -Raw
$m = [regex]::Match($raw, '(?s)<script id="sprites-data" type="application/json">(.*?)</script>')
if (-not $m.Success) { throw "no sprites-data block" }
$defs = $m.Groups[1].Value | ConvertFrom-Json

foreach ($name in $defs.PSObject.Properties.Name) {
    $d = $defs.$name
    $lens = @()
    for ($i = 0; $i -lt $d.rows.Count; $i++) { $lens += ([string]$d.rows[$i]).Length }
    $max = ($lens | Measure-Object -Maximum).Maximum
    $min = ($lens | Measure-Object -Minimum).Minimum
    $flag = if ($max -eq $d.w -and $min -eq $d.w) { "ok" } else { "MISMATCH" }
    Write-Output ("{0,-10} declared={1,-3} min={2,-3} max={3,-3} {4}" -f $name, $d.w, $min, $max, $flag)
    if ($flag -ne "ok") { Write-Output ("           lens: " + ($lens -join ",")) }
}
