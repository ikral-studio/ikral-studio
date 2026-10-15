import type { Project, Scene } from '../../types'
import { SPEEDS, cameraItem } from './camera'
import { STATUS_LABEL, activeVideo, effectiveDuration } from '../script-sync/derive'
import { formatDuration, pad2 } from '../../utils'

export const SHOT_COLUMNS = ['#', 'Escena', 'Duración', 'Plano', 'Ángulo', 'Movimiento', 'Lente', 'Luz', 'Video', 'Estado'] as const

export function shotRows(scenes: Scene[]): string[][] {
  return scenes.map((s, i) => {
    const c = s.script.camera ?? {}
    const name = (id?: string) => cameraItem(id)?.row[1] ?? '—'
    const move = c.move ? `${name(c.move)}${c.speed ? ` (${SPEEDS[c.speed].es})` : ''}` : '—'
    return [pad2(i + 1), s.title, formatDuration(effectiveDuration(s)), name(c.shot), name(c.angle), move, name(c.lens), name(c.light), activeVideo(s) ? 'Sí' : 'No', STATUS_LABEL[s.status]]
  })
}

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export const shotListCsv = (scenes: Scene[]) => [SHOT_COLUMNS as readonly string[], ...shotRows(scenes)].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
export const shotListTsv = (scenes: Scene[]) => [SHOT_COLUMNS as readonly string[], ...shotRows(scenes)].map((r) => r.join('\t')).join('\n')
export function shotListMarkdown(project: Project, scenes: Scene[]) {
  const head = `| ${SHOT_COLUMNS.join(' | ')} |\n|${SHOT_COLUMNS.map(() => '---').join('|')}|`
  return `# ${project.title} · Lista de tomas\n\n${head}\n${shotRows(scenes).map((r) => `| ${r.map((x) => x.replace(/\|/g, '/')).join(' | ')} |`).join('\n')}\n`
}
