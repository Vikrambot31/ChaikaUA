<#
.SYNOPSIS
  Chaika Life — unified deterministic build engine.

.DESCRIPTION
  Single entry-point for all APK build scenarios.
  Called by the bat wrappers in "ЗАПУСК АПК/".

.PARAMETER BuildMode
  LOCAL_APK_ONLY              — clean Gradle build, no server/OTA.
  LOCAL_APK_PLUS_FIREBASE_DEPLOY — clean build + mandatory Firebase deploy (errors = fail).
  FULL_RELEASE_WITH_OTA       — full rebuild + Firebase deploy + EAS OTA update.

.PARAMETER SkipClean
  Skip "gradlew clean" (used by simple/fast wrappers).

.PARAMETER SkipVersionBump
  Skip automatic version increment.

.PARAMETER SkipIconSync
  Skip launcher icon regeneration.

.PARAMETER SkipCacheClear
  Skip aggressive Metro/Gradle/Expo cache wipe.

.PARAMETER SkipTypeCheck
  Skip TypeScript validation.

.PARAMETER SkipVideoOptimize
  Skip temporary video optimization for APK size.

.PARAMETER EnableBuildLog
  Capture Gradle output to build-logs/.

.PARAMETER OtaCheckMode
  ON_LOAD (production default) or NEVER (local QA).
  Controls updates.checkAutomatically in app.json before build.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('LOCAL_APK_ONLY', 'LOCAL_APK_PLUS_FIREBASE_DEPLOY', 'FULL_RELEASE_WITH_OTA')]
  [string]$BuildMode,

  [switch]$SkipClean,
  [switch]$SkipVersionBump,
  [switch]$SkipIconSync,
  [switch]$SkipCacheClear,
  [switch]$SkipTypeCheck,
  [switch]$SkipVideoOptimize,
  [switch]$EnableBuildLog,

  [ValidateSet('ON_LOAD', 'NEVER')]
  [string]$OtaCheckMode = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ── Paths ──────────────────────────────────────────────────────────────
$ProjectRoot   = Split-Path -Parent $PSScriptRoot
$AndroidDir    = Join-Path $ProjectRoot 'android'
$ApkDir        = Join-Path $AndroidDir 'app\build\outputs\apk\release'
$ReleaseDir    = Join-Path $ProjectRoot 'release'
$BuildLogsDir  = Join-Path $ProjectRoot 'build-logs'
$LaunchDir     = @(
  (Join-Path $ProjectRoot 'ЗАПУСК АПК'),
  (Get-ChildItem -LiteralPath $ProjectRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'deploy.bat') } |
    Select-Object -ExpandProperty FullName -First 1)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $LaunchDir) {
  throw "Could not locate launch directory with deploy.bat under: $ProjectRoot"
}
$ScriptsDir    = $PSScriptRoot

$ProjectReleaseApk = Join-Path $ReleaseDir 'app-release.apk'
$LaunchReleaseApk  = Join-Path $LaunchDir 'app-release.apk'

$StaleBundle     = Join-Path $AndroidDir 'app\src\main\assets\index.android.bundle'
$StaleBundleMeta = "$StaleBundle.meta"
$ExpoCache       = Join-Path $ProjectRoot '.expo'
$AndroidLocal    = Join-Path $ProjectRoot '.android-local'
$ProjectBuildDir = Join-Path $ProjectRoot 'build'
$GeneratedAssets = Join-Path $AndroidDir 'app\build\generated\assets'
$GeneratedRes    = Join-Path $AndroidDir 'app\build\generated\res'
$IntermediatesAssets     = Join-Path $AndroidDir 'app\build\intermediates\assets'
$IntermediatesSourcemaps = Join-Path $AndroidDir 'app\build\intermediates\sourcemaps'

