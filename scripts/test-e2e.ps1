# ============================================================
# test-e2e.ps1 — Chaika Mobile E2E Test Runner
# Usage: .\scripts\test-e2e.ps1
# Optional flags:
#   -FlowFilter "03_tab"   — run only flows matching this pattern
#   -SkipLogcat            — skip logcat collection
#   -SkipEmulatorCheck     — skip emulator boot check
# ============================================================
param(
    [string]$FlowFilter = "",
    [switch]$SkipLogcat,
    [switch]$SkipEmulatorCheck
)

$ErrorActionPreference = "Continue"

# ---- Paths ----
$ROOT     = Split-Path -Parent $PSScriptRoot
$ADB      = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$MAESTRO  = "$ROOT\tools\maestro\maestro\bin\maestro.bat"
$FLOWS    = "$ROOT\.maestro\flows"
$RUN_ALL  = "$ROOT\.maestro\run_all_flows.yaml"

$TIMESTAMP      = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$REPORT_DIR     = "$ROOT\bug-registry\reports\run_$TIMESTAMP"
$SCREENSHOTS    = "$REPORT_DIR\screenshots"
$LOGCAT_DIR     = "$ROOT\bug-registry\raw-logs"
$LOGCAT_FILE    = "$LOGCAT_DIR\logcat_$TIMESTAMP.txt"
$REPORT_FILE    = "$REPORT_DIR\e2e_report_$TIMESTAMP.md"
$SUMMARY_FILE   = "$REPORT_DIR\summary.txt"

$APP_ID   = "com.chaikaua.mobile"
$DEVICE   = "emulator-5554"

# ---- Colors ----
function Green($msg)  { Write-Host $msg -ForegroundColor Green }
function Yellow($msg) { Write-Host $msg -ForegroundColor Yellow }
function Red($msg)    { Write-Host $msg -ForegroundColor Red }
function Cyan($msg)   { Write-Host $msg -ForegroundColor Cyan }

# ============================================================
Cyan "================================================================"
Cyan "   Chaika Mobile — E2E Auto-Test Runner"
Cyan "   Started: $TIMESTAMP"
Cyan "================================================================"

# ---- Validate tools ----
if (-not (Test-Path $ADB)) {
    Red "ERROR: ADB not found at: $ADB"
    Red "Install Android SDK or set correct path."
    exit 1
}
if (-not (Test-Path $MAESTRO)) {
    Red "ERROR: Maestro not found at: $MAESTRO"
    exit 1
}

# ---- Create output dirs ----
New-Item -ItemType Directory -Force -Path $REPORT_DIR    | Out-Null
New-Item -ItemType Directory -Force -Path $SCREENSHOTS   | Out-Null
New-Item -ItemType Directory -Force -Path $LOGCAT_DIR    | Out-Null

# ============================================================
# STAGE A: Emulator Check
# ============================================================
if (-not $SkipEmulatorCheck) {
    Cyan "`n[A] Checking emulator..."

    $devices = & $ADB devices 2>&1 | Select-String $DEVICE
    if (-not $devices) {
        Yellow "Emulator $DEVICE not found. Attempting to start Chaika_API34..."
        $emulatorExe = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"
        if (Test-Path $emulatorExe) {
            Start-Process -FilePath $emulatorExe -ArgumentList "-avd Chaika_API34 -no-snapshot-load" -WindowStyle Minimized
            Yellow "Waiting 60s for emulator boot..."
            Start-Sleep -Seconds 60
        } else {
            Red "Emulator binary not found. Start emulator manually."
            exit 1
        }
    }

    # Wait for boot_completed
    $bootAttempts = 0
    do {
        $boot = & $ADB -s $DEVICE shell getprop sys.boot_completed 2>&1
        $bootAttempts++
        if ($boot -notmatch "1") {
            Yellow "Waiting for boot... attempt $bootAttempts/20"
            Start-Sleep -Seconds 5
        }
    } while ($boot -notmatch "1" -and $bootAttempts -lt 20)

    if ($boot -notmatch "1") {
        Red "ERROR: Emulator did not boot after 100s. Aborting."
        exit 1
    }
    Green "Emulator ready."
}

# ---- Verify app is installed ----
Cyan "`n[A] Checking app installation..."
$pkgCheck = & $ADB -s $DEVICE shell pm list packages 2>&1 | Select-String $APP_ID
if (-not $pkgCheck) {
    Red "ERROR: $APP_ID not installed on $DEVICE"
    Red "Run: npx expo run:android --device $DEVICE"
    exit 1
}
$verName = & $ADB -s $DEVICE shell dumpsys package $APP_ID 2>&1 | Select-String "versionName" | Select-Object -First 1
Green "App installed: $verName"

# ---- Clear logcat buffer ----
if (-not $SkipLogcat) {
    & $ADB -s $DEVICE logcat -c 2>&1 | Out-Null
    Green "Logcat buffer cleared."
}

