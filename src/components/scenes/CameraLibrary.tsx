import { useState } from 'react'
import { Check, ClipboardCopy, Info, Trash2, Video, X } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { openCameraLibrary, toast, useUI } from '../../stores/uiStore'
import { CAMERA_CATEGORIES, type CameraCategoryId } from '../../features/camera/library'
import { DIAGRAMS } from '../../features/camera/diagrams'
import { CAMERA_ORDER, SPEEDS, cameraItem, cameraPrompt, cameraSpanish, isCameraEmpty, type CameraSpeed } from '../../features/camera/camera'
import { copyToClipboard, pad2 } from '../../utils'
import type { CameraSpec } from '../../types'
import { Modal } from '../common/Overlays'

/** Dibujo de una toma (SVG fijo de la app). */
export function CameraDiagram({ id, className = '' }: { id: string; className?: string }) {
  const svg = DIAGRAMS[id]?.() ?? ''
  return <div className={`camdiag ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
}

const close = () => useUI.setState({ modal: null, pasteSceneId: null })

export function CameraLibraryModal() {
  const sceneId = useUI((s) => s.pasteSceneId)
  const camera = useProject((s) => (sceneId ? s.scenes[sceneId]?.script.camera : undefined))
  const n = useProject((s) => (sceneId && s.project ? s.project.sceneIds.indexOf(sceneId) + 1 : 0))
  const [tab, setTab] = useState<CameraCategoryId>('move')
  if (!sceneId) return null
  const spec: CameraSpec = camera ?? {}
  const set = (next: CameraSpec) => useProject.getState().setCamera(sceneId, isCameraEmpty(next) ? undefined : next)
  const pick = (cat: CameraCategoryId, id: string) => {
    const next = { ...spec, [cat]: spec[cat] === id ? undefined : id }
    if (cat === 'move' && next.move && !next.speed) next.speed = 'slow'
    if (cat === 'move' && !next.move) delete next.speed
    set(next)
  }
  const cat = CAMERA_CATEGORIES.find((c) => c.id === tab)!
  const prompt = cameraPrompt(spec)

  return (
    <Modal title={`Biblioteca de cámara · Escena ${pad2(n)}`} onClose={close} width={1120}>
      <div className="flex flex-col gap-3">
        {/* Resumen de la toma */}
        <div className="rounded-xl border border-line bg-[#0f1828] p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">Tu toma:</span>
            {isCameraEmpty(spec) ? (
              <span className="text-[12.5px] text-ink-3">Elige abajo plano, ángulo, movimiento… (uno por categoría)</span>
            ) : (
              CAMERA_ORDER.filter((k) => spec[k]).map((k) => (
                <button
                  key={k}
                  className="chip !h-6 bg-sel/15 text-[#bfdbfe] hover:bg-bad/20 hover:text-[#fecaca]"
                  onClick={() => pick(k, spec[k]!)}
                  title="Quitar"
                >
                  {cameraItem(spec[k])!.row[1]} <X size={11} />
                </button>
              ))
            )}
            {!isCameraEmpty(spec) && (
              <button className="btn btn-sm btn-ghost ml-auto" onClick={() => set({})}>
                <Trash2 size={13} /> Quitar todo
              </button>
            )}
          </div>
          {spec.move && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="label">Velocidad del movimiento:</span>
              {(Object.keys(SPEEDS) as CameraSpeed[]).map((sp) => (
                <button key={sp} className={`btn btn-sm ${spec.speed === sp ? '!border-sel !bg-sel/20 !text-white' : ''}`} onClick={() => set({ ...spec, speed: sp })}>
                  {SPEEDS[sp].es}
                </button>
              ))}
            </div>
          )}
          {prompt && (
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <div className="rounded-lg bg-white/[0.03] p-2 text-[12px] leading-relaxed">
                <div className="label mb-0.5">En el guion (español)</div>
                Cámara: {cameraSpanish(spec)}
              </div>
              <div className="flex gap-1.5 rounded-lg bg-[#38bdd8]/10 p-2 font-mono text-[11.5px] leading-relaxed text-[#cdeff7]">
                <div className="flex-1">
                  <div className="label mb-0.5 font-sans">En el prompt (inglés, para Higgsfield / Kling)</div>
                  {prompt}
                </div>
                <button className="icon-btn sm shrink-0" onClick={async () => (await copyToClipboard(prompt)) && toast('Frase de cámara copiada')} aria-label="Copiar frase de cámara">
                  <ClipboardCopy size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Categorías */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Categorías de cámara">
          {CAMERA_CATEGORIES.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={tab === c.id}
              className={`btn btn-sm ${tab === c.id ? '!border-sel !bg-sel/20 !text-white' : ''}`}
              onClick={() => setTab(c.id)}
            >
              {c.name}
              {spec[c.id] && <Check size={12} className="text-ok" />}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <Info size={13} className="shrink-0" /> {cat.desc}
          {tab === 'move' && ' Un solo movimiento por toma sale mejor; si necesitas dos, corta la escena en dos (✂).'}
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
          {cat.items.map(([id, es, en, what, when, , hf]) => {
            const on = spec[tab] === id
            return (
              <button
                key={id}
                onClick={() => pick(tab, id)}
                aria-pressed={on}
                className={`flex flex-col gap-1.5 rounded-xl border p-2 text-left transition-colors ${on ? 'border-sel bg-sel/10 ring-1 ring-sel' : 'border-line bg-card/40 hover:border-line-2'}`}
              >
                <div className="relative overflow-hidden rounded-lg bg-[#0b1322]">
                  <CameraDiagram id={id} />
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sel text-white">
                      <Check size={12} />
                    </span>
                  )}
                </div>
                <div className="text-[13.5px] font-semibold leading-tight">{es}</div>
                <div className="font-mono text-[10.5px] text-[#67d3ea]">{en}</div>
                <div className="text-[11.5px] leading-snug text-ink-2">{what}</div>
                <div className="text-[11.5px] leading-snug text-ink-3">Para: {when}</div>
                {hf && <span className="chip mt-auto self-start bg-[#ff7a33]/15 text-[#ffb68a]">Higgsfield: {hf}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

/** Resumen debajo de «Dirección de cámara» en cada escena. */
export function CameraSummary({ sceneId }: { sceneId: string }) {
  const camera = useProject((s) => s.scenes[sceneId]?.script.camera)
  const empty = isCameraEmpty(camera)
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-line-2 bg-[#0f1828] p-2">
      <button className="btn btn-sm !border-[#38bdd8]/50 !text-[#cdeff7]" onClick={() => openCameraLibrary(sceneId)}>
        <Video size={13} /> Biblioteca de cámara
      </button>
      {empty ? (
        <span className="text-[11.5px] text-ink-3">Elige con dibujos el plano, ángulo, movimiento, lente y luz.</span>
      ) : (
        CAMERA_ORDER.filter((k) => camera![k]).map((k) => {
          const it = cameraItem(camera![k])!
          return (
            <span key={k} className="chip !h-7 gap-1.5 bg-white/5 !pl-1 text-ink" title={it.row[2]}>
              <CameraDiagram id={it.row[0]} className="w-8 overflow-hidden rounded" />
              {it.row[1]}
              {k === 'move' && camera!.speed ? <span className="text-ink-3">· {SPEEDS[camera!.speed].es}</span> : null}
            </span>
          )
        })
      )}
    </div>
  )
}
