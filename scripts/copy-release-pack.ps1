# Copy the NSIS installer into release/. Guide text lives in 安装说明.txt beside this script.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Release = Join-Path $Root "release"
$NsisDir = Join-Path $Root "apps\desktop\src-tauri\target\release\bundle\nsis"
$ExeDir = Join-Path $Root "apps\desktop\src-tauri\target\release"

New-Item -ItemType Directory -Force -Path $Release | Out-Null

$Conf = Get-Content (Join-Path $Root "apps\desktop\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$Version = [string]$Conf.version
$setup = Get-ChildItem $NsisDir -Filter "*setup.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*_${Version}_*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $setup) {
  $setup = Get-ChildItem $NsisDir -Filter "*setup.exe" -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending |
    Select-Object -First 1
}
if (-not $setup) { throw "NSIS setup.exe not found in $NsisDir" }
Copy-Item -Force $setup.FullName (Join-Path $Release $setup.Name)

$exe = Join-Path $ExeDir "WikiHome.exe"
if (-not (Test-Path $exe)) { $exe = Join-Path $ExeDir "wikihome.exe" }
if (Test-Path $exe) {
  try {
    Copy-Item -Force $exe (Join-Path $Release "WikiHome.exe")
  } catch {
    Write-Host "skip WikiHome.exe (file in use)"
  }
}

$dll = Join-Path $ExeDir "WebView2Loader.dll"
if (Test-Path $dll) {
  Copy-Item -Force $dll (Join-Path $Release "WebView2Loader.dll")
}

$guideSrc = Join-Path $PSScriptRoot "install-readme.zh-CN.txt"
if (Test-Path $guideSrc) {
  Copy-Item -Force $guideSrc (Join-Path $Release "install-readme.txt")
}

Write-Host "Release pack:"
Get-ChildItem $Release | ForEach-Object {
  "{0,12:N0}  {1}" -f $_.Length, $_.Name
}
