import { useState } from 'react'
import { Check, ClipboardCopy, ImagePlus, Loader2, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { isDesktop } from '../../database/db'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { characterPrompt } from '../../features/bible/bible'
import { orderedScenes } from '../../features/script-sync/derive'
import { requestCharacterPreview } from '../../features/chat/requests'
import { IMAGE_ACCEPT } from '../scenes/MediaSlot'
import { uid } from '../../utils'
import type { CharacterTry } from '../../types'

function TryThumb({ t, n, approved, onApprove, onRemove }: { t: CharacterTry; n: number; approved: boolean; onApprove: () => void; onRemove: () => void }) {
  const url = useMediaUrl(t.mediaId, true)
  return (
    <li className={`flex w-[104px] shrink-0 flex-col gap-1 rounded-[10px] border p-1 ${approved ? 'border-ok' : 'border-line'}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-[8px] bg-bg">
        {url && <img src={url} alt={`Prueba ${n}`} title={t.prompt} className="h-full w-full object-cover" />}
        {!approved && (
          <button className="icon-btn sm absolute right-1 top-1 !bg-black/60 !text-white" onClick={onRemove} aria-label={`Quitar prueba ${n}`} title="Quitar esta prueba">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {approved ? (
        <span className="py-1 text-center text-[12.5px] text-ok">✓ Aprobada</span>
      ) : (
        <button className="btn btn-sm !justify-center" onClick={onApprove} aria-label={`Aprobar prueba ${n}`}>
          <Check size={13} /> Aprobar
        </button>
      )}
    </li>
  )
}

/** Ficha de un personaje: descripción, prompt editable, pruebas de imagen y la aprobada. */
export function CharacterSheet({ characterId }: { characterId: string }) {
  const project = useProject((s) => s.project)
  const scenes = useProject((s) => s.scenes)
  const ch = project?.characters?.find((c) => c.id === characterId)
  const url = useMediaUrl(ch?.imageId)
  const [busy, setBusy] = useState(false)
  const { updateCharacter } = useProject.getState()

  const addTry = (mediaId: string) => {
    const cur = useProject.getState().project?.characters?.find((c) => c.id === characterId)
    if (!cur) return
    const tries = cur.tries?.some((t) => t.mediaId === mediaId) ? cur.tries : [...(cur.tries ?? []), { id: uid('try_'), mediaId, at: new Date().toISOString() }]
    updateCharacter(characterId, { tries, imageId: mediaId })
  }
  const accept = async (files: File[]) => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'image')
    setBusy(false)
    if (asset) {
      addTry(asset.id)
      toast('Imagen del personaje guardada')
    }
  }
  const drop = useFileDrop(accept, addTry)
  if (!ch) return null
  const auto = characterPrompt(project, ch, orderedScenes(project, scenes))
  const prompt = ch.prompt ?? auto
  const tries = ch.tries ?? []

  return (
    <div className="flex flex-col gap-3 border-t border-line px-3 pb-3 pt-3" aria-label={`Ficha de ${ch.name}`}>
      <div className="grid grid-cols-[150px_1fr] gap-3">
        <div
          {...drop.props}
          className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[10px] border border-dashed ${drop.over ? 'border-sel bg-sel/10' : 'border-line bg-bg'}`}
        >
          {busy ? (
            <Loader2 size={22} className="animate-spin text-ink-3" />
          ) : url ? (
            <img src={url} alt={`Imagen aprobada de ${ch.name}`} className="h-full w-full object-cover" />
          ) : (
            <button className="flex flex-col items-center gap-1.5 p-2 text-center text-[13px] text-ink-3" onClick={() => void pickFiles(IMAGE_ACCEPT).then(accept)}>
              <ImagePlus size={22} />
              Suelta o escoge una imagen
            </button>
          )}
          {ch.generating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 p-2 text-center text-[13px] text-white">
              <Loader2 size={22} className="animate-spin" />
              Claude está generando…
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold">¿Cómo se ve?</span>
            <textarea
              className="field !text-[14px]"
              rows={2}
              aria-label={`Descripción de ${ch.name}`}
              placeholder="Ej.: señora de 60 años, chaparrita, cabello canoso en chongo, mandil de flores"
              value={ch.description}
              onChange={(e) => updateCharacter(characterId, { description: e.target.value })}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2 text-[13px] text-ink-3">
              Prompt para la imagen (puedes cambiarlo):
              {ch.prompt !== undefined && (
                <button className="btn btn-sm btn-ghost" onClick={() => updateCharacter(characterId, { prompt: undefined })} title="Volver al prompt que se arma solo con la Biblia y el guion">
                  <RotateCcw size={12} /> Automático
                </button>
              )}
            </span>
            <textarea
              className="field !text-[13px] leading-snug"
              rows={4}
              aria-label={`Prompt de ${ch.name}`}
              value={prompt}
              onChange={(e) => updateCharacter(characterId, { prompt: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {isDesktop() && (
              <button
                className="btn !h-9 !border-[#7c3aed]/60 !text-[#ddd6fe]"
                onClick={() => void requestCharacterPreview(characterId, prompt)}
                disabled={ch.generating}
                title="Claude la hace con ChatGPT (gratis) y aparece aquí"
              >
                <Sparkles size={15} /> {tries.length ? 'Generar otra prueba' : 'Generar imagen'}
              </button>
            )}
            <button className="btn !h-9" onClick={() => void navigator.clipboard.writeText(prompt).then(() => toast('Prompt copiado'))}>
              <ClipboardCopy size={15} /> Copiar prompt
            </button>
            {ch.generating && (
              <button className="btn !h-9 btn-ghost" onClick={() => updateCharacter(characterId, { generating: false })} title="Quitar el aviso si ya no va a llegar">
                Cancelar espera
              </button>
            )}
          </div>
        </div>
      </div>

      {tries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Pruebas ({tries.length})</span>
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`Pruebas de ${ch.name}`}>
            {tries.map((t, i) => (
              <TryThumb
                key={t.id}
                t={t}
                n={i + 1}
                approved={t.mediaId === ch.imageId}
                onApprove={() => {
                  updateCharacter(characterId, { imageId: t.mediaId })
                  toast(`Prueba ${i + 1} aprobada para ${ch.name}`)
                }}
                onRemove={() => updateCharacter(characterId, { tries: tries.filter((x) => x.id !== t.id) })}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
