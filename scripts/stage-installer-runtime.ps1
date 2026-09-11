# Stage Node sidecar + Python/MarkItDown into the Tauri resource tree
# so the NSIS installer is self-contained for machines with nothing installed.
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Res = Join-Path $Root "apps\desktop\src-tauri\resources"
$Cache = Join-Path $Root ".cache\installer-runtime"
$SidecarOut = Join-Path $Res "sidecar"
$RuntimeOut = Join-Path $Res "runtime"
$PythonCache = Join-Path $Cache "python"
$PythonVer = "3.14.6"
$PythonZip = "python-$PythonVer-embed-amd64.zip"
$PythonUrl = "https://www.python.org/ftp/python/$PythonVer/$PythonZip"

New-Item -ItemType Directory -Force -Path $Cache, $Res, $RuntimeOut | Out-Null

function Remove-LongTree([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  if (-not ($Path -like "$Res*") -and -not ($Path -like "$Cache*")) {
    throw "refusing to delete outside staging dirs: $Path"
  }
  node (Join-Path $PSScriptRoot "rm-tree.mjs") $Path
  if ($LASTEXITCODE -ne 0) { throw "rm-tree failed for $Path" }
  if (Test-Path $Path) { throw "failed to remove $Path" }
}

Write-Host "==> build workspace packages"
Push-Location $Root
try {
  pnpm -r --filter=./packages/* run build
  if ($LASTEXITCODE -ne 0) { throw "package build failed" }
} finally {
  Pop-Location
}

Write-Host "==> deploy sidecar"
$SidecarCache = [System.IO.Path]::GetFullPath((Join-Path $Cache "sidecar-pkg"))
Write-Host "    dest $SidecarCache"
$sidecarCli = Join-Path $SidecarCache "dist\cli.js"
if ($Force -or -not (Test-Path $sidecarCli)) {
  Remove-LongTree $SidecarCache
  Push-Location $Root
  try {
    pnpm --filter @wikihome/sidecar deploy --prod --ignore-scripts --node-linker=hoisted $SidecarCache
    if ($LASTEXITCODE -ne 0) { throw "pnpm deploy failed" }
  } finally {
    Pop-Location
  }
  if (Test-Path (Join-Path $SidecarCache "apps")) {
    throw "sidecar deploy copied the monorepo into $SidecarCache; refuse to continue"
  }
} else {
  Write-Host "    sidecar cache hit"
}

Remove-LongTree $SidecarOut
New-Item -ItemType Directory -Force -Path $SidecarOut | Out-Null
$prevNative = $PSNativeCommandUseErrorActionPreference
$PSNativeCommandUseErrorActionPreference = $false
& robocopy $SidecarCache $SidecarOut /E /COPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
$copyCode = $LASTEXITCODE
$PSNativeCommandUseErrorActionPreference = $prevNative
if ($copyCode -ge 8) { throw "robocopy sidecar failed with code $copyCode" }

Write-Host "==> materialize junctions"
node (Join-Path $PSScriptRoot "materialize-node-modules.mjs") $SidecarOut
if ($LASTEXITCODE -ne 0) { throw "materialize node_modules failed" }

$skillsSrc = Join-Path $Root "packages\agent\skills"
$skillsDst = Join-Path $SidecarOut "node_modules\@wikihome\agent\skills"
if ((Test-Path $skillsSrc) -and -not (Test-Path (Join-Path $skillsDst "grill-me\SKILL.md"))) {
  New-Item -ItemType Directory -Force -Path $skillsDst | Out-Null
  Copy-Item -Recurse -Force (Join-Path $skillsSrc "*") $skillsDst
}

$cli = Join-Path $SidecarOut "dist\cli.js"
if (-not (Test-Path $cli)) { throw "sidecar cli.js missing after deploy: $cli" }

Write-Host "==> copy Node runtime"
$nodeSrc = (node -p "process.execPath").Trim()
if (-not $nodeSrc -or -not (Test-Path $nodeSrc)) {
  $nodeSrc = (Get-Command node.exe -ErrorAction Stop).Source
}
Copy-Item -Force $nodeSrc (Join-Path $RuntimeOut "node.exe")

Write-Host "==> WebView2Loader.dll"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "copy-webview2-dll.ps1") -TargetDir $Res

function Ensure-PythonRuntime {
  $pythonExe = Join-Path $PythonCache "python.exe"
  $env:PYTHONNOUSERSITE = "1"
  $markitdownOk = $false
  if ((Test-Path $pythonExe) -and -not $Force) {
    & $pythonExe -c "import markitdown; assert 'Roaming' not in markitdown.__file__" 2>$null
    if ($LASTEXITCODE -eq 0) { $markitdownOk = $true }
  }
  if ($markitdownOk) {
    Write-Host "==> python runtime cache hit"
    return
  }

  Write-Host "==> download embeddable Python $PythonVer"
  New-Item -ItemType Directory -Force -Path $PythonCache | Out-Null
  $zipPath = Join-Path $Cache $PythonZip
  if (-not (Test-Path $zipPath) -or $Force) {
    curl.exe -L --retry 3 -o $zipPath $PythonUrl
  }
  if (Test-Path $pythonExe) {
    Get-ChildItem $PythonCache | Remove-Item -Recurse -Force
  }
  Expand-Archive -Force -Path $zipPath -DestinationPath $PythonCache

  $pth = Get-ChildItem $PythonCache -Filter "python*._pth" | Select-Object -First 1
  if (-not $pth) { throw "python ._pth not found" }
  $zipFile = Get-ChildItem $PythonCache -Filter "python*.zip" | Select-Object -First 1
  $zipName = if ($zipFile) { $zipFile.Name } else { "python314.zip" }
  @(
    $zipName
    "."
    "Lib\site-packages"
    "import site"
  ) | Set-Content -Encoding ascii $pth.FullName

  $getPip = Join-Path $Cache "get-pip.py"
  if (-not (Test-Path $getPip) -or $Force) {
    curl.exe -L --retry 3 -o $getPip "https://bootstrap.pypa.io/get-pip.py"
  }
  Write-Host "==> pip + markitdown (bundled prefix only)"
  & $pythonExe $getPip --no-warn-script-location --no-user
  if ($LASTEXITCODE -ne 0) { throw "get-pip failed" }
  & $pythonExe -m pip install --no-user --no-warn-script-location --force-reinstall "markitdown[pdf,docx,pptx,xlsx]"
  if ($LASTEXITCODE -ne 0) { throw "markitdown install failed" }
  $installedAt = & $pythonExe -c "import markitdown; print(markitdown.__file__)"
  if ($LASTEXITCODE -ne 0 -or $installedAt -notlike "$PythonCache*") {
    throw "markitdown did not install into bundled Python: $installedAt"
  }
}

Ensure-PythonRuntime

Write-Host "==> copy python runtime"
$pythonOut = Join-Path $RuntimeOut "python"
Remove-LongTree $pythonOut
New-Item -ItemType Directory -Force -Path $pythonOut | Out-Null
Copy-Item -Recurse -Force (Join-Path $PythonCache "*") $pythonOut

$launcher = @"
@echo off
setlocal
set ROOT=%~dp0..
set PATH=%~dp0;%~dp0python;%PATH%
set WIKIHOME_PYTHON=%~dp0python\python.exe
set PYTHONNOUSERSITE=1
"%~dp0node.exe" "%ROOT%\sidecar\dist\cli.js"
"@
Set-Content -Encoding ascii (Join-Path $RuntimeOut "wikihome-sidecar.cmd") $launcher

Write-Host "==> staged installer runtime"
Write-Host "    sidecar: $SidecarOut"
Write-Host "    node:    $(Join-Path $RuntimeOut 'node.exe')"
Write-Host "    python:  $(Join-Path $RuntimeOut 'python\python.exe')"
