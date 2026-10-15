// Números a palabras en español (para que la voz de la IA los diga bien).

const UNITS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function below1000(n: number): string {
  if (n === 100) return 'cien'
  const h = Math.floor(n / 100)
  const r = n % 100
  const parts: string[] = []
  if (h) parts.push(HUNDREDS[h])
  if (r) {
    if (r < 30) parts.push(UNITS[r])
    else parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNITS[r % 10]}` : ''))
  }
  return parts.join(' ')
}

/** "uno" → "un" delante de mil / millones (veintiún mil, treinta y un millones). */
const apocope = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')

export function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e15) return String(n)
  if (n < 1000) return n === 0 ? 'cero' : below1000(n)
  if (n < 1e6) {
    const th = Math.floor(n / 1000)
    const r = n % 1000
    const head = th === 1 ? 'mil' : `${apocope(below1000(th))} mil`
    return r ? `${head} ${below1000(r)}` : head
  }
  const mill = Math.floor(n / 1e6)
  const r = n % 1e6
  const head = mill === 1 ? 'un millón' : `${apocope(integerToWords(mill))} millones`
  return r ? `${head} ${integerToWords(r)}` : head
}

function numberToWords(raw: string): string {
  // 1,253 o 1.253.000 con separador de miles → entero
  if (/^\d{1,3}([,.]\d{3})+$/.test(raw) && !/^\d{1,3}\.\d{3}$/.test(raw)) return integerToWords(Number(raw.replace(/[,.]/g, '')))
  const [int, dec] = raw.split(/[.,]/)
  let out = integerToWords(Number(int))
  if (dec !== undefined && dec !== '') {
    const decWords = /^0/.test(dec) ? dec.split('').map((d) => UNITS[Number(d)]).join(' ') : integerToWords(Number(dec))
    out += ` punto ${decWords}`
  }
  return out
}

/** Cambia los números de un texto por palabras. "$150" → "ciento cincuenta pesos", "50%" → "cincuenta por ciento". */
export function numbersToWordsInText(text: string): string {
  return text.replace(/(\$\s?)?(\d+(?:[.,]\d+)*)(\s?%)?/g, (_m, money: string | undefined, num: string, pct: string | undefined) => {
    let words = numberToWords(num)
    if (money) words += ' pesos'
    if (pct) words += ' por ciento'
    return words
  })
}
