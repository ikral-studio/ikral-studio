// Piezas de diseño de la Biblia: tarjeta de sección numerada, estado (Sin preparar / En pruebas / Canon) y tarjeta de elemento.
import type { ReactNode } from 'react'
import { Check, FlaskConical, Loader2 } from 'lucide-react'
import { FullScreenButton } from '../common/Overlays'
import { useMediaUrl } from '../../features/media-library/media'
import { STATUS_ES, type ItemStatus } from '../../features/bible/items'

const PILL: Record<ItemStatus, string> = {
  canon: 'border-ok/40 bg-ok/10 text-ok',
  testing: 'border-[#6b7fd7]/40 bg-[#6b7fd7]/12 text-[#b4c0f5]',
  none: 'border-line bg-bg/60 text-ink-3',
}

export function StatusPill({ status, full }: { status: ItemStatus; full?: boolean }) {
  return (
    <span className={`inline-flex h-7 items-center justify-center gap-1 rounded-[8px] border px-2 text-[12.5px] font-medium ${PILL[status]} ${full ? 'w-full' : ''}`}>
      {status === 'canon' ? <Check size={13} /> : status === 'testing' ? <FlaskConical size={12} /> : null}
      {STATUS_ES[status]}
    </span>
  )
}

/** Caja de sección con número en círculo, título, conteo y acción a la derecha. */
export function Section({
  n,
  title,
  count,
  action,
  children,
  className = '',
  label,
}: {
  n: number
  title: string
  count?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <section className={`bible-card flex min-w-0 flex-col gap-3 p-4 ${className}`} aria-label={label ?? title}>
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6d5dfc] to-[#8b5cf6] text-[14px] font-bold text-white shadow-[0_0_14px_#7c3aed55]">
          {n}
        </span>
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {count !== undefined && <span className="text-[14px] text-ink-3">{count}</span>}
        <div className="ml-auto flex items-center gap-2">{action}</div>
      </div>
      {children}
    </section>
  )
}

/** Tarjeta de un personaje, locación, objeto o vestuario: imagen, nombre, nota y estado. */
export function ItemCard({
  name,
  sub,
  imageId,
  status,
  generating,
  wide,
  onOpen,
}: {
  name: string
  sub?: string
  imageId?: string
  status: ItemStatus
  generating?: boolean
  wide?: boolean
  onOpen: () => void
}) {
  const url = useMediaUrl(imageId, true)
  return (
    <li className="relative min-w-0">
      <button
        className="group flex w-full flex-col overflow-hidden rounded-[12px] border border-line bg-card text-left transition hover:border-[#7c3aed]/70 hover:shadow-[0_0_0_1px_#7c3aed55]"
        onClick={onOpen}
        aria-label={`${name} · ${STATUS_ES[status]}`}
      >
        <div className={`relative w-full overflow-hidden bg-bg ${wide ? 'aspect-[16/10]' : 'aspect-[4/5]'}`}>
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1b2740] to-[#121b2c] text-[34px] font-bold text-ink-3/60">
              {name.trim().charAt(0).toUpperCase() || '?'}
            </div>
          )}
          {generating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <Loader2 size={20} className="animate-spin text-white" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-card to-transparent" />
        </div>
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5 pt-1">
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-semibold">{name || 'Sin nombre'}</div>
            <div className="truncate text-[12.5px] text-ink-3">{sub || ' '}</div>
          </div>
          <StatusPill status={status} full />
        </div>
      </button>
      <FullScreenButton mediaId={imageId} title={name} className="absolute right-1.5 top-1.5" />
    </li>
  )
}

/** Opción grande con ícono (estilo, sensación, público). */
export function Tile({ icon, label, active, onClick, stacked }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; stacked?: boolean }) {
  return (
    <button
      className={`flex min-h-[56px] rounded-[11px] border text-[14px] transition ${stacked ? 'min-h-[76px] flex-col items-center justify-center gap-1.5 px-2 py-2.5 text-center' : 'items-center gap-2.5 px-3 py-2 text-left'} ${
        active ? 'border-[#6d7cff] bg-[#3b4bdb]/20 text-white shadow-[0_0_0_1px_#6d7cff66,0_0_18px_#4f46e533]' : 'border-line bg-card/70 text-ink-2 hover:border-line-2 hover:text-ink'
      }`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="text-[20px] leading-none">{icon}</span>
      <span className="leading-tight">{label}</span>
    </button>
  )
}
