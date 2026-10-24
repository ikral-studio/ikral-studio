import { useState } from 'react'
import { Check, ClipboardCopy, ImagePlus, Loader2, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { isDesktop } from '../../database/db'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { importFiles } from '../../features/scene-management/actions'
import { pickFiles, useFileDrop } from '../../hooks/useFileDrop'
import { KIND_ES, itemPrompt, itemStatus } from '../../features/bible/items'
import { orderedScenes } from '../../features/script-sync/derive'
import { requestCharacterPreview, requestItemPreview } from '../../features/chat/requests'
import { IMAGE_ACCEPT } from '../scenes/MediaSlot'
import { uid } from '../../utils'
import type { BibleItem, BibleKind, Character, CharacterTry, ItemKind, Phase } from '../../types'
import { StatusPill } from './bibleUi'
import { FullScreenButton } from '../common/Overlays'
import { GptBibleToggle } from '../gpt/GptBiblePanel'
import { targetKey } from '../../features/gpt/bible'

export function TryThumb({
  t,
  n,
  approved,
  onApprove,
  onRemove,
  wide,
  approvedLabel = '✓ Aprobada',
}: {
  t: CharacterTry
  n: number
  approved: boolean
  onApprove: () => void
  onRemove: () => void
  wide?: boolean
  approvedLabel?: string
}) {
  const url = useMediaUrl(t.mediaId, true)
  return (
    <li className={`flex shrink-0 flex-col gap-1 rounded-[10px] border p-1 ${wide ? 'w-[150px]' : 'w-[104px]'} ${approved ? 'border-ok' : 'border-line'}`}>
      <div className={`relative overflow-hidden rounded-[8px] bg-bg ${wide ? 'aspect-video' : 'aspect-[3/4]'}`}>
        {url && <img src={url} alt={`Prueba ${n}`} title={t.prompt} className="h-full w-full object-cover" />}
        <FullScreenButton mediaId={t.mediaId} title={`Prueba ${n}`} className="absolute left-1 top-1" />
        {!approved && (
          <button className="icon-btn sm absolute right-1 top-1 !bg-black/60 !text-white" onClick={onRemove} aria-label={`Quitar prueba ${n}`} title="Quitar esta prueba">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {approved ? (
        <span className="py-1 text-center text-[12.5px] text-ok">{approvedLabel}</span>
      ) : (
        <button className="btn btn-sm !justify-center" onClick={onApprove} aria-label={`Aprobar prueba ${n}`}>
          <Check size={13} /> Aprobar
        </button>
      )}
    </li>
  )
}

/** Ficha de un elemento de la Biblia: descripción, prompt editable, pruebas de imagen y la Canon. */
/** Continuidad: en qué etapas puede aparecer y con qué otros nombres se le encuentra en el guion. */
function ContinuityFields({ kind, it, phases }: { kind: ItemKind; it: BibleItem; phases: Phase[] }) {
  const { updateItem } = useProject.getState()
  const only = (it.onlyIn ?? []).filter((id) => phases.some((p) => p.id === id))
  const toggle = (id: string) => {
    const next = only.includes(id) ? only.filter((x) => x !== id) : phases.map((p) => p.id).filter((x) => x === id || only.includes(x))
    updateItem(kind, it.id, { onlyIn: next.length ? next : undefined })
  }
  const saveAliases = (text: string) => {
    const list = [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]
    updateItem(kind, it.id, { aliases: list.length ? list : undefined })
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {phases.length > 0 && (
        <div className="flex flex-col gap-1" role="group" aria-label={`Etapas donde aparece ${it.name}`}>
          <span className="text-[13px] text-ink-2">Aparece en: {only.length ? '' : <span className="text-ink-3">todas las etapas</span>}</span>
          <div className="flex flex-wrap gap-1.5">
            {phases.map((p) => {
              const on = only.includes(p.id)
              return (
                <button key={p.id} className={`btn btn-sm ${on ? '!border-sel !bg-sel/20 !text-white' : ''}`} aria-pressed={on} onClick={() => toggle(p.id)}>
                  {on && <Check size={12} />} {p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-2">Otros nombres (separados por coma)</span>
        <input
          key={`${it.id}:${(it.aliases ?? []).join(',')}`}
          className="field !text-[14px]"
          aria-label={`Otros nombres de ${it.name}`}
          placeholder="Ej.: papelitos, tickets"
          defaultValue={(it.aliases ?? []).join(', ')}
          onBlur={(e) => saveAliases(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
    </div>
  )
}

export function ItemSheet({ kind, itemId, onRemoved }: { kind: BibleKind; itemId: string; onRemoved?: () => void }) {
  const project = useProject((s) => s.project)
  const scenes = useProject((s) => s.scenes)
  const it = (project?.[kind] as (BibleItem | Character)[] | undefined)?.find((c) => c.id === itemId)
  const url = useMediaUrl(it?.imageId)
  const [busy, setBusy] = useState(false)
  const { updateItem } = useProject.getState()
  const wide = kind === 'locations'
  const es = KIND_ES[kind]

  const addTry = (mediaId: string) => {
    const cur = (useProject.getState().project?.[kind] as BibleItem[] | undefined)?.find((c) => c.id === itemId)
    if (!cur) return
    const tries = cur.tries?.some((t) => t.mediaId === mediaId) ? cur.tries : [...(cur.tries ?? []), { id: uid('try_'), mediaId, at: new Date().toISOString() }]
    updateItem(kind, itemId, { tries, imageId: mediaId })
  }
  const accept = async (files: File[]) => {
    if (!files[0]) return
    setBusy(true)
    const [asset] = await importFiles([files[0]], 'image')
    setBusy(false)
    if (asset) {
      addTry(asset.id)
      toast(`Imagen de ${it?.name ?? es.one} guardada`)
    }
  }
  const drop = useFileDrop(accept, addTry)
  if (!project || !it) return null
  const auto = itemPrompt(project, kind, it, orderedScenes(project, scenes))
  const prompt = it.prompt ?? auto
  const tries = it.tries ?? []
  const status = itemStatus(it)
  const generate = () => (kind === 'characters' ? requestCharacterPreview(itemId, prompt) : requestItemPreview(kind, itemId, prompt))

  return (
    <div className="flex flex-col gap-3" aria-label={`Ficha de ${it.name}`}>
      <div className={`grid gap-4 ${wide ? 'grid-cols-1 sm:grid-cols-[300px_1fr]' : 'grid-cols-[170px_1fr]'}`}>
        <div className="flex flex-col gap-2">
          <div
            {...drop.props}
            className={`relative flex items-center justify-center overflow-hidden rounded-[12px] border border-dashed ${wide ? 'aspect-video' : 'aspect-[3/4]'} ${drop.over ? 'border-sel bg-sel/10' : 'border-line bg-bg'}`}
          >
            {busy ? (
              <Loader2 size={22} className="animate-spin text-ink-3" />
            ) : url ? (
              <>
                <img src={url} alt={`Imagen aprobada de ${it.name}`} className="h-full w-full object-cover" />
                <FullScreenButton mediaId={it.imageId} title={it.name} className="absolute right-1.5 top-1.5" />
              </>
            ) : (
              <button className="flex flex-col items-center gap-1.5 p-2 text-center text-[13px] text-ink-3" onClick={() => void pickFiles(IMAGE_ACCEPT).then(accept)}>
                <ImagePlus size={22} />
                Suelta o escoge una imagen
              </button>
            )}
            {it.generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 p-2 text-center text-[13px] text-white">
                <Loader2 size={22} className="animate-spin" />
                Claude está generando…
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <StatusPill status={status} />
            {status === 'canon' && (
              <button className="btn btn-sm btn-ghost" onClick={() => updateItem(kind, itemId, { imageId: undefined })} title="Deja de ser oficial; vuelve a «En pruebas»">
                Quitar Canon
              </button>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          {kind !== 'characters' && (
            <label className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold">Nombre</span>
              <input className="field !text-[14px]" aria-label={`Nombre de ${it.name}`} value={it.name} onChange={(e) => updateItem(kind, itemId, { name: e.target.value })} />
            </label>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-ink-2">{kind === 'characters' ? 'Papel (se ve en la tarjeta)' : 'Nota corta (se ve en la tarjeta)'}</span>
              <input
                className="field !text-[14px]"
                aria-label={`Nota de ${it.name}`}
                placeholder={kind === 'characters' ? 'Ej.: Dueña' : kind === 'locations' ? 'Ej.: Interior principal' : 'Ej.: Para llevar'}
                value={('role' in it ? it.role : 'note' in it ? it.note : '') ?? ''}
                onChange={(e) => updateItem(kind, itemId, kind === 'characters' ? ({ role: e.target.value } as Partial<BibleItem>) : { note: e.target.value })}
              />
            </label>
            {kind === 'wardrobe' && (
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-ink-2">¿Quién lo usa?</span>
                <select
                  className="field !text-[14px]"
                  aria-label={`Personaje de ${it.name}`}
                  value={'characterId' in it ? (it.characterId ?? '') : ''}
                  onChange={(e) => updateItem(kind, itemId, { characterId: e.target.value || undefined })}
                >
                  <option value="">— Nadie en especial —</option>
                  {(project.characters ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {kind !== 'characters' && <ContinuityFields kind={kind} it={it as BibleItem} phases={project.phases ?? []} />}
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold">¿Cómo se ve?</span>
            <textarea
              className="field !text-[14px]"
              rows={2}
              aria-label={`Descripción de ${it.name}`}
              placeholder={es.placeholder}
              value={it.description}
              onChange={(e) => updateItem(kind, itemId, { description: e.target.value })}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2 text-[13px] text-ink-3">
              Prompt para la imagen (puedes cambiarlo):
              {it.prompt !== undefined && (
                <button className="btn btn-sm btn-ghost" onClick={() => updateItem(kind, itemId, { prompt: undefined })} title="Volver al prompt que se arma solo con la Biblia y el guion">
                  <RotateCcw size={12} /> Automático
                </button>
              )}
            </span>
            <textarea className="field !text-[13px] leading-snug" rows={4} aria-label={`Prompt de ${it.name}`} value={prompt} onChange={(e) => updateItem(kind, itemId, { prompt: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            {isDesktop() && (
              <button className="btn !h-9 !border-[#7c3aed]/60 !text-[#ddd6fe]" onClick={() => void generate()} disabled={it.generating} title="Claude la hace con ChatGPT (gratis) y aparece aquí">
                <Sparkles size={15} /> {tries.length ? 'Generar otra prueba' : 'Generar imagen'}
              </button>
            )}
            <button className="btn !h-9" onClick={() => void navigator.clipboard.writeText(prompt).then(() => toast('Prompt copiado'))}>
              <ClipboardCopy size={15} /> Copiar prompt
            </button>
            {it.generating && (
              <button className="btn !h-9 btn-ghost" onClick={() => updateItem(kind, itemId, { generating: false })} title="Quitar el aviso si ya no va a llegar">
                Cancelar espera
              </button>
            )}
            {kind !== 'characters' && (
              <button
                className="btn btn-danger !h-9 ml-auto"
                onClick={async () => {
                  if (!(await askConfirm({ title: `¿Quitar «${it.name}»?`, body: `Se quita la ficha completa (no solo la imagen) con sus pruebas. Va a la Papelera y puedes pulsar «Deshacer» o Cmd+Z.`, confirmLabel: 'Quitar', danger: true }))) return
                  const name = it.name.trim() || 'sin nombre'
                  const trashId = useProject.getState().removeItem(kind, itemId)
                  onRemoved?.()
                  if (trashId)
                    toast(`${es.one.charAt(0).toUpperCase() + es.one.slice(1)} «${name}» ${kind === 'locations' ? 'eliminada' : 'eliminado'}`, 'info', {
                      label: 'Deshacer',
                      run: () => {
                        const err = useProject.getState().restoreTrash(trashId)
                        toast(err ?? `«${name}» regresó`, err ? 'error' : 'ok')
                      },
                    })
                }}
              >
                <Trash2 size={15} /> Quitar
              </button>
            )}
            <GptBibleToggle target={targetKey(kind, itemId)} />
          </div>
        </div>
      </div>

      {tries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Pruebas ({tries.length})</span>
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`Pruebas de ${it.name}`}>
            {tries.map((t, i) => (
              <TryThumb
                key={t.id}
                t={t}
                n={i + 1}
                wide={wide}
                approvedLabel="✓ Canon"
                approved={t.mediaId === it.imageId}
                onApprove={() => {
                  updateItem(kind, itemId, { imageId: t.mediaId })
                  toast(`Prueba ${i + 1} es Canon de ${it.name}`)
                }}
                onRemove={() => updateItem(kind, itemId, { tries: tries.filter((x) => x.id !== t.id) })}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Ficha de un personaje (la de antes, ahora con el mismo diseño que todo lo de la Biblia). */
export function CharacterSheet({ characterId }: { characterId: string }) {
  return <ItemSheet kind="characters" itemId={characterId} />
}
