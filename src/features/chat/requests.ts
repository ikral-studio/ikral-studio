// Pedidos a Claude desde botones de la app (van por el chat; Claude los atiende con su propio Claude Code).
import { useProject } from '../../stores/projectStore'
import { isDesktop, sendChat } from '../../database/db'
import { toast } from '../../stores/uiStore'
import { pad2, uid } from '../../utils'

/** Escenas a las que les falta imagen inicial o final. */
export function scenesMissingImages(): string[] {
  const { project, scenes } = useProject.getState()
  if (!project) return []
  return project.sceneIds.filter((id) => {
    const s = scenes[id]
    return s && (!s.startImageId || !s.endImageId)
  })
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
