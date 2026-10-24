// Ambiente para armar PDFs dentro de las pruebas (jsdom no tiene canvas ni sirve las fuentes).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { vi } from 'vitest'
import type { Project, Scene, Shot } from '../types'
import { createDemoProject } from '../features/projects/demo'
import { buildExample } from '../features/continuity/examples'
import { createScene } from '../features/scene-management/factory'

/** PNG de 1×1 (lo que «dibuja» el canvas falso). */
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function installPdfEnv() {
  vi.stubGlobal('fetch', async (url: string) => {
    const file = String(url).split('/').pop()!
    const buf = await readFile(join(process.cwd(), 'public', 'fonts', file))
    return new Response(buf)
  })
  HTMLCanvasElement.prototype.getContext = (() => ({ fillText() {}, drawImage() {} })) as never
  HTMLCanvasElement.prototype.toDataURL = () => PNG_1PX
}

/** Páginas del PDF (cuenta los objetos /Type /Page). */
export async function pageCount(blob: Blob): Promise<number> {
  const text = new TextDecoder('latin1').decode(await blob.arrayBuffer())
  return (text.match(/\/Type \/Page\b(?!s)/g) ?? []).length
}

/** Proyecto de ejemplo de siempre, con estilo, personajes y diálogos con caritas. */
export function portfolioFixture(): { project: Project; scenes: Scene[] } {
  const { project, scenes } = createDemoProject()
  project.style = { preset: 'cine', notes: 'Luz cálida de taquería' }
  project.characters = [
    { id: 'c1', name: 'Doña Chuy', role: 'Dueña', description: 'Señora de 60 años, mandil amarillo, trenza larga.' },
    { id: 'c2', name: 'Beto', role: 'Taquero', description: 'Joven de 25 años, gorra roja.' },
  ]
  scenes[0].script.dialogue = 'Beto (feliz): —¡Dos al pastor, sin cebolla! 🌮\nDoña Chuy (sorpresa | alegría): —¿Sin cebolla? ¡Sí, mi hijo!'
  scenes[1].script.action = 'Acción larga. '.repeat(160)
  return { project, scenes }
}

const at = (n: number) => new Date(Date.UTC(2026, 9, 24, 10, 0, n)).toISOString()

/** El ejemplo de Doña Chuy: etapas, decisiones, Canon y una escena con 4 planos. */
export function donaChuyFixture(): { project: Project; scenes: Scene[] } {
  const { project, scenes } = buildExample(
    [
      ['Todo va bien', 'antes', 'Doña Chuy cocina en la plancha. Beto lee las comandas de papel.'],
      ['Hora pico', 'despues', 'Beto cuelga los papelitos junto a la plancha.'],
    ],
    [
      { id: 'd1', text: 'Después de la app ya no hay comandas de papel.', proposedBy: 'gpt', proposedAt: at(1), status: 'approved', approvedBy: 'director', approvedAt: at(2), updatedAt: at(2) },
      { id: 'd2', text: 'Propuesta sin aprobar: nunca debe salir.', proposedBy: 'claude', proposedAt: at(3), status: 'proposed', updatedAt: at(3) },
    ],
  )
  project.title = 'Sin cebolla · Doña Chuy'
  project.bible = { look: 'real', era: 'Hoy', place: 'Guadalajara, México', mood: 'natural', audience: 'familia' }
  project.style = { preset: 'cine' }
  project.characters = [
    { id: 'c1', name: 'Doña Chuy', role: 'Dueña', description: 'Señora de 60 años, mandil amarillo.', imageId: 'img_chuy' },
    { id: 'c2', name: 'Beto', role: 'Taquero', description: 'Joven de 25 años.' },
  ]
  project.relations = [{ id: 'r1', a: 'c1', b: 'c2', label: 'Jefa / Empleado' }]
  project.locations = [{ id: 'l1', name: 'Taquería «El Güero»', note: 'Interior principal', description: 'Taquería con plancha al frente.', imageId: 'img_loc' }]
  project.mainLocationId = 'l1'
  project.wardrobe = [{ id: 'w1', name: 'Mandil amarillo', description: 'Mandil con bordado.', characterId: 'c1', imageId: 'img_mandil' }]
  project.props![0].imageId = 'img_comandas'
  project.audioTracks![0].clips = [{ id: 'ac1', mediaId: 'aud1', name: 'Cumbia de la plancha.mp3', start: 0, duration: 12 }]
  const s = scenes[0]
  s.script.dialogue = 'Doña Chuy (alegría): —¡Ya está la carne, mi hijo! 😄\nBeto: —¡Va!'
  s.script.soundDirection = 'Chisporroteo de la plancha.'
  const shot = (order: number, name: string, duration: number, extra: Partial<Shot> = {}): Shot => ({ id: `sh${order}`, order, name, duration, updatedAt: at(order), ...extra })
  s.shots = [
    shot(0, 'Plano general del restaurante', 3, { camera: { shot: 'wide' }, action: 'La taquería llena.', sound: 'Ambiente de gente.', generationPrompt: 'Wide shot of a busy taco shop.' }),
    shot(1, 'Detalle de sus manos', 2, { action: 'Manos volteando la carne.', continuity: 'La carne ya está volteada', startImageId: 'img_manos', prep: { start: { prompt: 'Close-up of hands flipping meat.' } } }),
    shot(2, 'Inserto de la carne en la parrilla', 2, {
      videoVersions: [{ id: 'v1', mediaId: 'vid1', duration: 2, model: 'Kling 2.5', createdAt: at(4) }],
      activeVideoVersionId: 'v1',
    }),
    shot(3, 'Primer plano de su rostro al responder', 3, { dialogueLines: [0], cameraDirection: 'Cámara en mano, leve acercamiento.' }),
  ]
  const extra = createScene(project.id, 'Cierre', 4, { order: 2 })
  scenes.push(extra)
  project.sceneIds = scenes.map((x) => x.id)
  return { project, scenes }
}
