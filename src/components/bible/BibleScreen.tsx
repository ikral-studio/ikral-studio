import { ArrowLeft, BookMarked, CalendarDays, ChevronRight, Circle, CheckCircle2, Clapperboard, Clock3, FileText, MapPin, Palette, Play, Sparkles, Users, Wand2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useUI } from '../../stores/uiStore'
import { useMediaUrl } from '../../features/media-library/media'
import { CopyFormatButton, ImportScriptButton } from '../sidebar/Sidebar'
import { orderedScenes } from '../../features/script-sync/derive'
import { SuggestionStep } from './SuggestionStep'
import { FramesPanel } from './FramesPanel'
import { CharactersSection, ItemsSection, RelationsSection } from './BibleSections'
import { Section, Tile } from './bibleUi'
import { AUDIENCES, LOOKS, MOODS, bibleAnswered, findCharacters, type Choice } from '../../features/bible/bible'
import { bibleProgress, type ProgressRow } from '../../features/bible/items'
import type { Project, Scene } from '../../types'
import { ClaudeLight } from '../chat/ClaudeLight'
import { TrashButton } from '../layout/TrashModal'
import { ClaudeChat } from '../chat/ClaudeChat'
import { isDesktop } from '../../database/db'

/** «🎥 Personas reales» → ícono y texto por separado. */
const split = (c: Choice) => {
  const [icon, ...rest] = c.es.split(' ')
  return { icon, label: rest.join(' ') }
}

