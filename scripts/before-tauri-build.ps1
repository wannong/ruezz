# Tauri beforeBuildCommand (cwd is apps/desktop). Keep this a single -File so cmd.exe
# does not swallow the frontend build after a semicolon.
$ErrorActionPreference = "Stop"

$keyPath = Join-Path $PSScriptRoot "..\.cache\signing\ruezz.key"
if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and -not $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
  if (Test-Path $keyPath) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PATH = (Resolve-Path $keyPath).Path
    Write-Host "updater signing key: $env:TAURI_SIGNING_PRIVATE_KEY_PATH"
  } else {
    Write-Host "WARN: no updater signing key at $keyPath (createUpdaterArtifacts builds need it)"
  }
}

$res = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\resources"
$ready = (Test-Path (Join-Path $res "sidecar\dist\cli.js")) -and
  (Test-Path (Join-Path $res "runtime\python\python.exe")) -and
  (Test-Path (Join-Path $res "runtime\node.exe"))
if ($ready) {
  Write-Host "installer runtime already staged"
} else {
  & (Join-Path $PSScriptRoot "stage-installer-runtime.ps1")
}
Set-Location (Join-Path $PSScriptRoot "..\apps\desktop")
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
