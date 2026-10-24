import { useRef, useState } from 'react'
import { Check, ClipboardCopy, ImagePlus, Loader2, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
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
import { itemImagePrompt, MIXED, mixesMoments, sceneTargets } from '../../features/bible/itemStates'
import type { BibleItem, BibleKind, Character, CharacterTry, ItemKind, ItemState, Phase, Scene } from '../../types'
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
  sceneLabel,
}: {
  t: CharacterTry
  n: number
  approved: boolean
  onApprove: () => void
  onRemove: () => void
  wide?: boolean
  approvedLabel?: string
  /** Fotograma de una escena (ej.: «Escena 03 · Antes: papel»): no es la referencia base, no se aprueba como Canon. */
  sceneLabel?: string
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
      {sceneLabel ? (
        <span className="py-1 text-center text-[12px] leading-tight text-ink-2" title="Fotograma de escena: no cambia la imagen Canon">
          {sceneLabel}
        </span>
      ) : approved ? (
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

/**
 * Estados por escena: el mismo lugar u objeto con cosas que cambian según la etapa o la escena
 * (ej.: «Antes: papel» / «Después: app»). La descripción de arriba es lo fijo (Canon).
 */
function StatesFields({ kind, it, phases, scenes }: { kind: ItemKind; it: BibleItem; phases: Phase[]; scenes: Scene[] }) {
  const { updateItem } = useProject.getState()
  const states = it.states ?? []
  const save = (next: ItemState[]) => updateItem(kind, it.id, { states: next.length ? next : undefined })
  const patch = (id: string, p: Partial<ItemState>) => save(states.map((s) => (s.id === id ? { ...s, ...p, updatedAt: new Date().toISOString() } : s)))
  const toggle = (list: string[] | undefined, id: string) => {
    const next = list?.includes(id) ? list.filter((x) => x !== id) : [...(list ?? []), id]
    return next.length ? next : undefined
  }
  const add = () => save([...states, { id: uid('st_'), label: `Estado ${states.length + 1}`, shows: '', updatedAt: new Date().toISOString() }])
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line p-2.5" role="group" aria-label={`Estados por escena de ${it.name}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold">Estados por escena</span>
        <button className="btn btn-sm" onClick={add}>
          <Plus size={13} /> Agregar estado
        </button>
      </div>
      {!states.length && <p className="text-[13px] text-ink-3">¿Cambia algo entre escenas (ej.: papel antes, app después)? Agrega un estado por cada momento.</p>}
      {states.map((st) => (
        <div key={st.id} className="flex flex-col gap-1.5 rounded-[8px] bg-bg p-2" aria-label={`Estado ${st.label}`}>
          <div className="flex items-center gap-2">
            <input className="field !text-[14px] flex-1" aria-label="Nombre del estado" value={st.label} onChange={(e) => patch(st.id, { label: e.target.value })} placeholder="Ej.: Antes: papel" />
            <button className="icon-btn sm" onClick={() => save(states.filter((s) => s.id !== st.id))} aria-label={`Quitar estado ${st.label}`} title="Quitar este estado">
              <Trash2 size={13} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] text-ink-2">Vale en:</span>
            {phases.map((p) => {
              const on = !!st.phaseIds?.includes(p.id)
              return (
                <button key={p.id} className={`btn btn-sm ${on ? '!border-sel !bg-sel/20 !text-white' : ''}`} aria-pressed={on} onClick={() => patch(st.id, { phaseIds: toggle(st.phaseIds, p.id) })}>
                  {on && <Check size={12} />} etapa {p.name}
                </button>
              )
            })}
            {(st.sceneIds ?? []).map((id) => {
              const n = scenes.findIndex((s) => s.id === id) + 1
              return (
                n > 0 && (
                  <button key={id} className="btn btn-sm !border-sel !bg-sel/20 !text-white" aria-pressed onClick={() => patch(st.id, { sceneIds: toggle(st.sceneIds, id) })} title="Quitar esta escena">
                    <Check size={12} /> Escena {String(n).padStart(2, '0')}
                  </button>
                )
              )
            })}
            <select className="field !h-8 !w-auto !text-[13px]" aria-label="Agregar escena al estado" value="" onChange={(e) => e.target.value && patch(st.id, { sceneIds: toggle(st.sceneIds, e.target.value) })}>
              <option value="">+ Escena…</option>
              {scenes.map((s, i) =>
                st.sceneIds?.includes(s.id) ? null : (
                  <option key={s.id} value={s.id}>
                    Escena {String(i + 1).padStart(2, '0')} · {s.title}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[12.5px] text-ink-2">Se ve</span>
              <textarea className="field !text-[13px]" rows={2} aria-label={`Se ve en ${st.label}`} value={st.shows} onChange={(e) => patch(st.id, { shows: e.target.value })} placeholder="Ej.: comandas de papel colgadas" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[12.5px] text-ink-2">No se ve</span>
              <textarea className="field !text-[13px]" rows={2} aria-label={`No se ve en ${st.label}`} value={st.hides ?? ''} onChange={(e) => patch(st.id, { hides: e.target.value || undefined })} placeholder="Ej.: tablet ni celular" />
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ItemSheet({ kind, itemId, onRemoved }: { kind: BibleKind; itemId: string; onRemoved?: () => void }) {
  const project = useProject((s) => s.project)
  const scenes = useProject((s) => s.scenes)
  const it = (project?.[kind] as (BibleItem | Character)[] | undefined)?.find((c) => c.id === itemId)
  const url = useMediaUrl(it?.imageId)
  const [busy, setBusy] = useState(false)
  // «¿Para qué?»: la referencia base (lo fijo) o el fotograma de una escena (con su estado).
  const [target, setTarget] = useState('base')
  const sceneRef = useRef<{ stateId: string; sceneId: string; label: string } | undefined>(undefined)
  const { updateItem } = useProject.getState()
  const wide = kind === 'locations'
  const es = KIND_ES[kind]

  const addTry = (mediaId: string) => {
    const cur = (useProject.getState().project?.[kind] as BibleItem[] | undefined)?.find((c) => c.id === itemId)
    if (!cur) return
    const sc = sceneRef.current
    const tries = cur.tries?.some((t) => t.mediaId === mediaId)
      ? cur.tries
      : [...(cur.tries ?? []), { id: uid('try_'), mediaId, at: new Date().toISOString(), ...(sc ? { stateId: sc.stateId, sceneId: sc.sceneId } : {}) }]
    // El fotograma de una escena nunca toca la imagen Canon.
    updateItem(kind, itemId, sc ? { tries } : { tries, imageId: mediaId })
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
  const ordered = orderedScenes(project, scenes)
  const item = kind !== 'characters' ? (it as BibleItem) : undefined
  const states = item?.states ?? []
  const targets = item && states.length ? sceneTargets(project, item, ordered) : []
  const chosen = targets.find((t) => t.scene.id === target)
  let prompt: string
  let blocked: string | undefined
  sceneRef.current = undefined
  if (!item || !states.length) {
    prompt = it.prompt ?? itemPrompt(project, kind, it, ordered)
    const mixed = kind === 'characters' ? undefined : mixesMoments(prompt)
    blocked = mixed && MIXED(mixed)
  } else if (!chosen) {
    ;({ prompt, blocked } = itemImagePrompt(project, kind as ItemKind, item, { mode: 'base' }))
  } else {
    const r = itemImagePrompt(project, kind as ItemKind, item, { mode: 'scene', sceneId: chosen.scene.id }, ordered)
    ;({ prompt, blocked } = r)
    if (r.state) sceneRef.current = { stateId: r.state.id, sceneId: chosen.scene.id, label: `Escena ${String(chosen.n).padStart(2, '0')}` }
  }
  const forScene = sceneRef.current
  const tries = it.tries ?? []
  const status = itemStatus(it)
  const tryLabel = (t: CharacterTry) => {
    if (!t.sceneId) return undefined
    const n = ordered.findIndex((s) => s.id === t.sceneId) + 1
    const st = states.find((s) => s.id === t.stateId)
    return `${n ? `Escena ${String(n).padStart(2, '0')}` : 'Escena'}${st ? ` · ${st.label}` : ''}`
  }
  const generate = () => (kind === 'characters' ? requestCharacterPreview(itemId, prompt) : requestItemPreview(kind, itemId, prompt, forScene))

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
          {item && <StatesFields kind={kind as ItemKind} it={item} phases={project.phases ?? []} scenes={ordered} />}
          {states.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold">¿Para qué es la imagen?</span>
              <select className="field !text-[14px]" aria-label={`Para qué es la imagen de ${it.name}`} value={chosen ? chosen.scene.id : 'base'} onChange={(e) => setTarget(e.target.value)}>
                <option value="base">Referencia base (el lugar sin cosas de una escena)</option>
                {targets.map((t) => (
                  <option key={t.scene.id} value={t.scene.id}>
                    Fotograma de la {t.label}
                  </option>
                ))}
              </select>
              {chosen && <span className="text-[12.5px] text-ink-3">Esta imagen se guarda como prueba de la escena. No cambia la imagen Canon.</span>}
            </label>
          )}
          <div className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2 text-[13px] text-ink-3">
              {chosen ? 'Prompt para esta escena (se arma solo con la ficha y su estado):' : 'Prompt para la imagen (puedes cambiarlo):'}
              {!chosen && it.prompt !== undefined && (
                <button className="btn btn-sm btn-ghost" onClick={() => updateItem(kind, itemId, { prompt: undefined })} title="Volver al prompt que se arma solo con la Biblia y el guion">
                  <RotateCcw size={12} /> Automático
                </button>
              )}
            </span>
            <textarea
              className="field !text-[13px] leading-snug"
              rows={4}
              aria-label={`Prompt de ${it.name}`}
              value={prompt}
              readOnly={!!chosen}
              onChange={(e) => !chosen && updateItem(kind, itemId, { prompt: e.target.value })}
            />
          </div>
          {blocked && (
            <p role="alert" className="rounded-[8px] border border-warn/50 bg-warn/10 p-2 text-[13px] text-warn">
              ⚠️ {blocked}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {isDesktop() && (
              <button
                className="btn !h-9 !border-[#7c3aed]/60 !text-[#ddd6fe]"
                onClick={() => void generate()}
                disabled={it.generating || !!blocked}
                title={blocked ? 'Primero arregla el aviso de arriba' : 'Claude la hace con ChatGPT (gratis) y aparece aquí'}
              >
                <Sparkles size={15} /> {forScene ? `Generar imagen para la ${forScene.label}` : tries.length ? 'Generar otra prueba' : 'Generar imagen'}
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
                sceneLabel={tryLabel(t)}
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
