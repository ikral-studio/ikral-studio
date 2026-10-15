// Motor de reproducción centralizado: un solo <video> para toda la película.
// Calcula qué escena toca en cada instante y salta entre clips sin solaparlos.
import { create } from 'zustand'
import { buildSegments, locateTime, orderedScenes, totalDuration, videoRange, type Segment } from '../script-sync/derive'
import { useProject } from '../../stores/projectStore'
import { getMediaUrl } from '../media-library/media'
import type { AudioTrack } from '../../types'

interface PlaybackState {
  time: number
  playing: boolean
  loop: boolean
  volume: number
  muted: boolean
  index: number
  mode: 'video' | 'frames' | 'empty'
  error: string | null
}

export const usePlayback = create<PlaybackState>()(() => ({
  time: 0,
  playing: false,
  loop: true,
  volume: 1,
  muted: false,
  index: -1,
  mode: 'empty',
  error: null,
}))

class PlaybackController {
  private video: HTMLVideoElement | null = null
  private segments: Segment[] = []
  private raf = 0
  private last = 0
  private token = 0
  private currentUrl: string | null = null
  /** True mientras se carga o se coloca un clip: evita saltos dobles. */
  private busy = false
  /** Un <audio> por cada clip de música. */
  private audios = new Map<string, { el: HTMLAudioElement; mediaId: string }>()
  private tracks: AudioTrack[] = []

  constructor() {
    const sync = () => {
      const { project, scenes } = useProject.getState()
      this.segments = buildSegments(orderedScenes(project, scenes))
      this.tracks = project?.audioTracks ?? []
      this.pruneAudio()
      const st = usePlayback.getState()
      const total = totalDuration(this.segments)
      if (st.time > total) usePlayback.setState({ time: total })
      // Si cambió el contenido del segmento actual (p. ej. se importó un video), recargar.
      if (!st.playing) void this.enter(Math.min(st.time, total), false)
      this.syncAudio()
    }
    useProject.subscribe((s, prev) => {
      if (s.project !== prev.project || s.scenes !== prev.scenes) sync()
    })
    sync()
  }

  attach(video: HTMLVideoElement | null) {
    if (this.video === video) return
    this.video = video
    if (video) {
      const st = usePlayback.getState()
      video.volume = st.volume
      video.muted = st.muted
      video.onended = () => {
        if (!this.busy && usePlayback.getState().playing && usePlayback.getState().mode === 'video') this.next()
      }
      video.onerror = () => {
        const st2 = usePlayback.getState()
        if (st2.mode !== 'video' || !video.getAttribute('src')) return
        usePlayback.setState({ mode: 'frames', error: 'No se pudo reproducir este video. Se muestra el storyboard.' })
        this.last = performance.now()
      }
      currentSegmentReload(this)
    }
  }

  get total() {
    return totalDuration(this.segments)
  }

  segmentsSnapshot() {
    return this.segments
  }

