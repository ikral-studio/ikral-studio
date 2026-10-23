// Secciones de la Biblia: personajes, locaciones, objetos, vestuario y relaciones.
import { useState } from 'react'
import { Heart, Plus, Trash2, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { findCharacters } from '../../features/bible/bible'
import { KIND_ES, itemStatus } from '../../features/bible/items'
import { orderedScenes } from '../../features/script-sync/derive'
import { Modal } from '../common/Overlays'
import { ImportScriptButton } from '../sidebar/Sidebar'
import { ItemSheet } from './CharacterSheet'
import { ItemCard, Section } from './bibleUi'
import type { BibleItem, BibleKind, Character } from '../../types'

/** Botón «+ Nuevo …» que se vuelve cajita para escribir el nombre. */
function AddButton({ kind, onAdded }: { kind: BibleKind; onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const es = KIND_ES[kind]
  const add = () => {
    if (!name.trim()) return
    const id = useProject.getState().addItem(kind, name)
    setName('')
    setOpen(false)
    if (id) onAdded(id)
  }
  if (!open)
    return (
      <button className="btn !h-9 !px-3 !text-[13.5px]" onClick={() => setOpen(true)}>
        <Plus size={15} /> {es.add}
      </button>
    )
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <input className="field !h-9 !w-[170px] !text-[14px]" autoFocus aria-label={`Nombre del nuevo ${es.one}`} placeholder={`Nombre del ${es.one}`} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn-primary !h-9" type="submit" disabled={!name.trim()}>
        Agregar
      </button>
      <button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="Cancelar">
        <X size={16} />
      </button>
    </form>
  )
}

/** Ventana con la ficha de un elemento. */
function SheetModal({ kind, id, onClose }: { kind: BibleKind; id: string; onClose: () => void }) {
  const name = useProject((s) => (s.project?.[kind] as BibleItem[] | undefined)?.find((c) => c.id === id)?.name ?? '')
  return (
    <Modal title={`${KIND_ES[kind].one.charAt(0).toUpperCase() + KIND_ES[kind].one.slice(1)} · ${name}`} onClose={onClose} width={920}>
      <ItemSheet kind={kind} itemId={id} onRemoved={onClose} />
    </Modal>
  )
}

const GRID = 'grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(118px,1fr))]'
const GRID_WIDE = 'grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]'

/** 2 · Personajes: salen del guion; cada uno con su ficha. */
export function CharactersSection() {
  const project = useProject((s) => s.project)
  const scenes = useProject((s) => s.scenes)
  const [openId, setOpenId] = useState<string>()
  if (!project) return null
  const found = findCharacters(project, orderedScenes(project, scenes))
  const byId = new Map((project.characters ?? []).map((c) => [c.id, c]))
  const canon = found.filter((f) => f.id && byId.get(f.id)?.imageId).length

  return (
    <Section n={2} title="Personajes" label="Personajes del guion" count={`${canon}/${found.length}`} action={<AddButton kind="characters" onAdded={setOpenId} />}>
      {found.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[14px] text-ink-2">Todavía no hay personajes. Carga tu guion y salen solos de los diálogos (como «Ana: —Hola»).</p>
          <ImportScriptButton className="!h-11 !px-5 !text-[15px]" />
        </div>
      ) : (
        <ul className={GRID}>
          {found.map((f) => {
            const ch = f.id ? byId.get(f.id) : undefined
            return (
              <ItemCard
                key={f.name}
                name={f.name}
                sub={ch?.role?.trim() || `${f.scenes} escena${f.scenes === 1 ? '' : 's'} · ${f.lines} diálogo${f.lines === 1 ? '' : 's'}`}
                imageId={ch?.imageId}
                status={ch ? itemStatus(ch) : 'none'}
                generating={ch?.generating}
                onOpen={() => setOpenId(f.id ?? useProject.getState().addCharacter(f.name))}
              />
            )
          })}
        </ul>
      )}
      {openId && <SheetModal kind="characters" id={openId} onClose={() => setOpenId(undefined)} />}
    </Section>
  )
}

