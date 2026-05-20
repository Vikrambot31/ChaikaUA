param(
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Continue'

$projectDir = 'C:\ChaikaUA\mobile-app-short'
$healthUrl = 'http://localhost:1234/v1/models'

Write-Host '[1/2] Проверка LM Studio...'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while (-not $ready -and (Get-Date) -lt $deadline) {
  try {
    $null = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    $ready = $true
  } catch {
    Start-Sleep -Seconds 2
  }
}

if ($ready) {
  Write-Host 'LM Studio доступна.'
} else {
  Write-Host 'LM Studio не отвечает. Запусти LM Studio вручную.'
}

Write-Host '[2/2] Открываю проект в VS Code...'
Push-Location $projectDir
try {
  code .
}
finally {
  Pop-Location
}
