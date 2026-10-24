// Portafolio de producción en PDF, estilo libro de arte de estudio:
// portada, el mundo (estilo y personajes), una página por escena (storyboard + guion + diálogos con caritas),
// storyboard completo en cuadrícula y lista de tomas.
import type { jsPDF as JsPDF } from 'jspdf'
import type { Project, Scene } from '../../types'
import { getMediaBlob } from '../media-library/media'
import { effectiveDuration, extraEntries, generationPrompt } from '../script-sync/derive'
import { cameraSpanish } from '../camera/camera'
import { SHOT_COLUMNS, shotRows } from '../camera/shotList'
import { styleSpanish } from '../project-style/style'
import { emojiFor, parseDialogue, splitEmotions } from '../dialogue/lines'
import { formatDuration, pad2 } from '../../utils'

// Página carta horizontal, en puntos. (La Biblia de Producción usa las mismas medidas y colores.)
export const W = 792
export const H = 612
export const M = 44
export const PAPER: RGB = [246, 240, 228]
export const INK: RGB = [43, 38, 32]
export const MUTED: RGB = [128, 117, 102]
export const RULE: RGB = [216, 204, 186]
export const ACCENT: RGB = [178, 70, 45]
export type RGB = [number, number, number]

const FONTS: [string, string, 'normal' | 'bold' | 'italic'][] = [
  ['DMSerifDisplay-Regular.ttf', 'Display', 'normal'],
  ['Lato-Regular.ttf', 'Body', 'normal'],
  ['Lato-Bold.ttf', 'Body', 'bold'],
  ['Lato-Italic.ttf', 'Body', 'italic'],
]

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Quita emojis y símbolos que las fuentes del PDF no tienen. */
export const clean = (t: string) =>
  t
    .replace(/\p{Extended_Pictographic}|‍|️/gu, '')
    .replace(/→/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .trim()

/** Imagen de una escena como JPEG ligero (máx. 1400 px). Videos: su miniatura. */
export async function imageData(id: string | undefined, cache: Map<string, Img | null>): Promise<Img | null> {
  if (!id) return null
  if (cache.has(id)) return cache.get(id)!
  let out: Img | null = null
  try {
    const rec = await getMediaBlob(id)
    const blob = rec ? (rec.kind === 'image' ? rec.blob : rec.thumb) : undefined
    if (blob) {
      const bmp = await createImageBitmap(blob)
      const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k)
      c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      out = { data: c.toDataURL('image/jpeg', 0.86), w: c.width, h: c.height }
    }
  } catch {
    out = null
  }
  cache.set(id, out)
  return out
}
export interface Img {
  data: string
  w: number
  h: number
}

/** Las caritas se dibujan con la fuente de emojis del sistema y entran al PDF como imagen. */
const emojiCache = new Map<string, string>()
export function emojiPng(e: string): string {
  let d = emojiCache.get(e)
  if (!d) {
    const c = document.createElement('canvas')
    c.width = c.height = 72
    const g = c.getContext('2d')!
    g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(e, 36, 40)
    d = c.toDataURL('image/png')
    emojiCache.set(e, d)
  }
  return d
}

