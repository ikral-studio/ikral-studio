// IKRAL Monitor · mini app de Mac (V1). Solo lee el mini.json que el puente reescribe cada ~45 s en
// ~/Library/Application Support/ikral-coord (ver tools/mini-monitor-core.mjs). No lee nada más: ni
// credenciales, ni cookies, ni registros. Si el archivo es viejo enseña «Sin señal». La cuota (M4) son dos
// barras, sesión y semana, con su reinicio y la hora de la última lectura de la statusLine de Claude Code;
// pasada la hora de reinicio no enseña el % viejo. Sin dato: lo dice y queda el botón «Ver uso en Claude».
// Icono en la barra de menús + ventana compacta que se puede cerrar, minimizar o dejar «Siempre visible».
import AppKit
import AVFoundation

struct Window: Decodable { let usedPct: Double; let resetsAt: Double? }
struct Usage: Decodable {
  let available: Bool
  let url: String?
  let text: String?
  let at: Double?
  let session: Window?
  let week: Window?
}

/// Una barra de cuota: «Sesión: 61%» + «Reinicia: 15:09». Si ya pasó el reinicio no enseña el % viejo.
struct Bar {
  var title = "Sin datos"
  var reset = ""
  var pct: Double? = nil
}
struct LastActivity: Decodable { let at: Double; let text: String }
struct Bridge: Decodable { let beatAt: Double?; let claudeRunning: Bool; let status: String? }
struct Mini: Decodable {
  let format: String
  let generatedAt: Double
  let staleMs: Double
  let code: String
  let label: String
  let icon: String
  let project: String
  let ahora: String
  let teNecesito: String
  let lastActivity: LastActivity?
  let link: String?
  let bridge: Bridge?
  let interactiveClaude: Int?
  let usage: Usage?
  let usageText: String
  let speech: String
  let staleSpeech: String
}

let miniURL = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Library/Application Support/ikral-coord/mini.json")
let usageFallback = "https://claude.ai/settings/usage"
let issueFallback = "https://github.com/ikral-studio/coordinacion/issues/1"

func clock(_ ms: Double) -> String {
  let f = DateFormatter()
  f.locale = Locale(identifier: "es_MX")
  f.dateFormat = "d MMM HH:mm"
  return f.string(from: Date(timeIntervalSince1970: ms / 1000))
}

func fmt(_ ms: Double, _ pattern: String) -> String {
  let f = DateFormatter()
  f.locale = Locale(identifier: "es_MX")
  f.dateFormat = pattern
  return f.string(from: Date(timeIntervalSince1970: ms / 1000))
}

/// El temporizador solo recalcula si ya reinició; nunca fabrica un % nuevo.
func bar(_ name: String, _ w: Window?, _ resetPattern: String, now: Double) -> Bar {
  guard let w = w else { return Bar(title: "\(name): sin datos") }
  if let r = w.resetsAt, now >= r { return Bar(title: "\(name): ya reinició", reset: "Esperando dato nuevo de Claude Code") }
  return Bar(title: "\(name): \(Int(w.usedPct.rounded()))%", reset: w.resetsAt.map { "Reinicia: \(fmt($0, resetPattern))" } ?? "", pct: w.usedPct)
}

func short(_ s: String, _ max: Int) -> String { s.count > max ? String(s.prefix(max - 1)) + "…" : s }

/// Lo que se enseña ahora mismo (ya con «Sin señal» si el dato es viejo o falta).
struct Shown {
  var icon = "⚫"
  var label = "Sin señal"
  var project = "IKRAL Studio"
  var ahora = "Todavía no hay datos del puente."
  var teNecesito = "Mira si el Mac está dormido o sin red. Si sigue así, avísale a Claude."
  var last = "—"
  var usage = "Uso no disponible"
  var session = Bar(title: "Sesión: sin datos")
  var week = Bar(title: "Semana: sin datos")
  var usageRead = "Sin datos de uso todavía (llegan cuando Claude Code responde)."
  var bridge = "Puente: sin datos"
  var speech = "Sin señal. Todavía no hay datos del puente."
  var link = issueFallback
  var usageURL = usageFallback

