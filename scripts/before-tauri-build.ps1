# Tauri beforeBuildCommand (cwd is apps/desktop). Keep this a single -File so cmd.exe
# does not swallow the frontend build after a semicolon.
$ErrorActionPreference = "Stop"
$res = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\resources"
$ready = (Test-Path (Join-Path $res "sidecar\dist\cli.js")) -and
  (Test-Path (Join-Path $res "runtime\python\python.exe")) -and
  (Test-Path (Join-Path $res "runtime\node.exe"))
if ($ready) {
  Write-Host "installer runtime already staged"
} else {
  & (Join-Path $PSScriptRoot "stage-installer-runtime.ps1")
}
$wv2 = Join-Path $PSScriptRoot "..\apps\desktop\src-tauri\webview2-runtime\msedgewebview2.exe"
if (-not (Test-Path $wv2)) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "ensure-webview2-fixed.ps1")
}
Set-Location (Join-Path $PSScriptRoot "..\apps\desktop")
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
