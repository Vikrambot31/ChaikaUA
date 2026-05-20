$adb = "C:\Users\Vikram-Game\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logDir = "build-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir "adb-logcat-$timestamp.txt"
Write-Host "Logging to: $logFile"
& $adb logcat -v time *:V | Tee-Object -FilePath $logFile
