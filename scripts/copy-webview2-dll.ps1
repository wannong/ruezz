# Copy WebView2Loader.dll next to WikiHome.exe (required for GNU toolchain builds).
param(
  [string]$TargetDir = (Join-Path $PSScriptRoot "..\release")
)

$ErrorActionPreference = "Stop"
$nuget = Join-Path $env:TEMP "microsoft.web.webview2.nupkg"
$extract = Join-Path $env:TEMP "webview2-dll-extract"

if (-not (Test-Path $nuget) -or (Get-Item $nuget).Length -lt 1MB) {
  Write-Host "Downloading Microsoft.Web.WebView2 NuGet package..."
  curl.exe -L --retry 3 -o $nuget "https://globalcdn.nuget.org/packages/microsoft.web.webview2.1.0.2592.51.nupkg"
}

if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
New-Item -ItemType Directory -Force -Path $extract | Out-Null
tar -xf $nuget -C $extract "runtimes/win-x64/native/WebView2Loader.dll"

$dll = Join-Path $extract "runtimes\win-x64\native\WebView2Loader.dll"
if (-not (Test-Path $dll)) { throw "WebView2Loader.dll not found in package" }

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
Copy-Item -Force $dll (Join-Path $TargetDir "WebView2Loader.dll")
Write-Host "Copied WebView2Loader.dll -> $TargetDir"
