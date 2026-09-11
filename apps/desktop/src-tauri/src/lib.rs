use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

struct SidecarState {
    inner: Mutex<Option<SidecarProc>>,
}

struct SidecarProc {
    _child: Child,
    stdin: ChildStdin,
    pending: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<Value>>>>,
    next_id: AtomicU64,
}

fn hide_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Prevent node.exe from opening a visible console window.
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

fn prepend_path(cmd: &mut Command, dir: &Path) {
    let mut parts = vec![dir.to_path_buf()];
    let existing = cmd
        .get_envs()
        .find(|(k, _)| k.eq_ignore_ascii_case("PATH"))
        .and_then(|(_, v)| v.map(|val| val.to_os_string()))
        .or_else(|| std::env::var_os("PATH"));
    if let Some(existing) = existing {
        parts.extend(std::env::split_paths(&existing));
    }
    if let Ok(joined) = std::env::join_paths(&parts) {
        cmd.env("PATH", joined);
    }
}

fn skip_walk_dir(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "webview2-runtime"
            | "node_modules"
            | "python"
            | "lib"
            | "dlls"
            | "target"
            | ".git"
    )
}

fn win_normal_path(p: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        const PREFIX: &str = r"\\?\";
        let s = p.to_string_lossy();
        if let Some(rest) = s.strip_prefix(PREFIX) {
            return PathBuf::from(rest);
        }
    }
    p.to_path_buf()
}

fn make_bundled_command(node: &Path, cli: &Path) -> Command {
    let sidecar_dir = cli
        .parent()
        .and_then(|p| p.parent())
        .unwrap_or(cli)
        .to_path_buf();
    let runtime_dir = node.parent().unwrap_or(node).to_path_buf();
    let node = win_normal_path(node);
    let cli = win_normal_path(cli);
    let sidecar_dir = win_normal_path(&sidecar_dir);
    let runtime_dir = win_normal_path(&runtime_dir);
    let mut cmd = Command::new(&node);
    cmd.arg(&cli);
    cmd.current_dir(&sidecar_dir);
    prepend_path(&mut cmd, &runtime_dir);
    let python = runtime_dir.join("python").join("python.exe");
    if python.exists() {
        cmd.env("WIKIHOME_PYTHON", &python);
        if let Some(dir) = python.parent() {
            prepend_path(&mut cmd, dir);
        }
    }
    cmd.env(
        "WIKIHOME_MOCK",
        std::env::var("WIKIHOME_MOCK").unwrap_or_else(|_| "0".into()),
    );
    cmd.env("PYTHONNOUSERSITE", "1");
    cmd.env("NODE_USE_ENV_PROXY", "1");
    cmd.env_remove("NODE_OPTIONS");
    let node_modules = sidecar_dir.join("node_modules");
    if node_modules.is_dir() {
        cmd.env("NODE_PATH", &node_modules);
    }
    cmd
}

fn try_runtime_pair(root: &Path) -> Option<Command> {
    let node = root.join("runtime").join("node.exe");
    let cli = root.join("sidecar").join("dist").join("cli.js");
    if node.is_file() && cli.is_file() {
        return Some(make_bundled_command(&node, &cli));
    }
    None
}

fn find_bundled_sidecar(root: &Path, depth: u8) -> Option<Command> {
    if let Some(cmd) = try_runtime_pair(root) {
        return Some(cmd);
    }
    if depth == 0 {
        return None;
    }
    let rd = std::fs::read_dir(root).ok()?;
    for entry in rd.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if skip_walk_dir(&name) {
            continue;
        }
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if let Some(cmd) = find_bundled_sidecar(&entry.path(), depth.saturating_sub(1)) {
                return Some(cmd);
            }
        }
    }
    None
}

fn bundled_sidecar_command(resource: &Path) -> Option<Command> {
    find_bundled_sidecar(resource, 3)
}

fn sidecar_log_tail() -> String {
    let Ok(text) = std::fs::read_to_string(sidecar_log_path()) else {
        return String::new();
    };
    let clipped: String = text
        .chars()
        .rev()
        .take(1500)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let clipped = clipped.trim();
    if clipped.is_empty() {
        String::new()
    } else {
        format!("\n{clipped}")
    }
}

fn sidecar_log_path() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("LOCALAPPDATA").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir);
    let dir = base.join("WikiHome");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("sidecar-stderr.log")
}

