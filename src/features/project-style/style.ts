// Estilo visual del proyecto y personajes: se agregan a cada prompt para que
// todas las escenas se vean iguales y los personajes no «cambien» entre clips.
import type { Project, Scene } from '../../types'

export const STYLE_PRESETS = [
  { id: 'cine', es: 'Cine realista 35 mm', en: 'cinematic live-action look, shot on 35mm film, natural color grading, subtle film grain' },
  { id: 'anim3d', es: 'Animación 3D familiar', en: 'high-quality 3D animated film style, soft global illumination, expressive characters' },
  { id: 'anim2d', es: 'Animación 2D cálida', en: 'warm hand-drawn 2D animation style, clean lines, soft shading' },
  { id: 'anime', es: 'Anime', en: 'Japanese anime style, cel shading, vibrant colors' },
  { id: 'comercial', es: 'Comercial limpio', en: 'clean modern commercial look, bright high-key lighting, crisp detail' },
  { id: 'documental', es: 'Documental', en: 'documentary style, natural light, handheld realism' },
  { id: 'neon', es: 'Video musical neón', en: 'music video style, neon lighting, high contrast, stylish' },
  { id: 'stop', es: 'Stop-motion', en: 'stop-motion animation style, handmade clay textures' },
  { id: 'acuarela', es: 'Acuarela', en: 'watercolor illustration style, soft paper texture' },
] as const

export function styleSpanish(p?: Project | null): string {
  const s = p?.style
  if (!s) return ''
  const preset = STYLE_PRESETS.find((x) => x.id === s.preset)
  return [preset?.es, s.notes?.trim()].filter(Boolean).join(' · ')
}

export function stylePrompt(p?: Project | null): string {
  const s = p?.style
  if (!s) return ''
  const preset = STYLE_PRESETS.find((x) => x.id === s.preset)
  const txt = [preset?.en, s.notes?.trim()].filter(Boolean).join('; ')
  return txt ? `Visual style: ${txt}.` : ''
}

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Personajes que aparecen (por nombre) en la escena. */
export function charactersInScene(p: Project | null | undefined, scene: Scene) {
  const chars = (p?.characters ?? []).filter((c) => c.name.trim() && c.description.trim())
  if (!chars.length) return []
  const s = scene.script
  const text = norm([scene.title, s.action, s.dialogue, s.cameraDirection, s.generationPrompt].join(' '))
  return chars.filter((c) => new RegExp(`(^|[^\\p{L}])${norm(c.name.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(text))
}

export function charactersPrompt(p: Project | null | undefined, scene: Scene): string {
  return charactersInScene(p, scene)
    .map((c) => `${c.name.trim()}: ${c.description.trim()}.`)
    .join(' ')
}
