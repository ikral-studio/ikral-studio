import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { installPdfEnv, pageCount, portfolioFixture, donaChuyFixture } from './pdfEnv'
import { exportPortfolioPdf } from '../features/projects/portfolio'
import { ALL_BIBLE_SECTIONS, BIBLE_SECTIONS, exportProductionBiblePdf, productionBibleModel, sectionLabel, type BibleModel } from '../features/projects/productionBible'
import { createDemoProject } from '../features/projects/demo'
import { createProjectData, createScene } from '../features/scene-management/factory'

beforeAll(() => {
  installPdfEnv()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T10:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const isPdf = async (blob: Blob) => new TextDecoder('latin1').decode((await blob.arrayBuffer()).slice(0, 5)) === '%PDF-'

/** ¿La sección tiene algo adentro? (la portada siempre). */
function filled(m: BibleModel, id: (typeof ALL_BIBLE_SECTIONS)[number]): boolean {
  switch (id) {
    case 'cover':
      return !!m.cover.title
    case 'sound':
      return m.sound.notes.length + m.sound.tracks.length > 0
    case 'continuity':
      return true
    default:
      return (m[id] as unknown[]).length > 0
  }
}

describe('Portafolio PDF (no cambia)', () => {
  it('el proyecto de ejemplo sigue saliendo con las mismas páginas', async () => {
    const { project, scenes } = portfolioFixture()
    const blob = await exportPortfolioPdf(project, scenes)
    expect(await isPdf(blob)).toBe(true)
    // 25 páginas medidas antes de sacar las piezas compartidas a createPdfKit.
    expect(await pageCount(blob)).toBe(25)
  }, 60000)

  it('con cobertura también sale igual que antes', async () => {
    const { project, scenes } = donaChuyFixture()
    expect(await pageCount(await exportPortfolioPdf(project, scenes))).toBe(10)
  }, 60000)
})

describe('Biblia de Producción · modelo', () => {
  it('trae las 13 secciones del plan en orden', () => {
    expect(BIBLE_SECTIONS.map((s) => s.label)).toEqual([
      'Portada',
      'Estilo',
      'Personajes',
      'Canon',
      'Etapas narrativas',
      'Decisiones aprobadas',
      'Guion',
      'Cobertura',
      'Anexo de prompts',
      'Sonido y música',
      'Videos',
      'Continuidad',
      'Lista de tomas',
    ])
  })

  it('proyecto viejo (sin Biblia, etapas ni planos): sin secciones vacías', () => {
    const { project, scenes } = createDemoProject()
    const m = productionBibleModel(project, scenes)
    for (const id of m.sections) expect(filled(m, id), id).toBe(true)
    expect(m.sections).not.toContain('characters')
    expect(m.sections).not.toContain('canon')
    expect(m.sections).not.toContain('phases')
    expect(m.sections).not.toContain('decisions')
    expect(m.sections).not.toContain('videos')
    expect(m.sections).not.toContain('continuity')
    expect(m.sections).toEqual(expect.arrayContaining(['cover', 'script', 'coverage', 'prompts', 'shotList']))
    // Sin cobertura: un plano por escena, con el código de la escena.
    expect(m.shotList).toHaveLength(scenes.length)
    expect(m.coverage[3].shots).toHaveLength(1)
    expect(m.coverage[3].shots[0].code).toBe('04')
  })

  it('proyecto vacío: solo la portada', () => {
    const p = createProjectData('Vacío')
    expect(productionBibleModel(p, []).sections).toEqual(['cover'])
  })

  it('Doña Chuy (etapas + 4 planos): salen todas las secciones', () => {
    const { project, scenes } = donaChuyFixture()
    const m = productionBibleModel(project, scenes)
    expect(m.sections).toEqual(ALL_BIBLE_SECTIONS)
    for (const id of m.sections) expect(filled(m, id), id).toBe(true)
    expect(m.cover.location).toBe('Taquería «El Güero»')
    expect(m.cover.format).toBe('16:9 horizontal')
    expect(m.cover.date).toBe('24 de octubre de 2026')
    expect(m.style.map(([k]) => k)).toEqual(['Look', 'Época', 'Lugar', 'Ánimo y colores', 'Público', 'Estilo visual'])
    const chuy = m.characters.find((c) => c.name === 'Doña Chuy')!
    expect(chuy.relations).toEqual(['Jefa / Empleado · Beto'])
    expect(chuy.wardrobe).toEqual(['Mandil amarillo'])
    expect(m.canon.map((c) => c.kind)).toEqual(['Locación', 'Objeto', 'Vestuario'])
    expect(m.canon[1].detail).toContain('Solo en: ANTES, TRANSICIÓN')
    expect(m.phases.map((p) => p.name)).toEqual(['ANTES', 'TRANSICIÓN', 'DESPUÉS'])
    expect(m.phases[0].items).toEqual(['Comandas de papel (objeto)'])
    expect(m.phases[0].scenes).toEqual(['01 Todo va bien'])
    // Solo las aprobadas por el director, con quién y cuándo.
    expect(m.decisions).toHaveLength(1)
    expect(m.decisions[0].proposed).toBe('Propuso: GPT · 24 de octubre de 2026')
    expect(m.decisions[0].approved).toBe('Aprobó: Director · 24 de octubre de 2026')
    expect(JSON.stringify(m)).not.toContain('nunca debe salir')
    expect(m.script[0].phase).toBe('ANTES')
    expect(m.script[0].dialogue[0]).toMatchObject({ speaker: 'Doña Chuy', emotion: 'alegría' })
    const shots = m.coverage[0].shots
    expect(shots.map((s) => s.code)).toEqual(['01.1', '01.2', '01.3', '01.4'])
    expect(shots[1].continuity).toBe('La carne ya está volteada')
    expect(shots[3].dialogue[0].speaker).toBe('Doña Chuy')
    expect(m.prompts.find((p) => p.code === '01.2')!.start).toBe('Close-up of hands flipping meat.')
    expect(m.prompts.find((p) => p.code === '01.1')!.video).toBe('Wide shot of a busy taco shop.')
    expect(m.prompts.find((p) => p.code === '01.3')!.end).toContain('Closing frame')
    expect(m.sound.notes.map((n) => n.code)).toEqual(['01', '01.1'])
    expect(m.sound.tracks[0].clips[0]).toBe('Cumbia de la plancha.mp3 · 0 s a 12 s')
    expect(m.videos).toEqual([expect.objectContaining({ code: '01.3', model: 'Kling 2.5', duration: 2 })])
    // «papelitos» en DESPUÉS: el auditor lo encuentra al exportar.
    expect(m.continuity.some((f) => f.severity === 'Grave' && f.where.includes('papelitos'))).toBe(true)
    expect(m.shotList).toHaveLength(4 + 2)
    expect(m.shotList[0].slice(0, 5)).toEqual(['01.1', 'Todo va bien', 'Plano general del restaurante', '3 s', 'Gran angular'])
  })

  it('el usuario escoge qué secciones salen', () => {
    const { project, scenes } = donaChuyFixture()
    expect(productionBibleModel(project, scenes, ['cover', 'canon', 'videos']).sections).toEqual(['cover', 'canon', 'videos'])
    expect(productionBibleModel(project, scenes, ['shotList']).sections).toEqual(['shotList'])
  })

  it('no cambia el proyecto', () => {
    const { project, scenes } = donaChuyFixture()
    const before = JSON.stringify({ project, scenes })
    productionBibleModel(project, scenes)
    expect(JSON.stringify({ project, scenes })).toBe(before)
  })
})

describe('Biblia de Producción · PDF', () => {
  it('Doña Chuy: dibuja todas las secciones', async () => {
    const { project, scenes } = donaChuyFixture()
    const drawn: string[] = []
    const blob = await exportProductionBiblePdf(project, scenes, undefined, (s) => drawn.push(s))
    expect(await isPdf(blob)).toBe(true)
    expect(drawn).toEqual(ALL_BIBLE_SECTIONS.map(sectionLabel))
    expect(await pageCount(blob)).toBeGreaterThanOrEqual(ALL_BIBLE_SECTIONS.length)
  }, 60000)

  it('proyecto viejo: sale sin errores y solo con lo que tiene', async () => {
    const { project, scenes } = createDemoProject()
    const drawn: string[] = []
    const blob = await exportProductionBiblePdf(project, scenes, undefined, (s) => drawn.push(s))
    expect(await isPdf(blob)).toBe(true)
    expect(drawn).toEqual(productionBibleModel(project, scenes).sections.map(sectionLabel))
  }, 60000)

  it('acentos, eñes y emojis no lo rompen (textos largos brincan de página)', async () => {
    const p = createProjectData('Año nuevo 🎉 en la Ciudad de México — «ñandú»')
    p.description = 'Pequeña historia con acentos: canción, corazón, pingüino. 😄🌮'
    p.bible = { look: 'otro', lookOther: '🎨 Acuarela suave', era: '1980–1990', place: 'Coyoacán', mood: 'alegre', audience: 'ninos' }
    p.characters = [{ id: 'c', name: 'Ñoño 🤖', description: 'Robot pequeño ✓ con ojos → grandes. '.repeat(30) }]
    p.phases = [{ id: 'a', name: 'ÉPOCA ÚNICA' }]
    const s = createScene(p.id, 'Canción del ñandú 🎶', 5, { order: 0 })
    s.phaseId = 'a'
    s.script.action = 'Él baila. ¿Qué pasará? ¡Sorpresa! '.repeat(200)
    s.script.dialogue = 'Ñoño (miedo | alegría): —¡Ay, qué susto! 😱\n—Línea sin nombre.\nAbuela (tristeza): —Mi niño…'
    p.sceneIds = [s.id]
    const drawn: string[] = []
    const blob = await exportProductionBiblePdf(p, [s], undefined, (x) => drawn.push(x))
    expect(await isPdf(blob)).toBe(true)
    expect(drawn).toContain('Guion')
    expect(drawn).toContain('Continuidad')
    expect(await pageCount(blob)).toBeGreaterThan(drawn.length)
  }, 60000)

  it('el Portafolio sigue igual aunque exista la Biblia', async () => {
    const { project, scenes } = portfolioFixture()
    await exportProductionBiblePdf(project, scenes)
    expect(await pageCount(await exportPortfolioPdf(project, scenes))).toBe(25)
  }, 60000)
})