fn explain_io(what: &str, err: &std::io::Error) -> String {
    let raw = err.to_string();
    let broken = err.kind() == std::io::ErrorKind::BrokenPipe
        || raw.contains("pipe")
        || raw.contains("管道")
        || raw.contains("being closed");
    if broken {
        return format!(
            "{what}：引擎进程已退出。请关掉 WikiHome 再打开。若仍失败，查看 %APPDATA%\\WikiHome\\sidecar-stderr.log"
        );
    }
    if err.kind() == std::io::ErrorKind::NotFound {
        return format!("{what}：找不到引擎文件，请重新安装 WikiHome");
    }
    format!("{what}：{raw}")
}

fn sidecar_command(app: &AppHandle) -> Result<Command, String> {
    let mut roots = Vec::new();
    if let Ok(resource) = app.path().resource_dir() {
        roots.push(resource.clone());
        roots.push(resource.join("resources"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.to_path_buf());
            roots.push(dir.join("resources"));
        }
    }

    for root in &roots {
        if let Some(cmd) = bundled_sidecar_command(root) {
            return Ok(cmd);
        }
    }

    if let Ok(resource) = app.path().resource_dir() {
        if let Ok(path) = app
            .path()
            .resolve("wikihome-sidecar", tauri::path::BaseDirectory::Resource)
        {
            if path.exists() {
                return Ok(Command::new(path));
            }
        }
        let _ = resource;
    }

    let mut candidates = Vec::new();

    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("binaries").join("wikihome-sidecar.exe"));
        candidates.push(resource.join("binaries").join("wikihome-sidecar"));
    }

    // Walk from the running exe upward to find the monorepo sidecar (local 验收).
    if let Ok(exe) = std::env::current_exe() {
        for dir in exe.ancestors().take(8) {
            candidates.push(dir.join("wikihome-sidecar.exe"));
            candidates.push(dir.join("binaries").join("wikihome-sidecar.exe"));
            candidates.push(dir.join("packages").join("sidecar").join("dist").join("cli.js"));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        for dir in cwd.ancestors().take(8) {
            candidates.push(dir.join("packages").join("sidecar").join("dist").join("cli.js"));
        }
    }

    for c in &candidates {
        if c.extension().and_then(|e| e.to_str()) == Some("js") && c.exists() {
            let mut cmd = Command::new("node.exe");
            cmd.arg(c);
            if let Some(root) = c
                .ancestors()
                .find(|p| p.join("pnpm-workspace.yaml").exists())
            {
                cmd.current_dir(root);
            }
            cmd.env(
                "WIKIHOME_MOCK",
                std::env::var("WIKIHOME_MOCK").unwrap_or_else(|_| "0".into()),
            );
            cmd.env("NODE_USE_ENV_PROXY", "1");
            return Ok(cmd);
        }
        if c.exists() {
            return Ok(Command::new(c));
        }
    }

    Err(format!(
        "找不到 WikiHome 引擎。请重新安装。已尝试：{}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

impl Drop for SidecarProc {
    fn drop(&mut self) {
        let _ = self._child.kill();
        let _ = self._child.wait();
    }
}

fn spawn_sidecar(app: &AppHandle) -> Result<SidecarProc, String> {
    let mut cmd = sidecar_command(app)?;
    hide_console(&mut cmd);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped());
    let log_path = sidecar_log_path();
    match OpenOptions::new().create(true).append(true).open(&log_path) {
        Ok(mut file) => {
            let _ = writeln!(
                file,
                "\n----- spawn -----\nprogram {:?}",
                cmd.get_program()
            );
            cmd.stderr(Stdio::from(file));
        }
        Err(_) => {
            cmd.stderr(Stdio::null());
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| explain_io("启动引擎失败", &e))?;
    let stdin = child.stdin.take().ok_or("sidecar stdin missing")?;
    let stdout = child.stdout.take().ok_or("sidecar stdout missing")?;
    let pending: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<Value>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let pending_reader = pending.clone();
    let emit_app = app.clone();

    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let Ok(val) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if val.get("method").and_then(|m| m.as_str()) == Some("agent_event") {
                if let Some(params) = val.get("params") {
                    let _ = emit_app.emit("agent-event", params);
                }
                continue;
            }
            // boot banner uses id "boot" — ignore for RPC matching
            let id = match val.get("id") {
                Some(Value::Number(n)) => n.as_u64(),
                Some(Value::String(s)) if s == "boot" => None,
                _ => None,
            };
            if let Some(id) = id {
                if let Some(tx) = pending_reader.lock().remove(&id) {
                    let _ = tx.send(val);
                }
            }
        }
    });

    thread::sleep(Duration::from_millis(400));
    if let Ok(Some(status)) = child.try_wait() {
        let detail = sidecar_log_tail();
        return Err(if detail.is_empty() {
            format!(
                "引擎启动后立即退出（{status}）。请查看 %APPDATA%\\WikiHome\\sidecar-stderr.log"
            )
        } else {
            format!("引擎启动后立即退出（{status}）。{detail}")
        });
    }

    Ok(SidecarProc {
        _child: child,
        stdin,
        pending,
        next_id: AtomicU64::new(1),
    })
}

