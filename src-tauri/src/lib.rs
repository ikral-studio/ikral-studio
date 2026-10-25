mod gpt;

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

/// Abre una carpeta en Finder.
#[tauri::command]
fn mostrar_en_finder(path: String) -> Result<(), String> {
  if !std::path::Path::new(&path).is_dir() {
    return Err(format!("No existe la carpeta {}", path));
  }
  std::process::Command::new("open").arg(&path).status().map_err(|e| e.to_string())?;
  Ok(())
}

/// Bibliotecas .ikral abiertas desde Finder antes de que la ventana estuviera lista.
#[derive(Default)]
struct Pendientes(std::sync::Mutex<Vec<String>>);

/// La app pregunta al arrancar si la abrieron con doble clic en una biblioteca.
#[tauri::command]
fn bibliotecas_pendientes(state: tauri::State<Pendientes>) -> Vec<String> {
  std::mem::take(&mut *state.0.lock().unwrap())
}

/// Ventana aparte de GPT (como la de Claude Code): se mueve, se achica, se minimiza y queda al frente.
/// Si ya existe, solo se muestra; nunca se abren dos.
#[tauri::command]
async fn abrir_ventana_gpt(app: tauri::AppHandle) -> Result<(), String> {
  use tauri::Manager;
  if let Some(w) = app.get_webview_window("gpt") {
    let _ = w.unminimize();
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())?;
    return Ok(());
  }
  tauri::WebviewWindowBuilder::new(&app, "gpt", tauri::WebviewUrl::App("index.html".into()))
    .title("GPT · IKRAL Studio")
    .inner_size(420.0, 620.0)
    .min_inner_size(320.0, 280.0)
    .resizable(true)
    .always_on_top(true)
    .build()
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_drag::init())
    .manage(Pendientes::default())
    .invoke_handler(tauri::generate_handler![empezar_a_escuchar, bibliotecas_pendientes, mostrar_en_finder, gpt::consultar_gpt, abrir_ventana_gpt])
    .on_window_event(|window, event| {
      // Al cerrar la ventana principal, se cierra también la de GPT (si no, la app no termina).
      use tauri::Manager;
      if window.label() == "main" {
        if let tauri::WindowEvent::Destroyed = event {
          if let Some(w) = window.app_handle().get_webview_window("gpt") {
            let _ = w.close();
          }
        }
      }
    })
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
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // Doble clic en una biblioteca .ikral en Finder (o arrastrarla al ícono de la app).
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Opened { urls } = event {
        use tauri::{Emitter, Manager};
        let paths: Vec<String> = urls
          .iter()
          .filter_map(|u| u.to_file_path().ok())
          .map(|p| p.to_string_lossy().trim_end_matches('/').to_string())
          .collect();
        if paths.is_empty() {
          return;
        }
        app.state::<Pendientes>().0.lock().unwrap().extend(paths.clone());
        let _ = app.emit("open-library", paths);
      }
    });
}
