import { describe, expect, it } from 'vitest'
import { scanDiff } from './backup-check.mjs'

// Valores falsos armados por partes para que esta misma prueba no parezca un secreto.
const fakeToken = ['gh', 'p_', 'x'.repeat(36)].join('')
const fakeMail = ['alguien', '@', 'correo', '.mx'].join('')

describe('revisar-respaldo: scanDiff', () => {
  it('encuentra secretos y correos solo en líneas agregadas, sin guardar el valor', () => {
    const diff = ['+++ b/src/a.ts', `+const t = '${fakeToken}'`, `-const viejo = '${fakeMail}'`, '+++ b/docs/b.md', `+Escribe a ${fakeMail}`, '+Co-Authored-By: Claude <noreply@anthropic.com>'].join('\n')
    const hits = scanDiff(diff)
    expect(hits).toEqual([
      { file: 'src/a.ts', kind: 'token de GitHub' },
      { file: 'docs/b.md', kind: 'correo' },
    ])
    expect(JSON.stringify(hits)).not.toContain(fakeToken)
  })

  it('un diff limpio no da avisos', () => {
    expect(scanDiff('+++ b/x.ts\n+const a = 1')).toEqual([])
  })
})
