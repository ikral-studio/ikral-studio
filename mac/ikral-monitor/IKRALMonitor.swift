// IKRAL Monitor · mini app de Mac (V1). Solo lee el mini.json que el puente reescribe cada ~45 s en
// ~/Library/Application Support/ikral-coord (ver tools/mini-monitor-core.mjs). No lee nada más: ni
// credenciales, ni cookies, ni registros. Si el archivo es viejo enseña «Sin señal»; la cuota solo si
// mini.json trae un dato verificable (si no: «Uso no disponible» y botón para verla en Claude).
// Icono en la barra de menús + ventana compacta que se puede cerrar, minimizar o dejar «Siempre visible».
import AppKit
import AVFoundation

struct Usage: Decodable { let available: Bool; let url: String? }
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
    s.usage = stale ? "Uso no disponible" : m.usageText
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
      contentRect: NSRect(x: 0, y: 0, width: 380, height: 330),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "IKRAL Monitor"
    window.isReleasedWhenClosed = false
    window.minSize = NSSize(width: 300, height: 260)
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

    let stack = NSStackView(views: [statusField, ahoraField, needField, lastField, usageField, bridgeField, buttons, pinBox])
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
    for f in [ahoraField, needField, lastField, usageField, bridgeField] {
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
    usageField.stringValue = "Uso de Claude Code: \(s.usage)"
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
    info("Uso de Claude Code: \(s.usage)")
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
