import { useEffect } from 'react'
import { useProject } from '../stores/projectStore'
import { toast, useUI, zoomBy } from '../stores/uiStore'
import { nextSpeed, playback, usePlayback } from '../features/playback/engine'
import { confirmDeleteScene, selectScene } from '../features/scene-management/actions'
import { actionFor, mergeKeys, normalizeKey, type ActionId, type KeyBindings } from '../features/shortcuts/keys'
import { isTypingTarget } from '../utils'

/** Mientras se está grabando una tecla nueva en Configuración, los atajos se apagan. */
export const shortcutCapture = { active: false }

function run(action: ActionId) {
  const pb = usePlayback.getState()
  switch (action) {
    case 'playPause':
      return playback.toggle()
    // Cada vez que se aprieta otra vez en la misma dirección: 2×, 4×, 8×.
    case 'playReverse':
      return pb.playing && pb.reverse ? playback.setSpeed(nextSpeed(pb.speed)) : playback.playReverse(1)
    case 'playForward':
      return pb.playing && !pb.reverse ? playback.setSpeed(nextSpeed(pb.speed)) : void playback.play(1)
    case 'razor':
      useUI.setState({ tool: 'razor' })
      return toast('Tijera ✂️: haz clic en el timeline donde quieras cortar (V para volver)', 'info')
    case 'select':
      return useUI.setState({ tool: 'select' })
    case 'zoomIn':
      return zoomBy(1.4)
    case 'zoomOut':
      return zoomBy(1 / 1.4)
    case 'deleteScene': {
      const id = useProject.getState().selectedSceneId
      if (id) void confirmDeleteScene(id)
      return
    }
    case 'prevScene':
    case 'nextScene': {
      const { project, selectedSceneId } = useProject.getState()
      if (!project?.sceneIds.length) return
      const i = selectedSceneId ? project.sceneIds.indexOf(selectedSceneId) : -1
      const j = Math.min(project.sceneIds.length - 1, Math.max(0, i + (action === 'nextScene' ? 1 : -1)))
      return selectScene(project.sceneIds[j], { seek: true })
    }
  }
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutCapture.active) return
      const mod = e.metaKey || e.ctrlKey
      const typing = isTypingTarget(e.target)
      const ui = useUI.getState()
      const blocked = !!(ui.modal || ui.confirm || ui.lightbox)

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void useProject.getState().flushSave().then(() => {
          const st = useProject.getState().saveState
          toast(st === 'error' ? 'Error al guardar' : 'Guardado en este navegador', st === 'error' ? 'error' : 'ok')
        })
        return
      }
      if (mod && e.key.toLowerCase() === 'z' && !blocked) {
        e.preventDefault()
        if (e.shiftKey) useProject.getState().redo()
        else useProject.getState().undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y' && !blocked) {
        e.preventDefault()
        useProject.getState().redo()
        return
      }
      if (e.key === 'Escape' && ui.tool === 'razor' && !blocked) {
        useUI.setState({ tool: 'select' })
        return
      }
      if (typing || blocked || mod || e.altKey) return

      const keys: KeyBindings = mergeKeys(useProject.getState().settings.keys as Partial<KeyBindings>)
      const key = normalizeKey(e)
      const action = actionFor(keys, key)
      if (!action) return
      const target = e.target as HTMLElement
      const onControl = target.closest('button, [role="slider"], [role="switch"], [role="separator"], a, input, select')
      // Espacio y flechas sobre un botón o control hacen lo normal de ese control.
      if (onControl && (key === 'Space' || key.startsWith('Arrow') || key === 'Enter')) return
      e.preventDefault()
      run(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
