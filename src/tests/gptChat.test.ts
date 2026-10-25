// Ventanita flotante de GPT: plática libre sobre el proyecto. GPT simulado (sin gastar cuota); el store es el real.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useProject } from '../stores/projectStore'
import { runChatConsult, type GptDeps } from '../features/gpt/client'
import { buildChatPacket, CHAT_KEY, parseChatResponse } from '../features/gpt/chat'
import { addMessage, mergeSection, newThread, type StoredThread } from '../features/gpt/threads'
import { GPT_ERROR_TEXT } from '../features/gpt/proposals'
import { orderedScenes } from '../features/script-sync/derive'
import schemaText from '../features/gpt/schemas/chat.json?raw'

const st = useProject.getState
const ordered = () => orderedScenes(st().project!, st().scenes)
const deps = (raw: string | Error, desktop = true): GptDeps => ({
  desktop: () => desktop,
  diskPath: async () => null,
  consult: vi.fn(async () => {
    if (raw instanceof Error) throw raw
    return raw
  }),
})

beforeAll(async () => {
  await st().init()
})

async function fresh() {
  await st().newProject('Caldo')
  st().addDecision('El final siempre es en la cocina.', { proposedBy: 'director', approve: true })
  st().addDecision('PROPUESTA-SECRETA', { proposedBy: 'claude' })
  const cid = st().addCharacter('Abuela')!
  st().updateCharacter(cid, { description: 'Pelo blanco, rebozo azul.' })
  const made: string[] = []
  for (const title of ['Llegada', 'Cocina']) {
    const id = st().addScene()!
    const sc = st().scenes[id]
    st().updateScene(id, { title, script: { ...sc.script, action: `Pasa algo en ${title}.`, dialogue: 'Abuela: —Siéntate.' } })
    made.push(id)
  }
  return made
}

describe('ventanita de GPT · paquete', () => {
  it('lleva proyecto, decisiones aprobadas, Biblia, escenas, escena abierta y el mensaje; no las propuestas', async () => {
    const [, b] = await fresh()
    const t = newThread<never, never>(CHAT_KEY, 't', undefined, 'chat')
    const p = buildChatPacket(st().project!, ordered(), t, '¿Qué falta?', b)
    expect(p).toContain('Proyecto: «Caldo»')
    expect(p).toContain('El final siempre es en la cocina.')
    expect(p).not.toContain('PROPUESTA-SECRETA')
    expect(p).toContain('Abuela')
    expect(p).toContain('1. «Llegada»')
    expect(p).toContain('Acción: Pasa algo en Cocina.')
    expect(p).toContain('El director tiene abierta la escena 2.')
    expect(p.trim().endsWith('Mensaje del director: ¿Qué falta?')).toBe(true)
  })

  it('incluye lo platicado antes', async () => {
    await fresh()
    let t = newThread<never, never>(CHAT_KEY, 't', undefined, 'chat')
    t = addMessage(t, { from: 'director', text: 'Hola GPT' })
    t = addMessage(t, { from: 'gpt', text: 'Hola director' })
    expect(buildChatPacket(st().project!, ordered(), t, 'Sigue')).toContain('Hola director')
  })
})

describe('ventanita de GPT · respuesta', () => {
  it('acepta solo el formato pedido', () => {
    expect(parseChatResponse('{"respuesta":"Sí","resumen_hilo":"r"}')).toEqual({ ok: true, data: { respuesta: 'Sí', resumen_hilo: 'r' } })
    expect(parseChatResponse('{"respuesta":"  ","resumen_hilo":"r"}').ok).toBe(false)
    expect(parseChatResponse('{"respuesta":"Sí"}').ok).toBe(false)
    expect(parseChatResponse('no json').ok).toBe(false)
  })

  it('en la web no consulta', async () => {
    await fresh()
    const d = deps('{}', false)
    const r = await runChatConsult(st().project!, ordered(), newThread<never, never>(CHAT_KEY, 't', undefined, 'chat'), 'Hola', null, d)
    expect(r).toEqual({ ok: false, kind: 'web', message: GPT_ERROR_TEXT.web })
    expect(d.consult).not.toHaveBeenCalled()
  })

  it('agrega mensaje y respuesta con el resumen; no cambia el proyecto', async () => {
    await fresh()
    const before = JSON.stringify(st().project)
    const d = deps(JSON.stringify({ respuesta: 'Falta el final.', resumen_hilo: 'Hablamos del final.' }))
    const r = await runChatConsult(st().project!, ordered(), newThread<never, never>(CHAT_KEY, 't', undefined, 'chat'), '¿Qué falta?', null, d)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const call = (d.consult as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.schema).toBe(schemaText)
    expect(call.images).toEqual([])
    expect(r.thread.section).toBe('chat')
    expect(r.thread.messages.map((m) => [m.from, m.text])).toEqual([['director', '¿Qué falta?'], ['gpt', 'Falta el final.']])
    expect(r.thread.summary).toBe('Hablamos del final.')
    expect(JSON.stringify(st().project)).toBe(before)
  })

  it('formato malo o error: el hilo queda igual', async () => {
    await fresh()
    const t = newThread<never, never>(CHAT_KEY, 't', undefined, 'chat')
    expect(await runChatConsult(st().project!, ordered(), t, 'x', null, deps('no json'))).toMatchObject({ ok: false, kind: 'bad-format' })
    const err = await runChatConsult(st().project!, ordered(), t, 'x', null, deps(new Error('timeout')))
    expect(err.ok).toBe(false)
    expect(t.messages).toEqual([])
  })

  it('guardar el chat no borra los hilos de otras secciones', () => {
    const chat = newThread<never, never>(CHAT_KEY, 'c', undefined, 'chat') as unknown as StoredThread
    const edit = newThread(CHAT_KEY, 'e', undefined, 'edit') as unknown as StoredThread
    expect(mergeSection([edit], [chat], 'chat').map((t) => t.section).sort()).toEqual(['chat', 'edit'])
  })
})
