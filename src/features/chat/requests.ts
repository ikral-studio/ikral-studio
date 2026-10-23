// Pedidos a Claude desde botones de la app (van por el chat; Claude los atiende con su propio Claude Code).
import { useProject } from '../../stores/projectStore'
import { isDesktop, sendChat } from '../../database/db'
import { toast } from '../../stores/uiStore'
import { pad2, uid } from '../../utils'
import { charactersInScene } from '../project-style/style'

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
  toast('Pedido enviado a Claude por el chat 💡')
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
