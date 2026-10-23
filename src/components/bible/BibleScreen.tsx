import { useState } from 'react'
import { ArrowLeft, BookMarked, ChevronDown, ChevronRight, Clapperboard, CheckCircle2, Circle, MapPinned, Palette, Sparkles, Users } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useUI } from '../../stores/uiStore'
import { ImportScriptButton } from '../sidebar/Sidebar'
import { orderedScenes } from '../../features/script-sync/derive'
import { CharacterSheet } from './CharacterSheet'
import { SuggestionStep } from './SuggestionStep'
import { AUDIENCES, LOOKS, MOODS, bibleAnswered, findCharacters, type Choice } from '../../features/bible/bible'

function Options({ list, value, onPick, label }: { list: Choice[]; value?: string; onPick: (id?: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {list.map((c) => (
        <button
          key={c.id}
          className={`btn !h-10 !px-4 !text-[14px] ${value === c.id ? '!border-sel !bg-sel/20 !text-white' : ''}`}
          onClick={() => onPick(value === c.id ? undefined : c.id)}
          aria-pressed={value === c.id}
        >
          {c.es}
        </button>
      ))}
    </div>
  )
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        {done ? <CheckCircle2 size={18} className="text-ok" /> : <Circle size={18} className="text-ink-3" />}
        {n}. {title}
      </div>
      {children}
    </div>
  )
}

/** Pantalla aparte para armar la Biblia: estilo, personajes y (luego) escenarios. */
export function BibleScreen() {
  const project = useProject((s) => s.project)
  const scenes = useProject((s) => s.scenes)
  const [openId, setOpenId] = useState<string>()
  if (!project) return null
  const { setBible, addCharacter } = useProject.getState()
  const b = project.bible ?? {}
  const ordered = orderedScenes(project, scenes)
  const found = findCharacters(project, ordered)
  const answered = bibleAnswered(project)
  const scriptScenes = ordered.filter((sc) => sc.script.action.trim() || sc.script.dialogue.trim()).length

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <button className="btn !h-9" onClick={() => useUI.setState({ view: 'home' })}>
          <ArrowLeft size={16} /> Inicio
        </button>
        <BookMarked size={20} className="text-[#c4b5fd]" />
        <h1 className="text-[18px] font-semibold">🎨 Preproducción · Biblia del proyecto</h1>
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink-3">{project.title}</span>
        <ImportScriptButton />
        <button className="btn !h-9" onClick={() => useUI.setState({ view: 'studio' })}>
          <Clapperboard size={16} /> Ir a Edición
        </button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-3">
        <section className="flex flex-col gap-5 rounded-[14px] border border-line bg-panel p-4" aria-label="Preguntas de estilo">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <Palette size={18} className="text-[#c4b5fd]" /> Estilo <span className="text-[13px] font-normal text-ink-3">{answered} de 4</span>
          </h2>
          <Step n={1} title="Guion" done={scriptScenes > 0}>
            {scriptScenes > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[14px] text-ink-2">
                  {scriptScenes} escena{scriptScenes === 1 ? '' : 's'} con guion · {found.length} personaje{found.length === 1 ? '' : 's'}
                </span>
                <ImportScriptButton />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <p className="text-[14px] text-ink-2">Primero carga tu guion: de ahí salen los personajes y lo que dicen.</p>
                <ImportScriptButton className="!h-10 !px-4 !text-[14px]" />
              </div>
            )}
          </Step>
          <Step n={2} title="¿Cómo se ve?" done={b.look === 'otro' ? !!b.lookOther?.trim() : !!b.look}>
            <Options label="Cómo se ve" list={LOOKS} value={b.look} onPick={(look) => setBible({ look })} />
            {b.look === 'otro' && (
              <input className="field" aria-label="Otro estilo" placeholder="Ej.: plastilina, acuarela, cómic…" value={b.lookOther ?? ''} onChange={(e) => setBible({ lookOther: e.target.value })} />
            )}
          </Step>
          <Step n={3} title="¿Época y lugar?" done={!!b.era?.trim()}>
            <input className="field !text-[14px]" aria-label="Época y lugar" placeholder="Ej.: pueblo mexicano, años 80" value={b.era ?? ''} onChange={(e) => setBible({ era: e.target.value })} />
          </Step>
          <Step n={4} title="¿Colores?" done={!!b.mood}>
            <Options label="Colores" list={MOODS} value={b.mood} onPick={(mood) => setBible({ mood })} />
          </Step>
          <Step n={5} title="¿Para quién es?" done={!!b.audience}>
            <Options label="Público" list={AUDIENCES} value={b.audience} onPick={(audience) => setBible({ audience })} />
          </Step>
          <Step n={6} title="Sugerencia de personajes" done={!!project.characters?.length && project.characters.every((c) => c.description.trim())}>
            <SuggestionStep names={found.map((c) => c.name)} />
          </Step>
          <p className="text-[12.5px] text-ink-3">Las respuestas entran solas al prompt de cada escena.</p>
        </section>

        <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-panel p-4" aria-label="Personajes del guion">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <Users size={18} className="text-[#c4b5fd]" /> Personajes <span className="text-[13px] font-normal text-ink-3">{found.length} en el guion</span>
          </h2>
          {found.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[14px] text-ink-2">Todavía no hay personajes. Carga tu guion y salen solos de los diálogos (como «Ana: —Hola»).</p>
              <ImportScriptButton className="!h-11 !px-5 !text-[15px]" />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {found.map((c) => (
                <li key={c.name} className="overflow-hidden rounded-[10px] border border-line bg-card">
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    aria-expanded={!!c.id && openId === c.id}
                    onClick={() => {
                      const id = c.id ?? addCharacter(c.name)
                      setOpenId(openId === id ? undefined : id)
                    }}
                  >
                    {c.id && openId === c.id ? <ChevronDown size={16} className="text-ink-2" /> : <ChevronRight size={16} className="text-ink-2" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{c.name}</div>
                      <div className="text-[12.5px] text-ink-3">
                        {c.scenes} escena{c.scenes === 1 ? '' : 's'} · {c.lines} diálogo{c.lines === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span className={`text-[12.5px] ${c.described ? 'text-ok' : 'text-ink-3'}`}>{c.described ? '✓ Descrito' : 'Sin descripción'}</span>
                  </button>
                  {c.id && openId === c.id && <CharacterSheet characterId={c.id} />}
                </li>
              ))}
            </ul>
          )}
          <button className="btn !h-10 mt-auto opacity-60" disabled title="Siguiente paso: Claude hace la propuesta con Codex">
            <Sparkles size={16} /> Generar propuesta (próximamente)
          </button>
        </section>

        <section className="flex flex-col gap-3 rounded-[14px] border border-dashed border-line bg-panel/50 p-4" aria-label="Locaciones">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <MapPinned size={18} className="text-[#c4b5fd]" /> Locaciones
          </h2>
          <p className="text-[14px] text-ink-2">Próximamente: propuesta de cada locación del guion, con 2 o 3 vistas.</p>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-3">
            <li>Guion y estilo: estas preguntas</li>
            <li>Personajes: propuesta → refinar → aprobar</li>
            <li>Locaciones: propuesta → refinar → aprobar</li>
            <li>Storyboard a lápiz en una sola hoja</li>
            <li>Imagen inicial y final de cada escena</li>
          </ol>
        </section>
      </main>
    </div>
  )
}
