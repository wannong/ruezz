fn main() {
    println!("cargo:rerun-if-changed=resources/WebView2Loader.dll");
    tauri_build::build();
    copy_webview2_loader();
}

fn copy_webview2_loader() {
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let src = manifest.join("resources").join("WebView2Loader.dll");
    if !src.exists() {
        return;
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    // OUT_DIR = target/<profile>/build/<crate>/out → profile dir is 3 ancestors up
    if let Some(profile_dir) = out.ancestors().nth(3) {
        let dest = profile_dir.join("WebView2Loader.dll");
        let _ = std::fs::copy(&src, dest);
    }
}
