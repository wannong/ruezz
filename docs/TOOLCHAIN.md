# Toolchain notes (Windows)

## Required for Node engine / Web UI

- Node.js 20+
- pnpm 9+

## Required for `pnpm dev:desktop` (Tauri)

- Rust stable (`rustup`)
- WebView2 (usually preinstalled on Windows 10/11)
- A C linker:
  - **MSVC**: Visual Studio Build Tools with C++ workload, or
  - **GNU**: MinGW with `dlltool` on PATH (e.g. LLVM-MinGW), with `rustup default stable-x86_64-pc-windows-gnu`

Until the linker is available, use Web mode (HTTP sidecar + Vite) documented in the README.

## China mirrors (optional)

```powershell
$env:RUSTUP_DIST_SERVER = "https://mirrors.ustc.edu.cn/rust-static"
# ~/.cargo/config.toml sparse USTC registry
```
