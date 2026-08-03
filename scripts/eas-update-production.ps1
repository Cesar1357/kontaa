param(
  [string]$Message = "Update production"
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$env:CI = "1"
Write-Host "Publishing EAS update to branch: production"
Write-Host "Platform: android"
Write-Host "Message: $Message"

npx eas update --branch production --platform android --message "$Message"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