fn sidecar_dead(proc: &mut SidecarProc) -> bool {
    matches!(proc._child.try_wait(), Ok(Some(_)))
}

fn ensure_sidecar(app: &AppHandle, state: &SidecarState) -> Result<(), String> {
    let mut guard = state.inner.lock();
    let dead = match guard.as_mut() {
        None => true,
        Some(proc) => sidecar_dead(proc),
    };
    if dead {
        *guard = Some(spawn_sidecar(app)?);
    }
    Ok(())
}

fn write_rpc(proc: &mut SidecarProc, method: &str, params: &Value) -> Result<(u64, tokio::sync::oneshot::Receiver<Value>), String> {
    let id = proc.next_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = tokio::sync::oneshot::channel();
    proc.pending.lock().insert(id, tx);
    let req = json!({
        "id": id,
        "method": method,
        "params": params,
    });
    writeln!(proc.stdin, "{req}").map_err(|e| explain_io("无法把请求发给引擎", &e))?;
    proc.stdin.flush().map_err(|e| explain_io("无法把请求发给引擎", &e))?;
    Ok((id, rx))
}

fn grant_dir_acl(dir: &Path) {
    #[cfg(windows)]
    {
        if !dir.is_dir() {
            return;
        }
        let mut cmd = Command::new("icacls");
        cmd.arg(dir)
            .arg("/grant")
            .arg("*S-1-15-2-1:(OI)(CI)(RX)")
            .arg("/grant")
            .arg("*S-1-15-2-2:(OI)(CI)(RX)");
        hide_console(&mut cmd);
        let _ = cmd.status();
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
    }
}

fn system_webview2_present() -> bool {
    let bases = [
        PathBuf::from(r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application"),
        PathBuf::from(r"C:\Program Files\Microsoft\EdgeWebView\Application"),
        PathBuf::from(r"C:\Program Files (x86)\Microsoft\Edge\Application"),
        PathBuf::from(r"C:\Program Files\Microsoft\Edge\Application"),
    ];
    for base in bases {
        let Ok(entries) = std::fs::read_dir(&base) else {
            continue;
        };
        for entry in entries.flatten() {
            if entry.path().join("msedgewebview2.exe").is_file() {
                return true;
            }
        }
        if base.join("msedgewebview2.exe").is_file() {
            return true;
        }
    }
    false
}

fn user_webview2_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("APPDATA").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir)
        .join("WikiHome")
        .join("webview2-runtime")
}

fn locate_webview2_runtime(extra: &[PathBuf]) -> Option<PathBuf> {
    let mut dirs = extra.to_vec();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.to_path_buf());
            dirs.push(parent.join("resources"));
        }
    }
    dirs.push(user_webview2_dir());
    for dir in dirs {
        let direct = dir.join("msedgewebview2.exe");
        if direct.is_file() {
            return Some(dir);
        }
        let nested = dir.join("webview2-runtime");
        if nested.join("msedgewebview2.exe").is_file() {
            return Some(nested);
        }
    }
    None
}

#[cfg(windows)]
mod win_msg {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            ty: u32,
        ) -> i32;
    }
    pub fn info(text: &str) {
        let text: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let caption: Vec<u16> = "WikiHome".encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x40);
        }
    }
}

