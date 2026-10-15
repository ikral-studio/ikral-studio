// Proyecto de ejemplo (sección 19). Solo estructura: sin imágenes ni videos inventados.
import type { Project, Scene } from '../../types'
import { createProjectData, createScene } from '../scene-management/factory'
import { deriveStatus } from '../script-sync/derive'

const TITLES = [
  'Todo va bien',
  'Un pequeño accidente',
  'Y todo se descompone',
  'El descubrimiento',
  'Tu negocio entra al celular',
  'La misma hora pico',
  'Sin cebolla',
  'Todo está conectado',
  'Hasta el cobro',
  'El mismo restaurante',
]

export function createDemoProject(defaultDuration = 8): { project: Project; scenes: Scene[] } {
  const project = createProjectData('Promocional de TuApp.digital')
  const scenes = TITLES.map((title, i) => {
    const scene = createScene(project.id, title, i === 3 ? 7 : defaultDuration, { order: i, collapsed: i !== 3 })
    if (i === 3) {
      scene.script = {
        action:
          'El joven de camisa azul saca su celular y se lo muestra al abuelito. Los demás escuchan y se acercan caminando hasta reunirse alrededor del teléfono.',
        dialogue: 'Joven: —¡Mire!',
        cameraDirection:
          'Inicio: el joven a la izquierda, el abuelito a la derecha. La cámara abre el encuadre. Conservar rostros, vestimenta y ambientación; evitar apariciones repentinas. La composición final coincide con la imagen final.',
        soundDirection: 'Español mexicano. Ambiente natural de restaurante. Sin música.',
        generationPrompt: '',
        pronunciations: [{ id: 'pr_demo', written: 'TuApp.digital', spoken: 'Tu Ap Dijital' }],
      }
      scene.status = deriveStatus(scene)
    }
    return scene
  })
  project.sceneIds = scenes.map((s) => s.id)
  return { project, scenes }
}
