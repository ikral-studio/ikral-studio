import { useState } from 'react'
import { ClipboardCopy, ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
import { isDesktop } from '../../database/db'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { characterPrompt } from '../../features/bible/bible'
import { requestCharacterPreview } from '../../features/chat/requests'
import { IMAGE_ACCEPT } from '../scenes/MediaSlot'

/** Ficha de un personaje: descripción editable, el prompt que se usará y su imagen de prueba. */
export function CharacterSheet({ characterId }: { characterId: string }) {
  const project = useProject((s) => s.project)
  const ch = project?.characters?.find((c) => c.id === characterId)
  const url = useMediaUrl(ch?.imageId)
  const [busy, setBusy] = useState(false)
  const { updateCharacter } = useProject.getState()

  const accept = async (files: File[]) => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'image')
    setBusy(false)
    if (asset) {
      updateCharacter(characterId, { imageId: asset.id })
      toast('Imagen del personaje guardada')
    }
  }
  const drop = useFileDrop(accept, (id) => updateCharacter(characterId, { imageId: id }))
  if (!ch) return null
  const prompt = characterPrompt(project, ch)

  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 border-t border-line px-3 pb-3 pt-3" aria-label={`Ficha de ${ch.name}`}>
      <div
        {...drop.props}
        className={`relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[10px] border border-dashed ${drop.over ? 'border-sel bg-sel/10' : 'border-line bg-bg'}`}
      >
        {busy ? (
          <Loader2 size={22} className="animate-spin text-ink-3" />
        ) : url ? (
          <>
            <img src={url} alt={`Imagen de prueba de ${ch.name}`} className="h-full w-full object-cover" />
            <button
              className="icon-btn sm absolute right-1 top-1 !bg-black/60 !text-white"
              onClick={() => updateCharacter(characterId, { imageId: undefined })}
              aria-label={`Quitar imagen de ${ch.name}`}
              title="Quitar imagen"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button className="flex flex-col items-center gap-1.5 p-2 text-center text-[13px] text-ink-3" onClick={() => void pickFiles(IMAGE_ACCEPT).then(accept)}>
            <ImagePlus size={22} />
            Suelta o escoge una imagen
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold">¿Cómo se ve?</span>
          <textarea
            className="field !text-[14px]"
            rows={3}
            aria-label={`Descripción de ${ch.name}`}
            placeholder="Ej.: señora de 60 años, chaparrita, cabello canoso en chongo, mandil de flores"
            value={ch.description}
            onChange={(e) => updateCharacter(characterId, { description: e.target.value })}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-3">Así se le pide a la IA (con el estilo de la Biblia):</span>
          <p className="rounded-[8px] bg-bg px-2.5 py-2 text-[12.5px] leading-snug text-ink-2" aria-label={`Prompt de ${ch.name}`}>
            {prompt}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDesktop() && (
            <button
              className="btn !h-9 !border-[#7c3aed]/60 !text-[#ddd6fe]"
              onClick={() => void requestCharacterPreview(characterId)}
              disabled={!ch.description.trim()}
              title={ch.description.trim() ? 'Claude la hace con ChatGPT y la pone aquí' : 'Primero escribe cómo se ve'}
            >
              <Sparkles size={15} /> {ch.imageId ? 'Otra versión' : 'Generar imagen de prueba'}
            </button>
          )}
          <button
            className="btn !h-9"
            onClick={() => void navigator.clipboard.writeText(prompt).then(() => toast('Prompt copiado'))}
          >
            <ClipboardCopy size={15} /> Copiar prompt
          </button>
        </div>
      </div>
    </div>
  )
}
