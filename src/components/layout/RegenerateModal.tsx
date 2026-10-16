import { useState } from 'react'
import { Wand2 } from 'lucide-react'
import { useProject } from '../../stores/projectStore'
import { useUI } from '../../stores/uiStore'
import { requestRegenerate } from '../../features/chat/requests'
import { useMediaUrl } from '../../features/media-library/media'
import { pad2 } from '../../utils'
import { Modal } from '../common/Overlays'

const close = () => useUI.setState({ modal: null, regenerate: null })

/** «Volver a generar»: qué salió mal (opcional) y se le pide a Claude por el chat. */
export function RegenerateModal() {
  const target = useUI((s) => s.regenerate)
  const scene = useProject((s) => (target ? s.scenes[target.sceneId] : undefined))
  const n = useProject((s) => (target && s.project ? s.project.sceneIds.indexOf(target.sceneId) + 1 : 0))
  const url = useMediaUrl(target && scene ? (target.slot === 'start' ? scene.startImageId : scene.endImageId) : undefined, true)
  const [note, setNote] = useState('')
  if (!target || !scene) return null
  const which = target.slot === 'start' ? 'imagen inicial' : 'imagen final'
  const send = async () => {
    await requestRegenerate(target.sceneId, target.slot, note)
    close()
  }
  return (
    <Modal
      title={`Volver a generar · Escena ${pad2(n)}`}
      onClose={close}
      width={520}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => void send()}>
            <Wand2 size={15} /> Pedir a Claude
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-ink-2">
          Claude rehace la <b className="text-ink">{which}</b> de «{scene.title}» con los mismos personajes. La imagen actual no se borra hasta que llegue la nueva.
        </p>
        {url && <img src={url} alt="" className="max-h-48 rounded-lg object-contain" />}
        <label className="flex flex-col gap-1">
          <span className="label">¿Qué salió mal? (opcional)</span>
          <textarea
            autoFocus
            className="field"
            rows={3}
            placeholder="Ej.: la pareja mira hacia atrás con el cuerpo chueco; que estén de frente a Don Pepe."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}
