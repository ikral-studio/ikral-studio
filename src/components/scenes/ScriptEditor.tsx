import { useState } from 'react'
import { ClipboardCopy, Languages, ListPlus, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { askConfirm, toast } from '../../stores/uiStore'
import { CameraSummary } from './CameraLibrary'
import { generationPrompt, sceneScriptText } from '../../features/script-sync/derive'
import { copyToClipboard } from '../../utils'
import type { CustomField, ScriptField } from '../../types'

const NO_FIELDS: CustomField[] = []

const FIELDS: { key: ScriptField; label: string; hint: string; rows: number }[] = [
  { key: 'action', label: 'Acción visual', hint: 'Qué ocurre físicamente en la escena.', rows: 3 },
  { key: 'dialogue', label: 'Diálogos', hint: 'Quién habla y qué dice. Ej.: Joven: —¡Mire!', rows: 2 },
  { key: 'soundDirection', label: 'Sonido y ambiente', hint: 'Ambiente, voces, silencios o música.', rows: 2 },
  { key: 'cameraDirection', label: 'Dirección de cámara', hint: 'Encuadre, movimiento, ángulo y continuidad.', rows: 2 },
  { key: 'generationPrompt', label: 'Instrucciones para generación', hint: 'Prompt específico para Higgsfield, Kling, Wan…', rows: 3 },
]

export function ScriptEditor({ sceneId, n }: { sceneId: string; n: number }) {
  const script = useProject((s) => s.scenes[sceneId]?.script)
  const { updateScript, addPronunciation, updatePronunciation, removePronunciation, setNumbersToWords } = useProject.getState()
  const [showPrompt, setShowPrompt] = useState(false)
  const fields = useProject((s) => s.project?.customFields ?? NO_FIELDS)
  const project = useProject((s) => s.project)
  if (!script) return null

  const copyScene = async () => {
    const scene = useProject.getState().scenes[sceneId]
    if (scene && (await copyToClipboard(sceneScriptText(scene, n, fields)))) toast('Guion de la escena copiado')
  }
  const copyPrompt = async () => {
    const scene = useProject.getState().scenes[sceneId]
    if (!scene) return
    const text = generationPrompt(scene, fields, project)
    if (!text.trim()) return toast('El prompt está vacío: escribe la acción o las instrucciones', 'info')
    if (await copyToClipboard(text)) toast('Prompt copiado, listo para pegar en el generador')
  }
  const scene = useProject.getState().scenes[sceneId]
  const prompt = scene ? generationPrompt(scene, fields, project) : ''

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Guion y dirección</span>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn btn-sm" onClick={copyScene}>
            <ClipboardCopy size={13} /> Copiar guion de escena
          </button>
          <button className="btn btn-sm !border-sel/60 !text-[#bfdbfe]" onClick={copyPrompt}>
            <Sparkles size={13} /> Copiar prompt de generación
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={`flex flex-col gap-1 ${f.key === 'action' || f.key === 'generationPrompt' || f.key === 'cameraDirection' ? 'lg:col-span-2' : ''}`}>
            <label className="flex flex-col gap-1">
              <span className="label">{f.label}</span>
              <textarea
                className="field"
                rows={f.rows}
                placeholder={f.hint}
                value={script[f.key]}
                onChange={(e) => updateScript(sceneId, f.key, e.target.value)}
              />
            </label>
            {f.key === 'cameraDirection' && <CameraSummary sceneId={sceneId} />}
          </div>
        ))}
      </div>

      <ExtraFields sceneId={sceneId} fields={fields} values={script.extras ?? {}} />

      <div className="mt-3 rounded-xl border border-line bg-[#0f1828] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label flex items-center gap-1.5">
            <Languages size={13} /> Pronunciación para la IA
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => addPronunciation(sceneId)}>
            <Plus size={13} /> Agregar palabra
          </button>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-ink-2">
          <button
            role="switch"
            aria-checked={!!script.numbersToWords}
            aria-label="Números en letras"
            onClick={() => setNumbersToWords(sceneId, !script.numbersToWords)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${script.numbersToWords ? 'bg-sel' : 'bg-line-2'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${script.numbersToWords ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
          <span>
            <b className="font-medium text-ink">Números en letras</b> — en el prompt, 1253 → «mil doscientos cincuenta y tres», $150 → «ciento cincuenta pesos».
          </span>
        </label>
        {script.pronunciations.length === 0 ? (
          <p className="mt-1 text-[11.5px] text-ink-3">
            Opcional. Ej.: «TuApp.digital» se escribe así en el guion, pero en el prompt va «Tu Ap Dijital».
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            {script.pronunciations.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <input
                  className="field !py-1.5"
                  placeholder="Se escribe (guion)"
                  aria-label="Se escribe"
                  value={p.written}
                  onChange={(e) => updatePronunciation(sceneId, p.id, { written: e.target.value })}
                />
                <span className="text-ink-3">→</span>
                <input
                  className="field !py-1.5"
                  placeholder="Se pronuncia (prompt)"
                  aria-label="Se pronuncia"
                  value={p.spoken}
                  onChange={(e) => updatePronunciation(sceneId, p.id, { spoken: e.target.value })}
                />
                <button className="icon-btn sm" onClick={() => removePronunciation(sceneId, p.id)} aria-label="Quitar pronunciación">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <p className="text-[11px] text-ink-3">Solo cambia el prompt de esta escena. El guion maestro conserva la escritura correcta.</p>
          </div>
        )}
      </div>

      <button className="mt-2 text-[11.5px] text-sel-2 hover:underline" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
        {showPrompt ? 'Ocultar' : 'Ver'} prompt unificado
      </button>
      {showPrompt && (
        <pre className="mt-1.5 whitespace-pre-wrap rounded-xl border border-line bg-[#0b1322] p-3 font-sans text-[12px] leading-relaxed text-ink-2">
          {prompt || 'Vacío: escribe la acción o las instrucciones de generación.'}
        </pre>
      )}
    </div>
  )
}

/** Campos extra del proyecto (Vestuario, Emoción…): salen en todas las escenas. */
function ExtraFields({ sceneId, fields, values }: { sceneId: string; fields: CustomField[]; values: Record<string, string> }) {
  const { updateExtra, addCustomField, renameCustomField, removeCustomField } = useProject.getState()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = () => {
    const n = name.trim()
    if (!n) return setAdding(false)
    if (fields.some((f) => f.name.toLowerCase() === n.toLowerCase())) return toast('Ya existe un campo con ese nombre', 'info')
    addCustomField(n)
    setName('')
    setAdding(false)
    toast(`Campo «${n}» agregado a todas las escenas`)
  }
  const remove = async (f: CustomField) => {
    const ok = await askConfirm({
      title: `¿Quitar el campo «${f.name}»?`,
      body: 'Desaparece de todas las escenas, del guion y del prompt. Puedes deshacer con ⌘Z.',
      confirmLabel: 'Quitar campo',
      danger: true,
    })
    if (ok) removeCustomField(f.id)
  }
  return (
    <div className="mt-3 rounded-xl border border-line bg-[#0f1828] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label flex items-center gap-1.5">
          <ListPlus size={13} /> Campos extra <span className="text-ink-3">(en todas las escenas)</span>
        </span>
        {!adding && (
          <button className="btn btn-sm btn-ghost" onClick={() => setAdding(true)}>
            <Plus size={13} /> Agregar campo
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            className="field !py-1.5"
            placeholder="Nombre del campo, ej. Vestuario"
            aria-label="Nombre del campo nuevo"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <button className="btn btn-sm btn-primary" onClick={add}>Agregar</button>
        </div>
      )}
      {fields.length === 0 && !adding ? (
        <p className="mt-1 text-[11.5px] text-ink-3">Opcional. Crea campos como «Vestuario» o «Emoción»; la IA también los llena al importar.</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {fields.map((f) => (
            <label key={f.id} className="flex flex-col gap-1">
              <span className="flex items-center gap-1">
                {editing === f.id ? (
                  <input
                    autoFocus
                    className="field !py-0.5 !text-[11.5px]"
                    defaultValue={f.name}
                    maxLength={40}
                    aria-label="Nuevo nombre del campo"
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v) renameCustomField(f.id, v)
                      setEditing(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <span className="label">{f.name}</span>
                )}
                <button type="button" className="icon-btn sm !h-5 !w-5" onClick={() => setEditing(f.id)} aria-label={`Renombrar ${f.name}`} title="Renombrar">
                  <Pencil size={11} />
                </button>
                <button type="button" className="icon-btn sm !h-5 !w-5 hover:!text-bad" onClick={() => remove(f)} aria-label={`Quitar campo ${f.name}`} title="Quitar campo">
                  <Trash2 size={11} />
                </button>
              </span>
              <textarea
                className="field"
                rows={2}
                aria-label={f.name}
                value={values[f.id] ?? ''}
                onChange={(e) => updateExtra(sceneId, f.id, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