# ============================================================
# STAGE B: Start logcat collector in background
# ============================================================
$logcatJob = $null
if (-not $SkipLogcat) {
    Cyan "`n[B] Starting logcat collector..."
    $logcatJob = Start-Job -ScriptBlock {
        param($adb, $device, $outFile)
        & $adb -s $device logcat -v threadtime 2>&1 | Out-File -FilePath $outFile -Encoding utf8
    } -ArgumentList $ADB, $DEVICE, $LOGCAT_FILE
    Green "Logcat collecting to: $LOGCAT_FILE (job id: $($logcatJob.Id))"
}

# ============================================================
# STAGE C: Run Maestro Flows
# ============================================================
Cyan "`n[C] Running Maestro flows..."

# Collect flow files
if ($FlowFilter) {
    $flowFiles = Get-ChildItem -Path $FLOWS -Filter "*.yaml" -Recurse |
                 Where-Object { $_.Name -like "*$FlowFilter*" } |
                 Sort-Object FullName
    Cyan "Filter: $FlowFilter — found $($flowFiles.Count) flows"
} else {
    $flowFiles = Get-ChildItem -Path $FLOWS -Filter "*.yaml" -Recurse |
                 Sort-Object FullName
    Cyan "Running all $($flowFiles.Count) flows"
}

$results = @()
$passCount = 0
$failCount = 0
$flowIndex = 0

