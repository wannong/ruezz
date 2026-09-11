# Download and extract WebView2 Fixed Version into src-tauri/webview2-runtime
# so the NSIS installer does not need admin to install Evergreen WebView2.
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SrcTauri = Join-Path $Root "apps\desktop\src-tauri"
$Out = Join-Path $SrcTauri "webview2-runtime"
$Cache = Join-Path $Root ".cache\installer-runtime"
# 151.x still fits in one NuGet package (<250MB). 152+ is split into .X64 + .X64.Core.
$RuntimeVer = "151.0.4129.107"
$NupkgName = "webview2.runtime.x64.$RuntimeVer.nupkg"
$NupkgUrl = "https://globalcdn.nuget.org/packages/$NupkgName"
$NupkgPath = Join-Path $Cache $NupkgName
$CabName = "Microsoft.WebView2.FixedVersionRuntime.x64.cab"
$CabUrl = "https://github.com/libnyanpasu/webview2-runtime-archive/releases/download/151.0.4129.101/$CabName"
$CabPath = Join-Path $Cache $CabName

function Runtime-Ready {
  Test-Path (Join-Path $Out "msedgewebview2.exe")
}

function Find-RuntimeDir([string]$RootDir) {
  $found = Get-ChildItem $RootDir -Recurse -Filter "msedgewebview2.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($found) { return $found.Directory.FullName }
  return $null
}

function Copy-Runtime([string]$FromDir) {
  if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
  Copy-Item -Recurse -Force (Join-Path $FromDir "*") $Out
}

if ((Runtime-Ready) -and -not $Force) {
  Write-Host "==> webview2 fixed runtime cache hit"
  return
}

New-Item -ItemType Directory -Force -Path $Cache | Out-Null
$extract = Join-Path $Cache "webview2-fixed-extract"
if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
New-Item -ItemType Directory -Force -Path $extract | Out-Null

$inner = $null
if (-not (Test-Path $NupkgPath) -or $Force -or ((Get-Item $NupkgPath).Length -lt 50MB)) {
  Write-Host "==> download WebView2 Fixed Runtime (NuGet $RuntimeVer)"
  curl.exe -L --retry 3 -o $NupkgPath $NupkgUrl
}

if ((Test-Path $NupkgPath) -and ((Get-Item $NupkgPath).Length -ge 50MB)) {
  Write-Host "==> extract WebView2 nupkg"
  tar.exe -xf $NupkgPath -C $extract
  $inner = Find-RuntimeDir $extract
}

if (-not $inner) {
  Write-Host "==> NuGet layout missing msedgewebview2.exe; try GitHub cab"
  if (-not (Test-Path $CabPath) -or $Force -or ((Get-Item $CabPath).Length -lt 50MB)) {
    curl.exe -L --retry 3 -o $CabPath $CabUrl
  }
  if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
  New-Item -ItemType Directory -Force -Path $extract | Out-Null
  & expand.exe $CabPath -F:* $extract | Out-Null
  $inner = Find-RuntimeDir $extract
}

if (-not $inner) { throw "msedgewebview2.exe not found after extracting WebView2 runtime" }

Copy-Runtime $inner
if (-not (Runtime-Ready)) { throw "webview2-runtime missing msedgewebview2.exe" }

# Win10 unpackaged Fixed Runtime needs AppContainer read+execute (no-op if icacls missing).
$icacls = Join-Path $env:SystemRoot "System32\icacls.exe"
if (Test-Path $icacls) {
  & $icacls $Out /grant "*S-1-15-2-1:(OI)(CI)(RX)" /grant "*S-1-15-2-2:(OI)(CI)(RX)" | Out-Null
}

Write-Host "==> webview2 fixed runtime -> $Out"
