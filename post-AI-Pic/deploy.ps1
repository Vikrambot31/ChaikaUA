Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

& ".\.venv\Scripts\Activate.ps1"
pip install -r requirements.txt

Write-Host ""
Write-Host "Installed. Next steps:"
Write-Host "1. Copy .env.example to .env and fill keys."
Write-Host "2. Run: python agent.py --dry-run"
Write-Host "3. Run: python agent.py --once"
