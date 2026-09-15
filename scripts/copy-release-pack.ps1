# Copy the NSIS installer into release/. Guide text lives in 安装说明.txt beside this script.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Release = Join-Path $Root "release"
$NsisDir = Join-Path $Root "apps\desktop\src-tauri\target\release\bundle\nsis"

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

$guideSrc = Join-Path $PSScriptRoot "install-readme.zh-CN.txt"
if (Test-Path $guideSrc) {
  $guide = Get-Content $guideSrc -Raw -Encoding UTF8
  $guide = $guide.Replace("1.0.5", $Version)
  $guide = $guide -replace "\r?\n绿色目录.*", ""
  Set-Content -Encoding utf8 (Join-Path $Release "install-readme.txt") $guide
}

Write-Host "Release pack:"
Get-ChildItem $Release | ForEach-Object {
  "{0,12:N0}  {1}" -f $_.Length, $_.Name
}
