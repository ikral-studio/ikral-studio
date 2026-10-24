import { useState } from 'react'
import { ClipboardCopy, ImagePlus, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { isDesktop } from '../../database/db'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { IMAGE_ACCEPT } from '../scenes/MediaSlot'
import { uid } from '../../utils'
import { TryThumb } from './CharacterSheet'
import type { FramePlan } from '../../types'

/**
 * Una imagen inicial o final (de una escena o de un plano): la aprobada grande, su prompt y sus pruebas.
 * `label` = «Imagen inicial de escena 01» o «Imagen inicial del plano 2 de escena 01».
 */
export function FramePlanBox({
  which,
  label,
  plan,
  current,
  autoPrompt,
  onPatch,
  onRequest,
}: {
  which: string
  label: string
  plan?: FramePlan
  /** Lee el plan al momento (para no perder pruebas que llegaron mientras se importaba). */
  current: () => FramePlan | undefined
  autoPrompt: string
  onPatch: (patch: Partial<FramePlan>) => void
  onRequest: (prompt: string) => void
}) {
  const project = useProject((s) => s.project)
  const url = useMediaUrl(plan?.approvedId)
  const [busy, setBusy] = useState(false)
  const wide = project?.aspectRatio !== '9:16'

  const addTry = (mediaId: string) => {
    const cur = current()
    const tries = cur?.tries?.some((t) => t.mediaId === mediaId) ? cur.tries : [...(cur?.tries ?? []), { id: uid('try_'), mediaId, at: new Date().toISOString() }]
    onPatch({ tries, approvedId: mediaId })
  }
  const accept = async (files: File[]) => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'image')
    setBusy(false)
    if (asset) {
      addTry(asset.id)
      toast(`${label} guardada`)
    }
  }
  const drop = useFileDrop(accept, addTry)
  const prompt = plan?.prompt ?? autoPrompt
  const tries = plan?.tries ?? []

  return (
    <div className="flex flex-col gap-2" aria-label={label}>
      <div className="flex items-center justify-between text-[14px] font-semibold">
        {which}
        <span className={`text-[12.5px] font-normal ${plan?.approvedId ? 'text-ok' : 'text-ink-3'}`}>{plan?.approvedId ? '✓ Aprobada' : 'Sin aprobar'}</span>
      </div>
      <div
        {...drop.props}
        className={`relative flex items-center justify-center overflow-hidden rounded-[10px] border border-dashed ${wide ? 'aspect-video' : 'mx-auto aspect-[9/16] w-1/2'} ${drop.over ? 'border-sel bg-sel/10' : 'border-line bg-bg'}`}
      >
        {busy ? (
          <Loader2 size={22} className="animate-spin text-ink-3" />
        ) : url ? (
          <img src={url} alt={`${label} aprobada`} className="h-full w-full object-cover" />
        ) : (
          <button className="flex flex-col items-center gap-1.5 p-2 text-center text-[13px] text-ink-3" onClick={() => void pickFiles(IMAGE_ACCEPT).then(accept)} aria-label={`Escoger ${label.toLowerCase()}`}>
            <ImagePlus size={22} />
            Suelta o escoge una imagen
          </button>
        )}
        {plan?.generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 p-2 text-center text-[13px] text-white">
            <Loader2 size={22} className="animate-spin" />
            Claude está generando…
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-[13px] text-ink-3">
          Prompt (puedes cambiarlo):
          {plan?.prompt !== undefined && (
            <button className="btn btn-sm btn-ghost" onClick={() => onPatch({ prompt: undefined })} title="Volver al prompt que se arma solo con la escena y la Biblia">
              <RotateCcw size={12} /> Automático
            </button>
          )}
        </span>
        <textarea className="field !text-[13px] leading-snug" rows={4} aria-label={`Prompt de ${label.toLowerCase()}`} value={prompt} onChange={(e) => onPatch({ prompt: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        {isDesktop() && (
          <button className="btn !h-9 !border-[#7c3aed]/60 !text-[#ddd6fe]" onClick={() => onRequest(prompt)} disabled={plan?.generating} title="Claude la hace con ChatGPT (gratis) y aparece aquí">
            <Sparkles size={15} /> {tries.length ? 'Generar otra' : 'Generar'}
          </button>
        )}
        <button className="btn !h-9" onClick={() => void navigator.clipboard.writeText(prompt).then(() => toast('Prompt copiado'))}>
          <ClipboardCopy size={15} /> Copiar prompt
        </button>
        {plan?.generating && (
          <button className="btn !h-9 btn-ghost" onClick={() => onPatch({ generating: false })} title="Quitar el aviso si ya no va a llegar">
            Cancelar espera
          </button>
        )}
      </div>
      {tries.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`Pruebas de ${label.toLowerCase()}`}>
          {tries.map((t, i) => (
            <TryThumb
              key={t.id}
              t={t}
              n={i + 1}
              wide={wide}
              approved={t.mediaId === plan?.approvedId}
              onApprove={() => {
                onPatch({ approvedId: t.mediaId })
                toast(`Prueba ${i + 1} aprobada`)
              }}
              onRemove={() => onPatch({ tries: tries.filter((x) => x.id !== t.id) })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
