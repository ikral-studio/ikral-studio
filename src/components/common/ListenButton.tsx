// Botón «🔊 Escuchar» para UNA sección larga (hallazgo de GPT, ficha de la Biblia…). Voz del sistema, nunca arranca sola.
// Mientras suena: Pausar/Reanudar · Detener · Repetir. Al empezar otra sección, esta se detiene. El texto sigue en pantalla.
import { useEffect, useSyncExternalStore } from 'react'
import { Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react'
import { appReader, type Reader } from '../../features/speech/reader'

export function ListenButton({ id, text, label = 'Escuchar esta sección', reader = appReader() }: {
  /** Id único de la sección (no se repite en la pantalla). */
  id: string
  /** Texto completo que se lee. */
  text: string
  label?: string
  reader?: Reader
}) {
  const state = useSyncExternalStore(reader.subscribe, reader.getState)
  const mine = state.sectionId === id
  // Al cerrar la pantalla o cambiar de escena, deja de sonar.
  useEffect(() => () => reader.stopIf(id), [reader, id])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Lectura en voz alta: ${label}`}>
        {!mine ? (
          <button className="btn !h-10 !px-3 !text-[14px]" onClick={() => reader.speak(id, text)} aria-label={label}>
            <Volume2 size={17} /> 🔊 {label}
          </button>
        ) : (
          <>
            {state.status === 'paused' ? (
              <button className="btn !h-10 !px-3 !text-[14px]" onClick={() => reader.resume()} aria-label="Reanudar lectura">
                <Play size={16} /> Reanudar
              </button>
            ) : (
              <button className="btn !h-10 !px-3 !text-[14px]" onClick={() => reader.pause()} aria-label="Pausar lectura">
                <Pause size={16} /> Pausar
              </button>
            )}
            <button className="btn btn-ghost !h-10 !px-3 !text-[14px]" onClick={() => reader.stop()} aria-label="Detener lectura">
              <Square size={15} /> Detener
            </button>
            <button className="btn btn-ghost !h-10 !px-3 !text-[14px]" onClick={() => reader.repeat(id, text)} aria-label="Repetir desde el principio">
              <RotateCcw size={15} /> Repetir
            </button>
            <span className="text-[13px] text-ink-2" role="status">
              {state.status === 'paused' ? 'En pausa' : 'Leyendo…'}
            </span>
          </>
        )}
      </div>
      {state.error && !state.sectionId && state.lastSectionId === id && (
        <p className="text-[13px] text-warn" role="alert">
          {state.error}
        </p>
      )}
    </div>
  )
}
