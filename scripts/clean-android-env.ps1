param(
  [string]$ProjectRoot = "C:\Users\cesar\Proyectos\kontaa",
  [switch]$Deep
)

$ErrorActionPreference = "Stop"

function Remove-IfExists {
  param([string]$PathToRemove)
  if (Test-Path $PathToRemove) {
    Write-Host "Removing: $PathToRemove"
    Remove-Item -Path $PathToRemove -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "== Android/Expo cleanup started =="
Write-Host "Project root: $ProjectRoot"

if (-not (Test-Path $ProjectRoot)) {
  throw "Project root not found: $ProjectRoot"
}

Set-Location $ProjectRoot

# 1) Stop Gradle daemons
if (Test-Path "$ProjectRoot\android\gradlew.bat") {
  Write-Host "Stopping Gradle daemons..."
  & "$ProjectRoot\android\gradlew.bat" --stop | Out-Null
}

# 2) Minimal safe cleanup
Remove-IfExists "$ProjectRoot\android\.gradle"
Remove-IfExists "$ProjectRoot\android\build"
Remove-IfExists "$ProjectRoot\android\app\build"
Remove-IfExists "$ProjectRoot\node_modules"
Remove-IfExists "$ProjectRoot\.expo"

# Optional deeper cleanup
if ($Deep) {
  Write-Host "Deep cleanup enabled"
  Remove-IfExists "$env:USERPROFILE\.gradle\caches"
  Remove-IfExists "$env:LOCALAPPDATA\Temp\metro-cache"
  Remove-IfExists "$env:LOCALAPPDATA\Temp\haste-map-*"
}

# 3) Validate/repair NDK used by Expo updates
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$ndkVersion = "27.0.12077973"
$ndkPath = Join-Path $sdkRoot "ndk\$ndkVersion"
$sourceProps = Join-Path $ndkPath "source.properties"

if (-not (Test-Path $sourceProps)) {
  Write-Host "NDK $ndkVersion looks incomplete. Attempting repair with sdkmanager..."

  $sdkManagerCandidates = @(
    (Join-Path $sdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"),
    (Join-Path $sdkRoot "cmdline-tools\bin\sdkmanager.bat"),
    (Join-Path $sdkRoot "tools\bin\sdkmanager.bat")
  )

  $sdkManager = $sdkManagerCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

  if ($null -eq $sdkManager) {
    Write-Warning "sdkmanager.bat not found. Open Android Studio > SDK Manager > install/reinstall NDK $ndkVersion"
  } else {
    & $sdkManager "ndk;$ndkVersion"
  }
}

# 4) Reinstall JS deps and clean android project
Write-Host "Installing dependencies..."
npm install

if (Test-Path "$ProjectRoot\android\gradlew.bat") {
  Write-Host "Running Gradle clean..."
  & "$ProjectRoot\android\gradlew.bat" clean
}

Write-Host "== Cleanup completed =="
Write-Host "Now run: npx expo run:android"