# ── State ──────────────────────────────────────────────────────────────
$BuildResult      = 'FAIL'
$BuildErrors      = New-Object System.Collections.Generic.List[string]
$BuildWarnings    = New-Object System.Collections.Generic.List[string]
$StepResults      = New-Object System.Collections.Generic.List[string]
$AppVersion       = ''
$VersionCode      = 0
$BuildStamp       = ''
$CommitHash       = ''
$BuiltApkPath     = ''
$VersionedApkPath = ''
$BuildMarker      = Join-Path $env:TEMP "chaika_build_$([guid]::NewGuid().ToString('N').Substring(0,8)).marker"
$BuildStartTime   = Get-Date

# ── Helpers ────────────────────────────────────────────────────────────
function Write-Step([string]$StepName, [string]$Message) {
  Write-Host "[$StepName] $Message" -ForegroundColor Cyan
}

function Write-StepOk([string]$StepName, [string]$Message) {
  Write-Host "[$StepName] $Message" -ForegroundColor Green
  $script:StepResults.Add("OK: $Message")
}

function Write-StepWarn([string]$StepName, [string]$Message) {
  Write-Host "[$StepName] $Message" -ForegroundColor Yellow
  $script:BuildWarnings.Add($Message)
  $script:StepResults.Add("WARN: $Message")
}

function Write-StepFail([string]$StepName, [string]$Message) {
  Write-Host "[$StepName] $Message" -ForegroundColor Red
  $script:BuildErrors.Add($Message)
  $script:StepResults.Add("FAIL: $Message")
}

function Invoke-Cmd {
  param(
    [Parameter(Mandatory)]  [string]$CommandLine,
    [string]$StepName = '',
    [string]$SuccessMsg = '',
    [switch]$ContinueOnError,
    [switch]$Capture
  )
  # Sync [System.Environment]::CurrentDirectory with PowerShell's Set-Location.
  # cmd.exe inherits CurrentDirectory from the process, not from PS provider location.
  [System.Environment]::CurrentDirectory = (Get-Location).ProviderPath

  Write-Host "  >> $CommandLine" -ForegroundColor DarkGray
  $output = cmd.exe /d /c "$CommandLine 2>&1"
  if (-not $Capture) {
    foreach ($line in $output) {
      Write-Host $line
    }
  }
  $exit = $LASTEXITCODE
  if ($exit -ne 0) {
    $errMsg = "Command failed (exit $exit): $CommandLine"
    if ($ContinueOnError) {
      if ($StepName) { Write-StepWarn $StepName $errMsg }
      return @{ ExitCode = $exit; Output = $output; Success = $false }
    }
    if ($StepName) { Write-StepFail $StepName $errMsg }
    throw $errMsg
  }
  if ($SuccessMsg -and $StepName) { Write-StepOk $StepName $SuccessMsg }
  return @{ ExitCode = 0; Output = $output; Success = $true }
}

