/** Color de acento por posición (azul, morado, naranja, verde). */
export const ACCENTS = ['#2563eb', '#7c3aed', '#ea7a12', '#16a34a']
export const accentFor = (i: number) => ACCENTS[i % ACCENTS.length]
