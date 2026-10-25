import { Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { isDesktop } from '../../database/db'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { requestSuggestion } from '../../features/chat/requests'
import { suggestionPrompt } from '../../features/bible/bible'
import { orderedScenes } from '../../features/script-sync/derive'
import type { CharacterSuggestion } from '../../types'

function SuggestionCard({ s }: { s: CharacterSuggestion }) {
  const url = useMediaUrl(s.imageId)
  return (
    <li className="flex gap-3 rounded-[10px] border border-line bg-card p-2.5">
      <div className="flex aspect-[3/4] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-bg text-[12px] text-ink-3">
        {url ? <img src={url} alt={`Sugerencia de ${s.name}`} className="h-full w-full object-cover" /> : 'Sin imagen'}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="text-[15px] font-semibold">{s.name}</div>
        <p className="text-[13px] leading-snug text-ink-2">{s.description}</p>
        <button
          className="btn btn-sm mt-auto self-start"
          onClick={() => {
            useProject.getState().acceptSuggestion(s.name)
            toast(`${s.name} quedó en su ficha`)
          }}
        >
          <Check size={13} /> Aceptar
        </button>
      </div>
    </li>
  )
}

/** Cajita con la idea general de los personajes y botón Generar. */
function IdeaBox({ names }: { names: string[] }) {
  const idea = useProject((s) => s.project?.bible?.castIdea ?? '')
  const suggesting = useProject((s) => !!s.project?.bible?.suggesting)
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="field !text-[14px]"
        rows={2}
        aria-label="Idea de los personajes"
        placeholder="Ej.: familia típica de Los Ángeles que va por unos tacos"
        value={idea}
        onChange={(e) => useProject.getState().setBible({ castIdea: e.target.value })}
      />
      {isDesktop() ? (
        suggesting ? (
          <div className="flex items-center gap-2 text-[14px] text-[#ddd6fe]">
            <Loader2 size={16} className="animate-spin" /> Claude está generando los personajes y las locaciones… aparecerán aquí.
            <button className="btn btn-sm btn-ghost" onClick={() => useProject.getState().setBible({ suggesting: false })}>
              Cancelar espera
            </button>
          </div>
        ) : (
          <button className="btn btn-hero !h-12 !text-[16px]" onClick={() => void requestSuggestion(names)}>
            <Sparkles size={18} /> Generar
          </button>
        )
      ) : (
        <>
          <button
            className="btn btn-hero !h-12 !text-[16px]"
            onClick={() =>
              void navigator.clipboard
                .writeText(suggestionPrompt(useProject.getState().project, names, orderedScenes(useProject.getState().project, useProject.getState().scenes)))
                .then(() => toast('Pedido copiado: pégalo en Codex o ChatGPT 📋'))
            }
          >
            <Sparkles size={18} /> Generar (copiar para Codex)
          </button>
          <p className="text-[13px] text-ink-3">Pégalo en Codex o ChatGPT (gratis con tu plan). Luego suelta cada imagen en la ficha de su personaje.</p>
        </>
      )}
    </div>
  )
}

/** Paso 5: Claude sugiere cómo se ve cada personaje; al aceptar, pasa a su ficha. */
export function SuggestionStep({ names }: { names: string[] }) {
  const suggestion = useProject((s) => s.project?.suggestion)
  const { acceptSuggestion, dismissSuggestion } = useProject.getState()

  if (!suggestion?.length) return <IdeaBox names={names} />

  return (
    <div className="flex flex-col gap-2.5" aria-label="Sugerencia de personajes">
      <ul className="flex flex-col gap-2">
        {suggestion.map((s) => (
          <SuggestionCard key={s.name} s={s} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn !h-10 !border-ok/60"
          onClick={() => {
            acceptSuggestion()
            toast('Listo: cada personaje quedó en su ficha')
          }}
        >
          <Check size={16} /> Aceptar todas
        </button>
        {isDesktop() && (
          <button className="btn !h-10" onClick={() => void requestSuggestion(names)}>
            <RefreshCw size={15} /> Pedir otra
          </button>
        )}
        <button className="btn !h-10" onClick={dismissSuggestion}>
          <X size={15} /> Descartar
        </button>
      </div>
    </div>
  )
}