/** 3, 4, 5 · Locaciones, objetos y vestuario. */
export function ItemsSection({ kind, n, empty }: { kind: Exclude<BibleKind, 'characters'>; n: number; empty: string }) {
  const project = useProject((s) => s.project)
  const [openId, setOpenId] = useState<string>()
  if (!project) return null
  const list = project[kind] ?? []
  const canon = list.filter((it) => itemStatus(it) === 'canon').length
  const who = (it: BibleItem) => project.characters?.find((c) => c.id === it.characterId)?.name

  return (
    <Section n={n} title={KIND_ES[kind].many} count={`${canon}/${list.length}`} action={<AddButton kind={kind} onAdded={setOpenId} />}>
      {list.length === 0 ? (
        <p className="text-[14px] text-ink-3">{empty}</p>
      ) : (
        <ul className={kind === 'locations' ? GRID_WIDE : GRID}>
          {list.map((it) => (
            <ItemCard
              key={it.id}
              name={it.name}
              sub={it.note?.trim() || (kind === 'wardrobe' ? who(it) : undefined)}
              imageId={it.imageId}
              status={itemStatus(it)}
              generating={it.generating}
              wide={kind === 'locations'}
              onOpen={() => setOpenId(it.id)}
            />
          ))}
        </ul>
      )}
      {openId && <SheetModal kind={kind} id={openId} onClose={() => setOpenId(undefined)} />}
    </Section>
  )
}

function Avatar({ ch }: { ch?: Character }) {
  const url = useMediaUrl(ch?.imageId, true)
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-panel bg-card-2 text-[13px] font-semibold text-ink-2">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : (ch?.name.charAt(0).toUpperCase() ?? '?')}
    </span>
  )
}

/** 6 · Relaciones entre personajes. */
export function RelationsSection() {
  const project = useProject((s) => s.project)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  if (!project) return null
  const chars = (project.characters ?? []).filter((c) => c.name.trim())
  const byId = new Map(chars.map((c) => [c.id, c]))
  const relations = (project.relations ?? []).filter((r) => byId.has(r.a) && byId.has(r.b))
  const add = () => {
    useProject.getState().addRelation(a, b, label)
    toast('Relación agregada')
    setA('')
    setB('')
    setLabel('')
    setAdding(false)
  }

  return (
    <Section
      n={6}
      title="Relaciones entre personajes"
      label="Relaciones entre personajes"
      count={relations.length}
      action={
        !adding && (
          <button className="btn !h-9 !px-3 !text-[13.5px]" onClick={() => setAdding(true)} disabled={chars.length < 2} title={chars.length < 2 ? 'Primero abre la ficha de al menos 2 personajes' : undefined}>
            <Plus size={15} /> Nueva relación
          </button>
        )
      }
    >
      {adding && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-card p-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (a && b && a !== b) add()
          }}
        >
          <select className="field !h-9 !w-auto !text-[14px]" aria-label="Primer personaje" value={a} onChange={(e) => setA(e.target.value)}>
            <option value="">Personaje…</option>
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-ink-3">↔</span>
          <select className="field !h-9 !w-auto !text-[14px]" aria-label="Segundo personaje" value={b} onChange={(e) => setB(e.target.value)}>
            <option value="">Personaje…</option>
            {chars
              .filter((c) => c.id !== a)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <input className="field !h-9 min-w-[160px] flex-1 !text-[14px]" aria-label="Qué son" placeholder="Qué son (ej.: Matrimonio)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-primary !h-9" type="submit" disabled={!a || !b || a === b}>
            Agregar
          </button>
          <button className="icon-btn" type="button" onClick={() => setAdding(false)} aria-label="Cancelar">
            <X size={16} />
          </button>
        </form>
      )}
      {relations.length === 0 ? (
        !adding && <p className="text-[14px] text-ink-3">Aún no hay relaciones. Ej.: Doña Chuy ↔ Don Pepe · Matrimonio.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
          {relations.map((r) => (
            <li key={r.id} className="group flex items-center gap-2.5 rounded-[11px] border border-line bg-card px-2.5 py-2">
              <span className="flex -space-x-2.5">
                <Avatar ch={byId.get(r.a)} />
                <Avatar ch={byId.get(r.b)} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">
                  {byId.get(r.a)?.name} ↔ {byId.get(r.b)?.name}
                </div>
                <div className="flex items-center gap-1 truncate text-[12.5px] text-ink-3">
                  {/matrimonio|espos|novi|pareja/i.test(r.label) && <Heart size={11} className="shrink-0 fill-[#f472b6] text-[#f472b6]" />}
                  {r.label || 'Sin descripción'}
                </div>
              </div>
              <button
                className="icon-btn sm opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                onClick={() => useProject.getState().removeRelation(r.id)}
                aria-label={`Quitar relación ${byId.get(r.a)?.name} y ${byId.get(r.b)?.name}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
