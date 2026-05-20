Add-Type -AssemblyName System.Drawing

function Add-EdgePoints {
  param(
    [System.Collections.Generic.Queue[System.Drawing.Point]]$Queue,
    [System.Collections.Generic.HashSet[string]]$Visited,
    [int]$Width,
    [int]$Height
  )

  for ($x = 0; $x -lt $Width; $x++) {
    foreach ($y in @([int]0, [int]($Height - 1))) {
      $key = "$x,$y"
      if ($Visited.Add($key)) {
        $Queue.Enqueue([System.Drawing.Point]::new($x, $y))
      }
    }
  }

  for ($y = 1; $y -lt ($Height - 1); $y++) {
    foreach ($x in @([int]0, [int]($Width - 1))) {
      $key = "$x,$y"
      if ($Visited.Add($key)) {
        $Queue.Enqueue([System.Drawing.Point]::new($x, $y))
      }
    }
  }
}

function Convert-EdgeBackgroundToTransparency {
  param(
    [string]$Path,
    [int]$BrightnessFloor,
    [int]$SpreadLimit
  )

  $resolved = (Resolve-Path $Path).Path
  $src = [System.Drawing.Bitmap]::FromFile($resolved)
  $bmp = [System.Drawing.Bitmap]::new($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.DrawImage($src, 0, 0, $src.Width, $src.Height)
  $graphics.Dispose()
  $src.Dispose()

  $width = [int]$bmp.Width
  $height = [int]$bmp.Height
  $visited = [System.Collections.Generic.HashSet[string]]::new()
  $queue = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()

  Add-EdgePoints -Queue $queue -Visited $visited -Width $width -Height $height

  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()
    $color = $bmp.GetPixel($point.X, $point.Y)

    if ($color.A -eq 0) {
      continue
    }

    $brightness = ($color.R + $color.G + $color.B) / 3
    $spread = [Math]::Max(
      [Math]::Abs($color.R - $color.G),
      [Math]::Max([Math]::Abs($color.R - $color.B), [Math]::Abs($color.G - $color.B))
    )

    if ($brightness -lt $BrightnessFloor -or $spread -gt $SpreadLimit) {
      continue
    }

    $alpha = if ($brightness -ge 235) {
      0
    } elseif ($brightness -ge 220) {
      24
    } elseif ($brightness -ge 205) {
      42
    } else {
      72
    }

    $bmp.SetPixel($point.X, $point.Y, [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))

    foreach ($next in @(
      [System.Drawing.Point]::new($point.X + 1, $point.Y),
      [System.Drawing.Point]::new($point.X - 1, $point.Y),
      [System.Drawing.Point]::new($point.X, $point.Y + 1),
      [System.Drawing.Point]::new($point.X, $point.Y - 1)
    )) {
      if ($next.X -lt 0 -or $next.Y -lt 0 -or $next.X -ge $width -or $next.Y -ge $height) {
        continue
      }

      $key = "$($next.X),$($next.Y)"
      if ($visited.Add($key)) {
        $queue.Enqueue($next)
      }
    }
  }

  $bmp.Save($resolved, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$buttonFiles = @(
  'foto-animation/1-help.png',
  'foto-animation/2-map.png',
  'foto-animation/3-broken.png',
  'foto-animation/4-people.png'
)

$introFiles = @(
  'foto-animation/intro1.png',
  'foto-animation/intro2.png',
  'foto-animation/intro3.png'
)

foreach ($file in $buttonFiles) {
  Convert-EdgeBackgroundToTransparency -Path $file -BrightnessFloor 190 -SpreadLimit 26
}

foreach ($file in $introFiles) {
  Convert-EdgeBackgroundToTransparency -Path $file -BrightnessFloor 215 -SpreadLimit 18
}

Write-Output 'Sanitized foto-animation PNG files.'
