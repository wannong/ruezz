use parking_lot::Mutex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
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

fn sidecar_command(app: &AppHandle) -> Result<Command, String> {
    // Prefer external binary next to the app; fall back to `node packages/sidecar/dist/cli.js`
    if let Ok(path) = app
        .path()
        .resolve("wikihome-sidecar", tauri::path::BaseDirectory::Resource)
    {
        if path.exists() {
            return Ok(Command::new(path));
        }
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

    // Explicit local checkout used during development / acceptance.
    candidates.push(std::path::PathBuf::from(
        r"D:\WikiHome\packages\sidecar\dist\cli.js",
    ));

    for c in &candidates {
        if c.extension().and_then(|e| e.to_str()) == Some("js") && c.exists() {
            let mut cmd = Command::new("node.exe");
            cmd.arg(c);
            // Keep cwd at monorepo root so workspace package imports resolve.
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
            return Ok(cmd);
        }
        if c.exists() {
            return Ok(Command::new(c));
        }
    }

    Err(format!(
        "sidecar not found; tried: {}",
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
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("spawn sidecar: {e}"))?;
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

    // drain boot line briefly
    thread::sleep(Duration::from_millis(50));

    Ok(SidecarProc {
        _child: child,
        stdin,
        pending,
        next_id: AtomicU64::new(1),
    })
}

fn ensure_sidecar(app: &AppHandle, state: &SidecarState) -> Result<(), String> {
    let mut guard = state.inner.lock();
    if guard.is_none() {
        *guard = Some(spawn_sidecar(app)?);
    }
    Ok(())
}

#[tauri::command]
async fn rpc(
    app: AppHandle,
    state: State<'_, SidecarState>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    ensure_sidecar(&app, &state)?;

    let (id, rx) = {
        let mut guard = state.inner.lock();
        let proc = guard.as_mut().ok_or("sidecar unavailable")?;
        let id = proc.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = tokio::sync::oneshot::channel();
        proc.pending.lock().insert(id, tx);
        let req = json!({
            "id": id,
            "method": method,
            "params": params,
        });
        writeln!(proc.stdin, "{req}").map_err(|e| format!("write sidecar: {e}"))?;
        proc.stdin.flush().map_err(|e| format!("flush sidecar: {e}"))?;
        (id, rx)
    };

    let response = tokio::time::timeout(Duration::from_secs(300), rx)
        .await
        .map_err(|_| format!("rpc timeout id={id}"))?
        .map_err(|_| "rpc channel closed".to_string())?;

    if let Some(err) = response.get("error") {
        let msg = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("sidecar error");
        return Err(msg.to_string());
    }
    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarState {
            inner: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![rpc])
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