/** Color fijo por personaje (el mismo que en la app). */
export function speakerColor(name: string): RGB {
  let h = 0
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360
  // hsl(h, 55%, 38%) → rgb, un poco más oscuro para papel claro
  const s = 0.55
  const l = 0.38
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

/** Hoja de PDF ya lista: carta horizontal, fuentes cargadas y las piezas de dibujo de siempre. */
export async function createPdfKit(title: string) {
  const { jsPDF } = await import('jspdf')
  const doc: JsPDF = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true })
  const base = import.meta.env.BASE_URL
  for (const [file, name, style] of FONTS) {
    const buf = await (await fetch(`${base}fonts/${file}`)).arrayBuffer()
    doc.addFileToVFS(file, toBase64(buf))
    doc.addFont(file, name, style)
  }
  let page = 0

  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const font = (name: 'Display' | 'Body', style: 'normal' | 'bold' | 'italic' = 'normal', size = 10) => {
    doc.setFont(name, style)
    doc.setFontSize(size)
  }
  const rule = (x1: number, y: number, x2: number, c: RGB = RULE, w = 0.6) => {
    doc.setDrawColor(c[0], c[1], c[2])
    doc.setLineWidth(w)
    doc.line(x1, y, x2, y)
  }
  const newPage = (footer = true) => {
    if (page > 0) doc.addPage()
    page++
    doc.setFillColor(PAPER[0], PAPER[1], PAPER[2])
    doc.rect(0, 0, W, H, 'F')
    if (footer) {
      rule(M, H - 30, W - M)
      font('Body', 'normal', 7.5)
      color(MUTED)
      doc.text(clean(title).toUpperCase(), M, H - 18, { charSpace: 1 })
      doc.text(String(page), W - M, H - 18, { align: 'right' })
    }
  }
  const label = (t: string, x: number, y: number, c: RGB = ACCENT) => {
    font('Body', 'bold', 7.5)
    color(c)
    doc.text(t.toUpperCase(), x, y, { charSpace: 1.4 })
  }
  /** Imagen encajada (cover) en un marco con filo fino. */
  const framed = (img: Img | null, x: number, y: number, w: number, h: number) => {
    doc.setFillColor(232, 224, 209)
    doc.rect(x, y, w, h, 'F')
    if (img) {
      const k = Math.min(w / img.w, h / img.h)
      const iw = img.w * k
      const ih = img.h * k
      doc.addImage(img.data, 'JPEG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST')
    } else {
      font('Body', 'italic', 9)
      color(MUTED)
      doc.text('Sin imagen', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' })
    }
    doc.setDrawColor(INK[0], INK[1], INK[2])
    doc.setLineWidth(0.4)
    doc.rect(x, y, w, h, 'S')
  }
  /** Etiqueta chiquita sobre la esquina de una imagen. */
  const tag = (t: string, x: number, y: number) => {
    font('Body', 'bold', 6.5)
    const tw = doc.getTextWidth(t.toUpperCase()) + t.length * 1 + 10
    doc.setFillColor(INK[0], INK[1], INK[2])
    doc.rect(x + 6, y + 6, tw, 13, 'F')
    doc.setTextColor(PAPER[0], PAPER[1], PAPER[2])
    doc.text(t.toUpperCase(), x + 11, y + 15, { charSpace: 1 })
  }
  /** Página actual (la primera es 1). */
  const pageNo = () => page
  return { doc, color, font, rule, newPage, label, framed, tag, pageNo, cache: new Map<string, Img | null>() }
}
export type PdfKit = Awaited<ReturnType<typeof createPdfKit>>

