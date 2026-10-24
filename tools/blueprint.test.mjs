import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyUpdates, proposeUpdates, renderMarkdown, summarize, validateBlueprint } from './blueprint-core.mjs'

const tarea = (over = {}) => ({
  id: 'A',
  fase: '1',
  titulo: 'Tarea',
  criterio: 'Algo verificable',
  estado: 'pendiente',
  responsable: 'Claude',
  fecha: null,
  evidencia: [],
  dependeDe: [],
  siguiente: null,
  director: null,
  ...over,
})
const bp = (tareas) => ({ formato: 'ikral-blueprint/1', nombre: 'Prueba', fases: [{ id: '1', titulo: 'Uno' }], tareas })

describe('validateBlueprint', () => {
  it('el Blueprint real de IKRAL Studio es válido', () => {
    const real = JSON.parse(readFileSync(join(process.cwd(), 'docs', 'blueprint', 'ikral-studio.json'), 'utf8'))
    expect(validateBlueprint(real).errors).toEqual([])
  })

  it('«hecho» sin evidencia es error', () => {
    const { errors } = validateBlueprint(bp([tarea({ estado: 'hecho', fecha: '2026-10-24' })]))
    expect(errors.join()).toMatch(/sin evidencia verificable/)
  })

  it('un comentario o un acuse nunca cuentan como evidencia', () => {
    for (const tipo of ['comentario', 'acuse']) {
      const { errors } = validateBlueprint(bp([tarea({ estado: 'hecho', fecha: '2026-10-24', evidencia: [{ tipo, ref: 'Issue #1' }] })]))
      expect(errors.join()).toMatch(new RegExp(`un ${tipo} no es evidencia`))
      expect(errors.join()).toMatch(/sin evidencia verificable/)
    }
  })

  it('el commit debe existir en el repositorio', () => {
    const t = tarea({ estado: 'hecho', fecha: '2026-10-24', evidencia: [{ tipo: 'commit', ref: 'abc1234' }] })
    expect(validateBlueprint(bp([t]), { commitExists: () => true }).errors).toEqual([])
    expect(validateBlueprint(bp([t]), { commitExists: () => false }).errors.join()).toMatch(/no existe/)
  })

  it('una decisión solo cuenta si es del director', () => {
    const d = (por) => tarea({ estado: 'hecho', fecha: '2026-10-24', evidencia: [{ tipo: 'decision', ref: 'Aprobado', por }] })
    expect(validateBlueprint(bp([d('director')])).errors).toEqual([])
    expect(validateBlueprint(bp([d('Claude')])).errors.join()).toMatch(/del director/)
  })

  it('revisa estado, dependencias, bloqueos y la casilla del director', () => {
    const { errors } = validateBlueprint(
      bp([
        tarea({ id: 'A', estado: 'listo' }),
        tarea({ id: 'B', dependeDe: ['Z'] }),
        tarea({ id: 'C', estado: 'bloqueado' }),
        tarea({ id: 'D', director: { aprobado: true, fecha: '2026-10-24' } }),
      ]),
    )
    const all = errors.join('\n')
    expect(all).toMatch(/estado «listo» no válido/)
    expect(all).toMatch(/depende de «Z»/)
    expect(all).toMatch(/bloqueada sin decir/)
    expect(all).toMatch(/no puede aprobar una tarea que no está hecha/)
  })
})

describe('proposeUpdates / applyUpdates', () => {
  const commits = [{ hash: 'abc1234', subject: 'Fase 3d Consultar GPT en cámara' }]
  const b = bp([tarea({ id: '3d', verificar: { asunto: '^Fase 3d ' } })])

  it('solo marca «hecho» si hay commit Y las pruebas y el build pasaron', () => {
    expect(proposeUpdates(b, commits, false).ready).toEqual([])
    expect(proposeUpdates(b, commits, false).waiting.map((u) => u.id)).toEqual(['3d'])
    expect(proposeUpdates(b, [], true).ready).toEqual([])
    const { ready } = proposeUpdates(b, commits, true)
    expect(ready).toEqual([{ id: '3d', commit: 'abc1234', deps: true }])
    const t = applyUpdates(b, ready, '2026-10-24').tareas[0]
    expect(t.estado).toBe('hecho')
    expect(t.evidencia.map((e) => e.tipo)).toEqual(['commit', 'prueba'])
    expect(t.director).toBeNull()
    expect(validateBlueprint({ ...b, tareas: [t] }).errors).toEqual([])
  })

  it('no avanza tareas bloqueadas ni con dependencias sin hacer', () => {
    const c = bp([tarea({ id: 'X' }), tarea({ id: '3d', dependeDe: ['X'], verificar: { asunto: '^Fase 3d ' } }), tarea({ id: 'Y', estado: 'bloqueado', siguiente: 'Director', verificar: { asunto: '^Fase' } })])
    const r = proposeUpdates(c, commits, true)
    expect(r.ready).toEqual([])
    expect(r.waiting.map((u) => u.id)).toEqual(['3d'])
  })
})

describe('summarize / renderMarkdown', () => {
  it('cuenta estados, siguiente tarea y bloqueos', () => {
    const b = bp([
      tarea({ id: 'A', estado: 'hecho', fecha: '2026-10-24', evidencia: [{ tipo: 'commit', ref: 'abc1234' }], director: { aprobado: true, fecha: '2026-10-24' } }),
      tarea({ id: 'B', estado: 'bloqueado', siguiente: 'Director' }),
      tarea({ id: 'C', dependeDe: ['A'] }),
    ])
    const s = summarize(b)
    expect(s).toMatchObject({ total: 3, hechas: 1, bloqueadas: 1, pendientes: 1, aprobadas: 1, siguiente: { id: 'C' }, fase: { id: '1' } })
    const md = renderMarkdown(b)
    expect(md).toContain('- [x] **A · Tarea** ✅ (2026-10-24)')
    expect(md).toContain('- [!] **B · Tarea**')
    expect(md).toContain('commit `abc1234`')
  })
})
