// Pedidos a Claude desde botones de la app (van por el chat; Claude los atiende con su propio Claude Code).
import { useProject } from '../../stores/projectStore'
import { isDesktop, sendChat } from '../../database/db'
import { askConfirm, toast } from '../../stores/uiStore'
import { missingRefs } from './missingRefs'
import { pad2, uid } from '../../utils'
import { charactersInScene } from '../project-style/style'
import type { ItemKind } from '../../types'

/** Escenas a las que les falta imagen inicial o final. */
export function scenesMissingImages(): string[] {
  const { project, scenes } = useProject.getState()
  if (!project) return []
  return project.sceneIds.filter((id) => {
    const s = scenes[id]
    return s && (!s.startImageId || !s.endImageId)
  })
}

/** Pedir que se vuelva a generar la imagen inicial o final de una escena. */
export async function requestRegenerate(sceneId: string, slot: 'start' | 'end', note: string) {
  const { project, scenes } = useProject.getState()
  if (!project || !isDesktop()) return
  const label = `Escena ${pad2(project.sceneIds.indexOf(sceneId) + 1)} · ${scenes[sceneId]?.title ?? ''}`
  const which = slot === 'start' ? 'imagen inicial' : 'imagen final'
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: `🔄 Vuelve a generar la ${which} de la ${label}.${note.trim() ? ` Qué salió mal: ${note.trim()}` : ''}`,
    sceneId,
    sceneLabel: label,
    request: { type: 'regenerate-image', sceneIds: [sceneId], slot, note: note.trim() || undefined },
  })
  toast('Pedido enviado a Claude por el chat 🔄')
}

export async function requestImages(sceneIds: string[]) {
  const { project, scenes } = useProject.getState()
  if (!project || !isDesktop()) return
  if (!sceneIds.length) return toast('Todas las escenas ya tienen imagen inicial y final 👍', 'info')
  const missing = missingRefs(project, sceneIds.map((id) => scenes[id]).filter(Boolean))
  if (missing.length) {
    const ok = await askConfirm({
      title: 'Oye, te faltan imágenes de referencia',
      body: `Sin ellas, ChatGPT inventa cómo se ven o deja las pantallas en blanco:\n\n${missing.map((m) => `• ${m}`).join('\n')}\n\nAgrégalas en la Biblia antes de generar.`,
      confirmLabel: 'Generar de todos modos',
    })
    if (!ok) return
  }
  const label = (id: string) => `Escena ${pad2(project.sceneIds.indexOf(id) + 1)} · ${scenes[id]?.title ?? ''}`
  const one = sceneIds.length === 1
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: one
      ? `✨ Genera con ChatGPT las imágenes que faltan de la ${label(sceneIds[0])}.`
      : `✨ Genera con ChatGPT las imágenes que faltan en ${sceneIds.length} escenas: ${sceneIds.map((id) => pad2(project.sceneIds.indexOf(id) + 1)).join(', ')}.`,
    ...(one ? { sceneId: sceneIds[0], sceneLabel: label(sceneIds[0]) } : {}),
    request: { type: 'generate-images', sceneIds },
  })
  toast('Pedido enviado a Claude por el chat ✨')
}

/** Pedir a Claude una prueba de imagen de un personaje con este prompt (la hace con Codex/ChatGPT). */
export async function requestCharacterPreview(characterId: string, prompt: string) {
  const { project, updateCharacter } = useProject.getState()
  const ch = project?.characters?.find((c) => c.id === characterId)
  if (!project || !ch || !isDesktop()) return
  updateCharacter(characterId, { generating: true })
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: `👤 Haz con ChatGPT una prueba de imagen de «${ch.name}» con este prompt: ${prompt}`,
    request: { type: 'character-preview', characterId, name: ch.name, prompt },
  })
  toast('Pedido enviado a Claude 👤 La imagen aparecerá aquí')
}

/** Paso 5 de la Biblia: pedir a Claude cómo se ve cada personaje (texto + imagen con ChatGPT). */
export async function requestSuggestion(names: string[]) {
  const { project } = useProject.getState()
  if (!project || !isDesktop()) return
  if (!names.length) return toast('Primero carga el guion para que salgan los personajes', 'info')
  const idea = project.bible?.castIdea?.trim()
  useProject.getState().setBible({ suggesting: true })
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: `💡 Sugiere cómo se ve cada personaje (${names.join(', ')}) con el estilo de la Biblia${idea ? `. Idea: «${idea}»` : ''}, y haz su imagen con ChatGPT.`,
    request: { type: 'character-suggestions', names, idea },
  })
  await requestItemSuggestions('locations', true)
  toast('Pedido enviado a Claude: personajes y locaciones, con su imagen 💡')
}

