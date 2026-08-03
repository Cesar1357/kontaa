param(
  [string]$Message = "Update preview"
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$env:CI = "1"
Write-Host "Publishing EAS update to branch: preview"
Write-Host "Platform: android"
Write-Host "Message: $Message"

npx eas update --branch preview --platform android --message "$Message"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
