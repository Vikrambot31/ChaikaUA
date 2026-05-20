param(
  [string]$WindowTitle = 'Claude Code'
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

function Send-Confirmation {
  param([string]$Title)

  $shell = New-Object -ComObject WScript.Shell
  if (-not [string]::IsNullOrWhiteSpace($Title)) {
    [void]$shell.AppActivate($Title)
    Start-Sleep -Milliseconds 150
  }

  [System.Windows.Forms.SendKeys]::SendWait('1')
}

try {
  Send-Confirmation -Title $WindowTitle
  Write-Host "Sent confirmation '1' to window: $WindowTitle"
}
catch {
  Write-Host "Failed to send confirmation: $($_.Exception.Message)"
  exit 1
}
