import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileUp, Loader2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { requestScroll, toast, useUI } from '../../stores/uiStore'
import { parseScriptText, type ScriptFile } from '../../features/script-exchange/schema'
import { pickFiles } from '../../hooks/useFileDrop'
import { formatDuration, pad2 } from '../../utils'
import { Modal } from '../common/Overlays'

const close = () => useUI.setState({ modal: null })

export function ImportScriptModal() {
  const current = useProject((s) => s.project)
  const [tab, setTab] = useState<'paste' | 'file'>('paste')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [data, setData] = useState<ScriptFile | null>(null)
  const [mode, setMode] = useState<'new' | 'append'>('new')
  const [busy, setBusy] = useState(false)

  const validate = (raw: string) => {
    const r = parseScriptText(raw)
    if (r.ok) {
      setData(r.data)
      setErrors([])
    } else {
      setData(null)
      setErrors(r.errors)
    }
  }

  const chooseFile = async () => {
    const [f] = await pickFiles('.json,application/json')
    if (!f) return
    if (f.size > 1_000_000) {
      setData(null)
      return setErrors(['El archivo es demasiado grande (máximo 1 MB).'])
    }
    setFileName(f.name)
    const raw = await f.text()
    setText(raw)
    validate(raw)
  }

  const doImport = async () => {
    if (!data) return
    setBusy(true)
    try {
      const n = await useProject.getState().importScript(data, mode)
      const sel = useProject.getState().selectedSceneId
      if (sel) requestScroll(sel)
      toast(mode === 'new' ? `Proyecto «${data.project.title}» creado con ${n} escenas` : `${n} escenas agregadas al final`)
      close()
    } catch (e) {
      console.error(e)
      toast('No se pudo importar. No se cambió nada.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const total = data?.scenes.reduce((a, s) => a + s.plannedDuration, 0) ?? 0
  const tabCls = (on: boolean) => `btn btn-sm ${on ? '!border-sel !bg-sel/15 !text-white' : ''}`

  return (
    <Modal
      title="Importar guion"
      onClose={close}
      width={680}
      footer={
        data ? (
          <>
            <button className="btn" onClick={() => setData(null)}>
              Volver
            </button>
            <button className="btn btn-primary" onClick={doImport} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {mode === 'new' ? 'Crear proyecto nuevo' : 'Agregar al proyecto actual'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => validate(text)} disabled={!text.trim()}>
            Validar y previsualizar
          </button>
        )
      }
    >
      {!data ? (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            Primero usa «Copiar formato para IA», pégalo en ChatGPT o Claude con tu idea, y trae aquí lo que te devuelva.
          </p>
          <div className="flex gap-1.5" role="tablist">
            <button role="tab" aria-selected={tab === 'paste'} className={tabCls(tab === 'paste')} onClick={() => setTab('paste')}>
              <ClipboardPaste size={13} /> Pegar contenido
            </button>
            <button role="tab" aria-selected={tab === 'file'} className={tabCls(tab === 'file')} onClick={() => setTab('file')}>
              <FileUp size={13} /> Cargar archivo
            </button>
          </div>
          {tab === 'paste' ? (
            <textarea
              className="field font-mono !text-[11.5px]"
              rows={12}
              placeholder='{ "format": "ikral-studio-script", "version": 1, … }'
              aria-label="JSON del guion"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setErrors([])
              }}
            />
          ) : (
            <div className="dropzone flex flex-col items-center gap-2 p-6 text-center">
              <button className="btn" onClick={chooseFile}>
                <FileUp size={15} /> Elegir archivo .json
              </button>
              <span className="text-[12px] text-ink-3">{fileName || 'Ningún archivo elegido'}</span>
            </div>
          )}
          {errors.length > 0 && (
            <div className="rounded-xl border border-bad/50 bg-bad/10 p-3" role="alert">
              <div className="mb-1.5 flex items-center gap-1.5 font-medium text-[#fecaca]">
                <AlertTriangle size={15} /> No se importó nada. Revisa esto:
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-[#fecaca]">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-ok">
            <CheckCircle2 size={16} /> <span className="font-medium">El guion es válido</span>
          </div>
          <div className="rounded-xl border border-line bg-card/50 p-3">
            <div className="text-[15px] font-semibold">{data.project.title}</div>
            <div className="text-[12px] text-ink-3">
              {data.scenes.length} escenas · {formatDuration(total)} · {data.project.aspectRatio}
              {data.project.customFields.length > 0 && ` · campos extra: ${data.project.customFields.join(', ')}`}
            </div>
            <ol className="mt-2 max-h-56 overflow-auto text-[12.5px]">
              {data.scenes.map((s, i) => (
                <li key={i} className="flex gap-2 border-b border-line py-1 last:border-0">
                  <span className="w-6 tabular-nums text-ink-3">{pad2(i + 1)}</span>
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="tabular-nums text-ink-3">{formatDuration(s.plannedDuration)}</span>
                </li>
              ))}
            </ol>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="label mb-1">¿Dónde lo pongo?</legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 has-[:checked]:border-sel">
              <input type="radio" name="mode" checked={mode === 'new'} onChange={() => setMode('new')} className="mt-0.5" />
              <span>
                <b className="font-medium">Crear proyecto nuevo</b> <span className="chip bg-ok/15 text-[#86efac]">Recomendado</span>
                <span className="block text-[12px] text-ink-3">Tu proyecto actual queda igual.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 has-[:checked]:border-sel">
              <input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} className="mt-0.5" disabled={!current} />
              <span>
                <b className="font-medium">Agregar al proyecto actual</b>
                <span className="block text-[12px] text-ink-3">
                  Las escenas se agregan al final de «{current?.title}». No se borra ninguna imagen, video ni música.
                </span>
              </span>
            </label>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}
