import { useState } from 'react'
import { ChevronDown, ChevronUp, Palette, Plus, Trash2, Users } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useUI } from '../../stores/uiStore'
import { STYLE_PRESETS, styleSpanish } from '../../features/project-style/style'

/** Estilo visual del proyecto y personajes: se agregan solos a cada prompt. */
export function ProjectStylePanel() {
  const project = useProject((s) => s.project)
  const [open, setOpen] = useState(false)
  if (!project) return null
  const { setStyle, addCharacter, updateCharacter, removeCharacter } = useProject.getState()
  const style = project.style ?? {}
  const chars = project.characters ?? []
  const summary = [styleSpanish(project) || 'Sin estilo', `${chars.length} personaje${chars.length === 1 ? '' : 's'}`].join(' · ')

  return (
    <section className="mb-3 rounded-[14px] border border-line bg-panel" aria-label="Estilo y personajes del proyecto">
      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Palette size={16} className="text-[#c4b5fd]" />
        <span className="text-[13.5px] font-semibold">Estilo y personajes</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{summary}</span>
        {open ? <ChevronUp size={16} className="text-ink-2" /> : <ChevronDown size={16} className="text-ink-2" />}
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-line px-3 pb-4 pt-3">
          <button className="btn self-start" onClick={() => useUI.setState({ view: 'bible' })}>
            📘 Abrir la Biblia del proyecto (preguntas de estilo y personajes del guion)
          </button>
          <div>
            <div className="label mb-1.5">Estilo visual de todo el video (se agrega a cada prompt)</div>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`btn btn-sm ${style.preset === p.id ? '!border-sel !bg-sel/20 !text-white' : ''}`}
                  onClick={() => setStyle({ preset: style.preset === p.id ? undefined : p.id })}
                  aria-pressed={style.preset === p.id}
                  title={p.en}
                >
                  {p.es}
                </button>
              ))}
            </div>
            <textarea
              className="field mt-2"
              rows={2}
              aria-label="Notas de estilo"
              placeholder="Notas de estilo: colores, época, ambiente… (ej. colores cálidos de restaurante mexicano)"
              value={style.notes ?? ''}
              onChange={(e) => setStyle({ notes: e.target.value })}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="label flex items-center gap-1.5">
                <Users size={13} /> Personajes (para que se vean iguales en todas las escenas)
              </span>
              <button className="btn btn-sm btn-ghost" onClick={() => addCharacter()}>
                <Plus size={13} /> Agregar personaje
              </button>
            </div>
            {chars.length === 0 ? (
              <p className="text-[12px] text-ink-3">
                Ej.: «Joven» → «25 años, cabello negro corto, camisa azul». Cuando el nombre aparece en una escena, su descripción entra sola al prompt.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {chars.map((c) => (
                  <div key={c.id} className="grid grid-cols-[160px_1fr_auto] items-start gap-1.5">
                    <input className="field !py-1.5" placeholder="Nombre" aria-label="Nombre del personaje" value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} />
                    <input
                      className="field !py-1.5"
                      placeholder="Cómo se ve: edad, cabello, ropa…"
                      aria-label={`Descripción de ${c.name || 'personaje'}`}
                      value={c.description}
                      onChange={(e) => updateCharacter(c.id, { description: e.target.value })}
                    />
                    <button className="icon-btn hover:!text-bad" onClick={() => removeCharacter(c.id)} aria-label={`Quitar ${c.name || 'personaje'}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <p className="text-[11.5px] text-ink-3">
                  Consejo de continuidad (regla de 180°): si en una escena alguien está a la izquierda mirando a la derecha, mantenlo así en la siguiente.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
