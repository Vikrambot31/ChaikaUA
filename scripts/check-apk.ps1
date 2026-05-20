param(
  [string]$ApkPath = "",
  [int]$MinBundleSizeKB = 200
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Find-LatestApk {
  $candidates = @(Get-ChildItem -Path "android/app/build/outputs/apk" -Filter "*.apk" -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending)
  if ($candidates.Count -eq 0) {
    throw "APK not found. Build first: cd android; .\gradlew.bat assembleDebug"
  }
  return $candidates[0].FullName
}

function Get-ZipEntries {
  param([string]$Path)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    return @($zip.Entries)
  } finally {
    $zip.Dispose()
  }
}

if ([string]::IsNullOrWhiteSpace($ApkPath)) {
  $ApkPath = Find-LatestApk
}

if (!(Test-Path $ApkPath)) {
  throw "APK path does not exist: $ApkPath"
}

$manifestPath = "android/app/src/main/AndroidManifest.xml"
if (!(Test-Path $manifestPath)) {
  throw "AndroidManifest not found: $manifestPath"
}

$entries = Get-ZipEntries -Path $ApkPath
$bundleEntry = $entries | Where-Object { $_.FullName -eq "assets/index.android.bundle" } | Select-Object -First 1
$assetEntries = $entries | Where-Object { $_.FullName -like "assets/*" }
$libEntries = $entries | Where-Object { $_.FullName -like "lib/*" }

[xml]$manifestXml = Get-Content $manifestPath -Raw
$permissionNodes = $manifestXml.manifest.'uses-permission'
$permissions = @()
foreach ($node in $permissionNodes) {
  $perm = $node.GetAttribute("android:name")
  if (![string]::IsNullOrWhiteSpace($perm)) {
    $permissions += $perm
  }
}

$requiredPermissions = @(
  "android.permission.INTERNET",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.CAMERA"
)
$missingPermissions = @($requiredPermissions | Where-Object { $_ -notin $permissions })

$googleServicesPath = "android/app/google-services.json"
$googleServicesExists = Test-Path $googleServicesPath
$apkSizeMB = [Math]::Round((Get-Item $ApkPath).Length / 1MB, 2)
$bundleSizeKB = if ($bundleEntry) { [Math]::Round($bundleEntry.Length / 1KB, 2) } else { 0 }

Write-Host "APK CHECK REPORT"
Write-Host "APK: $ApkPath"
Write-Host "APK size: $apkSizeMB MB"
Write-Host "google-services.json: $googleServicesExists"
Write-Host "assets/* count in APK: $($assetEntries.Count)"
Write-Host "lib/* count in APK: $($libEntries.Count)"
Write-Host "permissions declared: $($permissions.Count)"
Write-Host ""

if ($bundleEntry) {
  Write-Host "PASS bundle exists: assets/index.android.bundle ($bundleSizeKB KB)"
} else {
  Write-Host "FAIL bundle missing: assets/index.android.bundle"
}

if ($bundleEntry -and $bundleSizeKB -lt $MinBundleSizeKB) {
  Write-Host "FAIL bundle too small (< $MinBundleSizeKB KB)"
} elseif ($bundleEntry) {
  Write-Host "PASS bundle size >= $MinBundleSizeKB KB"
}

if ($assetEntries.Count -gt 0) {
  Write-Host "PASS assets embedded"
} else {
  Write-Host "FAIL assets not embedded"
}

if (@($missingPermissions).Count -eq 0) {
  Write-Host "PASS required permissions present"
} else {
  Write-Host "FAIL missing permissions: $($missingPermissions -join ', ')"
}

if ($googleServicesExists) {
  Write-Host "PASS google-services.json exists"
} else {
  Write-Host "FAIL google-services.json missing at android/app/google-services.json"
}

if ($apkSizeMB -gt 50) {
  Write-Host "WARN release target is < 50MB; current file is $apkSizeMB MB"
}
