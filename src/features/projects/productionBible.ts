// Biblia de Producción en PDF: todo el proyecto en un solo documento para el equipo
// (estilo, personajes, Canon, etapas, decisiones, guion, cobertura plano por plano, prompts,
// sonido, videos, continuidad y lista de tomas). Usa las mismas fuentes y colores del Portafolio.
// Primero se arma un modelo con solo lo que tiene datos (las secciones vacías no salen); luego se dibuja.
import type { Project, Scene } from '../../types'
import { shotsOf, hasCoverage } from '../coverage/shots'
import { STATUS_LABEL, effectiveDuration, generationPrompt, shotParts } from '../script-sync/derive'
import { SPEEDS, cameraItem, cameraSpanish } from '../camera/camera'
import { styleSpanish } from '../project-style/style'
import { AUDIENCES, LOOKS, MOODS } from '../bible/bible'
import { framePrompt, shotFramePrompt } from '../bible/frames'
import { approvedDecisions, auditContinuity, phaseOf, phasesOf } from '../continuity/continuity'
import { emojiFor, parseDialogue, splitEmotions, type DialogueLine } from '../dialogue/lines'
import { formatDuration, pad2 } from '../../utils'
import { ACCENT, H, INK, M, MUTED, W, clean, createPdfKit, emojiPng, imageData, speakerColor, type RGB } from './portfolio'

export type BibleSectionId =
  | 'cover'
  | 'style'
  | 'characters'
  | 'canon'
  | 'phases'
  | 'decisions'
  | 'script'
  | 'coverage'
  | 'prompts'
  | 'sound'
  | 'videos'
  | 'continuity'
  | 'shotList'

export const BIBLE_SECTIONS: { id: BibleSectionId; label: string }[] = [
  { id: 'cover', label: 'Portada' },
  { id: 'style', label: 'Estilo' },
  { id: 'characters', label: 'Personajes' },
  { id: 'canon', label: 'Canon' },
  { id: 'phases', label: 'Etapas narrativas' },
  { id: 'decisions', label: 'Decisiones aprobadas' },
  { id: 'script', label: 'Guion' },
  { id: 'coverage', label: 'Cobertura' },
  { id: 'prompts', label: 'Anexo de prompts' },
  { id: 'sound', label: 'Sonido y música' },
  { id: 'videos', label: 'Videos' },
  { id: 'continuity', label: 'Continuidad' },
  { id: 'shotList', label: 'Lista de tomas' },
]
export const ALL_BIBLE_SECTIONS: BibleSectionId[] = BIBLE_SECTIONS.map((s) => s.id)
export const sectionLabel = (id: BibleSectionId) => BIBLE_SECTIONS.find((s) => s.id === id)!.label

const AUTHOR: Record<string, string> = { director: 'Director', claude: 'Claude', gpt: 'GPT' }
const SEVERITY: Record<string, string> = { high: 'Grave', review: 'Revisar', low: 'Leve' }
export const SHOT_LIST_COLUMNS = ['#', 'Escena', 'Plano', 'Duración', 'Encuadre', 'Ángulo', 'Movimiento', 'Lente', 'Luz', 'Video', 'Estado'] as const

const longDate = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
const isoDate = (iso?: string) => (iso ? longDate(new Date(iso)) : '')
const has = (t?: string) => !!t?.trim()

export interface BibleShot {
  /** «03.2»: escena y plano. */
  code: string
  name: string
  duration: number
  camera: string
  action: string
  dialogue: DialogueLine[]
  sound: string
  continuity: string
  startImageId?: string
  endImageId?: string
}