  static func read() -> Shown {
    var s = Shown()
    guard let data = try? Data(contentsOf: miniURL), data.count < 256 * 1024,
      let m = try? JSONDecoder().decode(Mini.self, from: data), m.format == "ikral-mini/1"
    else { return s }
    let now = Date().timeIntervalSince1970 * 1000
    let stale = now - m.generatedAt > m.staleMs
    s.project = m.project
    s.link = m.link ?? issueFallback
    s.usageURL = m.usage?.url ?? usageFallback
    s.last = m.lastActivity.map { "\($0.text) · \(clock($0.at))" } ?? "—"
    // La cuota no depende de que el puente esté al día: es la última lectura de la statusLine, con su hora.
    s.usage = m.usageText
    if let u = m.usage, u.available, let at = u.at {
      s.session = bar("Sesión", u.session, "HH:mm", now: now)
      s.week = bar("Semana", u.week, "EEE HH:mm", now: now)
      let fresh = now - at <= 10 * 60 * 1000
      s.usageRead = "\(fresh ? "Leído" : "Última lectura") \(clock(at)) · fuente: statusline de Claude Code"
    } else if let t = m.usage?.text {
      s.usageRead = t
    }
    let claude = (m.bridge?.claudeRunning ?? false) ? "Claude del puente corriendo" : "Claude del puente parado"
    let win = m.interactiveClaude.map { " · \($0) ventana(s) de Claude abiertas" } ?? ""
    s.bridge = "Puente: última vuelta \(m.bridge?.beatAt.map(clock) ?? "—") · \(claude)\(win)"
    if stale {
      s.ahora = "Sin datos nuevos desde \(clock(m.generatedAt)). Lo último: \(m.ahora)"
      s.speech = m.staleSpeech
    } else {
      s.icon = m.icon
      s.label = m.label
      s.ahora = m.ahora
      s.teNecesito = m.teNecesito
      s.speech = m.speech
    }
    return s
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
  var item: NSStatusItem!
  let speaker = AVSpeechSynthesizer()
  var window: NSWindow!
  var shown = Shown()
  var timer: Timer?
  let statusField = NSTextField(labelWithString: "")
  let ahoraField = NSTextField(wrappingLabelWithString: "")
  let needField = NSTextField(wrappingLabelWithString: "")
  let lastField = NSTextField(wrappingLabelWithString: "")
  let usageField = NSTextField(wrappingLabelWithString: "")
  let sessionTitle = NSTextField(labelWithString: "")
  let sessionReset = NSTextField(labelWithString: "")
  let sessionBar = NSProgressIndicator()
  let weekTitle = NSTextField(labelWithString: "")
  let weekReset = NSTextField(labelWithString: "")
  let weekBar = NSProgressIndicator()
  let bridgeField = NSTextField(wrappingLabelWithString: "")
  let pinBox = NSButton(checkboxWithTitle: "Siempre visible", target: nil, action: nil)

  var alwaysOnTop: Bool {
    get { UserDefaults.standard.bool(forKey: "siempreVisible") }
    set { UserDefaults.standard.set(newValue, forKey: "siempreVisible") }
  }

  func applicationDidFinishLaunching(_ n: Notification) {
    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    buildWindow()
    refresh()
    timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
    showWindow()
  }

  // Cerrar la ventana no cierra la app: sigue el icono de arriba y el del Dock.
  func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { false }

  // Clic en el Dock (o abrir desde el Escritorio) con la ventana cerrada o minimizada → vuelve.
  func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows: Bool) -> Bool {
    showWindow()
    return true
  }

  func buildWindow() {
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 400, height: 470),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "IKRAL Monitor"
    window.isReleasedWhenClosed = false
    window.minSize = NSSize(width: 320, height: 400)
    window.delegate = self
    window.setFrameAutosaveName("IKRALMonitorVentana")

    statusField.font = .systemFont(ofSize: 22, weight: .bold)
    for f in [ahoraField, needField] { f.font = .systemFont(ofSize: 15) }
    for f in [lastField, usageField, bridgeField] {
      f.font = .systemFont(ofSize: 13)
      f.textColor = .secondaryLabelColor
    }
    pinBox.target = self
    pinBox.action = #selector(togglePin)

