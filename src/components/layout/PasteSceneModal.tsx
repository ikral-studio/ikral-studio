import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardPaste } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { toast, useUI } from '../../stores/uiStore'
import { parseSceneText, type SceneParseResult } from '../../features/script-exchange/schema'
import { formatDuration, pad2 } from '../../utils'
import { Modal } from '../common/Overlays'

const close = () => useUI.setState({ modal: null, pasteSceneId: null })

const LABELS: [string, string][] = [
  ['action', 'Acción visual'],
  ['dialogue', 'Diálogos'],
  ['cameraDirection', 'Dirección de cámara'],
  ['soundDirection', 'Sonido y ambiente'],
  ['generationPrompt', 'Instrucciones para generación'],
]

export function PasteSceneModal() {
  const sceneId = useUI((s) => s.pasteSceneId)
  const scene = useProject((s) => (sceneId ? s.scenes[sceneId] : undefined))
  const n = useProject((s) => (sceneId && s.project ? s.project.sceneIds.indexOf(sceneId) + 1 : 0))
  const [text, setText] = useState('')
  const [result, setResult] = useState<SceneParseResult | null>(null)
  const [keepDuration, setKeepDuration] = useState(false)
  if (!scene || !sceneId) return null

  const validate = (raw: string) => {
    const r = parseSceneText(raw)
    setResult(r)
    if (r.ok) setKeepDuration(!r.hasDuration)
  }
  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      setText(t)
      validate(t)
    } catch {
      toast('El navegador no dejó leer el portapapeles. Pega con ⌘V en el cuadro.', 'info')
    }
  }
  const apply = () => {
    if (!result?.ok) return
    useProject.getState().applySceneFromAI(sceneId, result.scene, { customFields: result.customFields, keepDuration })
    toast(`Escena ${pad2(n)} actualizada con la IA ✨`)
    close()
  }
  const ok = result?.ok ? result : null

  return (
    <Modal
      title={`Pegar escena de IA · Escena ${pad2(n)}`}
      onClose={close}
      width={620}
      footer={
        ok ? (
          <>
            <button className="btn" onClick={() => setResult(null)}>
              Volver
            </button>
            <button className="btn btn-primary" onClick={apply}>
              <CheckCircle2 size={15} /> Actualizar escena {pad2(n)}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => validate(text)} disabled={!text.trim()}>
            Validar y previsualizar
          </button>
        )
      }
    >
      {!ok ? (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            Pídele a ChatGPT o Claude solo esta escena (con el «Formato para IA») y pega aquí su respuesta. Se llenan los textos; las imágenes, videos y música
            no se tocan.
          </p>
          <button className="btn self-start" onClick={fromClipboard}>
            <ClipboardPaste size={15} /> Pegar del portapapeles
          </button>
          <textarea
            className="field font-mono !text-[11.5px]"
            rows={10}
            aria-label="JSON de la escena"
            placeholder='{ "format": "ikral-studio-script", … "scenes": [ { una escena } ] }'
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setResult(null)
            }}
          />
          {result && !result.ok && (
            <div className="rounded-xl border border-bad/50 bg-bad/10 p-3" role="alert">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium text-[#fecaca]">
                <AlertTriangle size={15} /> No se cambió nada. Revisa esto:
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-[#fecaca]">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-ok">
            <CheckCircle2 size={16} /> <span className="font-medium">La escena es válida</span>
          </div>
          <div className="rounded-xl border border-line bg-card/50 p-3">
            <div className="text-[12px] text-ink-3">
              «{scene.title}» se llamará:
            </div>
            <div className="text-[15px] font-semibold">{ok.scene.title}</div>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-[12px]">
              {LABELS.map(([k, label]) => {
                const has = !!String(ok.scene.script[k as keyof typeof ok.scene.script] ?? '').trim()
                return (
                  <li key={k} className={has ? 'text-ink' : 'text-ink-3'}>
                    {has ? '✓' : '—'} {label}
                  </li>
                )
              })}
              <li className={ok.scene.script.pronunciations.length ? 'text-ink' : 'text-ink-3'}>
                {ok.scene.script.pronunciations.length ? '✓' : '—'} Pronunciación ({ok.scene.script.pronunciations.length})
              </li>
              <li className="text-ink">✓ Números en letras: {ok.scene.script.numbersToWords ? 'sí' : 'no'}</li>
              {Object.keys(ok.scene.script.extras ?? {}).map((name) => (
                <li key={name} className="text-ink">
                  ✓ {name}
                </li>
              ))}
            </ul>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={keepDuration} onChange={(e) => setKeepDuration(e.target.checked)} />
            Mantener la duración actual ({formatDuration(scene.plannedDuration)}) en vez de {formatDuration(ok.scene.plannedDuration)}
          </label>
          <p className="flex items-start gap-1.5 text-[12px] text-warn">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Se reemplazan los textos de esta escena. Imágenes, videos y música no cambian. Puedes deshacer con ⌘Z.
          </p>
        </div>
      )}
    </Modal>
  )
}
