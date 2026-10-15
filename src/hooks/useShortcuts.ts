import { useEffect } from 'react'
import { useProject } from '../stores/projectStore'
import { toast, useUI } from '../stores/uiStore'
import { playback } from '../features/playback/engine'
import { confirmDeleteScene, selectScene } from '../features/scene-management/actions'
import { isTypingTarget } from '../utils'

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      if (typing || blocked || mod || e.altKey) return
      const target = e.target as HTMLElement
      const onControl = target.closest('button, [role="slider"], [role="switch"], [role="separator"], a')

      if (e.code === 'Space' && !onControl) {
        e.preventDefault()
        playback.toggle()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = useProject.getState().selectedSceneId
        if (id) {
          e.preventDefault()
          void confirmDeleteScene(id)
        }
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !onControl) {
        const { project, selectedSceneId } = useProject.getState()
        if (!project?.sceneIds.length) return
        e.preventDefault()
        const i = selectedSceneId ? project.sceneIds.indexOf(selectedSceneId) : -1
        const j = Math.min(project.sceneIds.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
        selectScene(project.sceneIds[j], { seek: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