fn download_fixed_webview2() -> Option<PathBuf> {
    let dest = user_webview2_dir();
    if dest.join("msedgewebview2.exe").is_file() {
        return Some(dest);
    }
    #[cfg(windows)]
    win_msg::info("本机没有网页组件（WebView2）。即将下载到用户目录，不需要管理员权限，请稍候。");

    let cache = dest.parent().unwrap_or(&dest).join("cache");
    let _ = std::fs::create_dir_all(&cache);
    let nupkg = cache.join("webview2.runtime.x64.151.0.4129.107.nupkg");
    let url = "https://globalcdn.nuget.org/packages/webview2.runtime.x64.151.0.4129.107.nupkg";
    let mut curl = Command::new("curl.exe");
    curl.args(["-L", "--retry", "3", "-o"]);
    curl.arg(&nupkg);
    curl.arg(url);
    hide_console(&mut curl);
    if !curl.status().ok()?.success() {
        return None;
    }
    let meta = std::fs::metadata(&nupkg).ok()?;
    if meta.len() < 50 * 1024 * 1024 {
        return None;
    }
    let extract = cache.join("webview2-extract");
    let _ = std::fs::remove_dir_all(&extract);
    let _ = std::fs::create_dir_all(&extract);
    let mut tar = Command::new("tar.exe");
    tar.arg("-xf").arg(&nupkg).arg("-C").arg(&extract);
    hide_console(&mut tar);
    if !tar.status().ok()?.success() {
        return None;
    }
    fn find_exe(dir: &Path, depth: u8) -> Option<PathBuf> {
        if dir.join("msedgewebview2.exe").is_file() {
            return Some(dir.to_path_buf());
        }
        if depth == 0 {
            return None;
        }
        for entry in std::fs::read_dir(dir).ok()?.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                if let Some(found) = find_exe(&entry.path(), depth.saturating_sub(1)) {
                    return Some(found);
                }
            }
        }
        None
    }
    let inner = find_exe(&extract, 6)?;
    let _ = std::fs::create_dir_all(&dest);
    for entry in std::fs::read_dir(&inner).ok()?.flatten() {
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            copy_dir(&from, &to);
        } else {
            let _ = std::fs::copy(&from, &to);
        }
    }
    dest.join("msedgewebview2.exe").is_file().then_some(dest)
}

fn copy_dir(from: &Path, to: &Path) {
    let _ = std::fs::create_dir_all(to);
    let Ok(rd) = std::fs::read_dir(from) else {
        return;
    };
    for entry in rd.flatten() {
        let from = entry.path();
        let to = to.join(entry.file_name());
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            copy_dir(&from, &to);
        } else {
            let _ = std::fs::copy(&from, to);
        }
    }
}

fn prepare_webview2(extra: &[PathBuf]) {
    if system_webview2_present() {
        return;
    }
    if let Some(runtime) = locate_webview2_runtime(extra) {
        std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &runtime);
        grant_dir_acl(&runtime);
        return;
    }
    if let Some(runtime) = download_fixed_webview2() {
        std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &runtime);
        grant_dir_acl(&runtime);
    }
}

#[tauri::command]
async fn rpc(
    app: AppHandle,
    state: State<'_, SidecarState>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    ensure_sidecar(&app, &state)?;

    let write_once = || -> Result<(u64, tokio::sync::oneshot::Receiver<Value>), String> {
        let mut guard = state.inner.lock();
        let proc = guard.as_mut().ok_or("sidecar unavailable")?;
        if sidecar_dead(proc) {
            return Err("引擎进程已退出".into());
        }
        write_rpc(proc, &method, &params)
    };

    let (id, rx) = match write_once() {
        Ok(pair) => pair,
        Err(_) => {
            *state.inner.lock() = None;
            ensure_sidecar(&app, &state)?;
            write_once()?
        }
    };

    let response = tokio::time::timeout(Duration::from_secs(300), rx)
        .await
        .map_err(|_| format!("rpc timeout id={id}"))?
        .map_err(|_| {
            "引擎连接已断开。请关掉 WikiHome 再打开。若仍失败，查看 %APPDATA%\\WikiHome\\sidecar-stderr.log"
                .to_string()
        })?;

    if let Some(err) = response.get("error") {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("sidecar error");
        return Err(msg.to_string());
    }
    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

fn prime_webview2_from_exe_dir() {
    prepare_webview2(&[]);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    prime_webview2_from_exe_dir();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarState {
            inner: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![rpc])
        .setup(|app| {
            let mut extra = Vec::new();
            if let Ok(resource) = app.path().resource_dir() {
                extra.push(resource);
            }
            prepare_webview2(&extra);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<SidecarState>() {
                    *state.inner.lock() = None;
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running WikiHome");
}
