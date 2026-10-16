// Buscar en el guion sin importar mayúsculas ni acentos («cebolla» encuentra «Cebolla», «menu» encuentra «menú»).

/** Quita acentos y pasa a minúsculas letra por letra, para que las posiciones sigan siendo las mismas. */
export function fold(text: string): string {
  let out = ''
  for (const ch of text) {
    const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    out += f.length === ch.length ? f : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch
  }
  return out
}

/** Posiciones [inicio, fin) de cada coincidencia. */
export function findRanges(text: string, query: string): [number, number][] {
  const q = fold(query.trim())
  if (!q) return []
  const t = fold(text)
  const out: [number, number][] = []
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) out.push([i, i + q.length])
  return out
}
