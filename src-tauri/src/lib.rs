/// Carpeta del código de IKRAL Studio (ahí están tools/claude-chat.mjs y docs/).
fn repo_dir() -> std::path::PathBuf {
  std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .map(|p| p.to_path_buf())
    .unwrap_or_default()
}

/// Abre la Terminal con una sesión nueva de Claude Code que se pone a escuchar el chat de la app.
#[tauri::command]
fn empezar_a_escuchar() -> Result<(), String> {
  let dir = repo_dir();
  if !dir.join("tools/claude-chat.mjs").exists() {
    return Err(format!("No encontré tools/claude-chat.mjs en {}", dir.display()));
  }
  let prompt = "escucha IKRAL Studio: lee docs/carpeta-del-proyecto.md (sección «Chat con Claude») y sigue ese ciclo hasta que te diga que pares.";
  // Comando de shell con comillas simples (la ruta puede tener espacios).
  let shell = format!(
    "cd '{}' && claude '{}'",
    dir.display().to_string().replace('\'', "'\\''"),
    prompt.replace('\'', "'\\''")
  );
  // Dentro de AppleScript hay que escapar \ y ".
  let applescript_str = shell.replace('\\', "\\\\").replace('"', "\\\"");
  let status = std::process::Command::new("osascript")
    .arg("-e")
    .arg(format!("tell application \"Terminal\" to do script \"{}\"", applescript_str))
    .arg("-e")
    .arg("tell application \"Terminal\" to activate")
    .status()
    .map_err(|e| e.to_string())?;
  if status.success() {
    Ok(())
  } else {
    Err("No se pudo abrir la Terminal".into())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_drag::init())
    .invoke_handler(tauri::generate_handler![empezar_a_escuchar])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