  async play() {
    const total = this.total
    if (!total) return
    let t = usePlayback.getState().time
    if (t >= total - 0.05) t = 0
    usePlayback.setState({ playing: true })
    await this.enter(t, true)
    this.last = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.tick)
  }

  pause() {
    usePlayback.setState({ playing: false })
    cancelAnimationFrame(this.raf)
    this.video?.pause()
    this.syncAudio()
  }

  toggle() {
    if (usePlayback.getState().playing) this.pause()
    else void this.play()
  }

  restart() {
    void this.seek(0)
  }

  async seek(t: number) {
    const playing = usePlayback.getState().playing
    const clamped = Math.max(0, Math.min(t, this.total))
    usePlayback.setState({ time: clamped })
    this.syncAudio(true)
    await this.enter(clamped, playing)
    this.last = performance.now()
  }

  /** Salta al inicio de la escena indicada. */
  seekScene(sceneId: string) {
    const seg = this.segments.find((s) => s.scene.id === sceneId)
    if (seg) void this.seek(seg.start)
  }

  setLoop(loop: boolean) {
    usePlayback.setState({ loop })
  }

  setVolume(volume: number) {
    usePlayback.setState({ volume, muted: volume === 0 })
    if (this.video) {
      this.video.volume = volume
      this.video.muted = volume === 0
    }
    this.syncAudio()
  }

  toggleMute() {
    const muted = !usePlayback.getState().muted
    usePlayback.setState({ muted })
    if (this.video) this.video.muted = muted
    this.syncAudio()
  }

  private pruneAudio() {
    const alive = new Set(this.tracks.flatMap((t) => t.clips.map((c) => c.id)))
    for (const [id, a] of this.audios) {
      if (!alive.has(id)) {
        a.el.pause()
        a.el.removeAttribute('src')
        this.audios.delete(id)
      }
    }
  }

  /** Pone cada clip de música a sonar (o callar) según el tiempo global. */
  syncAudio(force = false) {
    const st = usePlayback.getState()
    const total = this.total
    const master = st.muted ? 0 : st.volume
    for (const track of this.tracks) {
      for (const clip of track.clips) {
        let entry = this.audios.get(clip.id)
        if (!entry || entry.mediaId !== clip.mediaId) {
          entry?.el.pause()
          const el = new Audio()
          el.preload = 'auto'
          entry = { el, mediaId: clip.mediaId }
          this.audios.set(clip.id, entry)
          const target = entry
          void getMediaUrl(clip.mediaId).then((url) => {
            if (url && this.audios.get(clip.id) === target) {
              target.el.src = url
              this.syncAudio(true)
            }
          })
        }
        const el = entry.el
        el.volume = track.muted ? 0 : Math.min(1, track.volume * master)
        const t = st.time
        const active = st.playing && t >= clip.start && t < clip.start + clip.duration && t < total && !!el.getAttribute('src')
        if (active) {
          const want = (clip.offset ?? 0) + (t - clip.start)
          if (el.paused) {
            el.currentTime = want
            el.play().catch(() => {})
          } else if (force || Math.abs(el.currentTime - want) > 0.35) {
            el.currentTime = want
          }
        } else if (!el.paused) el.pause()
      }
    }
  }

  /** Coloca el reproductor en el instante t (carga el clip si hace falta). */
  async enter(t: number, autoplay: boolean) {
    const token = ++this.token
    this.busy = true
    try {
      await this.place(token, t, autoplay)
    } finally {
      if (token === this.token) this.busy = false
    }
  }

  private async place(token: number, t: number, autoplay: boolean) {
    const { index, offset } = locateTime(this.segments, t)
    const seg = this.segments[index]
    if (!seg) {
      usePlayback.setState({ index: -1, mode: 'empty', time: 0, error: null })
      this.video?.pause()
      return
    }
    usePlayback.setState({ index, time: t, error: null })
    const video = this.video
    if (!seg.video || !video) {
      video?.pause()
      usePlayback.setState({ mode: 'frames' })
      return
    }
    const url = await getMediaUrl(seg.video.mediaId)
    if (token !== this.token) return
    if (!url) {
      video.pause()
      usePlayback.setState({ mode: 'frames', error: 'Falta el archivo de este video.' })
      return
    }
    usePlayback.setState({ mode: 'video' })
    if (this.currentUrl !== url) {
      video.pause()
      this.currentUrl = url
      video.src = url
      const ok = await new Promise<boolean>((res) => {
        const done = (v: boolean) => {
          video.removeEventListener('loadedmetadata', onMeta)
          video.removeEventListener('error', onErr)
          res(v)
        }
        const onMeta = () => done(true)
        const onErr = () => done(false)
        video.addEventListener('loadedmetadata', onMeta)
        video.addEventListener('error', onErr)
      })
      if (token !== this.token) return
      if (!ok) {
        this.currentUrl = null
        usePlayback.setState({ mode: 'frames', error: 'No se pudo abrir este video. Se muestra el storyboard.' })
        return
      }
    }
    const range = videoRange(seg.video)
    const target = Math.min(range.from + offset, Math.max(range.from, range.to - 0.05))
    if (Math.abs(video.currentTime - target) > 0.05) {
      video.currentTime = target
    }
    if (autoplay) {
      try {
        await video.play()
      } catch (e) {
        if (token !== this.token) return
        // El navegador bloqueó el audio automático: reintentar sin sonido.
        if (e instanceof DOMException && e.name === 'NotAllowedError') {
          video.muted = true
          usePlayback.setState({ muted: true })
          await video.play().catch(() => {})
        }
      }
    } else video.pause()
  }

  private next() {
    const st = usePlayback.getState()
    const nextIndex = st.index + 1
    if (nextIndex < this.segments.length) {
      void this.enter(this.segments[nextIndex].start, true)
    } else if (st.loop && this.segments.length) {
      void this.enter(0, true)
    } else {
      this.pause()
      usePlayback.setState({ time: this.total })
    }
    this.last = performance.now()
  }

  private tick = (now: number) => {
    const st = usePlayback.getState()
    if (!st.playing) return
    const seg = this.segments[st.index]
    if (this.busy) {
      this.last = now
      this.raf = requestAnimationFrame(this.tick)
      return
    }
    if (!seg) {
      this.pause()
      return
    }
    if (st.mode === 'video' && this.video) {
      const v = this.video
      const range = seg.video ? videoRange(seg.video) : { from: 0, to: seg.duration }
      const t = seg.start + Math.min(Math.max(0, v.currentTime - range.from), seg.duration)
      if (Math.abs(t - st.time) > 0.01) usePlayback.setState({ time: t })
      if (v.ended || v.currentTime >= range.to - 0.02) this.next()
    } else {
      const dt = (now - this.last) / 1000
      const t = st.time + dt
      if (t >= seg.end) this.next()
      else usePlayback.setState({ time: t })
    }
    this.last = now
    this.syncAudio()
    this.raf = requestAnimationFrame(this.tick)
  }
}

function currentSegmentReload(c: PlaybackController) {
  const st = usePlayback.getState()
  void c.enter(st.time, st.playing)
}

export const playback = new PlaybackController()
