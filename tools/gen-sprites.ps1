# Dev-only helper: the authoritative source for EvoQuest sprite art.
#
#   powershell -ExecutionPolicy Bypass -File tools\gen-sprites.ps1
#
# Writes the sprite JSON straight into the <script id="sprites-data"> block in
# index.html, so the pixel data in the HTML can never drift out of sync.
#
# Two authoring modes:
#   * "mirror" - you write the left half of a front-facing sprite, this script
#     appends the mirrored right half. Width errors become impossible.
#   * "rows"   - you write every row yourself (side-view / asymmetric sprites).
#     Rows are padded on the right with transparent pixels to a common width.
#
# Then run tools\render-sprites.ps1 to eyeball the result as a PNG sheet.

param(
  [string]$Html = (Join-Path $PSScriptRoot "..\index.html")
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------- mirror mode
# Each entry: @{ label; pal; L = @(<left-half rows, all equal length>) }
$mirror = [ordered]@{
  butterfly = [ordered]@{
    label = "Butterfly"
    pal   = [ordered]@{ k = "#2a1546"; a = "#4c1d95"; b = "#7c3aed"; c = "#c4b5fd"; w = "#ffffff"; y = "#fde047" }
    L      = @(
      "...........",
      "........k..",
      ".........k.",
      ".....kkccck",
      "....kcccccc",
      "...kcwwccak",
      "..kcwccccck",
      "..kcwcccbbk",
      ".kcwcccbbak",
      ".kcwccbbbak",
      ".kcwccbbbak",
      "..kcwbbbbak",
      "..kccbbbbak",
      "...kccbbbak",
      "....kkbbbak",
      "......kkkk."
    )
  }
  crab = [ordered]@{
    label = "Crab"
    pal   = [ordered]@{ k = "#6b1212"; a = "#e2453b"; b = "#ffb3a7"; p = "#4a0b0b"; w = "#ffffff" }
    L      = @(
      "...kk......",
      "..kbbk.....",
      ".kbbbbk....",
      "kbbbbbk....",
      "kbbpbbbk...",
      ".kb..bbk...",
      "..kk..kk...",
      "...k..kwk..",
      "...k..kpk..",
      "....kbaabk.",
      "...kbaaabk.",
      "..kkbaaabkk",
      ".kkbaaaaabk",
      ".kkbaaaaabk",
      "..kkbaaaabk",
      "..kkkkkkkk.",
      "..k.k.k.k.k"
    )
  }
  sparrow = [ordered]@{
    label = "Sparrow"
    pal   = [ordered]@{ k = "#3b2412"; a = "#b5793f"; b = "#8a5527"; c = "#d9a066"; w = "#ffffff"; y = "#f2b134" }
    L      = @(
      ".........k.",
      ".........kk",
      ".......kccc",
      "......kcwck",
      "......kcwwy",
      "......kcwwy",
      "......kccck",
      ".....kcaacc",
      "....kcaaacc",
      "...kcabbaac",
      "..kcabbbaac",
      "..kcabbbaac",
      "..kcabbaaac",
      "...kcaaaack",
      "....kkccckk",
      ".....kkcckk"
    )
  }
  pigeon = [ordered]@{
    label = "Pigeon"
    pal   = [ordered]@{ k = "#2f3542"; a = "#98a3b4"; b = "#5c6779"; c = "#c3cbd6"; n = "#3fbfa0"; w = "#ffffff"; y = "#f2b134" }
    L      = @(
      ".........k.",
      ".........kk",
      ".......kccc",
      "......kcwck",
      "......kcwnk",
      "......kccck",
      "......kccck",
      ".....kcaacc",
      "...kcannaac",
      "...kcabbaac",
      "..kcabbbaac",
      "..kcabbbaac",
      "..kcabbaaac",
      "...kcaaaack",
      "....kcaaaak",
      ".....kkcckk",
      ".....kkcckk",
      "....k.k....",
      "....k.k...."
    )
  }
  wasp = [ordered]@{
    label = "Wasp"
    pal   = [ordered]@{ k = "#141414"; y = "#ffc21a"; w = "#d8f3ff" }
    L      = @(
      ".wwwww....",
      ".wwwww....",
      ".wwwww....",
      ".wwwww....",
      "..wwwww...",
      "......k.k.",
      ".....kwwwk",
      ".....kwywk",
      ".....kwwwk",
      ".....kkyyk",
      "......kkkk",
      "..k...kyyy",
      "..k....kk.",
      ".....kyyyy",
      ".....kkkkk",
      ".....kyyyy",
      ".....kkkkk",
      "......kkkk",
      "......kk..",
      "........k."
    )
  }
  berry = [ordered]@{
    label = "Berries"
    pal   = [ordered]@{ k = "#4a0d20"; a = "#ef4444"; b = "#991b1b"; c = "#fca5a5"; w = "#ffffff" }
    L      = @(
      "........",
      "...k....",
      "..kk....",
      "..kcck..",
      ".kcccck.",
      "kcwwacck",
      "kcaaaack",
      "kcaaabck",
      "kcbbbbck",
      ".kbbbbk.",
      "..kkkk..",
      "........"
    )
  }
}

# ----------------------------------------------------------------- rows mode
$freehand = [ordered]@{
  plankton = [ordered]@{
    label = "Plankton"
    pal   = [ordered]@{ k = "#0b3b2a"; a = "#3ad17f"; b = "#1f8f5c"; c = "#a6f7c8"; d = "#ffe66d"; w = "#ffffff" }
    rows   = @(
      "...............",
      "..d......d.....",
      "..d......d.....",
      "...k....k......",
      "..kaaakkaak.....",
      ".kaaaaaaaak....",
      ".kaaccaaaac....",
      "k.aawaaaawaak.",
      "k.aaaaaaaaaaak..",
      "k.abaaaaaabak...",
      ".kbaaaaaaabk....",
      "..kbbaaaabbk...",
      "...kkkkkkkk....",
      "..............."
    )
  }
  fish = [ordered]@{
    label = "Fish"
    pal   = [ordered]@{ k = "#0a2f52"; a = "#2f8fd8"; b = "#1c5f9c"; c = "#8fdcff"; w = "#ffffff"; y = "#ffd75e" }
    rows   = @(
      "....................",
      "........kkkk........",
      ".......kcccck.......",
      "kk.....kcccck.......",
      "kck..kcaawccck......",
      "kcckkaaaaaaacck.....",
      "kccckaayyaaaaaaak...",
      "kcckkaaaaaaacck.....",
      "kck..kcaacccck......",
      "kk....kcaccck.......",
      ".......kkkkk........",
      "....................",
      "...................."
    )
  }
  krill = [ordered]@{
    label = "Krill"
    pal   = [ordered]@{ k = "#4c0519"; a = "#fb7185"; c = "#fecdd3"; b = "#9f1239" }
    rows   = @(
      "...............",
      "....kkkk.......",
      "..kkcccckk.....",
      ".kccaaaaackk....",
      "kccaaaaaaaacck.",
      "kccaaaaaaaacck.",
      ".kbbbaaaabbbk...",
      "..kkbbbbbbkk...",
      "....kkkkkk.....",
      "..............."
    )
  }
  bee = [ordered]@{
    label = "Bee"
    pal   = [ordered]@{ k = "#151515"; y = "#ffc21a"; w = "#d8f3ff"; b = "#6b4b00" }
    rows   = @(
      "...................",
      "...ww........ww.....",
      "..wwww......wwww....",
      "..wwww..kk..wwww....",
      "....ww.kyyk.ww......",
      "...kkkkyyyykkkkk....",
      "..kyyyyyyyyyyyyk....",
      ".kyykyyykyyykyyyyk..",
      ".kyykyyykyyykyyyyk..",
      "..kyyyyyyyyyyyyk....",
      "...kkyykyykkkkk.....",
      ".....yk..k..........",
      "......k.............",
      "....................."
    )
  }
  owl = [ordered]@{
    label = "Owl"
    pal   = [ordered]@{ k = "#2b1d12"; a = "#8a5a2b"; b = "#5c3a17"; c = "#c98a4b"; w = "#ffffff"; p = "#160d05"; y = "#f2b134" }
    rows   = @(
      ".......k........k.......",
      "......kak......kak......",
      ".....kaak......kaak.....",
      "....kbbakkkkkkkabbk.....",
      "..kkbbaaaaaaaaaaaabbkk..",
      ".kcbbaaaaaaaaaaaaaabbbk.",
      "kcbaaawwwwwwwwwwwaaabck.",
      "kcbaawwpppawwwwpwwaaabck.",
      "kcbaawwpppawwwwpwwaaabck.",
      "kcbaaawwwwwawwwwwaaabck.",
      "kcbbaaaaaaaaaaaaaaaabck.",
      "kcbbaakkkkkkkkkkkkaabck.",
      "kcbbaakyyyyyyyyyykaabck.",
      "kcbbaakkkkkkkkkkkkaabck.",
      "kcbbaaaaaaaaaaaaaaaabck.",
      ".kcbbaaaaaaaaaaaaaabck..",
      "..kkbbaaaaaaaaaaaabbkk..",
      "....kbbbbbbbbbbbbbbk....",
      ".....kkkkkkkkkkkkkk.....",
      ".......kk..kk..kk.......",
      "......................."
    )
  }
  vampire = [ordered]@{
    label = "Vampire"
    pal   = [ordered]@{ k = "#12060f"; a = "#c8102e"; b = "#7a0a1c"; c = "#2a2a33"; w = "#ffffff"; p = "#5a1020"; e = "#ffd9a0" }
    rows   = @(
      "...kk..............kk...",
      "..kcck............kcck..",
      ".kcccck..........kcccck.",
      "kcccccck........kcccccck.",
      "kcccccccckkkkkkcccccccck.",
      "kcccccccccceeeccccccccck.",
      "kcbbbbccccccppcccccccbbck",
      "kcbbbbcccccwewccccccbbcck",
      ".kbbbbbbbcccwewcccbbbbbbk",
      ".kbbbbbbbbccwcccccbbbbbbk",
      "..kbbbbbbbbcccccbbbbbbbk",
      "...kkbbbbbbbbbbbbbbbbkk.",
      ".....kkbbbbbbbbbbbbbbkk.",
      ".......kkkkkkkkkkkkkk...",
      ".........kk.kk..........",
      ".......................",
      ".......................",
      ".......................",
      "......................."
    )
  }
  algae = [ordered]@{
    label = "Algae"
    pal   = [ordered]@{ k = "#14532d"; a = "#22c55e"; c = "#86efac"; b = "#15803d" }
    rows   = @(
      ".............",
      "..kk..kk.....",
      ".kaak.kaak...",
      "kcaaaakcaack.",
      "kcaacaaacaak.",
      "kcaaaaaaaack.",
      "kbaaaaaaaabk.",
      ".kbaaaaaabk..",
      "..kbbaabbk...",
      "...kkkkkk....",
      ".............",
      "............."
    )
  }
  mushroom = [ordered]@{
    label = "Mushroom"
    pal   = [ordered]@{ k = "#3f2d16"; a = "#f59e0b"; c = "#fcd34d"; b = "#b45309"; w = "#fff7ed" }
    rows   = @(
      "....kkkk....",
      "...kcccck...",
      "..kcccccck..",
      ".kcccccccck.",
      "kaccccccccck",
      "kaccccccccck",
      "kcccccccccck",
      ".kkkkkkkkkk.",
      "....kwwk....",
      "....kwwk....",
      "....kaak....",
      "....kbak....",
      "....kbak....",
      ".....kk....."
    )
  }
}

# ------------------------------------------------------------------- assemble
$issues   = New-Object System.Collections.ArrayList
$sprites  = [ordered]@{}

function Resolve-Rows {
    param($Def, $Id)
    if ($Def.Contains('L')) {
        $half   = @($Def.L | ForEach-Object { [string]$_ })
        $widths = @($half | ForEach-Object { $_.Length } | Select-Object -Unique | Sort-Object)
        if ($widths.Count -ne 1) {
            $detail = @()
            for ($i = 0; $i -lt $half.Count; $i++) {
                $detail += ("[{0}]'{1}'({2})" -f $i, $half[$i], $half[$i].Length)
            }
            [void]$issues.Add(("{0}: mirrored half-rows differ in length [{1}] -> {2}" -f $Id, ($widths -join ","), ($detail -join ' ')))
            return ,$half
        }
        return ,@($half | ForEach-Object {
            $chars = $_.ToCharArray()
            [array]::Reverse($chars)
            $s = [string]$_
            $s + (-join $chars)
        })
    }
    $rows = @($Def.rows | ForEach-Object { [string]$_ })
    $w = ($rows | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum
    return ,@($rows | ForEach-Object { $_.PadRight($w, '.') })
}

foreach ($entry in $mirror.GetEnumerator()) {
    $def = $entry.Value
    $rows = Resolve-Rows $def $entry.Key
    $sprites[$entry.Key] = [ordered]@{
        label = $def.label; w = $rows[0].Length; h = $rows.Count; pal = $def.pal; rows = $rows
    }
}
foreach ($entry in $freehand.GetEnumerator()) {
    $def = $entry.Value
    $rows = Resolve-Rows $def $entry.Key
    $sprites[$entry.Key] = [ordered]@{
        label = $def.label; w = $rows[0].Length; h = $rows.Count; pal = $def.pal; rows = $rows
    }
}

# -------------------------------------------------------------------- validate
foreach ($key in $sprites.Keys) {
    $s = $sprites[$key]
    foreach ($r in $s.rows) {
        if ($r.Length -ne $s.w) { [void]$issues.Add(("{0}: row width {1} != sprite width {2}" -f $key, $r.Length, $s.w)) }
        foreach ($ch in $r.ToCharArray()) {
            if ($ch -ne '.' -and -not $s.pal.Contains([string]$ch)) {
                [void]$issues.Add(("{0}: unknown palette char '{1}'" -f $key, $ch))
                break
            }
        }
    }
}

if ($issues.Count -gt 0) {
    Write-Output "--- $($issues.Count) sprite issue(s), index.html NOT updated ---"
    $issues | Select-Object -Unique | ForEach-Object { Write-Output "  $_" }
    exit 1
}

# ---------------------------------------------------------------------- emit
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("{")
$keys = @($sprites.Keys)
for ($i = 0; $i -lt $keys.Count; $i++) {
    $key = $keys[$i]
    $s   = $sprites[$key]
    [void]$sb.AppendLine(('  "{0}": {{' -f $key))
    [void]$sb.AppendLine(('    "label": "{0}", "w": {1}, "h": {2},' -f $s.label, $s.w, $s.h))
    $palBits = @()
    foreach ($p in $s.pal.Keys) { $palBits += ('"{0}": "{1}"' -f $p, $s.pal[$p]) }
    [void]$sb.AppendLine(('    "pal": {{{0}}},' -f ($palBits -join ', ')))
    [void]$sb.AppendLine('    "rows": [')
    for ($r = 0; $r -lt $s.rows.Count; $r++) {
        $comma = if ($r -lt $s.rows.Count - 1) { ',' } else { '' }
        [void]$sb.AppendLine(('      "{0}"{1}' -f $s.rows[$r], $comma))
    }
    [void]$sb.AppendLine('    ]')
    $close = if ($i -lt $keys.Count - 1) { '  },' } else { '  }' }
    [void]$sb.AppendLine($close)
}
[void]$sb.AppendLine("}")

$doc = Get-Content -LiteralPath $Html -Raw
$block = '<script id="sprites-data" type="application/json">' + "`n" + $sb.ToString() + '</script>'
$rx = [regex]::new('(?s)<script id="sprites-data" type="application/json">.*?</script>')
if (-not $rx.IsMatch($doc)) { throw "no sprites-data script block found in $Html" }
$doc = $rx.Replace($doc, [System.Text.RegularExpressions.MatchEvaluator]{ param($mm) $block }, 1)
[System.IO.File]::WriteAllText($Html, $doc, (New-Object System.Text.UTF8Encoding $false))

Write-Output ("wrote {0} sprites into {1}" -f $keys.Count, $Html)
$keys | ForEach-Object {
    $s = $sprites[$_]
    Write-Output ("  {0,-10} {1,2}x{2,-2}  {3} palette colours" -f $_, $s.w, $s.h, $s.pal.Count)
}