export async function exportPortfolioPdf(project: Project, scenes: Scene[], onProgress?: (msg: string) => void): Promise<Blob> {
  const { doc, color, font, rule, newPage, label, framed, tag, cache } = await createPdfKit(project.title)
  const vertical = project.aspectRatio === '9:16'
  const total = scenes.reduce((a, s) => a + effectiveDuration(s), 0)
  const date = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

  // ---------- Portada ----------
  onProgress?.('Portada')
  newPage(false)
  const hero = await imageData(scenes.find((s) => s.startImageId)?.startImageId ?? scenes.find((s) => s.endImageId)?.endImageId, cache)
  const heroW = vertical ? 250 : 430
  const heroH = vertical ? 444 : 242
  const heroX = W - M - heroW
  const heroY = (H - heroH) / 2
  framed(hero, heroX, heroY, heroW, heroH)
  label('Carpeta de producción', M, 150)
  font('Display', 'normal', clean(project.title).length > 22 ? 34 : 44)
  color(INK)
  const titleLines = doc.splitTextToSize(clean(project.title), heroX - M - 30)
  doc.text(titleLines, M, 196)
  let ty = 196 + titleLines.length * 46
  rule(M, ty - 18, M + 60, ACCENT, 1.4)
  font('Body', 'normal', 11)
  color(MUTED)
  doc.text(`${scenes.length} escenas · ${Math.floor(total / 60)}:${pad2(Math.round(total % 60))} min · ${project.aspectRatio}`, M, ty + 4)
  doc.text(date, M, ty + 20)
  if (project.description?.trim()) {
    font('Body', 'italic', 10.5)
    color(INK)
    doc.text(doc.splitTextToSize(clean(project.description), heroX - M - 30).slice(0, 6), M, ty + 50)
  }
  font('Body', 'bold', 8)
  color(MUTED)
  doc.text('IKRAL STUDIO', M, H - M, { charSpace: 2 })

  // ---------- El mundo: estilo y personajes ----------
  const style = styleSpanish(project)
  const chars = (project.characters ?? []).filter((c) => c.name.trim())
  if (style || chars.length) {
    onProgress?.('Personajes')
    newPage()
    label('El mundo', M, 70)
    font('Display', 'normal', 30)
    color(INK)
    doc.text('Estilo y personajes', M, 104)
    let y = 132
    if (style) {
      font('Body', 'italic', 11.5)
      color(INK)
      const lines = doc.splitTextToSize(clean(style), W - 2 * M)
      doc.text(lines, M, y)
      y += lines.length * 15 + 18
    }
    // Tarjetas en 3 columnas parejas.
    const cols = 3
    const gap = 18
    const cw = (W - 2 * M - gap * (cols - 1)) / cols
    let rowH = 0
    chars.forEach((c, i) => {
      const col = i % cols
      if (col === 0 && i > 0) {
        y += rowH + gap
        rowH = 0
      }
      font('Body', 'normal', 9.5)
      const desc = doc.splitTextToSize(clean(c.description) || '—', cw - 24)
      const h = 46 + desc.length * 12.5
      if (y + h > H - 50) {
        newPage()
        y = 70
      }
      const x = M + col * (cw + gap)
      doc.setFillColor(239, 231, 216)
      doc.rect(x, y, cw, h, 'F')
      const sc = speakerColor(c.name)
      doc.setFillColor(sc[0], sc[1], sc[2])
      doc.rect(x, y, 3, h, 'F')
      font('Display', 'normal', 16)
      color(INK)
      doc.text(clean(c.name), x + 14, y + 24)
      font('Body', 'normal', 9.5)
      color(INK)
      doc.text(desc, x + 14, y + 42)
      rowH = Math.max(rowH, h)
    })
  }

  // ---------- Una página por escena ----------
  const colX = vertical ? M + 2 * 170 + 30 + 30 : M + 380 + 30
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]
    onProgress?.(`Escena ${i + 1} de ${scenes.length}`)
    newPage()
    // Encabezado
    label(`Escena ${pad2(i + 1)}`, M, 60)
    font('Display', 'normal', 24)
    color(INK)
    doc.text(clean(s.title) || 'Sin título', M, 88)
    font('Body', 'normal', 9)
    color(MUTED)
    const cam = cameraSpanish(s.script.camera)
    doc.text(formatDuration(effectiveDuration(s)), W - M, 60, { align: 'right' })
    rule(M, 100, W - M)

    // Storyboard: inicio y final (y fotogramas intermedios en chiquito).
    const [start, end] = await Promise.all([imageData(s.startImageId, cache), imageData(s.endImageId, cache)])
    if (vertical) {
      framed(start, M, 116, 170, 302)
      tag('Inicio', M, 116)
      framed(end, M + 200, 116, 170, 302)
      tag('Final', M + 200, 116)
      // Fotogramas intermedios en chiquito debajo.
      const frames = [...s.storyboardFrames].sort((a, b) => a.order - b.order).slice(0, 5)
      for (let f = 0; f < frames.length; f++) framed(await imageData(frames[f].mediaId, cache), M + f * 75.5, 430, 67.5, 120)
    } else {
      framed(start, M, 116, 380, 214)
      tag('Inicio', M, 116)
      framed(end, M, 342, 380, 214)
      tag('Final', M, 342)
    }

    // Texto a la derecha. Primero se mide: si no cabe, se achica la letra un poco;
    // solo si aun así no cabe, sigue en una página de continuación a todo lo ancho.
    const bottom = H - 46
    const lines = parseDialogue(s.script.dialogue).filter((l) => clean(l.text) || l.speaker)
    const sections: [string, string][] = [
      ['Acción', s.script.action],
      ['Cámara', [cam, s.script.cameraDirection].filter((t) => t.trim()).join('\n')],
      ['Sonido', s.script.soundDirection],
      ...extraEntries(s, project.customFields),
    ]
    const layout = (draw: boolean, fs: number): boolean => {
      const lh = fs * 1.32
      let x = colX
      let width = W - M - colX
      let y = 124
      let overflow = false
      const cont = () => {
        overflow = true
        if (!draw) return
        newPage()
        label(`Escena ${pad2(i + 1)} · continúa`, M, 60)
        font('Display', 'normal', 18)
        color(INK)
        doc.text(clean(s.title), M, 84)
        rule(M, 96, W - M)
        x = M
        width = W - 2 * M
        y = 120
      }
      const ensure = (h: number) => {
        if (y + h > bottom) cont()
      }
      const section = (title: string, text: string) => {
        const t = clean(text)
        if (!t) return
        font('Body', 'normal', fs)
        ensure(lh * 2 + 13)
        if (draw) label(title, x, y)
        y += 13
        // Si brinca de página, lo que falta se vuelve a acomodar al ancho nuevo.
        let rows: string[] = doc.splitTextToSize(t, width)
        while (rows.length) {
          const w0 = width
          ensure(lh)
          if (width !== w0) {
            font('Body', 'normal', fs)
            rows = doc.splitTextToSize(rows.join(' '), width)
          }
          if (draw) {
            font('Body', 'normal', fs)
            color(INK)
            doc.text(rows[0], x, y)
          }
          rows = rows.slice(1)
          y += lh
        }
        y += 10
      }
      section(...sections[0])
      if (lines.length) {
        ensure(lh * 2 + 15)
        if (draw) label('Diálogos', x, y)
        y += 15
        for (const l of lines) {
          const emos = splitEmotions(l.emotion)
          const faces = emos.map((e) => emojiFor(e)).filter(Boolean) as string[]
          font('Body', 'italic', fs)
          const body: string[] = doc.splitTextToSize(clean(l.text), width - 12)
          ensure(lh + 4 + body.length * lh)
          if (draw) {
            let cx = x
            if (l.speaker) {
              const sc = speakerColor(l.speaker)
              font('Body', 'bold', fs)
              doc.setTextColor(sc[0], sc[1], sc[2])
              const name = clean(l.speaker).toUpperCase()
              doc.text(name, cx, y, { charSpace: 0.6 })
              cx += doc.getTextWidth(name) + name.length * 0.6 + 6
            }
            faces.forEach((f, k) => {
              if (k > 0) {
                font('Body', 'normal', 8)
                color(MUTED)
                doc.text('>', cx, y - 0.5)
                cx += 7
              }
              doc.addImage(emojiPng(f), 'PNG', cx, y - 10.5, 13, 13)
              cx += 15
            })
            const words = clean(emos.filter(Boolean).join(' > '))
            if (words) {
              font('Body', 'normal', 7.5)
              color(MUTED)
              doc.text(`(${words})`, cx + 2, y - 0.5)
            }
          }
          y += lh
          for (const ln of body) {
            if (draw) {
              font('Body', 'italic', fs)
              color(INK)
              doc.text(ln, x + 12, y)
            }
            y += lh
          }
          y += 4
        }
        y += 8
      }
      for (const sec of sections.slice(1)) section(...sec)
      return overflow
    }
    const fs = [9.5, 9, 8.5, 8].find((f) => !layout(false, f)) ?? 8
    layout(true, fs)

    // Prompt de generación de la escena, en la página siguiente y a todo lo ancho.
    const prompt = clean(generationPrompt(s, project.customFields, project))
    if (prompt) {
      const head = () => {
        newPage()
        label(`Escena ${pad2(i + 1)} · Prompt de generación`, M, 60)
        font('Display', 'normal', 24)
        color(INK)
        doc.text(clean(s.title) || 'Sin título', M, 88)
        rule(M, 100, W - M)
        return 128
      }
      let py = head()
      let top = py - 10
      const plh = 13.5
      const bar = (from: number, to: number) => {
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2])
        doc.rect(M, from, 2, to - from, 'F')
      }
      font('Body', 'normal', 10)
      for (const ln of doc.splitTextToSize(prompt, W - 2 * M - 18) as string[]) {
        if (py > H - 50) {
          bar(top, py - plh + 4)
          py = head()
          top = py - 10
        }
        font('Body', 'normal', 10)
        color(INK)
        doc.text(ln, M + 16, py)
        py += plh
      }
      bar(top, py - plh + 4)
    }
  }

  // ---------- Storyboard completo: 3 × 3 por página ----------
  if (scenes.length) {
    const cols = vertical ? 5 : 3
    const rows = vertical ? 1 : 3
    const gap = 16
    const cw = (W - 2 * M - gap * (cols - 1)) / cols
    const ch = vertical ? cw * 16 / 9 : cw * 9 / 16
    const per = cols * rows
    for (let p = 0; p < scenes.length; p += per) {
      onProgress?.('Storyboard')
      newPage()
      label('Storyboard', M, 54)
      font('Display', 'normal', 20)
      color(INK)
      doc.text(`Escenas ${p + 1}–${Math.min(scenes.length, p + per)}`, M, 78)
      for (let k = 0; k < per && p + k < scenes.length; k++) {
        const s = scenes[p + k]
        const cx = M + (k % cols) * (cw + gap)
        const cy = 96 + Math.floor(k / cols) * (ch + 34)
        framed(await imageData(s.startImageId ?? s.endImageId ?? s.storyboardFrames[0]?.mediaId, cache), cx, cy, cw, ch)
        font('Body', 'bold', 8)
        color(ACCENT)
        doc.text(pad2(p + k + 1), cx, cy + ch + 13)
        font('Body', 'normal', 8.5)
        color(INK)
        const t = doc.splitTextToSize(clean(s.title), cw - 60)[0] ?? ''
        doc.text(t, cx + 16, cy + ch + 13)
        color(MUTED)
        doc.text(formatDuration(effectiveDuration(s)), cx + cw, cy + ch + 13, { align: 'right' })
      }
    }
  }

  // ---------- Lista de tomas ----------
  onProgress?.('Lista de tomas')
  const widths = [26, 150, 52, 74, 66, 104, 66, 70, 36, 60]
  const scale = (W - 2 * M) / widths.reduce((a, b) => a + b, 0)
  const cw = widths.map((w) => w * scale)
  const rowsData = shotRows(scenes)
  const header = () => {
    newPage()
    label('Producción', M, 54)
    font('Display', 'normal', 20)
    color(INK)
    doc.text('Lista de tomas', M, 78)
    let cx = M
    font('Body', 'bold', 7.5)
    color(MUTED)
    SHOT_COLUMNS.forEach((c, k) => {
      doc.text(c.toUpperCase(), cx + 3, 104, { charSpace: 0.8 })
      cx += cw[k]
    })
    rule(M, 110, W - M, INK, 0.6)
    return 126
  }
  let y = header()
  rowsData.forEach((r, n) => {
    if (y > H - 50) y = header()
    if (n % 2 === 0) {
      doc.setFillColor(239, 231, 216)
      doc.rect(M, y - 11, W - 2 * M, 16, 'F')
    }
    let cx = M
    r.forEach((v, k) => {
      font('Body', k === 1 ? 'bold' : 'normal', 8.5)
      color(k === 0 ? ACCENT : INK)
      doc.text(doc.splitTextToSize(clean(v), cw[k] - 6)[0] ?? '', cx + 3, y)
      cx += cw[k]
    })
    y += 16
  })

  return doc.output('blob')
}
