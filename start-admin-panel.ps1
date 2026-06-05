# PowerShell script to start Admin Panel Dev Server
# Run with: powershell -ExecutionPolicy Bypass -File start-admin-panel.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommandPath
$adminPanelDir = Join-Path $scriptDir "admin-panel"

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Starting Admin Panel Dev Server" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project: $adminPanelDir"
Write-Host "Command: npm run dev"
Write-Host "Expected URL: http://localhost:5174" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the server"
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $adminPanelDir
npm run dev

Read-Host "Press Enter to close"
