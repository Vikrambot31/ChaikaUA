$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$auditPath = Join-Path $root "encoding-audit.json"

if (-not (Test-Path -LiteralPath $auditPath)) {
  throw "encoding-audit.json not found: $auditPath"
}

$audit = Get-Content -Raw -LiteralPath $auditPath | ConvertFrom-Json
$runtimeFiles = @($audit.RuntimeProblems | ForEach-Object { $_.Path }) | Where-Object { $_ -and $_ -ne "App.tsx" }

$enc1251 = [System.Text.Encoding]::GetEncoding(1251)
$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$markerPattern = '[\u00D0\u00D1\u0420\u0421\u0440\u0441\u0451\u0401\u201A\u201E\u2026\u2020\u2021\u20AC\u2122\u0459\u045A\u045C\u045B\u045F]'
$tokenPattern = "[^\s""'`]+"
$controlPattern = "[\u0000-\u0008\u000B\u000C\u000E-\u001F]"

function Convert-TokenIfMojibake {
  param(
    [Parameter(Mandatory = $true)][string]$Token
  )

  if ($Token -notmatch $markerPattern) {
    return $Token
  }

  try {
    $bytes = $enc1251.GetBytes($Token)
    $candidate = $utf8Strict.GetString($bytes)
  } catch {
    return $Token
  }

  if ($candidate -eq $Token) {
    return $Token
  }

  if ($candidate -match $controlPattern) {
    return $Token
  }

  $before = ([regex]::Matches($Token, $markerPattern)).Count
  $after = ([regex]::Matches($candidate, $markerPattern)).Count

  if ($after -lt $before) {
    return $candidate
  }

  return $Token
}

$changed = New-Object System.Collections.Generic.List[string]
$checked = 0

foreach ($relative in $runtimeFiles) {
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path)) {
    continue
  }

  $checked++
  $content = Get-Content -Raw -LiteralPath $path -Encoding UTF8
  $newContent = [regex]::Replace($content, $tokenPattern, {
    param($m)
    Convert-TokenIfMojibake -Token $m.Value
  })

  if ($newContent -ne $content) {
    [System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)
    $changed.Add($relative) | Out-Null
  }
}

Write-Host "Checked runtime files:" $checked
Write-Host "Changed files:" $changed.Count
if ($changed.Count -gt 0) {
  $changed | Sort-Object | ForEach-Object { Write-Host " - $_" }
}
