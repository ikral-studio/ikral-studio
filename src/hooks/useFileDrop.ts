import { useRef, useState, type DragEvent } from 'react'

/** Zona de soltar archivos desde la computadora. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
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
