import { useRef, useState, type DragEvent } from 'react'

/** Tipo para arrastrar imágenes que ya están en el proyecto (de un fotograma a «Imagen final», etc.). */
export const MEDIA_MIME = 'application/x-ikral-media'

/** Marca un elemento para arrastrar una imagen del proyecto. */
export function mediaDragProps(mediaId: string) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(MEDIA_MIME, mediaId)
      e.dataTransfer.effectAllowed = 'copy'
    },
  }
}

/**
 * Zona de soltar archivos desde la computadora.
 * Con onMedia también acepta imágenes arrastradas desde otra parte del proyecto.
 */
export function useFileDrop(onFiles: (files: File[]) => void, onMedia?: (mediaId: string) => void) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const hasFiles = (e: DragEvent) => {
    const t = Array.from(e.dataTransfer.types)
    return t.includes('Files') || (!!onMedia && t.includes(MEDIA_MIME))
  }
  return {
    over,
    props: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current++
        setOver(true)
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setOver(false)
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.stopPropagation()
        depth.current = 0
        setOver(false)
        const internal = onMedia && e.dataTransfer.getData(MEDIA_MIME)
        if (internal) return onMedia!(internal)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onFiles(files)
      },
    },
  }
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}