foreach ($flow in $flowFiles) {
    $flowIndex++
    $flowName = $flow.Name -replace "\.yaml$", ""
    $flowRel  = $flow.FullName.Replace($ROOT, "").TrimStart("\")

    Cyan "`n--- [$flowIndex/$($flowFiles.Count)] $flowName ---"

    # Screenshots go into report dir
    $flowScreenshotDir = "$SCREENSHOTS\$flowName"
    New-Item -ItemType Directory -Force -Path $flowScreenshotDir | Out-Null

    # Run Maestro
    $startTime = Get-Date
    $maestroOut = & $MAESTRO test --device $DEVICE --format junit `
        --output "$REPORT_DIR\junit_$flowName.xml" `
        $flow.FullName 2>&1

    $exitCode = $LASTEXITCODE
    $duration = [int](New-TimeSpan -Start $startTime -End (Get-Date)).TotalSeconds

    if ($exitCode -eq 0) {
        Green "PASS ($duration s): $flowName"
        $passCount++
        $status = "PASS"
    } else {
        Red "FAIL ($duration s): $flowName"
        $failCount++
        $status = "FAIL"
        # Print relevant output
        $maestroOut | Where-Object { $_ -match "Error|fail|FAIL|Exception" } | ForEach-Object { Yellow "  $_" }
    }

    # Move any screenshots Maestro created
    $tmpScreenshots = Get-ChildItem -Path $ROOT -Filter "*.png" -ErrorAction SilentlyContinue |
                      Where-Object { $_.LastWriteTime -gt $startTime }
    foreach ($ss in $tmpScreenshots) {
        Move-Item -Path $ss.FullName -Destination $flowScreenshotDir -Force -ErrorAction SilentlyContinue
    }

    $results += [PSCustomObject]@{
        Index    = $flowIndex
        Name     = $flowName
        Status   = $status
        Duration = $duration
        ExitCode = $exitCode
        Output   = ($maestroOut -join "`n") | Select-Object -First 50
    }
}

# ============================================================
# STAGE D: Stop logcat and filter for bugs
# ============================================================
Cyan "`n[D] Stopping logcat and analyzing..."

if ($logcatJob) {
    Stop-Job -Job $logcatJob -ErrorAction SilentlyContinue
    Receive-Job -Job $logcatJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job -Job $logcatJob -ErrorAction SilentlyContinue
}

# Wait a moment for file to flush
Start-Sleep -Seconds 2

# Also grab a final logcat dump
$finalLogcat = & $ADB -s $DEVICE logcat -d -v threadtime 2>&1
$finalLogcat | Out-File -FilePath "$LOGCAT_DIR\logcat_final_$TIMESTAMP.txt" -Encoding utf8

# ---- Filter for app-specific issues ----
$bugPatterns = @(
    "FATAL EXCEPTION",
    "AndroidRuntime.*FATAL",
    "Process: $APP_ID",
    "ANR in $APP_ID",
    "ReactNativeJS.*Error",
    "ReactNativeJS.*TypeError",
    "ReactNativeJS.*ReferenceError",
    "ReactNativeJS.*Warning.*SerializableState",
    "Unable to resolve module",
    "invariant violation",
    "Invariant Violation",
    "E/ReactNativeJS",
    "WARN.*ReactNativeJS",
    "NullPointerException",
    "Application crashed"
)

$bugs = @()
if (Test-Path $LOGCAT_FILE) {
    $logLines = Get-Content $LOGCAT_FILE -ErrorAction SilentlyContinue
} else {
    $logLines = $finalLogcat
}

foreach ($pattern in $bugPatterns) {
    $matches = $logLines | Select-String -Pattern $pattern -AllMatches
    foreach ($match in $matches) {
        $bugs += [PSCustomObject]@{
            Pattern  = $pattern
            Line     = $match.Line.Trim()
            LineNum  = $match.LineNumber
        }
    }
}

# Deduplicate
$bugs = $bugs | Sort-Object Line -Unique

Green "Logcat analysis complete. Found $($bugs.Count) potential issues."

# ============================================================
# STAGE E: Classify bugs by severity
# ============================================================
function Get-Severity($line) {
    if ($line -match "FATAL|ANR|NullPointerException|Application crashed") { return "CRITICAL" }
    if ($line -match "TypeError|ReferenceError|Invariant Violation|Unable to resolve module") { return "HIGH" }
    if ($line -match "E/ReactNativeJS|WARN.*SerializableState") { return "MEDIUM" }
    return "LOW"
}

$classifiedBugs = $bugs | ForEach-Object {
    [PSCustomObject]@{
        Severity = Get-Severity $_.Line
        Pattern  = $_.Pattern
        Line     = $_.Line
    }
}

$criticalBugs = $classifiedBugs | Where-Object { $_.Severity -eq "CRITICAL" }
$highBugs     = $classifiedBugs | Where-Object { $_.Severity -eq "HIGH" }
$mediumBugs   = $classifiedBugs | Where-Object { $_.Severity -eq "MEDIUM" }
$lowBugs      = $classifiedBugs | Where-Object { $_.Severity -eq "LOW" }

# ============================================================
# STAGE F: Write Report
# ============================================================
Cyan "`n[F] Writing report..."

$totalFlows = $passCount + $failCount
$passRate   = if ($totalFlows -gt 0) { [math]::Round($passCount / $totalFlows * 100, 1) } else { 0 }

# Determine Go/No-Go
if ($criticalBugs.Count -eq 0 -and $failCount -eq 0) {
    $verdict = "GO - Ready for release"
    $verdictColor = "Green"
} elseif ($criticalBugs.Count -eq 0 -and $failCount -le 3) {
    $verdict = "CONDITIONAL GO - Minor issues, review before release"
    $verdictColor = "Yellow"
} else {
    $verdict = "NO-GO - Critical issues must be resolved"
    $verdictColor = "Red"
}

$reportContent = @"
# Chaika Mobile E2E Test Report
**Generated:** $TIMESTAMP
**App Version:** 1.1.29
**Device:** Android Emulator ($DEVICE)
**App ID:** $APP_ID

---

## Summary

| Metric | Value |
|--------|-------|
| Total Flows | $totalFlows |
| Passed | $passCount |
| Failed | $failCount |
| Pass Rate | $passRate% |
| Critical Bugs | $($criticalBugs.Count) |
| High Bugs | $($highBugs.Count) |
| Medium Bugs | $($mediumBugs.Count) |
| Low Bugs | $($lowBugs.Count) |

## Release Verdict: $verdict

---

## Flow Results

| # | Flow | Status | Duration |
|---|------|--------|----------|
$(foreach ($r in $results) { "| $($r.Index) | $($r.Name) | $($r.Status) | $($r.Duration)s |" })

---

## Bugs Found in Logcat

### CRITICAL ($($criticalBugs.Count))
$(if ($criticalBugs.Count -eq 0) { "_None_" } else { $criticalBugs | ForEach-Object { "- ``$($_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)))``" } })

### HIGH ($($highBugs.Count))
$(if ($highBugs.Count -eq 0) { "_None_" } else { $highBugs | Select-Object -First 20 | ForEach-Object { "- ``$($_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)))``" } })

### MEDIUM ($($mediumBugs.Count))
$(if ($mediumBugs.Count -eq 0) { "_None_" } else { $mediumBugs | Select-Object -First 10 | ForEach-Object { "- ``$($_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)))``" } })

### LOW ($($lowBugs.Count))
$(if ($lowBugs.Count -eq 0) { "_None_" } else { $lowBugs | Select-Object -First 5 | ForEach-Object { "- ``$($_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)))``" } })

---

## Artifacts
- Screenshots: ``$SCREENSHOTS``
- Logcat: ``$LOGCAT_FILE``
- JUnit XMLs: ``$REPORT_DIR\junit_*.xml``
"@

$reportContent | Out-File -FilePath $REPORT_FILE -Encoding utf8

# Summary to console
"$TIMESTAMP | Passed=$passCount Failed=$failCount Bugs=$($bugs.Count) Verdict=$verdict" |
    Out-File -FilePath $SUMMARY_FILE -Encoding utf8

# ============================================================
# Final Console Output
# ============================================================
Cyan "`n================================================================"
if ($verdictColor -eq "Green")  { Green  "VERDICT: $verdict" }
if ($verdictColor -eq "Yellow") { Yellow "VERDICT: $verdict" }
if ($verdictColor -eq "Red")    { Red    "VERDICT: $verdict" }
Cyan "----------------------------------------------------------------"
Green  "Flows: $passCount passed / $failCount failed ($passRate%)"
if ($criticalBugs.Count -gt 0) { Red    "Critical bugs: $($criticalBugs.Count)" }
if ($highBugs.Count -gt 0)     { Yellow "High bugs: $($highBugs.Count)" }
if ($mediumBugs.Count -gt 0)   { Yellow "Medium bugs: $($mediumBugs.Count)" }
Cyan "Report: $REPORT_FILE"
Cyan "Logcat: $LOGCAT_FILE"
Cyan "================================================================"
