# Start HTTP sidecar + Vite UI (no Rust required)

Write-Host "Starting WikiHome web mode (mock LLM)..."
$env:WIKIHOME_MOCK = "1"
$env:VITE_SIDECAR_HTTP = "http://127.0.0.1:8787"

Start-Process -FilePath "node" -ArgumentList "packages/sidecar/dist/http-main.js" -WorkingDirectory (Split-Path $PSScriptRoot -Parent) -WindowStyle Hidden
Start-Sleep -Seconds 1
Set-Location (Join-Path (Split-Path $PSScriptRoot -Parent) "apps\desktop")
pnpm exec vite --port 1420 --strictPort
