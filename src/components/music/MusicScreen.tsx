import { useState } from 'react'
import { create } from 'zustand'
import { ArrowLeft, ChevronRight, FileAudio, Loader2, Music, Plus, Wand2, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { getMediaBlob, kindOf, useMediaUrl } from '../../features/media-library/media'
import { DURATIONS, type AudioMode } from '../../features/music-local/acestep'
import { generateLocalSong } from '../../features/music-local/generate'
import { isDesktop } from '../../database/db'
import { formatTime as fmtTime } from '../../utils'
import type { Song } from '../../types'

/** Botones de estilo: se ven en español y al modelo le llega en inglés (lo entiende mejor). */
const STYLES: [string, string][] = [
  ['🎬 Película', 'cinematic orchestral, emotional strings'],
  ['🪗 Cumbia', 'cumbia, accordion, guacharaca, festive'],
  ['💃 Pop latino', 'latin pop, upbeat, catchy'],
  ['🎸 Rock', 'rock, electric guitars, energetic drums'],
  ['🎧 Electrónica', 'electronic, synth, dance beat'],
  ['☕ Lo-fi tranquila', 'lo-fi hip hop, relaxed, warm'],
  ['🎺 Mariachi', 'mariachi, trumpets, mexican folk'],
  ['🎹 Piano triste', 'sad solo piano, slow, melancholic'],
  ['⚡ Épica', 'epic trailer music, big drums, choir'],
  ['🧸 Infantil', 'happy children song, playful, bright'],
]

/** Se queda vivo aunque cambies de pantalla mientras se hace la canción. */
const useMusicJob = create<{ busy: boolean; step: string }>(() => ({ busy: false, step: '' }))

type MyAudio = { blob: Blob; name: string; mode: AudioMode; from?: number; to?: number; length?: number }

function SongRow({ song, onReuse, onUseAudio }: { song: Song; onReuse: (s: Song) => void; onUseAudio: (s: Song, mode: AudioMode) => void }) {
  const url = useMediaUrl(song.mediaId)
  const tracks = useProject((s) => s.project?.audioTracks ?? [])
  const { renameSong, addAudioClip } = useProject.getState()
  const putOn = (trackId: string, name: string) => {
    const track = tracks.find((t) => t.id === trackId)
    const start = Math.max(0, ...(track?.clips.map((c) => c.start + c.duration) ?? []))
    addAudioClip(trackId, { mediaId: song.mediaId, name: song.title, start, duration: song.duration, sourceDuration: song.duration })
    toast(`«${song.title}» quedó en ${name}, en el segundo ${Math.round(start)}`, 'ok')
  }
  return (
    <li className="flex flex-col gap-2 rounded-[14px] border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <Music size={18} className="shrink-0 text-[#5eead4]" />
        <input className="field !h-9 min-w-0 flex-1 !text-[15px] font-medium" aria-label="Nombre de la canción" value={song.title} onChange={(e) => renameSong(song.id, e.target.value)} />
        <span className="shrink-0 text-[13px] text-ink-3">{fmtTime(song.duration)}</span>
      </div>
      <p className="text-[13px] text-ink-2">
        {song.style}
        {song.lyrics ? ' · con letra' : ' · sin voz'}
      </p>
      {url && <audio controls preload="metadata" src={url} className="w-full" aria-label={`Escuchar ${song.title}`} />}
      <div className="flex flex-wrap gap-2">
        {tracks.map((t) => (
          <button key={t.id} className="btn btn-sm" onClick={() => putOn(t.id, t.name)}>
            <Plus size={14} /> Poner en {t.name}
          </button>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => onReuse(song)}>
          Usar este estilo otra vez
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => onUseAudio(song, 'cover')}>
          Hacer otra versión
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => onUseAudio(song, 'repaint')}>
          Rehacer un pedazo
        </button>
      </div>
    </li>
  )
}

/** Pantalla Música: escribir estilo y letra → canción gratis hecha en la Mac → biblioteca del proyecto. */
export function MusicScreen() {
  const project = useProject((s) => s.project)
  const { busy, step } = useMusicJob()
  const [style, setStyle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [seconds, setSeconds] = useState<number>(60)
  const [audio, setAudio] = useState<MyAudio | null>(null)
  if (!project) return null
  const songs = project.songs ?? []
  const desktop = isDesktop()

  const addStyle = (tags: string) => setStyle((s) => (s.trim() ? `${s.trim()}, ${tags}` : tags))
  const pickAudio = (file?: File) => {
    if (!file) return
    if (kindOf(file) !== 'audio') return toast('Aquí va un audio (MP3, M4A o WAV).', 'error')
    setAudio({ blob: file, name: file.name, mode: audio?.mode ?? 'style' })
  }
  const useSongAudio = async (song: Song, mode: AudioMode) => {
    const rec = await getMediaBlob(song.mediaId)
    if (!rec) return toast('No encontré el archivo de esa canción.', 'error')
    const length = Math.round(song.duration)
    setAudio({ blob: rec.blob, name: `${song.title}.mp3`, mode, from: 0, to: Math.min(10, length), length })
    setStyle(mode === 'repaint' ? song.style : '')
    setLyrics(song.lyrics)
    toast(mode === 'repaint' ? `Escoge desde qué segundo hasta cuál rehacer «${song.title}».` : `Escoge el nuevo estilo para «${song.title}» y pulsa «Hacer música».`, 'info')
  }
  const make = async (surprise = false) => {
    useMusicJob.setState({ busy: true, step: 'Empezando…' })
    try {
      const secs = await generateLocalSong({ style, lyrics, seconds, audio: surprise ? undefined : (audio ?? undefined), surprise }, (t) => useMusicJob.setState({ step: t }))
      if (secs !== undefined) toast(`Música lista en ${fmtTime(secs)}. Quedó en la biblioteca del proyecto.`, 'ok')
    } catch (e) {
      console.error('música local', e)
      toast(`No se pudo hacer la música: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      useMusicJob.setState({ busy: false, step: '' })
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-[#0a101d]/90 px-4 py-2.5 backdrop-blur">
        <button className="btn !h-9" onClick={() => useUI.setState({ view: 'home' })}>
          <ArrowLeft size={16} /> Inicio
        </button>
        <Music size={20} className="text-[#5eead4]" />
        <h1 className="flex items-center gap-1.5 text-[17px] font-semibold">
          <span className="text-ink-2">Música</span>
          <ChevronRight size={16} className="text-ink-3" />
          Hacer música gratis
        </h1>
        <span className="min-w-0 flex-1 truncate text-[13.5px] uppercase tracking-wide text-ink-3">{project.title}</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-5" aria-label="Hacer música">
          <div className="flex flex-col gap-2">
            <label className="text-[15px] font-medium" htmlFor="music-style">
              1 · ¿Cómo suena?
            </label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map(([label, tags]) => (
                <button key={label} className="btn btn-sm" onClick={() => addStyle(tags)} disabled={busy}>
                  {label}
                </button>
              ))}
            </div>
            <textarea id="music-style" className="field !text-[14px]" rows={3} placeholder="Ej.: cumbia alegre, acordeón, fiesta de noche" value={style} onChange={(e) => setStyle(e.target.value)} disabled={busy} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[15px] font-medium" htmlFor="music-lyrics">
              2 · Letra <span className="font-normal text-ink-3">(vacío = sin voz)</span>
            </label>
            <textarea
              id="music-lyrics"
              className="field !text-[14px]"
              rows={7}
              placeholder={'[verse]\nLa noche empieza en la ciudad…\n[chorus]\nVamos a bailar…'}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">3 · ¿Cuánto dura?</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Duración">
              {DURATIONS.map((d) => (
                <button key={d} className={`btn btn-sm ${seconds === d ? 'btn-primary' : ''}`} aria-pressed={seconds === d} onClick={() => setSeconds(d)} disabled={busy}>
                  {fmtTime(d)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium">
              4 · Usar mi audio <span className="font-normal text-ink-3">(opcional)</span>
            </span>
            {audio ? (
              <div className="flex flex-col gap-2 rounded-[12px] border border-line bg-panel p-3">
                <div className="flex items-center gap-2 text-[14px]">
                  <FileAudio size={16} className="shrink-0 text-[#5eead4]" />
                  <span className="min-w-0 flex-1 truncate">{audio.name}</span>
                  <button className="icon-btn sm" onClick={() => setAudio(null)} aria-label="Quitar mi audio" title="Quitar" disabled={busy}>
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Qué hacer con mi audio">
                  {(
                    [
                      ['style', '🎨 Copiar su estilo', 'Canción nueva que suena parecida.'],
                      ['cover', '🔁 Otra versión', 'La misma canción con el estilo que escribiste.'],
                      ['repaint', '✂️ Rehacer un pedazo', 'Solo cambia los segundos que escojas.'],
                    ] as const
                  ).map(([mode, label, hint]) => (
                    <button key={mode} className={`btn btn-sm ${audio.mode === mode ? 'btn-primary' : ''}`} aria-pressed={audio.mode === mode} title={hint} onClick={() => setAudio({ ...audio, mode })} disabled={busy}>
                      {label}
                    </button>
                  ))}
                </div>
                {audio.mode === 'repaint' && (
                  <div className="flex flex-wrap items-center gap-2 text-[14px]">
                    Desde el segundo
                    <input type="number" min={0} className="field !h-9 !w-20" aria-label="Desde el segundo" value={audio.from ?? 0} onChange={(e) => setAudio({ ...audio, from: Math.max(0, Number(e.target.value) || 0) })} disabled={busy} />
                    hasta el
                    <input type="number" min={1} className="field !h-9 !w-20" aria-label="Hasta el segundo" value={audio.to ?? 10} onChange={(e) => setAudio({ ...audio, to: Math.max(1, Number(e.target.value) || 1) })} disabled={busy} />
                    {audio.length ? <span className="text-ink-3">(dura {fmtTime(audio.length)})</span> : null}
                  </div>
                )}
                <p className="text-[13px] text-ink-3">
                  {audio.mode === 'style' ? 'Canción nueva que suena parecida a tu audio.' : audio.mode === 'cover' ? 'Tu misma canción, con el estilo que escribiste arriba.' : 'Solo cambia ese pedazo; lo demás se queda igual.'}
                </p>
              </div>
            ) : (
              <label className="btn btn-sm self-start cursor-pointer">
                <FileAudio size={14} /> Escoger un audio…
                <input type="file" accept="audio/*,.mp3,.m4a,.wav" className="hidden" onChange={(e) => pickAudio(e.target.files?.[0])} disabled={busy} />
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary !h-12 !px-6 !text-[16px]" onClick={() => make()} disabled={busy || !desktop || !style.trim()}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />} Hacer música
            </button>
            <button className="btn !h-12 !px-5 !text-[16px]" onClick={() => make(true)} disabled={busy || !desktop} title="El generador inventa estilo y letra. Si escribiste algo arriba, lo usa como idea.">
              🎲 Sorpréndeme
            </button>
          </div>
          <p className="text-[13.5px] text-ink-2" aria-live="polite">
            {busy ? step : !desktop ? 'Solo funciona en la app de la Mac.' : !style.trim() ? 'Escoge un estilo o escríbelo.' : 'Gratis, en tu Mac. Tarda unos minutos.'}
          </p>
        </section>

        <section className="flex flex-col gap-3" aria-label="Música del proyecto">
          <h2 className="text-[15px] font-medium">
            Música del proyecto <span className="font-normal text-ink-3">({songs.length})</span>
          </h2>
          {songs.length === 0 ? (
            <p className="text-[14px] text-ink-3">Aquí aparecen las canciones que hagas. Se guardan en la biblioteca del proyecto.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {songs.map((s) => (
                <SongRow
                  key={s.id}
                  song={s}
                  onReuse={(x) => {
                    setStyle(x.style)
                    setLyrics(x.lyrics)
                  }}
                  onUseAudio={useSongAudio}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