export interface BibleModel {
  /** Secciones que sí salen, en orden. */
  sections: BibleSectionId[]
  cover: { title: string; location: string; date: string; format: string; scenes: number; duration: number; description: string; imageId?: string }
  style: [string, string][]
  characters: { name: string; role: string; description: string; imageId?: string; relations: string[]; wardrobe: string[] }[]
  canon: { kind: string; name: string; note: string; description: string; imageId: string; detail: string }[]
  phases: { name: string; note: string; scenes: string[]; items: string[] }[]
  /** Elementos sin etapa fija (salen en todas). */
  everywhere: string[]
  decisions: { text: string; proposed: string; approved: string; applies: string }[]
  script: { code: string; title: string; phase: string; duration: number; action: string; dialogue: DialogueLine[]; camera: string; sound: string }[]
  coverage: { code: string; title: string; shots: BibleShot[] }[]
  prompts: { code: string; name: string; start: string; end: string; video: string }[]
  sound: { notes: { code: string; title: string; text: string }[]; tracks: { name: string; clips: string[] }[] }
  videos: { code: string; name: string; imageId: string; duration: number; model: string; versions: number }[]
  continuity: { severity: string; where: string; problem: string; suggestion: string }[]
  shotList: string[][]
}

/** Arma la Biblia con lo que tiene el proyecto. No cambia nada del proyecto. */
export function productionBibleModel(project: Project, scenes: Scene[], include: BibleSectionId[] = ALL_BIBLE_SECTIONS, now = new Date()): BibleModel {
  const want = new Set(include)
  const sceneCode = (i: number) => pad2(i + 1)
  const sceneN = new Map(scenes.map((s, i) => [s.id, i]))
  const sceneName = (id: string) => (sceneN.has(id) ? `${sceneCode(sceneN.get(id)!)} ${scenes[sceneN.get(id)!].title}` : '')
  const chars = (project.characters ?? []).filter((c) => has(c.name))
  const charName = (id?: string) => chars.find((c) => c.id === id)?.name ?? ''
  const items = [
    ...(project.locations ?? []).map((it) => ({ it, kind: 'Locación' })),
    ...(project.props ?? []).map((it) => ({ it, kind: 'Objeto' })),
    ...(project.wardrobe ?? []).map((it) => ({ it, kind: 'Vestuario' })),
  ].filter(({ it }) => has(it.name))
  const itemName = (id: string) => items.find(({ it }) => it.id === id)?.it.name ?? ''
  const phases = phasesOf(project)
  const phaseName = (id: string) => phases.find((ph) => ph.id === id)?.name ?? ''

  // Portada
  const main = (project.locations ?? []).find((l) => l.id === project.mainLocationId) ?? (project.locations ?? []).find((l) => has(l.name))
  const cover = {
    title: project.title,
    location: main?.name ?? project.bible?.place ?? '',
    date: longDate(now),
    format: `${project.aspectRatio} ${project.aspectRatio === '9:16' ? 'vertical' : 'horizontal'}`,
    scenes: scenes.length,
    duration: scenes.reduce((a, s) => a + effectiveDuration(s), 0),
    description: project.description ?? '',
    imageId: main?.imageId ?? scenes.find((s) => s.startImageId)?.startImageId ?? scenes.find((s) => s.endImageId)?.endImageId,
  }

  // Estilo
  const b = project.bible ?? {}
  const pick = (list: { id: string; es: string }[], id?: string) => list.find((c) => c.id === id)?.es ?? ''
  const style: [string, string][] = (
    [
      ['Look', b.look === 'otro' ? (b.lookOther ?? '') : pick(LOOKS, b.look)],
      ['Época', b.era ?? ''],
      ['Lugar', b.place ?? ''],
      ['Ánimo y colores', pick(MOODS, b.mood)],
      ['Público', pick(AUDIENCES, b.audience)],
      ['Estilo visual', styleSpanish(project)],
    ] as [string, string][]
  ).filter(([, v]) => has(clean(v)))

  // Personajes
  const characters = chars.map((c) => ({
    name: c.name,
    role: c.role ?? '',
    description: c.description,
    imageId: c.imageId,
    relations: (project.relations ?? [])
      .filter((r) => (r.a === c.id || r.b === c.id) && charName(r.a === c.id ? r.b : r.a))
      .map((r) => `${r.label} · ${charName(r.a === c.id ? r.b : r.a)}`),
    wardrobe: (project.wardrobe ?? []).filter((w) => w.characterId === c.id && has(w.name)).map((w) => w.name),
  }))

  // Canon: lo que ya tiene imagen aprobada.
  const canon = items
    .filter(({ it }) => it.imageId)
    .map(({ it, kind }) => ({
      kind,
      name: it.name,
      note: it.note ?? '',
      description: it.description,
      imageId: it.imageId!,
      detail: [
        it.characterId && charName(it.characterId) && `De ${charName(it.characterId)}`,
        it.onlyIn?.length && `Solo en: ${it.onlyIn.map(phaseName).filter(Boolean).join(', ')}`,
        it.aliases?.length && `También: ${it.aliases.join(', ')}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }))

  // Etapas
  const phaseRows = phases.map((ph) => ({
    name: ph.name,
    note: ph.note ?? '',
    scenes: scenes.filter((s) => s.phaseId === ph.id).map((s) => sceneName(s.id)),
    items: items.filter(({ it }) => it.onlyIn?.includes(ph.id)).map(({ it, kind }) => `${it.name} (${kind.toLowerCase()})`),
  }))
  const everywhere = phases.length ? items.filter(({ it }) => !it.onlyIn?.length).map(({ it }) => it.name) : []

  // Decisiones: solo las que aprobó el director.
  const decisions = approvedDecisions(project).map((d) => ({
    text: d.text,
    proposed: `Propuso: ${AUTHOR[d.proposedBy] ?? d.proposedBy}${d.proposedAt ? ` · ${isoDate(d.proposedAt)}` : ''}`,
    approved: `Aprobó: Director${d.approvedAt ? ` · ${isoDate(d.approvedAt)}` : ''}`,
    applies: [
      d.sceneIds?.length && `Escenas: ${d.sceneIds.map(sceneName).filter(Boolean).join(', ')}`,
      d.itemIds?.length && `Elementos: ${d.itemIds.map(itemName).filter(Boolean).join(', ')}`,
      d.allowsBackstep && 'Permite volver a una etapa anterior',
    ]
      .filter(Boolean)
      .join(' · '),
  }))

  // Guion, cobertura, prompts, videos y lista de tomas (escena por escena, plano por plano).
  const script: BibleModel['script'] = []
  const coverage: BibleModel['coverage'] = []
  const prompts: BibleModel['prompts'] = []
  const videos: BibleModel['videos'] = []
  const notes: BibleModel['sound']['notes'] = []
  const shotList: string[][] = []
  scenes.forEach((s, i) => {
    const code = sceneCode(i)
    const lines = parseDialogue(s.script.dialogue).filter((l) => has(clean(l.text)) || has(l.speaker))
    const allLines = parseDialogue(s.script.dialogue)
    const sceneCam = [cameraSpanish(s.script.camera), s.script.cameraDirection].filter(has).join('\n')
    script.push({ code, title: s.title, phase: phaseOf(project, s)?.name ?? '', duration: effectiveDuration(s), action: s.script.action, dialogue: lines, camera: sceneCam, sound: s.script.soundDirection })
    const covered = hasCoverage(s)
    const parts = shotParts(s)
    const shots = shotsOf(s)
    const sceneShots: BibleShot[] = []
    if (has(s.script.soundDirection)) notes.push({ code, title: s.title, text: s.script.soundDirection })
    shots.forEach((sh, k) => {
      const sc = covered ? `${code}.${k + 1}` : code
      const part = parts[k]
      sceneShots.push({
        code: sc,
        name: sh.name,
        duration: part?.duration ?? sh.duration,
        camera: [cameraSpanish(sh.camera), sh.cameraDirection].filter(has).join('\n'),
        action: sh.action ?? '',
        dialogue: covered ? (sh.dialogueLines ?? []).map((n) => allLines[n]).filter(Boolean) : [],
        sound: sh.sound ?? '',
        continuity: sh.continuity ?? '',
        startImageId: sh.startImageId,
        endImageId: sh.endImageId,
      })
      prompts.push({
        code: sc,
        name: covered ? sh.name : s.title,
        start: covered ? sh.prep?.start?.prompt?.trim() || shotFramePrompt(project, s, sh, 'start', i + 1, k + 1, shots.length) : s.prep?.start?.prompt?.trim() || framePrompt(project, s, 'start', i + 1),
        end: covered ? sh.prep?.end?.prompt?.trim() || shotFramePrompt(project, s, sh, 'end', i + 1, k + 1, shots.length) : s.prep?.end?.prompt?.trim() || framePrompt(project, s, 'end', i + 1),
        video: covered ? (sh.generationPrompt ?? '') : generationPrompt(s, project.customFields, project),
      })
      const v = part?.video
      if (v) videos.push({ code: sc, name: covered ? sh.name : s.title, imageId: v.mediaId, duration: part.duration, model: v.model ?? '', versions: sh.videoVersions?.length ?? 1 })
      if (covered && has(sh.sound)) notes.push({ code: sc, title: sh.name, text: sh.sound! })
      const c = sh.camera ?? {}
      const name = (id?: string) => cameraItem(id)?.row[1] ?? '—'
      const move = c.move ? `${name(c.move)}${c.speed ? ` (${SPEEDS[c.speed].es})` : ''}` : '—'
      shotList.push([sc, s.title, covered ? sh.name : '—', formatDuration(part?.duration ?? sh.duration), name(c.shot), name(c.angle), move, name(c.lens), name(c.light), v ? 'Sí' : 'No', STATUS_LABEL[s.status]])
    })
    coverage.push({ code, title: s.title, shots: sceneShots })
  })

  const tracks = (project.audioTracks ?? [])
    .filter((t) => t.clips.length)
    .map((t) => ({
      name: `${t.name}${t.muted ? ' (silenciada)' : ''}`,
      clips: [...t.clips].sort((a, z) => a.start - z.start).map((c) => `${c.name} · ${formatDuration(c.start)} a ${formatDuration(c.start + c.duration)}`),
    }))

  // Continuidad: solo si hay algo que revisar (etapas o decisiones).
  const audit = phases.length || decisions.length ? auditContinuity(project, scenes) : []
  const continuity = audit.map((f) => ({
    severity: SEVERITY[f.severity] ?? f.severity,
    where: [f.sceneId && sceneName(f.sceneId), f.quote && `«${f.quote}»`].filter(Boolean).join(' · '),
    problem: f.problem,
    suggestion: f.suggestion,
  }))

  const model: BibleModel = {
    sections: [],
    cover,
    style,
    characters,
    canon,
    phases: phaseRows,
    everywhere,
    decisions,
    script,
    coverage,
    prompts: prompts.filter((p) => has(p.start) || has(p.end) || has(p.video)),
    sound: { notes, tracks },
    videos,
    continuity,
    shotList,
  }
  const filled: Record<BibleSectionId, boolean> = {
    cover: true,
    style: style.length > 0,
    characters: characters.length > 0,
    canon: canon.length > 0,
    phases: phaseRows.length > 0,
    decisions: decisions.length > 0,
    script: script.length > 0,
    coverage: coverage.length > 0,
    prompts: model.prompts.length > 0,
    sound: notes.length > 0 || tracks.length > 0,
    videos: videos.length > 0,
    // Sin hallazgos también se informa, si el proyecto tiene etapas o decisiones que revisar.
    continuity: phases.length > 0 || decisions.length > 0,
    shotList: shotList.length > 0,
  }
  model.sections = ALL_BIBLE_SECTIONS.filter((id) => want.has(id) && filled[id])
  return model
}

/** Dibuja la Biblia de Producción. `onProgress` avisa cada sección que se dibuja. */
export async function exportProductionBiblePdf(
  project: Project,
  scenes: Scene[],
  include: BibleSectionId[] = ALL_BIBLE_SECTIONS,
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  const m = productionBibleModel(project, scenes, include)
  const { doc, color, font, rule, newPage, label, framed, tag, cache } = await createPdfKit(project.title)
  const bottom = H - 46
  let y = 0
  let kicker = ''

  // ---------- Piezas de escritura con salto de página ----------
  const head = (title: string, sub = 'Biblia de producción') => {
    kicker = title
    newPage()
    label(sub, M, 60)
    font('Display', 'normal', 26)
    color(INK)
    doc.text(title, M, 90)
    rule(M, 102, W - M)
    y = 128
  }
  const ensure = (h: number) => {
    if (y + h <= bottom) return
    newPage()
    label(`${kicker} · continúa`, M, 54)
    rule(M, 64, W - M)
    y = 86
  }
  const para = (text: string, x = M, width = W - 2 * M - (x - M), size = 9.5, style: 'normal' | 'bold' | 'italic' = 'normal', c: RGB = INK) => {
    const t = clean(text)
    if (!t) return
    const lh = size * 1.32
    font('Body', style, size)
    for (const ln of doc.splitTextToSize(t, width) as string[]) {
      ensure(lh)
      font('Body', style, size)
      color(c)
      doc.text(ln, x, y)
      y += lh
    }
  }
  const sub = (text: string, size = 15) => {
    ensure(size * 2 + 20)
    font('Display', 'normal', size)
    color(INK)
    doc.text(clean(text) || 'Sin título', M, y)
    y += size + 4
  }
  const field = (name: string, text: string, x = M, width?: number) => {
    if (!clean(text)) return
    ensure(30)
    label(name, x, y)
    y += 12
    para(text, x, width)
    y += 6
  }
  const dialogue = (lines: DialogueLine[], x = M, width = W - 2 * M - (x - M), size = 9.5) => {
    const lh = size * 1.32
    for (const l of lines) {
      const emos = splitEmotions(l.emotion)
      const faces = emos.map((e) => emojiFor(e)).filter(Boolean) as string[]
      font('Body', 'italic', size)
      const body: string[] = doc.splitTextToSize(clean(l.text), width - 12)
      ensure(lh + 4 + Math.min(body.length, 3) * lh)
      let cx = x
      if (l.speaker) {
        const sc = speakerColor(l.speaker)
        font('Body', 'bold', size)
        doc.setTextColor(sc[0], sc[1], sc[2])
        const name = clean(l.speaker).toUpperCase()
        doc.text(name, cx, y, { charSpace: 0.6 })
        cx += doc.getTextWidth(name) + name.length * 0.6 + 6
      }
      faces.forEach((f, k) => {
        if (k > 0) {
          font('Body', 'normal', 8)
          color(MUTED)
          doc.text('>', cx, y - 0.5)
          cx += 7
        }
        doc.addImage(emojiPng(f), 'PNG', cx, y - 10.5, 13, 13)
        cx += 15
      })
      const words = clean(emos.filter(Boolean).join(' > '))
      if (words) {
        font('Body', 'normal', 7.5)
        color(MUTED)
        doc.text(`(${words})`, cx + 2, y - 0.5)
      }
      y += lh
      for (const ln of body) {
        ensure(lh)
        font('Body', 'italic', size)
        color(INK)
        doc.text(ln, x + 12, y)
        y += lh
      }
      y += 4
    }
  }

  for (const id of m.sections) {
    onProgress?.(sectionLabel(id))

    if (id === 'cover') {
      const c = m.cover
      newPage(false)
      const vertical = project.aspectRatio === '9:16'
      const heroW = vertical ? 250 : 430
      const heroH = vertical ? 444 : 242
      const heroX = W - M - heroW
      framed(await imageData(c.imageId, cache), heroX, (H - heroH) / 2, heroW, heroH)
      label('Biblia de producción', M, 150)
      font('Display', 'normal', clean(c.title).length > 22 ? 34 : 44)
      color(INK)
      const titleLines = doc.splitTextToSize(clean(c.title), heroX - M - 30)
      doc.text(titleLines, M, 196)
      const ty = 196 + titleLines.length * 46
      rule(M, ty - 18, M + 60, ACCENT, 1.4)
      font('Body', 'normal', 11)
      color(MUTED)
      const facts = [
        c.location && `Locación principal: ${clean(c.location)}`,
        `Formato: ${c.format}`,
        `${c.scenes} escenas · ${Math.floor(c.duration / 60)}:${pad2(Math.round(c.duration % 60))} min`,
        c.date,
      ].filter(Boolean) as string[]
      facts.forEach((f, k) => doc.text(doc.splitTextToSize(f, heroX - M - 30)[0] ?? '', M, ty + 4 + k * 16))
      if (has(c.description)) {
        font('Body', 'italic', 10.5)
        color(INK)
        doc.text(doc.splitTextToSize(clean(c.description), heroX - M - 30).slice(0, 5), M, ty + 30 + facts.length * 16)
      }
      font('Body', 'bold', 8)
      color(MUTED)
      doc.text('IKRAL STUDIO', M, H - M, { charSpace: 2 })
    }

    if (id === 'style') {
      head('Estilo')
      for (const [k, v] of m.style) field(k, v)
    }

    if (id === 'characters') {
      head('Personajes')
      for (const c of m.characters) {
        const img = await imageData(c.imageId, cache)
        const tx = img ? M + 136 : M
        font('Body', 'normal', 9.5)
        const est = 30 + (doc.splitTextToSize(clean(c.description) || '—', W - M - tx) as string[]).length * 12.5 + (c.relations.length + c.wardrobe.length ? 40 : 0)
        ensure(Math.max(img ? 124 : 0, est) + 10)
        const top = y
        if (img) framed(img, M, top - 10, 120, 120)
        const sc = speakerColor(c.name)
        doc.setFillColor(sc[0], sc[1], sc[2])
        doc.rect(tx - 10, top - 10, 3, 24, 'F')
        font('Display', 'normal', 17)
        color(INK)
        doc.text(clean(c.name), tx, top + 8)
        y = top + 26
        if (has(c.role)) para(c.role, tx, undefined, 8.5, 'bold', MUTED)
        para(c.description, tx)
        if (c.relations.length) para(`Relaciones: ${c.relations.join(' · ')}`, tx, undefined, 9, 'italic')
        if (c.wardrobe.length) para(`Vestuario: ${c.wardrobe.join(' · ')}`, tx, undefined, 9, 'italic')
        y = Math.max(y, img ? top + 120 : y) + 16
      }
    }

    if (id === 'canon') {
      head('Canon', 'Biblia de producción · imágenes aprobadas')
      const cols = 3
      const gap = 18
      const cw = (W - 2 * M - gap * (cols - 1)) / cols
      const ih = (cw * 9) / 16
      for (let k = 0; k < m.canon.length; k += cols) {
        const row = m.canon.slice(k, k + cols)
        ensure(ih + 70)
        const top = y
        let maxY = top
        for (let j = 0; j < row.length; j++) {
          const it = row[j]
          const x = M + j * (cw + gap)
          framed(await imageData(it.imageId, cache), x, top - 8, cw, ih)
          tag(it.kind, x, top - 8)
          y = top + ih + 8
          font('Display', 'normal', 13)
          color(INK)
          doc.text(doc.splitTextToSize(clean(it.name), cw)[0] ?? '', x, y)
          y += 13
          font('Body', 'normal', 8.5)
          color(INK)
          const text = [it.note, it.description].filter(has).map(clean).join(' · ')
          const lines = (doc.splitTextToSize(text || '—', cw) as string[]).slice(0, 4)
          doc.text(lines, x, y)
          y += lines.length * 11
          if (it.detail) {
            font('Body', 'italic', 8)
            color(MUTED)
            const d = (doc.splitTextToSize(clean(it.detail), cw) as string[]).slice(0, 2)
            doc.text(d, x, y)
            y += d.length * 10.5
          }
          maxY = Math.max(maxY, y)
        }
        y = maxY + 20
      }
    }

    if (id === 'phases') {
      head('Etapas narrativas')
      m.phases.forEach((ph, k) => {
        sub(`${k + 1}. ${ph.name}`)
        if (has(ph.note)) para(ph.note, M, undefined, 9.5, 'italic', MUTED)
        y += 4
        field('Escenas', ph.scenes.join(' · ') || 'Ninguna todavía')
        field('Elementos de esta etapa', ph.items.join(' · ') || 'Ninguno propio')
        y += 8
      })
      if (m.everywhere.length) field('Salen en todas las etapas', m.everywhere.join(' · '))
    }

    if (id === 'decisions') {
      head('Decisiones aprobadas')
      m.decisions.forEach((d, k) => {
        ensure(60)
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2])
        const top = y
        font('Display', 'normal', 13)
        color(INK)
        doc.text(`${k + 1}.`, M, y)
        para(d.text, M + 22, undefined, 10.5, 'bold')
        para(`${d.proposed}  ·  ${d.approved}`, M + 22, undefined, 8.5, 'normal', MUTED)
        if (d.applies) para(d.applies, M + 22, undefined, 8.5, 'italic', MUTED)
        if (y > top) doc.rect(M + 12, top - 9, 2, y - top, 'F')
        y += 12
      })
    }

    if (id === 'script') {
      head('Guion')
      for (const s of m.script) {
        sub(`${s.code} · ${s.title}`)
        para([s.phase && `Etapa: ${s.phase}`, formatDuration(s.duration)].filter(Boolean).join(' · '), M, undefined, 8.5, 'bold', MUTED)
        y += 6
        field('Acción', s.action)
        if (s.dialogue.length) {
          ensure(30)
          label('Diálogos', M, y)
          y += 15
          dialogue(s.dialogue)
          y += 4
        }
        field('Cámara', s.camera)
        field('Sonido', s.sound)
        y += 10
      }
    }

    if (id === 'coverage') {
      head('Cobertura', 'Biblia de producción · plano por plano')
      for (const sc of m.coverage) {
        sub(`${sc.code} · ${sc.title}`)
        y += 4
        for (const sh of sc.shots) {
          const [a, z] = await Promise.all([imageData(sh.startImageId, cache), imageData(sh.endImageId, cache)])
          const pics = a || z
          ensure(pics ? 80 : 40)
          const top = y
          const tx = pics ? M + 220 : M
          if (pics) {
            framed(a, M, top - 8, 100, 56)
            tag('Inicio', M, top - 8)
            framed(z, M + 108, top - 8, 100, 56)
            tag('Final', M + 108, top - 8)
          }
          font('Body', 'bold', 10)
          color(ACCENT)
          doc.text(sh.code, tx, top)
          font('Body', 'bold', 10)
          color(INK)
          doc.text(doc.splitTextToSize(clean(sh.name) || 'Sin nombre', W - M - tx - 110)[0] ?? '', tx + 40, top)
          font('Body', 'normal', 9)
          color(MUTED)
          doc.text(formatDuration(sh.duration), W - M, top, { align: 'right' })
          y = top + 15
          const line = (k: string, v: string) => has(clean(v)) && para(`${k}: ${v}`, tx, undefined, 9)
          line('Cámara', sh.camera.replace(/\n/g, ' · '))
          line('Acción', sh.action)
          if (sh.dialogue.length) dialogue(sh.dialogue, tx, undefined, 9)
          line('Sonido', sh.sound)
          line('Continuidad', sh.continuity)
          y = Math.max(y, pics ? top + 56 : y) + 14
        }
        y += 6
      }
    }

    if (id === 'prompts') {
      head('Anexo de prompts', 'Biblia de producción · imagen y video por plano')
      for (const p of m.prompts) {
        sub(`${p.code} · ${p.name}`, 13)
        field('Imagen inicial', p.start)
        field('Imagen final', p.end)
        field('Video', p.video)
        y += 6
      }
    }

    if (id === 'sound') {
      head('Sonido y música')
      if (m.sound.notes.length) {
        sub('Notas de sonido', 14)
        for (const n of m.sound.notes) para(`${n.code} · ${n.title}: ${n.text}`)
        y += 12
      }
      for (const t of m.sound.tracks) {
        sub(t.name, 14)
        for (const c of t.clips) para(c)
        y += 10
      }
    }

    if (id === 'videos') {
      head('Videos', 'Biblia de producción · versión activa de cada plano')
      for (const v of m.videos) {
        ensure(70)
        const top = y
        framed(await imageData(v.imageId, cache), M, top - 8, 100, 56)
        font('Body', 'bold', 10)
        color(ACCENT)
        doc.text(v.code, M + 116, top + 6)
        color(INK)
        doc.text(doc.splitTextToSize(clean(v.name), W - 2 * M - 160)[0] ?? '', M + 156, top + 6)
        y = top + 22
        para([`Duración: ${formatDuration(v.duration)}`, v.model && `Modelo: ${v.model}`, v.versions > 1 && `${v.versions} versiones`].filter(Boolean).join(' · '), M + 116, undefined, 9, 'normal', MUTED)
        y = Math.max(y, top + 56) + 14
      }
    }

    if (id === 'continuity') {
      head('Continuidad', `Biblia de producción · revisión al exportar (${m.cover.date})`)
      if (!m.continuity.length) para('El auditor no encontró problemas de continuidad.', M, undefined, 11, 'italic')
      for (const f of m.continuity) {
        ensure(44)
        label(f.severity, M, y, f.severity === 'Grave' ? ACCENT : MUTED)
        if (f.where) {
          font('Body', 'normal', 8.5)
          color(MUTED)
          doc.text(doc.splitTextToSize(clean(f.where), W - 2 * M - 70)[0] ?? '', M + 64, y)
        }
        y += 13
        para(f.problem, M, undefined, 9.5, 'bold')
        para(`Sugerencia: ${f.suggestion}`, M, undefined, 9, 'italic')
        y += 10
      }
    }

    if (id === 'shotList') {
      const widths = [34, 104, 110, 46, 62, 62, 82, 54, 58, 32, 70]
      const scale = (W - 2 * M) / widths.reduce((a, b2) => a + b2, 0)
      const cw = widths.map((w) => w * scale)
      const header = () => {
        newPage()
        label('Biblia de producción', M, 54)
        font('Display', 'normal', 20)
        color(INK)
        doc.text('Lista de tomas', M, 78)
        let cx = M
        font('Body', 'bold', 7)
        color(MUTED)
        SHOT_LIST_COLUMNS.forEach((c, k) => {
          doc.text(c.toUpperCase(), cx + 3, 104, { charSpace: 0.6 })
          cx += cw[k]
        })
        rule(M, 110, W - M, INK, 0.6)
        y = 126
      }
      header()
      m.shotList.forEach((r, n) => {
        if (y > H - 50) header()
        if (n % 2 === 0) {
          doc.setFillColor(239, 231, 216)
          doc.rect(M, y - 11, W - 2 * M, 16, 'F')
        }
        let cx = M
        r.forEach((v, k) => {
          font('Body', k === 2 ? 'bold' : 'normal', 8)
          color(k === 0 ? ACCENT : INK)
          doc.text(doc.splitTextToSize(clean(v), cw[k] - 6)[0] ?? '', cx + 3, y)
          cx += cw[k]
        })
        y += 16
      })
    }
  }

  return doc.output('blob')
}
