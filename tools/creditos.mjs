// Escribe CREDITOS.md desde src/features/credits/credits.ts (la misma lista que muestra «Acerca de»).
// Uso: node tools/creditos.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/features/credits/credits.ts', import.meta.url), 'utf8')
const data = src.slice(src.indexOf('= [') + 2).replace(/\]\s*$/, ']')
const groups = Function(`return ${data}`)()
let md = '# Créditos y agradecimientos\n\nIKRAL Studio existe gracias a estos proyectos libres. ¡Gracias a sus autores! 💙\nTextos completos de las licencias: THIRD_PARTY_LICENSES.txt. En la app: Inicio → «Acerca de».\n'
for (const { group, items } of groups) {
  md += `\n## ${group}\n\n| Proyecto | Autor | Para qué | Licencia |\n| --- | --- | --- | --- |\n`
  for (const c of items) md += `| [${c.name}](${c.url}) | ${c.author} | ${c.use} | ${c.license} |\n`
}
writeFileSync(new URL('../CREDITOS.md', import.meta.url), md)
console.log('CREDITOS.md listo')
