// Exportar el guion como JSON de intercambio (el mismo formato que se importa).
// v2 lleva los planos; v1 los une en un solo texto por escena (con aviso de lo que se pierde).
import type { Project, Scene, Shot } from '../../types'
import { flattenToV1, hasCoverage, shotsOf, v1LossReport, v2DurationWarnings, V1_MAX_DURATION } from '../coverage/shots'
import { SCRIPT_FORMAT, SCRIPT_VERSION, SCRIPT_VERSION_SHOTS, type ImportedShot, type ScriptFile } from './schema'

export type ScriptVersion = typeof SCRIPT_VERSION | typeof SCRIPT_VERSION_SHOTS

/** Versión que conviene por defecto: v2 solo si alguna escena tiene planos. */
export const defaultScriptVersion = (scenes: Scene[]): ScriptVersion => (scenes.some(hasCoverage) ? SCRIPT_VERSION_SHOTS : SCRIPT_VERSION)

const clampDuration = (n: number) => Math.min(V1_MAX_DURATION, Math.max(0.5, n || 0.5))

function shotOut(s: Shot): ImportedShot {
  const out: ImportedShot = { name: s.name.trim() || 'Plano', duration: clampDuration(s.duration) }
  if (s.action) out.action = s.action
  if (s.dialogueLines?.length) out.dialogueLines = s.dialogueLines
  if (s.sound) out.sound = s.sound
  if (s.continuity) out.continuity = s.continuity
  if (s.camera && Object.keys(s.camera).length) out.camera = s.camera
  if (s.cameraDirection) out.cameraDirection = s.cameraDirection
  if (s.generationPrompt) out.generationPrompt = s.generationPrompt
  return out
}

/** Arma el JSON del guion. Sin imágenes, videos, rutas ni ids internos (igual que v1). */
export function buildScriptFile(project: Project, scenes: Scene[], version: ScriptVersion = defaultScriptVersion(scenes)): ScriptFile {
  const fieldName = new Map((project.customFields ?? []).map((f) => [f.id, f.name]))
  return {
    format: SCRIPT_FORMAT,
    version,
    project: {
      title: project.title,
      aspectRatio: project.aspectRatio,
      customFields: (project.customFields ?? []).map((f) => f.name),
      ...(project.style?.notes?.trim() ? { style: project.style.notes.trim() } : {}),
      characters: (project.characters ?? []).map((c) => ({ name: c.name, description: c.description })),
    },
    scenes: scenes.map((s) => {
      const flat = version === SCRIPT_VERSION ? flattenToV1(s) : null
      const sc = s.script
      const extras: Record<string, string> = {}
      for (const [id, value] of Object.entries(sc.extras ?? {})) {
        const name = fieldName.get(id)
        if (name && value) extras[name] = value
      }
      return {
        title: s.title,
        plannedDuration: flat ? flat.plannedDuration : clampDuration(s.plannedDuration),
        script: {
          action: flat ? flat.action : sc.action,
          dialogue: sc.dialogue,
          cameraDirection: flat ? flat.cameraDirection : sc.cameraDirection,
          soundDirection: flat ? flat.soundDirection : sc.soundDirection,
          generationPrompt: flat ? flat.generationPrompt : sc.generationPrompt,
          pronunciations: sc.pronunciations.map((p) => ({ written: p.written, spoken: p.spoken })),
          numbersToWords: !!sc.numbersToWords,
          ...(sc.camera && Object.keys(sc.camera).length ? { camera: sc.camera } : {}),
          extras,
        },
        ...(version === SCRIPT_VERSION_SHOTS && hasCoverage(s) ? { shots: shotsOf(s).map(shotOut) } : {}),
      }
    }),
  }
}

/** Para el botón de exportar: el texto JSON y el aviso de lo que se pierde (v1 con planos, o duraciones de más). */
export function exportScriptJson(project: Project, scenes: Scene[], version?: ScriptVersion): { json: string; warnings: string[] } {
  const file = buildScriptFile(project, scenes, version)
  return { json: JSON.stringify(file, null, 2), warnings: file.version === SCRIPT_VERSION ? v1LossReport(scenes) : v2DurationWarnings(scenes) }
}
