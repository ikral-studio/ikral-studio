// Blueprint con checklist (lógica pura, sin archivos ni procesos). La usa tools/blueprint.mjs y el monitor.
// Regla principal: una tarea solo está «hecho» con evidencia verificable (commit que existe, prueba, URL o decisión
// del director). Un comentario o un acuse NUNCA cuentan. La casilla «director» solo la marca el director.

export const BLUEPRINT_FORMAT = 'ikral-blueprint/1'
export const ESTADOS = ['pendiente', 'en curso', 'bloqueado', 'hecho']
export const EVIDENCIAS = ['commit', 'prueba', 'url', 'decision']
/** Tipos que alguien podría querer usar como evidencia y no lo son. */
const NO_EVIDENCIA = ['comentario', 'acuse', 'mensaje', 'chat']

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HASH = /^[0-9a-f]{7,40}$/

/**
 * Revisa el Blueprint → { errors, warnings }. commitExists(hash) dice si el commit está en el repo
 * (si no se pasa, los commits solo se revisan por forma).
 */
export function validateBlueprint(bp, { commitExists } = {}) {
  const errors = []
  const warnings = []
  if (bp?.formato !== BLUEPRINT_FORMAT) errors.push(`Formato desconocido (se espera ${BLUEPRINT_FORMAT}).`)
  const fases = new Set((bp?.fases ?? []).map((f) => f.id))
  const tareas = Array.isArray(bp?.tareas) ? bp.tareas : []
  const byId = new Map()
  for (const t of tareas) {
    if (!t?.id || byId.has(t.id)) errors.push(`Tarea con id vacío o repetido: «${t?.id ?? ''}».`)
    else byId.set(t.id, t)
  }
  for (const t of tareas) {
    const at = `Tarea ${t.id}`
    if (!fases.has(t.fase)) errors.push(`${at}: su fase «${t.fase}» no existe.`)
    if (!ESTADOS.includes(t.estado)) errors.push(`${at}: estado «${t.estado}» no válido (${ESTADOS.join(' / ')}).`)
    if (!t.titulo) errors.push(`${at}: falta el título.`)
    if (!t.responsable) errors.push(`${at}: falta el responsable.`)
    if (t.fecha != null && !FECHA.test(t.fecha)) errors.push(`${at}: fecha «${t.fecha}» no es AAAA-MM-DD.`)
    for (const d of t.dependeDe ?? []) if (!byId.has(d)) errors.push(`${at}: depende de «${d}», que no existe.`)
    let fuertes = 0
    for (const e of t.evidencia ?? []) {
      if (NO_EVIDENCIA.includes(e?.tipo)) {
        errors.push(`${at}: un ${e.tipo} no es evidencia (usa commit, prueba, URL o decisión del director).`)
        continue
      }
      if (!EVIDENCIAS.includes(e?.tipo)) {
        errors.push(`${at}: tipo de evidencia «${e?.tipo}» no válido.`)
        continue
      }
      if (!e.ref) {
        errors.push(`${at}: evidencia ${e.tipo} sin referencia.`)
        continue
      }
      if (e.tipo === 'commit') {
        if (!HASH.test(e.ref)) errors.push(`${at}: «${e.ref}» no parece un commit.`)
        else if (commitExists && !commitExists(e.ref)) errors.push(`${at}: el commit ${e.ref} no existe en este repositorio.`)
        else fuertes++
      } else if (e.tipo === 'url') {
        if (!/^https:\/\//.test(e.ref)) errors.push(`${at}: la URL debe empezar con https://.`)
        else fuertes++
      } else if (e.tipo === 'decision') {
        if (e.por !== 'director') errors.push(`${at}: solo cuenta una decisión del director (por: "director").`)
        else fuertes++
      } else fuertes++
    }
    if (t.estado === 'hecho') {
      if (!fuertes) errors.push(`${at}: está «hecho» sin evidencia verificable.`)
      if (!t.fecha) errors.push(`${at}: está «hecho» sin fecha.`)
      for (const d of t.dependeDe ?? []) if (byId.get(d) && byId.get(d).estado !== 'hecho') warnings.push(`${at}: está hecha pero depende de ${d}, que no lo está.`)
    }
    if (t.estado === 'bloqueado' && !t.siguiente) errors.push(`${at}: está bloqueada sin decir qué la desbloquea («siguiente»).`)
    if (t.director != null) {
      if (t.director?.aprobado !== true || !FECHA.test(t.director?.fecha ?? '')) errors.push(`${at}: la casilla del director necesita { aprobado: true, fecha }.`)
      if (t.estado !== 'hecho') errors.push(`${at}: el director no puede aprobar una tarea que no está hecha.`)
    }
    if (t.verificar?.asunto != null)
      try {
        new RegExp(t.verificar.asunto)
      } catch {
        errors.push(`${at}: «verificar.asunto» no es una expresión válida.`)
      }
  }
  return { errors, warnings }
}

/**
 * Tareas que la evidencia ya valida: no están «hecho», tienen verificar.asunto y hay un commit con ese asunto.
 * Si checksOk (npm test y build pasaron de verdad) no es true, quedan en espera y no se aplican.
 * commits = [{ hash, subject }] (el más nuevo primero).
 */
export function proposeUpdates(bp, commits, checksOk) {
  const ready = []
  const waiting = []
  for (const t of bp.tareas ?? []) {
    if (t.estado === 'hecho' || t.estado === 'bloqueado' || !t.verificar?.asunto) continue
    const re = new RegExp(t.verificar.asunto)
    const c = commits.find((x) => re.test(x.subject))
    if (!c) continue
    const deps = (t.dependeDe ?? []).every((d) => bp.tareas.find((x) => x.id === d)?.estado === 'hecho')
    ;(checksOk === true && deps ? ready : waiting).push({ id: t.id, commit: c.hash, deps })
  }
  return { ready, waiting }
}

/** Aplica las tareas listas: «hecho» con el commit y la comprobación como evidencia. No toca la casilla del director. */
export function applyUpdates(bp, ready, today) {
  const map = new Map(ready.map((u) => [u.id, u]))
  return {
    ...bp,
    tareas: bp.tareas.map((t) => {
      const u = map.get(t.id)
      if (!u) return t
      const evidencia = [...(t.evidencia ?? []).filter((e) => !(e.tipo === 'commit' && e.ref === u.commit)), { tipo: 'commit', ref: u.commit }, { tipo: 'prueba', ref: `npm test y npm run build pasaron (comprobación automática ${today})` }]
      return { ...t, estado: 'hecho', fecha: today, evidencia, siguiente: null }
    }),
  }
}

/** Resumen para el monitor y la ficha: cuántas hay en cada estado, la fase actual y la siguiente tarea. */
export function summarize(bp) {
  const tareas = bp?.tareas ?? []
  const n = (e) => tareas.filter((t) => t.estado === e).length
  const done = (id) => tareas.find((t) => t.id === id)?.estado === 'hecho'
  const next =
    tareas.find((t) => t.estado === 'en curso') ??
    tareas.find((t) => t.estado === 'pendiente' && (t.dependeDe ?? []).every(done)) ??
    null
  const faseActual = next ? (bp.fases ?? []).find((f) => f.id === next.fase) ?? null : null
  return {
    total: tareas.length,
    hechas: n('hecho'),
    enCurso: n('en curso'),
    bloqueadas: n('bloqueado'),
    pendientes: n('pendiente'),
    aprobadas: tareas.filter((t) => t.director?.aprobado === true).length,
    fase: faseActual ? { id: faseActual.id, titulo: faseActual.titulo } : null,
    siguiente: next ? { id: next.id, titulo: next.titulo } : null,
    bloqueos: tareas.filter((t) => t.estado === 'bloqueado').map((t) => ({ id: t.id, titulo: t.titulo })),
  }
}

const caja = { hecho: '[x]', 'en curso': '[~]', bloqueado: '[!]', pendiente: '[ ]' }
const evText = (e) => (e.tipo === 'commit' ? `commit \`${e.ref}\`` : e.tipo === 'url' ? e.ref : e.tipo === 'decision' ? `decisión del director: ${e.ref}` : `prueba: ${e.ref}`)

/** PLAN.md legible (lo pide DS-010). Se genera desde el JSON: no se edita a mano. */
export function renderMarkdown(bp) {
  const s = summarize(bp)
  const out = [
    `# Blueprint · ${bp.nombre}`,
    '',
    '> Generado desde `docs/blueprint/ikral-studio.json` con `npm run blueprint`. No editar a mano.',
    '> Fuente oficial: la ficha del proyecto en el Panel de IKRAL. «hecho» solo con evidencia verificable; ✅ = aprobada por el director.',
    '',
    `**Avance:** ${s.hechas} de ${s.total} hechas · ${s.enCurso} en curso · ${s.bloqueadas} bloqueadas · ${s.pendientes} pendientes · ${s.aprobadas} aprobadas por el director.`,
    s.siguiente ? `**Siguiente:** ${s.siguiente.id} · ${s.siguiente.titulo}` : '**Siguiente:** nada pendiente.',
    '',
    'Casillas: `[x]` hecho · `[~]` en curso · `[!]` bloqueado · `[ ]` pendiente.',
  ]
  for (const f of bp.fases ?? []) {
    out.push('', `## Fase ${f.id} · ${f.titulo}`, '')
    for (const t of bp.tareas.filter((x) => x.fase === f.id)) {
      out.push(`- ${caja[t.estado] ?? '[ ]'} **${t.id} · ${t.titulo}**${t.director?.aprobado ? ` ✅ (${t.director.fecha})` : ''} — ${t.responsable}${t.fecha ? ` · ${t.fecha}` : ''}`)
      if (t.criterio) out.push(`  - Criterio: ${t.criterio}`)
      if (t.evidencia?.length) out.push(`  - Evidencia: ${t.evidencia.map(evText).join(' · ')}`)
      if (t.dependeDe?.length) out.push(`  - Depende de: ${t.dependeDe.join(', ')}`)
      if (t.siguiente) out.push(`  - Siguiente: ${t.siguiente}`)
    }
  }
  const l = bp.enlaces ?? {}
  out.push('', '## Enlaces', '')
  for (const [k, v] of Object.entries(l)) out.push(`- ${k}: ${v}`)
  return `${out.join('\n')}\n`
}