function Tiles({ list, value, onPick, label, cols = 2, stacked }: { list: Choice[]; value?: string; onPick: (id?: string) => void; label: string; cols?: 2 | 3; stacked?: boolean }) {
  return (
    <div className={`grid gap-2 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="group" aria-label={label}>
      {list.map((c) => {
        const { icon, label } = split(c)
        return <Tile key={c.id} icon={icon} label={label} stacked={stacked} active={value === c.id} onClick={() => onPick(value === c.id ? undefined : c.id)} />
      })}
    </div>
  )
}

function Question({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
        <span className="text-[#a78bfa]">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

/** Imagen de portada: la primera locación Canon, o la imagen inicial de la primera escena que tenga. */
function heroImage(p: Project, scenes: Scene[]): string | undefined {
  return p.locations?.find((l) => l.imageId)?.imageId ?? scenes.map((s) => s.prep?.start?.approvedId ?? s.startImageId).find(Boolean)
}

function Hero({ project, scenes, ready }: { project: Project; scenes: Scene[]; ready: boolean }) {
  const url = useMediaUrl(heroImage(project, scenes))
  const [title, subtitle] = project.title.split(/\s+[—–-]\s+/, 2)
  const canon = (project.characters ?? []).filter((c) => c.imageId).slice(0, 6)
  return (
    <div className="bible-hero relative min-h-[230px] overflow-hidden rounded-[18px] border border-line">
      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,#4c1d95_0%,#1e1b4b_35%,#0b1220_75%)]" />}
      {!url && canon.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex w-[62%] items-end justify-end gap-0 [mask-image:linear-gradient(to_right,transparent,black_30%)]">
          {canon.map((c) => (
            <HeroFigure key={c.id} id={c.imageId} />
          ))}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#070b16f2] via-[#070b16b3] to-[#070b1622]" />
      <div className="relative flex h-full min-h-[230px] flex-col justify-center gap-3 p-6 sm:p-8">
        <h2 className="max-w-[560px] text-[34px] font-extrabold uppercase leading-[1.02] tracking-tight text-white drop-shadow-lg sm:text-[42px]">{title}</h2>
        {subtitle && <p className="-mt-1 text-[22px] font-semibold uppercase tracking-wide text-white/90">{subtitle}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex h-11 items-center gap-2 rounded-[11px] border px-4 text-[16px] font-semibold backdrop-blur ${
              ready ? 'border-ok/60 bg-ok/15 text-[#bbf7d0]' : 'border-[#8b5cf6]/70 bg-[#4c1d95]/40 text-[#ddd6fe]'
            }`}
          >
            <Clapperboard size={18} /> {ready ? 'Lista para escenas' : 'En preparación'}
          </span>
          {url && canon.length > 0 && (
            <span className="flex -space-x-3" aria-label="Personajes Canon">
              {canon.map((c) => (
                <HeroAvatar key={c.id} id={c.imageId} name={c.name} />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function HeroFigure({ id }: { id?: string }) {
  const url = useMediaUrl(id)
  return <div className="h-full min-w-0 flex-1">{url && <img src={url} alt="" className="h-full w-full object-cover object-top" />}</div>
}

function HeroAvatar({ id, name }: { id?: string; name: string }) {
  const url = useMediaUrl(id, true)
  return <span className="h-11 w-11 overflow-hidden rounded-full border-2 border-[#0b1220] bg-card-2">{url && <img src={url} alt={name} title={name} className="h-full w-full object-cover" />}</span>
}

function ProgressCard({ rows, percent }: { rows: ProgressRow[]; percent: number }) {
  return (
    <div className="bible-card flex flex-col gap-3 p-4" aria-label="Progreso de la Biblia">
      <div className="text-[16px] font-semibold">Progreso de la Biblia</div>
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-gradient-to-r from-[#16a34a] to-[#4ade80] transition-all" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-10 text-right text-[15px] font-semibold tabular-nums">{percent}%</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const full = r.total > 0 && r.done >= r.total
          return (
            <li key={r.key} className="flex items-center gap-2 text-[14px]">
              {full ? <CheckCircle2 size={17} className="text-ok" /> : r.done > 0 ? <Clock3 size={17} className="text-warn" /> : <Circle size={17} className="text-ink-3" />}
              <span className="flex-1 text-ink-2">{r.label}</span>
              <span className="tabular-nums text-ink-2">{r.key === 'relations' ? r.done : `${r.done}/${r.total}`}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function OverviewCard({ project, scenes }: { project: Project; scenes: Scene[] }) {
  const firstWithImage = scenes.find((s) => s.prep?.start?.approvedId ?? s.startImageId)
  const url = useMediaUrl(firstWithImage ? (firstWithImage.prep?.start?.approvedId ?? firstWithImage.startImageId) : project.locations?.find((l) => l.imageId)?.imageId, true)
  return (
    <div className="bible-card flex flex-col gap-3 p-3">
      <div className="aspect-video overflow-hidden rounded-[11px] bg-bg">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[13px] text-ink-3">Aún sin imágenes</div>}
      </div>
      <div className="px-1 text-[14px] text-ink-2">Vista general del proyecto</div>
      <button className="btn !h-10 !justify-center !text-[14px]" onClick={() => useUI.setState({ view: 'studio' })} aria-label="Ver en Edición">
        <Play size={15} className="fill-current" /> Ver en Edición
      </button>
    </div>
  )
}

/** Preproducción · Biblia del proyecto: estilo, personajes, locaciones, objetos, vestuario, relaciones y escenas. */
export function BibleScreen() {
  const project = useProject((s) => s.project)
  const scenesMap = useProject((s) => s.scenes)
  if (!project) return null
  const { setBible } = useProject.getState()
  const b = project.bible ?? {}
  const scenes = orderedScenes(project, scenesMap)
  const found = findCharacters(project, scenes)
  const answered = bibleAnswered(project)
  const { rows, percent, ready } = bibleProgress(project, scenes)
  const scriptScenes = scenes.filter((sc) => sc.script.action.trim() || sc.script.dialogue.trim()).length

  return (
    <div className="bible-screen flex h-screen flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-[#0a101d]/90 px-4 py-2.5 backdrop-blur">
        <button className="btn !h-9" onClick={() => useUI.setState({ view: 'home' })}>
          <ArrowLeft size={16} /> Inicio
        </button>
        <BookMarked size={20} className="text-[#c4b5fd]" />
        <h1 className="flex items-center gap-1.5 text-[17px] font-semibold">
          <span className="text-ink-2">Preproducción</span>
          <ChevronRight size={16} className="text-ink-3" />
          Biblia del proyecto
        </h1>
        <span className="min-w-0 flex-1 truncate text-[13.5px] uppercase tracking-wide text-ink-3">{project.title}</span>
        <ClaudeLight />
        <ImportScriptButton />
        <CopyFormatButton className="btn-hero !h-9" />
        <TrashButton label />
        <button className="btn !h-9" onClick={() => useUI.setState({ view: 'studio' })}>
          <Clapperboard size={16} /> Ir a Edición
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px_280px]">
            <Hero project={project} scenes={scenes} ready={ready} />
            <ProgressCard rows={rows} percent={percent} />
            <div className="hidden 2xl:block">
              <OverviewCard project={project} scenes={scenes} />
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_360px]">
            <Section n={1} title="Estilo y tono visual" label="Preguntas de estilo" count={`${answered} de 4`}>
              <Question icon={<FileText size={17} />} title="Guion">
                {scriptScenes > 0 && (
                  <span className="text-[14px] text-ink-2">
                    {scriptScenes} escena{scriptScenes === 1 ? '' : 's'} con guion · {found.length} personaje{found.length === 1 ? '' : 's'}
                  </span>
                )}
                <ol className="flex list-decimal flex-col gap-1 pl-5 text-[14px] text-ink-2" aria-label="Cómo hacer el guion con IA">
                  <li>Toca «Copiar formato para IA».</li>
                  <li>Pégalo en ChatGPT o Claude y escribe tu idea al final.</li>
                  <li>Lo que te devuelva, tráelo con «Importar guion».</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <CopyFormatButton className="!h-10 !px-3 !text-[14px]" />
                  <ImportScriptButton className="!h-10 !px-3 !text-[14px]" />
                </div>
              </Question>
              <hr className="border-line" />
              <Question icon={<Palette size={17} />} title="¿Cómo quieres que se vea?">
                <Tiles label="Cómo se ve" list={LOOKS} value={b.look} onPick={(look) => setBible({ look })} />
                {b.look === 'otro' && (
                  <input className="field !text-[14px]" aria-label="Otro estilo" placeholder="Ej.: plastilina, acuarela, cómic…" value={b.lookOther ?? ''} onChange={(e) => setBible({ lookOther: e.target.value })} />
                )}
              </Question>
              <Question icon={<CalendarDays size={17} />} title="¿Cuándo y dónde ocurre?">
                <input className="field !text-[14px]" aria-label="Época y lugar" placeholder="Época · Ej.: actual 2026, años 80" value={b.era ?? ''} onChange={(e) => setBible({ era: e.target.value })} />
                <label className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                    <MapPin size={13} /> Lugar principal
                  </span>
                  <input className="field !text-[14px]" aria-label="Lugar principal" placeholder="Ej.: Los Ángeles, USA" value={b.place ?? ''} onChange={(e) => setBible({ place: e.target.value })} />
                </label>
              </Question>
              <Question icon={<Sparkles size={17} />} title="¿Qué sensación visual quieres?">
                <Tiles label="Colores" list={MOODS} value={b.mood} onPick={(mood) => setBible({ mood })} />
              </Question>
              <Question icon={<Users size={17} />} title="¿Para quién es?">
                <Tiles label="Público" list={AUDIENCES} value={b.audience} onPick={(audience) => setBible({ audience })} stacked />
              </Question>
              <hr className="border-line" />
              <Question icon={<Wand2 size={17} />} title="Crear propuesta visual">
                <p className="-mt-1 text-[13.5px] text-ink-3">Escribe la idea y Claude propone cómo se ve cada personaje, con su imagen.</p>
                <SuggestionStep names={found.map((c) => c.name)} />
              </Question>
              <p className="text-[12.5px] text-ink-3">Las respuestas entran solas al prompt de cada escena.</p>
            </Section>

            <div className="flex min-w-0 flex-col gap-4">
              <CharactersSection />
              <ItemsSection kind="locations" n={3} empty="Aún no hay locaciones. Agrega los lugares donde pasa la historia (ej.: Restaurante, Cocina, Exterior)." />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ItemsSection kind="props" n={4} empty="Aún no hay objetos. Agrega los que salen seguido (ej.: Celular, Platos de tacos)." />
                <ItemsSection kind="wardrobe" n={5} empty="Aún no hay vestuario. Agrega la ropa fija de cada personaje (ej.: Delantal de Doña Chuy)." />
              </div>
              <RelationsSection />
              {isDesktop() && (
                <div className="flex h-[520px] flex-col">
                  <ClaudeChat />
                </div>
              )}
            </div>

            <div className="lg:col-span-2 2xl:sticky 2xl:top-0 2xl:col-span-1">
              <FramesPanel />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
