# Stage Tauri release layout and pack MSIX for Microsoft Store.
# Requires: WinApp CLI (`winget install Microsoft.WinAppCli`), MinGW on PATH for GNU builds.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Desktop = Join-Path $Root "apps\desktop"
$SrcTauri = Join-Path $Desktop "src-tauri"
$Layout = Join-Path $Root ".cache\msix-layout"
$StoreDir = Join-Path $Root "store\msix"
$Mingw = "D:\winlibs\mingw64\bin"

if (Test-Path $Mingw) {
  $env:PATH = "$Mingw;" + $env:PATH
}

$env:VITE_RUEZZ_CHANNEL = "store"

Push-Location $Desktop
try {
  Write-Host "==> tauri build (no NSIS bundle, store config merge)"
  pnpm exec tauri build --no-bundle --config "src-tauri/tauri.microsoftstore.conf.json"
  if ($LASTEXITCODE -ne 0) { throw "tauri build failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

$ReleaseDir = Join-Path $SrcTauri "target\release"
$Exe = Get-ChildItem $ReleaseDir -Filter "Ruezz.exe" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $Exe) {
  $Exe = Get-ChildItem $ReleaseDir -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch '(?i)web|test|build' } |
    Sort-Object Length -Descending |
    Select-Object -First 1
}
if (-not $Exe) { throw "Release exe not found under $ReleaseDir" }

if (Test-Path $Layout) {
  node (Join-Path $Root "scripts\rm-tree.mjs") $Layout
}
New-Item -ItemType Directory -Force -Path $Layout | Out-Null

Write-Host "==> stage layout from $($Exe.Name)"
Copy-Item -Force $Exe.FullName (Join-Path $Layout "Ruezz.exe")
$resSrc = Join-Path $ReleaseDir "resources"
if (-not (Test-Path $resSrc)) { $resSrc = Join-Path $SrcTauri "resources" }
if (Test-Path $resSrc) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Layout "resources") | Out-Null
  robocopy $resSrc (Join-Path $Layout "resources") /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy resources failed ($LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
}

$loader = Join-Path $Layout "resources\WebView2Loader.dll"
if (Test-Path $loader) {
  Copy-Item -Force $loader (Join-Path $Layout "WebView2Loader.dll")
}

Copy-Item -Force (Join-Path $StoreDir "Package.appxmanifest") (Join-Path $Layout "Package.appxmanifest")
$assetsSrc = Join-Path $StoreDir "Assets"
$assetsDst = Join-Path $Layout "Assets"
if (Test-Path $assetsSrc) {
  New-Item -ItemType Directory -Force -Path $assetsDst | Out-Null
  Copy-Item -Force (Join-Path $assetsSrc "*") $assetsDst
}

$winapp = Get-Command winapp -ErrorAction SilentlyContinue
if (-not $winapp) {
  $shim = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\winapp.exe"
  if (Test-Path $shim) {
    $env:PATH = "$(Split-Path $shim -Parent);$env:PATH"
    $winapp = Get-Command winapp -ErrorAction SilentlyContinue
  }
}
if (-not $winapp) {
  Write-Host "winapp CLI not found. Install: winget install Microsoft.WinAppCli"
  Write-Host "Layout staged at: $Layout"
  Write-Host "Then: winapp package `"$Layout`" --manifest Package.appxmanifest --generate-cert --publisher `"CN=A9453A2B-53CD-4F9F-8509-8A51777F01E8`""
  exit 0
}

$OutDir = Join-Path $Root "release\msix"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$MsixName = "Ruezz_1.2.3.0_x64.msix"
$MsixPath = Join-Path $OutDir $MsixName

Push-Location $Layout
try {
  Write-Host "==> winapp package (dev cert publisher must match Partner Center)"
  winapp package . `
    --manifest .\Package.appxmanifest `
    --generate-cert `
    --publisher "CN=A9453A2B-53CD-4F9F-8509-8A51777F01E8" `
    --output $MsixPath `
    --verbose
  if ($LASTEXITCODE -ne 0) { throw "winapp package failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

Write-Host "Done: $MsixPath"
Get-Item $MsixPath | Format-List FullName, Length, LastWriteTime
Write-Host "Upload this .msix in Partner Center. Microsoft re-signs after certification."
Write-Host "Identity: nong.Ruezz / CN=A9453A2B-53CD-4F9F-8509-8A51777F01E8 / 晓nong"