    let listen = NSButton(title: "▶ Escuchar estado", target: self, action: #selector(speak))
    listen.keyEquivalent = " "
    let usageBtn = NSButton(title: "Ver uso en Claude", target: self, action: #selector(openUsage))
    let issueBtn = NSButton(title: "Abrir Issue", target: self, action: #selector(openIssue))
    let buttons = NSStackView(views: [listen, usageBtn, issueBtn])
    buttons.orientation = .horizontal

    // Cuota: dos barras con texto grande (sesión de 5 h y semana). No es el contexto (150k).
    func usageRow(_ title: NSTextField, _ reset: NSTextField, _ bar: NSProgressIndicator) -> NSStackView {
      title.font = .systemFont(ofSize: 20, weight: .semibold)
      reset.font = .systemFont(ofSize: 15)
      reset.textColor = .secondaryLabelColor
      bar.style = .bar
      bar.isIndeterminate = false
      bar.minValue = 0
      bar.maxValue = 100
      let top = NSStackView(views: [title, reset])
      top.orientation = .horizontal
      top.spacing = 12
      let row = NSStackView(views: [top, bar])
      row.orientation = .vertical
      row.alignment = .leading
      row.spacing = 4
      bar.widthAnchor.constraint(equalTo: row.widthAnchor).isActive = true
      return row
    }
    let sessionRow = usageRow(sessionTitle, sessionReset, sessionBar)
    let weekRow = usageRow(weekTitle, weekReset, weekBar)

    let stack = NSStackView(views: [statusField, ahoraField, needField, sessionRow, weekRow, usageField, lastField, bridgeField, buttons, pinBox])
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 8
    stack.edgeInsets = NSEdgeInsets(top: 14, left: 16, bottom: 14, right: 16)
    stack.translatesAutoresizingMaskIntoConstraints = false
    let content = NSView()
    content.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      stack.topAnchor.constraint(equalTo: content.topAnchor),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: content.bottomAnchor),
    ])
    for f in [ahoraField, needField, lastField, usageField, bridgeField, sessionRow, weekRow] {
      f.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -32).isActive = true
    }
    window.contentView = content
    applyPin()
  }

  func applyPin() {
    window.level = alwaysOnTop ? .floating : .normal
    window.collectionBehavior = alwaysOnTop ? [.canJoinAllSpaces, .fullScreenAuxiliary] : []
    pinBox.state = alwaysOnTop ? .on : .off
  }

  func refresh() {
    shown = Shown.read()
    let s = shown
    if let b = item.button {
      b.title = "\(s.icon) IKRAL"
      b.toolTip = "\(s.label) · \(s.project)\nAhora: \(s.ahora)"
      b.setAccessibilityLabel("IKRAL Monitor: \(s.label)")
    }
    statusField.stringValue = "\(s.icon) \(s.label) · \(s.project)"
    ahoraField.stringValue = "Ahora: \(s.ahora)"
    needField.stringValue = "Te necesito: \(s.teNecesito)"
    lastField.stringValue = "Última actividad: \(s.last)"
    for (title, reset, bar, b) in [(sessionTitle, sessionReset, sessionBar, s.session), (weekTitle, weekReset, weekBar, s.week)] {
      title.stringValue = b.title
      reset.stringValue = b.reset
      bar.doubleValue = b.pct ?? 0
      bar.isHidden = b.pct == nil
    }
    usageField.stringValue = s.usageRead
    bridgeField.stringValue = s.bridge
    item.menu = buildMenu(s)
  }

  func buildMenu(_ s: Shown) -> NSMenu {
    let menu = NSMenu()
    func info(_ text: String, _ full: String? = nil) {
      let mi = NSMenuItem(title: short(text, 90), action: nil, keyEquivalent: "")
      mi.isEnabled = false
      mi.toolTip = full ?? text
      menu.addItem(mi)
    }
    func action(_ title: String, _ sel: Selector, _ key: String = "") {
      let mi = NSMenuItem(title: title, action: sel, keyEquivalent: key)
      mi.target = self
      menu.addItem(mi)
    }
    info("\(s.icon) \(s.label) · \(s.project)")
    info("Ahora: \(s.ahora)")
    info("Te necesito: \(s.teNecesito)")
    info("Última actividad: \(s.last)")
    info("\(s.session.title) · \(s.session.reset)")
    info("\(s.week.title) · \(s.week.reset)")
    info(s.usageRead)
    menu.addItem(.separator())
    action("Abrir ventana", #selector(showWindow), "o")
    action("▶ Escuchar estado", #selector(speak), "e")
    action("Ver uso en Claude", #selector(openUsage))
    action("Abrir Issue en GitHub", #selector(openIssue))
    let pin = NSMenuItem(title: "Siempre visible", action: #selector(togglePin), keyEquivalent: "")
    pin.target = self
    pin.state = alwaysOnTop ? .on : .off
    menu.addItem(pin)
    menu.addItem(.separator())
    action("Salir de IKRAL Monitor", #selector(quit), "q")
    return menu
  }

  @objc func showWindow() {
    refresh()
    if window.isMiniaturized { window.deminiaturize(nil) }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  @objc func togglePin() {
    alwaysOnTop.toggle()
    applyPin()
    refresh()
  }

  // Voz del propio Mac (sin servicios de pago). Solo cuando el director pulsa el botón.
  @objc func speak() {
    refresh()
    if speaker.isSpeaking { speaker.stopSpeaking(at: .immediate) }
    let u = AVSpeechUtterance(string: shown.speech)
    u.voice = AVSpeechSynthesisVoice(language: "es-MX") ?? AVSpeechSynthesisVoice(language: "es-ES")
    speaker.speak(u)
  }

  @objc func openUsage() { if let u = URL(string: shown.usageURL) { NSWorkspace.shared.open(u) } }
  @objc func openIssue() { if let u = URL(string: shown.link) { NSWorkspace.shared.open(u) } }
  @objc func quit() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
