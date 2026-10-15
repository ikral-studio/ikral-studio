import { CheckCheck, Circle, Clock3, FileText, Film, ImageIcon } from 'lucide-react'
import type { SceneStatus } from '../../types'
import { STATUS_LABEL } from '../../features/script-sync/derive'

const STYLE: Record<SceneStatus, { cls: string; Icon: typeof Circle }> = {
  draft: { cls: 'bg-white/5 text-ink-3', Icon: Circle },
  'storyboard-ready': { cls: 'bg-acc-purple/15 text-[#c4b5fd]', Icon: ImageIcon },
  'script-ready': { cls: 'bg-sel/15 text-[#93c5fd]', Icon: FileText },
  'video-pending': { cls: 'bg-warn/15 text-[#fcd34d]', Icon: Clock3 },
  'video-imported': { cls: 'bg-ok/15 text-[#86efac]', Icon: Film },
  reviewed: { cls: 'bg-ok/25 text-[#bbf7d0]', Icon: CheckCheck },
}

export function StatusChip({ status, compact }: { status: SceneStatus; compact?: boolean }) {
  const { cls, Icon } = STYLE[status]
  return (
    <span className={`chip ${cls}`} title={STATUS_LABEL[status]}>
      <Icon size={11} />
      {!compact && STATUS_LABEL[status]}
    </span>
  )
}

/** Color de acento por posición (azul, morado, naranja, verde). */
export const ACCENTS = ['#2563eb', '#7c3aed', '#ea7a12', '#16a34a']
export const accentFor = (i: number) => ACCENTS[i % ACCENTS.length]
