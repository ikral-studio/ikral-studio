//! Revisión con GPT: corre `codex exec` en modo solo lectura y devuelve el JSON de la respuesta.
//! Nunca toca el proyecto: la app valida la respuesta y el director decide qué aceptar.
//! Errores con código fijo al inicio para que la app los traduzca: NO_CODEX, TIMEOUT, CODEX: <detalle>.
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Las apps abiertas desde el Dock traen un PATH mínimo: también se busca en Homebrew.
fn find_codex() -> Option<PathBuf> {
  let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
    .map(|p| std::env::split_paths(&p).collect())
    .unwrap_or_default();
  dirs.push("/opt/homebrew/bin".into());
  dirs.push("/usr/local/bin".into());
  if let Some(home) = std::env::var_os("HOME") {
    dirs.push(Path::new(&home).join(".local/bin"));
  }
  dirs.into_iter().map(|d| d.join("codex")).find(|p| p.is_file())
}

/// Últimas líneas de un texto largo (para que el error sea legible).
fn tail(s: &str, n: usize) -> String {
  let lines: Vec<&str> = s.lines().filter(|l| !l.trim().is_empty()).collect();
  lines[lines.len().saturating_sub(n)..].join("\n")
}

fn run(prompt: String, schema: String, images: Vec<String>, timeout_secs: u64) -> Result<String, String> {
  let codex = find_codex().ok_or("NO_CODEX")?;
  let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
  let tmp = std::env::temp_dir().join(format!("ikral-gpt-{}-{}", std::process::id(), nanos));
  std::fs::create_dir_all(&tmp).map_err(|e| format!("CODEX: {e}"))?;
  let result = (|| {
    let schema_path = tmp.join("esquema.json");
    let out_path = tmp.join("respuesta.json");
    std::fs::write(&schema_path, schema).map_err(|e| format!("CODEX: {e}"))?;
    let mut cmd = Command::new(&codex);
    // Codex se instala con Node: que encuentre `node` aunque el PATH de la app sea mínimo.
    let path = std::env::var("PATH").unwrap_or_default();
    cmd.env("PATH", format!("{path}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"));
    cmd.args(["exec", "--sandbox", "read-only", "--ephemeral", "--skip-git-repo-check", "-C"]).arg(&tmp);
    for img in images.iter().filter(|p| Path::new(p).is_file()) {
      cmd.arg("-i").arg(img);
    }
    cmd.arg("--output-schema").arg(&schema_path).arg("-o").arg(&out_path).arg(&prompt);
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("CODEX: {e}"))?;
    // stderr se lee en otro hilo para que el proceso no se trabe si escribe mucho.
    let mut stderr = child.stderr.take();
    let reader = std::thread::spawn(move || {
      let mut s = String::new();
      if let Some(e) = stderr.as_mut() {
        let _ = e.read_to_string(&mut s);
      }
      s
    });
    let start = Instant::now();
    let status = loop {
      if let Some(st) = child.try_wait().map_err(|e| format!("CODEX: {e}"))? {
        break st;
      }
      if start.elapsed() > Duration::from_secs(timeout_secs.max(10)) {
        let _ = child.kill();
        let _ = child.wait();
        return Err("TIMEOUT".to_string());
      }
      std::thread::sleep(Duration::from_millis(250));
    };
    let err = reader.join().unwrap_or_default();
    if !status.success() {
      return Err(format!("CODEX: {}", tail(&err, 6)));
    }
    std::fs::read_to_string(&out_path).map_err(|_| format!("CODEX: sin respuesta. {}", tail(&err, 4)))
  })();
  let _ = std::fs::remove_dir_all(&tmp);
  result
}

/// La app manda el texto del paquete, el esquema JSON y las rutas de las miniaturas.
#[tauri::command]
pub async fn consultar_gpt(prompt: String, schema: String, images: Vec<String>, timeout_secs: u64) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || run(prompt, schema, images, timeout_secs))
    .await
    .map_err(|e| format!("CODEX: {e}"))?
}