/** Preproducción: pedir a Claude una prueba de la imagen inicial o final de una escena (la hace con Codex/ChatGPT). */
export async function requestFramePreview(sceneId: string, slot: 'start' | 'end', prompt: string) {
  const { project, scenes, updateFramePlan } = useProject.getState()
  const scene = scenes[sceneId]
  if (!project || !scene || !isDesktop()) return
  const label = `Escena ${pad2(project.sceneIds.indexOf(sceneId) + 1)} · ${scene.title}`
  // Las imágenes aprobadas de los personajes de la escena van de referencia para que se vean iguales.
  const characterImageIds = charactersInScene(project, scene).flatMap((c) => (c.imageId ? [c.imageId] : []))
  updateFramePlan(sceneId, slot, { generating: true })
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: `🖼️ Haz con ChatGPT una propuesta de la ${slot === 'start' ? 'imagen inicial' : 'imagen final'} de la ${label}${characterImageIds.length ? ', usando de referencia las imágenes aprobadas de sus personajes' : ''}.`,
    sceneId,
    sceneLabel: label,
    request: { type: 'frame-preview', sceneId, slot, prompt, ...(characterImageIds.length ? { characterImageIds } : {}) },
  })
  toast('Pedido enviado a Claude 🖼️ La imagen aparecerá aquí')
}

/** Cobertura: pedir a Claude una prueba de la imagen inicial o final de un plano (va ligada al id del plano). */
export async function requestShotPreview(sceneId: string, shotId: string, slot: 'start' | 'end', prompt: string) {
  const { project, scenes, updateShotFramePlan } = useProject.getState()
  const scene = scenes[sceneId]
  const shots = [...(scene?.shots ?? [])].sort((a, b) => a.order - b.order)
  const n = shots.findIndex((x) => x.id === shotId) + 1
  if (!project || !scene || !n || !isDesktop()) return
  const shot = shots[n - 1]
  const label = `Escena ${pad2(project.sceneIds.indexOf(sceneId) + 1)} · ${scene.title}`
  const text = [shot.name, shot.action, shot.cameraDirection, shot.continuity, shot.generationPrompt].filter(Boolean).join(' ')
  const characterImageIds = charactersInScene(project, { ...scene, script: { ...scene.script, action: `${scene.script.action} ${text}` } }).flatMap((c) => (c.imageId ? [c.imageId] : []))
  updateShotFramePlan(sceneId, shotId, slot, { generating: true })
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: `🎬 Haz con ChatGPT una propuesta de la ${slot === 'start' ? 'imagen inicial' : 'imagen final'} del Plano ${n} «${shot.name}» de la ${label}${characterImageIds.length ? ', usando de referencia las imágenes aprobadas de sus personajes' : ''}.`,
    sceneId,
    sceneLabel: label,
    request: { type: 'shot-preview', sceneId, shotId, slot, prompt, ...(characterImageIds.length ? { characterImageIds } : {}) },
  })
  toast('Pedido enviado a Claude 🎬 La imagen aparecerá en el plano')
}

/**
 * Biblia: pedir a Claude una prueba de imagen de una locación, objeto o vestuario. Con `scene` es el fotograma
 * de un estado (ej.: Escena 3 con papel): se guarda como prueba de esa escena y nunca se vuelve Canon.
 */
export async function requestItemPreview(kind: 'locations' | 'props' | 'wardrobe', itemId: string, prompt: string, scene?: { stateId: string; sceneId: string; label: string }) {
  const { project, updateItem } = useProject.getState()
  const it = project?.[kind]?.find((c) => c.id === itemId)
  if (!project || !it || !isDesktop()) return
  const what = kind === 'locations' ? '📍 la locación' : kind === 'props' ? '📦 el objeto' : '👕 el vestuario'
  updateItem(kind, itemId, { generating: true })
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: scene
      ? `Haz con ChatGPT el fotograma de ${what} «${it.name}» para la ${scene.label} (no es la referencia base: no la pongas como Canon) con este prompt: ${prompt}`
      : `Haz con ChatGPT una prueba de imagen de ${what} «${it.name}» con este prompt: ${prompt}`,
    request: { type: 'item-preview', kind, itemId, name: it.name, prompt, ...(scene ? { stateId: scene.stateId, sceneId: scene.sceneId } : {}) },
  })
  toast('Pedido enviado a Claude. La imagen aparecerá aquí')
}

/** Biblia: pedir a Claude que lea el guion y sugiera las locaciones (u objetos, vestuario). Llegan como sugerencia para aceptar. */
export async function requestItemSuggestions(kind: ItemKind, images = false) {
  const { project, setBible } = useProject.getState()
  if (!project || !isDesktop()) return
  if (!project.sceneIds.length) return images ? undefined : toast('Primero carga el guion para que Claude lo lea', 'info')
  const what = kind === 'locations' ? '📍 las locaciones (escenarios)' : kind === 'props' ? '📦 los objetos importantes' : '👕 el vestuario de cada personaje'
  setBible({ suggestingItems: [...new Set([...(project.bible?.suggestingItems ?? []), kind])] })
  await sendChat(project.id, {
    id: uid('msg_'),
    from: 'user',
    at: new Date().toISOString(),
    text: `✨ Lee el guion (${project.sceneIds.length} escenas) y sugiere ${what} con el estilo de la Biblia${images ? ', y haz la imagen de cada una con ChatGPT' : ''}.`,
    request: { type: 'item-suggestions', kind, ...(images ? { images: true } : {}) },
  })
  if (!images) toast('Pedido enviado a Claude. Las sugerencias aparecerán aquí ✨')
}