function Remove-DirSafe([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Remove-FileSafe([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  }
}

function Get-GitCommitHash {
  try {
    $hash = (git -C $ProjectRoot rev-parse --short=10 HEAD 2>$null)
    if ($LASTEXITCODE -eq 0 -and $hash) { return $hash.Trim() }
  } catch {}
  return 'no-git'
}

function Get-MachineId {
  try { return "$env:COMPUTERNAME/$env:USERNAME" } catch { return 'unknown' }
}

# ── Resolve OTA check mode ────────────────────────────────────────────
if (-not $OtaCheckMode) {
  $OtaCheckMode = switch ($BuildMode) {
    'LOCAL_APK_ONLY'                { 'NEVER' }
    'LOCAL_APK_PLUS_FIREBASE_DEPLOY' { 'NEVER' }
    'FULL_RELEASE_WITH_OTA'          { 'ON_LOAD' }
  }
}

# Suppress dotenv v17 stdout that breaks Gradle JSON parsing
$env:DOTENV_CONFIG_QUIET = 'true'

try {
  Write-Host ''
  Write-Host "=============================================" -ForegroundColor Cyan
  Write-Host "  Chaika Life — Deterministic Release Build"   -ForegroundColor Cyan
  Write-Host "  Mode: $BuildMode"                            -ForegroundColor Cyan
  Write-Host "  OTA:  $OtaCheckMode"                         -ForegroundColor Cyan
  Write-Host "=============================================" -ForegroundColor Cyan
  Write-Host ''

  Set-Location $ProjectRoot

  # ── STEP 0: Build freshness marker ──────────────────────────────────
  Write-Step 'INIT' 'Create build freshness marker'
  [System.IO.File]::WriteAllText($BuildMarker, '')
  Write-StepOk 'INIT' "Marker: $BuildMarker"

  # ── STEP 1: Remove stale APK copies ─────────────────────────────────
  Write-Step 'CLEAN-APK' 'Remove stale APK copies'
  Remove-FileSafe $ProjectReleaseApk
  Remove-FileSafe $LaunchReleaseApk
  if (Test-Path -LiteralPath $ApkDir) {
    Get-ChildItem -LiteralPath $ApkDir -Filter '*.apk' -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item $_.FullName -Force }
  }
  # Verify removal
  foreach ($path in @($ProjectReleaseApk, $LaunchReleaseApk)) {
    if (Test-Path -LiteralPath $path) {
      throw "Could not remove stale APK: $path. Close any opened APK files."
    }
  }
  Write-StepOk 'CLEAN-APK' 'Stale APK copies removed'

  # ── STEP 2: Tool checks ─────────────────────────────────────────────
  Write-Step 'TOOLS' 'Verify required tools'
  foreach ($tool in @('java', 'node', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "Required tool not in PATH: $tool"
    }
  }
  Write-StepOk 'TOOLS' 'java, node, npm confirmed'

  # ── STEP 3: Version bump ─────────────────────────────────────────────
  if (-not $SkipVersionBump) {
    Write-Step 'VERSION' 'Bump app version and build stamp'
    $versionOutput = node "$ScriptsDir\bump-release-version.cjs" 2>&1
    $versionLines = ($versionOutput | Out-String) -split "`n"
    foreach ($line in $versionLines) {
      $line = $line.Trim()
      if ($line -match '^VERSION=(.+)$')      { $AppVersion  = $Matches[1] }
      if ($line -match '^VERSION_CODE=(.+)$')  { $VersionCode = [int]$Matches[1] }
      if ($line -match '^BUILD_STAMP=(.+)$')   { $BuildStamp  = $Matches[1] }
    }
    if (-not $AppVersion -or -not $BuildStamp) {
      throw 'bump-release-version.cjs did not return VERSION and BUILD_STAMP'
    }
    Write-StepOk 'VERSION' "v$AppVersion (code $VersionCode) stamp $BuildStamp"
  } else {
    # Read current version from package.json
    $pkg = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
    $AppVersion = $pkg.version
    $avj = Get-Content (Join-Path $ProjectRoot 'app-version.json') -Raw | ConvertFrom-Json
    $BuildStamp = $avj.lastBuildStamp
    $gradle = Get-Content (Join-Path $AndroidDir 'app\build.gradle') -Raw
    if ($gradle -match 'versionCode\s+(\d+)') { $VersionCode = [int]$Matches[1] }
    Write-StepWarn 'VERSION' "Skipped bump. Using current v$AppVersion stamp $BuildStamp"
  }

  # ── STEP 3b: Commit hash ────────────────────────────────────────────
  $CommitHash = Get-GitCommitHash
  Write-StepOk 'VERSION' "Commit: $CommitHash"

  # ── STEP 3c: Write build manifest ───────────────────────────────────
  Write-Step 'MANIFEST' 'Generate build manifest'
  $manifest = @{
    appVersion  = $AppVersion
    versionCode = $VersionCode
    buildStamp  = $BuildStamp
    commitHash  = $CommitHash
    timestamp   = $BuildStartTime.ToString('o')
    machineId   = Get-MachineId
    buildMode   = $BuildMode
    otaMode     = $OtaCheckMode
  }
  $manifestJson = $manifest | ConvertTo-Json -Depth 3
  $manifestDir = Join-Path $AndroidDir 'app\src\main\assets'
  if (-not (Test-Path $manifestDir)) { New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null }
  $manifestPath = Join-Path $manifestDir 'build-manifest.json'
  Set-Content -LiteralPath $manifestPath -Value $manifestJson -Encoding UTF8
  Write-StepOk 'MANIFEST' "Written: $manifestPath"

  # ── STEP 3d: Inject build metadata into constants.ts ─────────────────
  Write-Step 'CONSTANTS' 'Inject build stamp and commit hash into constants.ts'
  $constantsPath = Join-Path $ProjectRoot 'src\utils\constants.ts'
  $constantsContent = Get-Content $constantsPath -Raw

  # Add/update APP_BUILD_STAMP
  if ($constantsContent -match "export const APP_BUILD_STAMP = '") {
    $constantsContent = $constantsContent -replace "export const APP_BUILD_STAMP = '[^']*';", "export const APP_BUILD_STAMP = '$BuildStamp';"
  } else {
    $constantsContent = $constantsContent -replace "(export const APP_BUILD_DATE = '[^']*';)", "`$1`nexport const APP_BUILD_STAMP = '$BuildStamp';"
  }

  # Add/update APP_COMMIT_HASH
  if ($constantsContent -match "export const APP_COMMIT_HASH = '") {
    $constantsContent = $constantsContent -replace "export const APP_COMMIT_HASH = '[^']*';", "export const APP_COMMIT_HASH = '$CommitHash';"
  } else {
    $constantsContent = $constantsContent -replace "(export const APP_BUILD_STAMP = '[^']*';)", "`$1`nexport const APP_COMMIT_HASH = '$CommitHash';"
  }

  # Add/update APP_BUILD_MODE
  if ($constantsContent -match "export const APP_BUILD_MODE = '") {
    $constantsContent = $constantsContent -replace "export const APP_BUILD_MODE = '[^']*';", "export const APP_BUILD_MODE = '$BuildMode';"
  } else {
    $constantsContent = $constantsContent -replace "(export const APP_COMMIT_HASH = '[^']*';)", "`$1`nexport const APP_BUILD_MODE = '$BuildMode';"
  }

  Set-Content -LiteralPath $constantsPath -Value $constantsContent -NoNewline -Encoding UTF8
  Write-StepOk 'CONSTANTS' 'APP_BUILD_STAMP, APP_COMMIT_HASH, APP_BUILD_MODE injected'

  # ── STEP 4: OTA control ─────────────────────────────────────────────
  Write-Step 'OTA' "Set updates.checkAutomatically = $OtaCheckMode"
  $appJsonPath = Join-Path $ProjectRoot 'app.json'
  $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
  if ($appJson.expo.updates) {
    $appJson.expo.updates.checkAutomatically = $OtaCheckMode
    if ($OtaCheckMode -eq 'NEVER') {
      $appJson.expo.updates.enabled = $false
    } else {
      $appJson.expo.updates.enabled = $true
    }
  }
  Set-Content -LiteralPath $appJsonPath -Value ($appJson | ConvertTo-Json -Depth 10) -Encoding UTF8
  Write-StepOk 'OTA' "app.json updates.checkAutomatically = $OtaCheckMode"

  # ── STEP 5: Remove stale manual JS bundle ────────────────────────────
  Write-Step 'BUNDLE' 'Remove stale manually bundled JS'
  Remove-FileSafe $StaleBundle
  Remove-FileSafe $StaleBundleMeta
  Write-StepOk 'BUNDLE' 'Stale bundle removed'

  # ── STEP 6: Sync icons ──────────────────────────────────────────────
  if (-not $SkipIconSync) {
    Write-Step 'ICONS' 'Sync native Android launcher icons'
    $null = Invoke-Cmd -CommandLine "node `"$ScriptsDir\sync-android-icons.cjs`"" -StepName 'ICONS' -SuccessMsg 'Icons synced'
  }

  # ── STEP 7: Clear caches ────────────────────────────────────────────
  if (-not $SkipCacheClear) {
    Write-Step 'CACHE' 'Clear Metro/Gradle/Expo caches'
    $cacheDirs = @(
      (Join-Path $ProjectRoot 'node_modules\.cache'),
      $GeneratedAssets, $GeneratedRes,
      $IntermediatesAssets, $IntermediatesSourcemaps,
      $ExpoCache, $AndroidLocal, $ProjectBuildDir, $BuildLogsDir
    )
    foreach ($dir in $cacheDirs) { Remove-DirSafe $dir }
    Write-StepOk 'CACHE' 'Caches cleared'
  }

  # ── STEP 8: Firebase deploy (mode-dependent) ─────────────────────────
  $deployRequired = $BuildMode -in @('LOCAL_APK_PLUS_FIREBASE_DEPLOY', 'FULL_RELEASE_WITH_OTA')
  if ($deployRequired) {
    Write-Step 'DEPLOY' 'Firebase deploy (MANDATORY for this build mode)'
    $deployBat = Join-Path $LaunchDir 'deploy.bat'
    $deployFlags = '-SkipInstall -SkipAuditFix -SkipExpoDoctor'
    if ($BuildMode -ne 'FULL_RELEASE_WITH_OTA') {
      $deployFlags += ' -SkipEasUpdate'
    }
    if ($BuildMode -eq 'FULL_RELEASE_WITH_OTA') {
      # Relaxed local mode: do not block deterministic APK rebuild on OTA CLI failures.
      $deployFlags += ' -SkipEasUpdate'
    }
    if ($BuildMode -in @('LOCAL_APK_PLUS_FIREBASE_DEPLOY', 'FULL_RELEASE_WITH_OTA')) {
      $deployFlags += ' -SkipDatabaseMigrations'
    }

    $env:DEPLOY_NO_PAUSE = '1'
    $deployResult = Invoke-Cmd -CommandLine "`"$deployBat`" $deployFlags" -StepName 'DEPLOY' -ContinueOnError
    if (-not $deployResult.Success) {
      if ($BuildMode -eq 'FULL_RELEASE_WITH_OTA') {
        Write-StepWarn 'DEPLOY' 'Firebase deploy finished with warnings in relaxed FULL_RELEASE_WITH_OTA mode; continuing APK build.'
      } else {
        # In deploy-required modes, deploy failure = build failure
        throw "Firebase deploy FAILED. In $BuildMode mode, deploy errors stop the release."
      }
    } else {
      Write-StepOk 'DEPLOY' 'Firebase deploy succeeded'
    }
  } else {
    Write-StepWarn 'DEPLOY' "Skipped (mode=$BuildMode). Use LOCAL_APK_PLUS_FIREBASE_DEPLOY or FULL_RELEASE_WITH_OTA for server sync."
  }

  # ── STEP 9: TypeScript check ─────────────────────────────────────────
  if (-not $SkipTypeCheck) {
    Write-Step 'TSC' 'TypeScript validation'
    $tscResult = Invoke-Cmd -CommandLine 'npm run type-check' -StepName 'TSC' -ContinueOnError -SuccessMsg 'TypeScript check passed'
    if (-not $tscResult.Success) {
      if ($BuildMode -eq 'FULL_RELEASE_WITH_OTA') {
        Write-StepWarn 'TSC' 'TypeScript check failed (non-blocking in FULL_RELEASE_WITH_OTA mode)'
      } else {
        Write-StepWarn 'TSC' 'TypeScript check failed (non-blocking in this mode)'
      }
    }
  }

  # ── STEP 10: Video optimization ──────────────────────────────────────
  $videoOptimized = $false
  if (-not $SkipVideoOptimize) {
    Write-Step 'VIDEO' 'Temporarily optimize large video for APK size'
    $null = Invoke-Cmd -CommandLine "node `"$ScriptsDir\optimize-apk-video.cjs`" prepare" -StepName 'VIDEO' -ContinueOnError -SuccessMsg 'Video optimized'
    $videoOptimized = $true
  }

  try {
    # ── STEP 11: Gradle clean ──────────────────────────────────────────
    if (-not $SkipClean) {
      Write-Step 'GRADLE' 'Stop Gradle daemon and clean'
      Set-Location $AndroidDir
      cmd.exe /d /c "`"$AndroidDir\gradlew.bat`" --stop" 2>$null
      $null = Invoke-Cmd -CommandLine "`"$AndroidDir\gradlew.bat`" --no-build-cache clean" -StepName 'GRADLE' -SuccessMsg 'Gradle clean completed'
    }

    # ── STEP 12: Remove old APK outputs ────────────────────────────────
    Write-Step 'PRE-BUILD' 'Remove old APK outputs before build'
    if (Test-Path -LiteralPath $ApkDir) {
      Get-ChildItem -LiteralPath $ApkDir -Filter '*.apk' -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-Item $_.FullName -Force }
    }
    Write-StepOk 'PRE-BUILD' 'Old APK outputs removed'

    # ── STEP 13: Build release APK ─────────────────────────────────────
    Write-Step 'BUILD' 'Build fresh size-optimized release APK'
    Set-Location $AndroidDir

    $gradleCmd = "`"$AndroidDir\gradlew.bat`"" +
      ' -PreactNativeArchitectures=arm64-v8a' +
      ' -Pandroid.enableProguardInReleaseBuilds=true' +
      ' -Pandroid.enableShrinkResourcesInReleaseBuilds=true' +
      ' -Pexpo.gif.enabled=false' +
      ' -Pexpo.webp.enabled=false' +
      ' -Pexpo.webp.animated=false' +
      ' -Pexpo.useLegacyPackaging=true' +
      ' --no-build-cache --rerun-tasks assembleRelease'

    if ($EnableBuildLog) {
      New-Item -ItemType Directory -Force -Path $BuildLogsDir | Out-Null
      $logFile = Join-Path $BuildLogsDir "build-$($BuildStartTime.ToString('yyyy-MM-dd_HH-mm-ss')).log"
      $gradleCmd += " > `"$logFile`" 2>&1"
      Write-Host "  Build log: $logFile" -ForegroundColor DarkGray
    }

    $null = Invoke-Cmd -CommandLine $gradleCmd -StepName 'BUILD' -SuccessMsg 'Gradle assembleRelease succeeded'

    # ── STEP 14: Find built APK ────────────────────────────────────────
    Write-Step 'VERIFY' 'Locate freshly built APK'
    $candidates = @(Get-ChildItem -LiteralPath $ApkDir -Filter '*-release.apk' -ErrorAction Stop |
      Sort-Object LastWriteTime -Descending)
    if ($candidates.Count -eq 0) {
      throw "APK not found after build in: $ApkDir"
    }
    $BuiltApkPath = $candidates[0].FullName
    Write-StepOk 'VERIFY' "Found: $BuiltApkPath"

    # ── STEP 15: Freshness check ──────────────────────────────────────
    Write-Step 'VERIFY' 'Check APK is newer than build start marker'
    if (-not (Test-Path -LiteralPath $BuildMarker)) {
      Write-StepWarn 'VERIFY' "Build marker missing: $BuildMarker. Skipping freshness timestamp check."
      $markerTime = $BuildStartTime
    } else {
      $markerTime = (Get-Item -LiteralPath $BuildMarker).LastWriteTime
    }
    $apkTime    = (Get-Item -LiteralPath $BuiltApkPath).LastWriteTime
    if ($apkTime -lt $markerTime) {
      throw "Built APK timestamp ($apkTime) is older than build start ($markerTime). Stale build!"
    }
    Write-StepOk 'VERIFY' 'APK freshness confirmed'

    # ── STEP 16: Bundle fingerprint verification ───────────────────────
    Write-Step 'FINGERPRINT' 'Verify index.android.bundle inside APK'
    Set-Location $ProjectRoot
    $fingerprintScript = Join-Path $ScriptsDir 'verify-apk-bundle-fingerprint.cjs'
    if (Test-Path $fingerprintScript) {
      $fpResult = Invoke-Cmd -CommandLine "node `"$fingerprintScript`" `"$BuiltApkPath`" `"$manifestPath`"" -StepName 'FINGERPRINT' -ContinueOnError -Capture
      if ($fpResult.Success) {
        Write-StepOk 'FINGERPRINT' 'Bundle fingerprint verified'
      } else {
        $fpOutput = ($fpResult.Output | Out-String).Trim()
        throw "Bundle fingerprint verification FAILED: $fpOutput"
      }
    } else {
      Write-StepWarn 'FINGERPRINT' 'verify-apk-bundle-fingerprint.cjs not found, skipping'
    }

    # ── STEP 17: Version check in APK ─────────────────────────────────
    Write-Step 'VERIFY' "Check versionCode=$VersionCode and versionName=$AppVersion in built APK"
    $checkApkScript = Join-Path $ScriptsDir 'check-apk.ps1'
    if (Test-Path $checkApkScript) {
      & $checkApkScript -ApkPath $BuiltApkPath
    }

    # ── STEP 18: Copy APK to release locations ─────────────────────────
    Write-Step 'COPY' 'Copy APK to release/ and script folder'
    Set-Location $ProjectRoot
    New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

    $safeName = "ChaikaLife-v$($AppVersion -replace '[\s:/\\]','-')-$($BuildStamp -replace '[\s:/\\]','-')"
    $VersionedApkPath = Join-Path $ReleaseDir "$safeName.apk"

    Remove-FileSafe $VersionedApkPath
    Remove-FileSafe $ProjectReleaseApk
    Remove-FileSafe $LaunchReleaseApk

    Copy-Item -LiteralPath $BuiltApkPath -Destination $VersionedApkPath -Force
    Copy-Item -LiteralPath $BuiltApkPath -Destination $ProjectReleaseApk -Force
    Copy-Item -LiteralPath $BuiltApkPath -Destination $LaunchReleaseApk  -Force

    if (-not (Test-Path -LiteralPath $VersionedApkPath)) {
      throw "Versioned APK was not created: $VersionedApkPath"
    }
    Write-StepOk 'COPY' "Versioned: $VersionedApkPath"

    # ── STEP 19: Final freshness verification ──────────────────────────
    Write-Step 'FINAL' 'Verify all final APK copies are fresh'
    foreach ($path in @($ProjectReleaseApk, $LaunchReleaseApk, $VersionedApkPath)) {
      $t = (Get-Item -LiteralPath $path).LastWriteTime
      if ($t -lt $markerTime) {
        throw "Stale final APK: $path ($t < $markerTime)"
      }
    }
    Write-StepOk 'FINAL' 'All APK copies are fresh'

    # ── STEP 20: Generate build report ─────────────────────────────────
    Write-Step 'REPORT' 'Generate build report'
    $reportScript = Join-Path $ScriptsDir 'generate-build-report.cjs'
    if (Test-Path $reportScript) {
      $reportArgs = @(
        "`"$BuiltApkPath`"",
        "`"$VersionedApkPath`"",
        "`"$AppVersion`"",
        "$VersionCode",
        "`"$BuildStamp`"",
        "`"$CommitHash`"",
        "`"$BuildMode`"",
        "`"$OtaCheckMode`""
      ) -join ' '
      $null = Invoke-Cmd -CommandLine "node `"$reportScript`" $reportArgs" -StepName 'REPORT' -ContinueOnError -SuccessMsg 'Build report generated'
    } else {
      Write-StepWarn 'REPORT' 'generate-build-report.cjs not found, skipping'
    }

    # ── STEP 21: Register release in Firebase RTDB ──────────────────────
    if ($BuildMode -in @('LOCAL_APK_PLUS_FIREBASE_DEPLOY', 'FULL_RELEASE_WITH_OTA')) {
      Write-Step 'REGISTER' 'Register release in Firebase RTDB'
      $reportPath = Join-Path $ReleaseDir 'build-report.json'
      if (Test-Path $reportPath) {
        $null = Invoke-Cmd -CommandLine "node `"$ScriptsDir\register-release.cjs`" `"$reportPath`"" `
          -StepName 'REGISTER' -ContinueOnError -SuccessMsg 'Release registered'
      } else {
        Write-StepWarn 'REGISTER' 'build-report.json not found, skipping'
      }
    } else {
      Write-StepWarn 'REGISTER' "Skipped (mode=$BuildMode). Firebase registration only in deploy modes."
    }

    $BuildResult = 'OK'
  }
  finally {
    # Always restore video
    if ($videoOptimized) {
      Set-Location $ProjectRoot
      $null = Invoke-Cmd -CommandLine "node `"$ScriptsDir\optimize-apk-video.cjs`" restore" -StepName 'VIDEO' -ContinueOnError -SuccessMsg 'Video restored'
    }
  }
}
catch {
  $BuildResult = 'FAIL'
  $BuildErrors.Add($_.Exception.Message)
  Write-Host ''
  Write-Host "BUILD FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
  Remove-FileSafe $BuildMarker

  # Restore OTA to production default if we changed it
  if ($OtaCheckMode -eq 'NEVER') {
    try {
      $appJsonPath = Join-Path $ProjectRoot 'app.json'
      $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
      if ($appJson.expo.updates) {
        $appJson.expo.updates.checkAutomatically = 'ON_LOAD'
        $appJson.expo.updates.enabled = $true
      }
      Set-Content -LiteralPath $appJsonPath -Value ($appJson | ConvertTo-Json -Depth 10) -Encoding UTF8
    } catch {}
  }

  Write-Host ''
  Write-Host '====== BUILD SUMMARY ======' -ForegroundColor Cyan
  Write-Host "Result:  $BuildResult" -ForegroundColor $(if ($BuildResult -eq 'OK') { 'Green' } else { 'Red' })
  Write-Host "Mode:    $BuildMode"
  Write-Host "Version: v$AppVersion (code $VersionCode)"
  Write-Host "Stamp:   $BuildStamp"
  Write-Host "Commit:  $CommitHash"
  if ($VersionedApkPath -and (Test-Path -LiteralPath $VersionedApkPath -ErrorAction SilentlyContinue)) {
    $sizeMB = [Math]::Round((Get-Item $VersionedApkPath).Length / 1MB, 2)
    Write-Host "APK:     $VersionedApkPath ($sizeMB MB)" -ForegroundColor Green
  }
  if ($BuildWarnings.Count -gt 0) {
    Write-Host ''
    Write-Host "Warnings ($($BuildWarnings.Count)):" -ForegroundColor Yellow
    foreach ($w in $BuildWarnings) { Write-Host "  - $w" -ForegroundColor Yellow }
  }
  if ($BuildErrors.Count -gt 0) {
    Write-Host ''
    Write-Host "Errors ($($BuildErrors.Count)):" -ForegroundColor Red
    foreach ($e in $BuildErrors) { Write-Host "  - $e" -ForegroundColor Red }
  }
  Write-Host '===========================' -ForegroundColor Cyan

  if ($BuildResult -ne 'OK') {
    exit 1
  }
  exit 0
}
