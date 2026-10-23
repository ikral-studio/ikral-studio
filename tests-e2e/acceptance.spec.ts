// Las 13 pruebas de aceptación de la sección 21 del prompt maestro.
import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const FX = path.join(import.meta.dirname, 'fixtures')
const fx = (f: string) => path.join(FX, f)

async function freshProject(page: Page, title = 'Proyecto de prueba') {
  await page.goto('./')
  await page.getByRole('button', { name: 'Edición', exact: true }).click()
  await expect(page.getByText('Promocional de TuApp.digital').first()).toBeVisible()
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click()
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await expect(page.getByText('Tu proyecto está vacío')).toBeVisible()
  await page.getByTitle('Clic para renombrar').click()
  const input = page.getByLabel('Nombre del proyecto')
  await input.fill(title)
  await input.press('Enter')
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible()
}

async function addScenes(page: Page, n: number) {
  for (let i = 0; i < n; i++) await page.locator('aside').getByRole('button', { name: 'Agregar escena', exact: true }).click()
}

const card = (page: Page, n: number) => page.locator('article[data-scene-id]').nth(n - 1)

/** Escribe una línea de diálogo con el editor de caritas. */
async function addLine(c: ReturnType<typeof card>, speaker: string, text: string) {
  await c.getByRole('button', { name: 'Agregar línea' }).click()
  const n = await c.getByLabel(/^Personaje de la línea/).count()
  await c.getByLabel(`Personaje de la línea ${n}`).fill(speaker)
  await c.getByLabel(`Texto de la línea ${n}`).fill(text)
}

async function chooseFile(page: Page, trigger: () => Promise<void>, file: string) {
  const chooser = page.waitForEvent('filechooser')
  await trigger()
  await (await chooser).setFiles(fx(file))
}

async function importVideo(page: Page, n: number, file: string) {
  const c = card(page, n)
  if (await c.getByRole('button', { name: 'Expandir escena' }).isVisible()) await c.getByRole('button', { name: 'Expandir escena' }).click()
  await chooseFile(page, () => c.getByText('Arrastra aquí el video generado').click(), file)
  await expect(c.locator('video')).toBeVisible({ timeout: 15000 })
}

const time = (page: Page) => page.locator('[aria-label="Vista previa"]').locator('span.tabular-nums').first()
async function seconds(page: Page) {
  const t = (await time(page).innerText()).split('/')[0].trim()
  const [m, s] = t.split(':').map(Number)
  return m * 60 + s
}

test('1 · crear, renombrar, cerrar/reabrir proyecto', async ({ page }) => {
  await freshProject(page, 'Mi corto')
  await page.reload()
  await expect(page.getByTitle('Clic para renombrar')).toHaveText('Mi corto')
  await page.getByRole('button', { name: 'Abrir proyecto' }).click()
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click()
  await expect(page.getByTitle('Clic para renombrar')).toHaveText('Promocional de TuApp.digital')
  await page.getByRole('button', { name: 'Abrir proyecto' }).click()
  await page.getByRole('dialog').locator('li', { hasText: 'Mi corto' }).getByRole('button', { name: 'Abrir' }).click()
  await expect(page.getByTitle('Clic para renombrar')).toHaveText('Mi corto')
})

test('2 · cinco escenas en panel, tarjetas, guion y storyboard', async ({ page }) => {
  await freshProject(page)
  await addScenes(page, 5)
  await expect(page.locator('aside[aria-label="Escenas"] li')).toHaveCount(5)
  await expect(page.locator('article[data-scene-id]')).toHaveCount(5)
  await expect(page.locator('[data-script-id]')).toHaveCount(5)
  await expect(page.locator('[aria-label^="Storyboard escena"]')).toHaveCount(5)
})

test('3 y 10 · imágenes y guion se conservan al recargar', async ({ page }) => {
  await freshProject(page)
  await addScenes(page, 1)
  const c = card(page, 1)
  await chooseFile(page, () => c.getByText('Arrastra o elige imagen').first().click(), 'inicio.png')
  await expect(c.locator('img')).toHaveCount(1)
  await chooseFile(page, () => c.getByText('Arrastra o elige imagen').first().click(), 'final.png')
  await expect(c.locator('img')).toHaveCount(2)
  await c.getByPlaceholder('Qué ocurre físicamente en la escena.').fill('Acción que debe persistir')
  await page.keyboard.press('Meta+s')
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible()
  await page.reload()
  await expect(card(page, 1).locator('img')).toHaveCount(2)
  await expect(card(page, 1).getByText('1280×720 · PNG')).toHaveCount(2)
  await expect(page.locator('[data-script-id]').first()).toContainText('Acción que debe persistir')
})

test('4 y 5 · guion sincronizado y reordenar escenas', async ({ page }) => {
  await freshProject(page)
  await addScenes(page, 4)
  for (let i = 1; i <= 4; i++) {
    const t = card(page, i).getByLabel('Nombre de la escena')
    await t.fill(`Titulo ${i}`)
  }
  const c4 = card(page, 4)
  await addLine(c4, 'Joven', '—¡Mire esto!')
  await expect(page.locator('[data-script-id]').nth(3)).toContainText('Joven: —¡Mire esto!')
  // Mover la escena 4 antes de la 3 con el teclado (alternativa accesible al arrastre)
  const handle = page.getByRole('button', { name: /Mover escena 4/ })
  await handle.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await expect(card(page, 3).getByLabel('Nombre de la escena')).toHaveValue('Titulo 4')
  await expect(card(page, 4).getByLabel('Nombre de la escena')).toHaveValue('Titulo 3')
  await expect(page.locator('[data-script-id]').nth(2)).toContainText('Escena 03 · Titulo 4')
  await expect(page.locator('[aria-label^="Storyboard escena 3"]')).toHaveAttribute('aria-label', /Titulo 4/)
  await page.reload()
  await expect(card(page, 3).getByLabel('Nombre de la escena')).toHaveValue('Titulo 4')
})

test('6, 7, 8 y 9 · videos, reproducción seguida, loop y storyboard provisional', async ({ page }) => {
  await freshProject(page)
  await addScenes(page, 4)
  await importVideo(page, 1, 'clip1.mp4')
  await importVideo(page, 2, 'clip2.mp4')
  await importVideo(page, 3, 'clip3.mp4')
  await expect(page.locator('[aria-label="Video escena 1, 3 s"]')).toBeVisible()
  await expect(page.locator('[aria-label="Video escena 2, 4 s"]')).toBeVisible()
  await expect(page.locator('[aria-label="Escena 4 sin video"]')).toBeVisible()
  // La escena 4 dura 2 s para que la prueba sea corta
  const dur = card(page, 4).getByLabel('Duración planificada en segundos')
  await dur.fill('2')
  await dur.press('Enter')
  const preview = page.locator('[aria-label="Vista previa"]')
  await expect(preview.getByText('00:00 / 00:11')).toBeVisible()

  // Solo un <video> de vista previa: toda la película en el mismo reproductor
  await page.locator('[aria-label="Línea de tiempo"]').getByRole('switch').click() // loop off
  await preview.getByRole('button', { name: 'Reproducir' }).click()
  await expect(preview.getByText('Escena 02 ·').first()).toBeVisible({ timeout: 6000 })
  await expect(preview.getByText('Escena 03 ·').first()).toBeVisible({ timeout: 7000 })
  await expect(preview.getByText('Escena 04 ·').first()).toBeVisible({ timeout: 5000 })
  await expect(preview.getByText('Provisional', { exact: true })).toBeVisible()
  await expect(preview.getByRole('button', { name: 'Reproducir' })).toBeVisible({ timeout: 5000 })
  expect(await seconds(page)).toBe(11)

  // Loop: al terminar vuelve a la escena 1 y sigue
  await page.locator('[aria-label="Línea de tiempo"]').getByRole('switch').click()
  await page.locator('[aria-label="Línea de tiempo"]').getByRole('button', { name: 'Reproducir' }).click()
  await page.waitForTimeout(800)
  expect(await seconds(page)).toBeLessThan(3)
  await expect(preview.getByText('Escena 01 ·').first()).toBeVisible()
  await expect(preview.getByRole('button', { name: 'Pausar' })).toBeVisible()
})

test('11 · formato 16:9 ↔ 9:16 sin deformar', async ({ page }) => {
  await freshProject(page)
  await addScenes(page, 1)
  await importVideo(page, 1, 'clip1.mp4')
  const frame = page.locator('[aria-label="Vista previa"] video').locator('..')
  await expect(frame).toHaveCSS('aspect-ratio', '16 / 9')
  await page.getByRole('button', { name: /Vertical/ }).click()
  await expect(frame).toHaveCSS('aspect-ratio', '9 / 16')
  await expect(page.locator('[aria-label="Vista previa"] video')).toHaveCSS('object-fit', 'contain')
  const box = await frame.boundingBox()
  expect(box!.height).toBeGreaterThan(box!.width)
  await expect(card(page, 1).getByText(/otra orientación/)).toBeVisible()
})

test('12 y 13 · exportar e importar respaldo con archivos reales', async ({ page }) => {
  await freshProject(page, 'Respaldo')
  await addScenes(page, 2)
  await chooseFile(page, () => card(page, 1).getByText('Arrastra o elige imagen').first().click(), 'inicio.png')
  await importVideo(page, 2, 'clip2.mp4')
  await card(page, 2).getByPlaceholder('Qué ocurre físicamente en la escena.').fill('Texto del respaldo')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar proyecto' }).click()
  const file = await (await dl).path()
  const zip = await JSZip.loadAsync(await readFile(file))
  const manifest = JSON.parse(await zip.file('project.json')!.async('string'))
  expect(manifest.scenes).toHaveLength(2)
  const mp4 = Object.keys(zip.files).find((f) => f.startsWith('media/') && f.endsWith('.mp4'))!
  const png = Object.keys(zip.files).find((f) => f.startsWith('media/') && f.endsWith('.png'))!
  expect((await zip.file(mp4)!.async('uint8array')).byteLength).toBe((await readFile(fx('clip2.mp4'))).byteLength)
  expect((await zip.file(png)!.async('uint8array')).byteLength).toBe((await readFile(fx('inicio.png'))).byteLength)
  expect(JSON.stringify(manifest)).not.toContain('blob:')

  await page.getByRole('button', { name: 'Abrir proyecto' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Importar respaldo/ }).click()
  await (await chooser).setFiles(file)
  await expect(page.getByText('Respaldo importado')).toBeVisible()
  await expect(page.locator('article[data-scene-id]')).toHaveCount(2)
  await expect(card(page, 1).locator('img')).toHaveCount(1)
  await expect(page.locator('[aria-label="Video escena 2, 4 s"]')).toBeVisible()
  await expect(page.locator('[data-script-id]').nth(1)).toContainText('Texto del respaldo')
})

test('extra · insertar escena entre dos (tarjetas y timeline)', async ({ page }) => {
  await freshProject(page)
  await addScenes(page, 2)
  await card(page, 1).getByLabel('Nombre de la escena').fill('Primera')
  await card(page, 2).getByLabel('Nombre de la escena').fill('Segunda')
  await page.getByRole('button', { name: 'Insertar escena nueva entre la 1 y la 2' }).click()
  await expect(page.locator('article[data-scene-id]')).toHaveCount(3)
  await expect(card(page, 2).getByLabel('Nombre de la escena')).toHaveValue('Escena nueva')
  await expect(card(page, 3).getByLabel('Nombre de la escena')).toHaveValue('Segunda')
  await page.getByRole('button', { name: 'Insertar escena entre la 1 y la 2' }).click()
  await expect(page.locator('[data-script-id]')).toHaveCount(4)
  await expect(card(page, 4).getByLabel('Nombre de la escena')).toHaveValue('Segunda')
  await expect(card(page, 1).getByLabel('Nombre de la escena')).toHaveValue('Primera')
})

test('extra · dos pistas de música: importar, sonar al reproducir, quitar y respaldar', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __plays: string[] }
    w.__plays = []
    const orig = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      w.__plays.push(this.tagName)
      return orig.call(this)
    }
  })
  await freshProject(page, 'Con música')
  await addScenes(page, 2)
  await expect(page.getByLabel('Pista Música 1')).toBeVisible()
  await expect(page.getByLabel('Pista Música 2')).toBeVisible()
  await chooseFile(page, () => page.getByRole('button', { name: 'Agregar música a Música 2' }).click(), 'musica.mp3')
  const clip = page.getByLabel('Pista Música 2').getByRole('slider', { name: /musica, empieza en 00:00/ })
  await expect(clip).toBeVisible()
  // mover con el teclado 1 s a la derecha
  await clip.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByLabel('Pista Música 2').getByRole('slider', { name: /empieza en 00:01/ })).toBeVisible()
  await page.locator('[aria-label="Vista previa"]').getByRole('button', { name: 'Reproducir' }).click()
  await page.waitForTimeout(2500)
  expect(await page.evaluate(() => (window as unknown as { __plays: string[] }).__plays)).toContain('AUDIO')
  await page.locator('[aria-label="Vista previa"]').getByRole('button', { name: 'Pausar' }).click()
  // persiste
  await page.keyboard.press('Meta+s')
  await page.reload()
  await expect(page.getByLabel('Pista Música 2').getByRole('slider', { name: /empieza en 00:01/ })).toBeVisible()
  // respaldo lleva el mp3
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar proyecto' }).click()
  const zip = await JSZip.loadAsync(await readFile(await (await dl).path()))
  expect(Object.keys(zip.files).some((f) => f.endsWith('.mp3'))).toBe(true)
  // quitar
  await page.getByRole('button', { name: 'Quitar musica' }).click({ force: true })
  await expect(page.getByLabel('Pista Música 2').getByRole('slider')).toHaveCount(0)
})

test('extra · cortar video y música, y estirar orillas', async ({ page }) => {
  await freshProject(page, 'Cortes')
  await addScenes(page, 1)
  await importVideo(page, 1, 'clip2.mp4') // 4 s
  await chooseFile(page, () => page.getByRole('button', { name: 'Agregar música a Música 1' }).click(), 'musica.mp3') // 6 s
  // cabezal en 1.5 s: clic en la regla
  const tl = page.locator('[aria-label="Línea de tiempo"]')
  await page.evaluate(() => {})
  const ruler = page.getByRole('slider', { name: 'Regla de tiempo' })
  const box = (await ruler.boundingBox())!
  const block = (await page.locator('[aria-label="Video escena 1, 4 s"]').boundingBox())!
  await ruler.click({ position: { x: block.x - box.x + block.width * 0.375, y: 10 } })
  await tl.getByRole('button', { name: 'Cortar video' }).click()
  await expect(page.locator('article[data-scene-id]')).toHaveCount(2)
  await expect(page.locator('[aria-label^="Video escena 1, 1.5 s"]')).toBeVisible()
  await expect(page.locator('[aria-label^="Video escena 2, 2.5 s"]')).toBeVisible()
  await expect(card(page, 2).getByLabel('Nombre de la escena')).toHaveValue(/parte 2/)
  await tl.getByRole('button', { name: 'Cortar música' }).click()
  await expect(page.getByLabel('Pista Música 1').getByRole('slider')).toHaveCount(2)
  // estirar la orilla derecha del video 1 recupera hasta los 4 s originales
  const edge = page.getByRole('separator', { name: 'Estirar el final del video de la escena 1' })
  const eb = (await edge.boundingBox())!
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2)
  await page.mouse.down()
  await page.mouse.move(eb.x + 600, eb.y + eb.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('[aria-label^="Video escena 1, 4 s"]')).toBeVisible()
  // reproducir: pasa de la escena 1 a la 2 sin trabarse
  await page.locator('[aria-label="Vista previa"]').getByRole('button', { name: 'Reiniciar' }).click()
  await page.locator('[aria-label="Vista previa"]').getByRole('button', { name: 'Reproducir' }).click()
  await expect(page.locator('[aria-label="Vista previa"]').getByText('Escena 02 ·').first()).toBeVisible({ timeout: 8000 })
  // deshacer
  await page.keyboard.press('Meta+z')
})

test('extra · exportar edición para Premiere / Final Cut / DaVinci', async ({ page }) => {
  await freshProject(page, 'Para editor')
  await addScenes(page, 2)
  await importVideo(page, 1, 'clip1.mp4')
  await chooseFile(page, () => card(page, 2).getByText('Arrastra o elige imagen').first().click(), 'inicio.png')
  await chooseFile(page, () => page.getByRole('button', { name: 'Agregar música a Música 1' }).click(), 'musica.mp3')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar edición para editor de video' }).click()
  const zip = await JSZip.loadAsync(await readFile(await (await dl).path()))
  const names = Object.keys(zip.files)
  expect(names).toEqual(expect.arrayContaining(['Premiere-DaVinci.xml', 'FinalCut.fcpxml', 'LEEME.txt']))
  expect(names.filter((n) => n.startsWith('media/') && !n.endsWith('/'))).toHaveLength(3)
  const xml = await zip.file('Premiere-DaVinci.xml')!.async('string')
  expect(xml).toContain('<pathurl>media/001-clip1.mp4</pathurl>')
  expect(xml.match(/<clipitem /g)!.length).toBe(4) // video, imagen, audio del video, música
})

test('extra · atajos A D C V W S y cambiarlos', async ({ page }) => {
  await freshProject(page, 'Atajos')
  await addScenes(page, 1)
  await importVideo(page, 1, 'clip2.mp4') // 4 s
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  const zoom = page.getByLabel('Zoom del timeline')
  const z0 = Number(await zoom.inputValue())
  await page.keyboard.press('w')
  expect(Number(await zoom.inputValue())).toBeGreaterThan(z0)
  await page.keyboard.press('s')
  await page.keyboard.press('s')
  expect(Number(await zoom.inputValue())).toBeLessThan(z0)
  await page.keyboard.press('w')
  // D adelante, A hacia atrás
  await page.keyboard.press('d')
  await page.waitForTimeout(1800)
  const t1 = await seconds(page)
  expect(t1).toBeGreaterThanOrEqual(1)
  await page.keyboard.press('a')
  await expect(page.getByText('◀◀ Hacia atrás 1×')).toBeVisible()
  await page.waitForTimeout(1200)
  expect(await seconds(page)).toBeLessThan(t1)
  await page.keyboard.press('a')
  await expect(page.getByText('◀◀ Hacia atrás 2×')).toBeVisible()
  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await expect(page.getByText('▶▶ Adelante 4×')).toBeVisible()
  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await expect(page.getByText('▶▶ Adelante 8×')).toBeVisible()
  await page.keyboard.press('Space')
  // C = tijera: clic a la mitad del bloque corta la escena
  await page.keyboard.press('c')
  await expect(page.getByRole('button', { name: 'Herramienta tijera' })).toHaveAttribute('aria-pressed', 'true')
  const block = page.locator('[aria-label^="Storyboard escena 1"]')
  const b = (await block.boundingBox())!
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await expect(page.locator('article[data-scene-id]')).toHaveCount(2)
  await page.keyboard.press('v')
  await expect(page.getByRole('button', { name: 'Herramienta selección' })).toHaveAttribute('aria-pressed', 'true')
  // cambiar «Acercar» a la tecla Q
  await page.getByRole('button', { name: 'Configuración' }).click()
  await page.getByRole('button', { name: 'Cambiar tecla de Acercar timeline (zoom +)' }).click()
  await page.keyboard.press('q')
  await expect(page.getByRole('dialog').locator('li', { hasText: 'Acercar' }).locator('kbd')).toHaveText('Q')
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  const z1 = Number(await zoom.inputValue())
  await page.keyboard.press('w')
  expect(Number(await zoom.inputValue())).toBe(z1)
  await page.keyboard.press('q')
  expect(Number(await zoom.inputValue())).toBeGreaterThan(z1)
  await page.reload()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  const z2 = Number(await page.getByLabel('Zoom del timeline').inputValue())
  await page.keyboard.press('q')
  expect(Number(await page.getByLabel('Zoom del timeline').inputValue())).toBeGreaterThan(z2)
})

test('extra · guion con IA: copiar formato, pegar, subir archivo, inválido, agregar sin borrar', async ({ page }) => {
  const json = await readFile(fx('guion-ia.json'), 'utf8')
  await freshProject(page, 'Mi proyecto')
  await addScenes(page, 1)
  await importVideo(page, 1, 'clip1.mp4')
  // 1 · copiar formato
  await page.getByRole('button', { name: 'Copiar formato para IA' }).click()
  await expect(page.getByText(/Formato copiado/)).toBeVisible()
  // 11 · inválido no cambia nada
  await page.getByRole('button', { name: 'Importar guion' }).click()
  await page.getByLabel('JSON del guion').fill(json.replace('"version": 1', '"version": 9').replace('"plannedDuration": 7', '"plannedDuration": "siete"'))
  await page.getByRole('button', { name: 'Validar y previsualizar' }).click()
  await expect(page.getByRole('alert')).toContainText('No se importó nada')
  await expect(page.getByRole('alert')).toContainText('Escena 2 · campo «Duración»')
  await page.keyboard.press('Escape')
  await expect(page.locator('article[data-scene-id]')).toHaveCount(1)
  // 3 · pegar y agregar al proyecto actual (10 · no borra el video)
  await page.getByRole('button', { name: 'Importar guion' }).click()
  await page.getByLabel('JSON del guion').fill('```json\n' + json + '\n```')
  await page.getByRole('button', { name: 'Validar y previsualizar' }).click()
  await expect(page.getByText('El guion es válido')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('2 escenas')
  await page.getByLabel(/Agregar al proyecto actual/).check()
  await page.getByRole('button', { name: 'Agregar al proyecto actual' }).click()
  await expect(page.locator('article[data-scene-id]')).toHaveCount(3)
  await expect(page.locator('[aria-label="Video escena 1, 3 s"]')).toBeVisible()
  // 6 y 7 · guion maestro y timeline en orden
  await expect(page.locator('[data-script-id]').nth(2)).toContainText('Escena 03 · El descubrimiento')
  await expect(page.locator('[data-script-id]').nth(2)).toContainText('Vestuario: Camisa azul')
  await expect(page.locator('[aria-label^="Storyboard escena 2"]')).toHaveAttribute('aria-label', /Todo va bien/)
  // 5, 8, 9 · campos, pronunciación y números en el prompt
  const c3 = card(page, 3)
  await c3.getByRole('button', { name: 'Expandir escena' }).click()
  await expect(c3.getByPlaceholder('Encuadre, movimiento, ángulo y continuidad.')).toHaveValue('Joven a la izquierda, abuelito a la derecha.')
  await expect(c3.getByRole('textbox', { name: 'Vestuario', exact: true })).toHaveValue('Camisa azul')
  await expect(c3.getByRole('switch', { name: 'Números en letras' })).toHaveAttribute('aria-checked', 'true')
  await c3.getByText('Ver prompt unificado').click()
  await expect(c3.locator('pre')).toContainText('Con Tu Ap Dijital llegan veinticinco pedidos')
  // 12 · persiste
  await page.reload()
  await expect(page.locator('article[data-scene-id]')).toHaveCount(3)
  await expect(page.locator('[aria-label="Video escena 1, 3 s"]')).toBeVisible()
  // 4 · archivo .json → proyecto nuevo (recomendado)
  await page.getByRole('button', { name: 'Importar guion' }).click()
  await page.getByRole('tab', { name: 'Cargar archivo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Elegir archivo .json' }).click()
  await (await chooser).setFiles(fx('guion-ia.json'))
  await expect(page.getByText('El guion es válido')).toBeVisible()
  await page.getByRole('button', { name: 'Crear proyecto nuevo' }).click()
  await expect(page.getByTitle('Clic para renombrar')).toHaveText('Promo importada')
  await expect(page.locator('article[data-scene-id]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Vertical/ })).toHaveAttribute('aria-pressed', 'true')
})

test('extra · guion en columna alta', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Edición', exact: true }).click()
  await page.getByRole('button', { name: 'Guion en panel lateral', exact: true }).click()
  const dock = page.getByLabel('Guion completo en panel')
  await expect(dock).toBeVisible()
  const box = (await dock.boundingBox())!
  expect(box.height).toBeGreaterThan(850)
  await expect(dock.locator('[data-script-id]')).toHaveCount(10)
  await page.getByLabel('Abrir guion en panel lateral').count().then((n) => expect(n).toBe(0))
  await page.getByLabel('Cerrar panel del guion').click()
  await expect(dock).toHaveCount(0)
})

test('extra · pegar UNA escena de IA en una escena que faltaba', async ({ page }) => {
  const full = JSON.parse(await readFile(fx('guion-ia.json'), 'utf8'))
  full.scenes = [full.scenes[1]]
  await freshProject(page, 'Falta una')
  await addScenes(page, 3)
  await importVideo(page, 3, 'clip1.mp4')
  // la escena 3 (con video) se mueve a la posición 2
  const handle = page.getByRole('button', { name: /Mover escena 3/ })
  await handle.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await card(page, 2).getByRole('button', { name: 'Pegar escena de IA' }).click()
  await page.getByLabel('JSON de la escena').fill(JSON.stringify(full))
  await page.getByRole('button', { name: 'Validar y previsualizar' }).click()
  await expect(page.getByText('La escena es válida')).toBeVisible()
  await page.getByRole('button', { name: 'Actualizar escena 02' }).click()
  await expect(card(page, 2).getByLabel('Nombre de la escena')).toHaveValue('El descubrimiento')
  await expect(page.locator('[data-script-id]').nth(1)).toContainText('Joven: ¡Mire! Con TuApp.digital llegan 25 pedidos.')
  await expect(page.locator('[aria-label="Video escena 2, 3 s"]')).toBeVisible()
  // desde el panel izquierdo también; JSON con 2 escenas se rechaza
  await page.getByRole('button', { name: 'Pegar escena de IA en la escena 1' }).click({ force: true })
  await page.getByLabel('JSON de la escena').fill(await readFile(fx('guion-ia.json'), 'utf8'))
  await page.getByRole('button', { name: 'Validar y previsualizar' }).click()
  await expect(page.getByRole('alert')).toContainText('trae 2 escenas')
})

test('extra · biblioteca de cámara con dibujos', async ({ page }) => {
  await freshProject(page, 'Cámara')
  await addScenes(page, 1)
  await card(page, 1).getByRole('button', { name: 'Biblioteca de cámara' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('tab', { name: 'Movimiento de cámara' }).click()
  await dlg.getByRole('button', { name: /^Orbital 360°/ }).click()
  await dlg.getByRole('button', { name: 'rápido', exact: true }).click()
  await dlg.getByRole('tab', { name: 'Tamaño del plano' }).click()
  await dlg.getByRole('button', { name: /^Plano medio\b/ }).first().click()
  await expect(dlg).toContainText('Cámara: Plano medio · Orbital 360° (rápido)')
  await expect(dlg).toContainText('no zoom, the subject does not spin')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-script-id]').first()).toContainText('Cámara: Plano medio · Orbital 360° (rápido)')
  await card(page, 1).getByText('Ver prompt unificado').click()
  await expect(card(page, 1).locator('pre')).toContainText('smooth 360-degree orbit around the subject')
  await page.reload()
  await expect(page.locator('[data-script-id]').first()).toContainText('Orbital 360°')
})

test('extra · estilo del proyecto, personajes y lista de tomas', async ({ page }) => {
  await freshProject(page, 'Estilo')
  await addScenes(page, 2)
  await page.getByRole('button', { name: /Estilo y personajes/ }).click()
  await page.getByRole('button', { name: 'Anime', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar personaje' }).click()
  await page.getByLabel('Nombre del personaje').fill('Joven')
  await page.getByLabel('Descripción de Joven').fill('camisa azul')
  await card(page, 1).getByPlaceholder('Qué ocurre físicamente en la escena.').fill('El joven entra al restaurante.')
  await card(page, 1).getByText('Ver prompt unificado').click()
  await expect(card(page, 1).locator('pre')).toContainText('Visual style: Japanese anime style')
  await expect(card(page, 1).locator('pre')).toContainText('Joven: camisa azul.')
  await page.getByRole('button', { name: 'Lista de tomas' }).click()
  await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(2)
  await expect(page.getByRole('dialog')).toContainText('Plano')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByRole('button', { name: /Estilo y personajes/ })).toContainText('Anime · 1 personaje')
})

test('extra · duración sugerida según el guion', async ({ page }) => {
  await freshProject(page, 'Tiempos')
  await addScenes(page, 1)
  const c = card(page, 1)
  await addLine(c, 'Joven', '¡Mire! Con esta aplicación pueden organizar todos sus pedidos y cobrar sin filas.')
  await expect(c.getByText('Duración sugerida:')).toBeVisible()
  await c.getByRole('button', { name: /^Usar \d+ s$/ }).click()
  await expect(c.getByLabel('Duración planificada en segundos')).toHaveValue('7')
  await expect(c.getByText('Ya la estás usando')).toBeVisible()
})

test('extra · dos ventanas no se pisan y respaldos restaurables', async ({ page, context }) => {
  await freshProject(page, 'Dos ventanas')
  await addScenes(page, 1)
  const page2 = await context.newPage()
  await page2.goto('./')
  await page2.getByRole('button', { name: 'Edición', exact: true }).click()
  await expect(page.getByText('IKRAL Studio está abierto en otra ventana')).toBeVisible()
  await expect(page2.getByTitle('Clic para renombrar')).toHaveText('Dos ventanas')
  await card(page2, 1).getByLabel('Nombre de la escena').fill('Editada en la ventana 2')
  await page2.keyboard.press('Meta+s')
  await page.getByRole('button', { name: 'Usar esta ventana' }).click()
  await expect(card(page, 1).getByLabel('Nombre de la escena')).toHaveValue('Editada en la ventana 2')
  await expect(page2.getByText('IKRAL Studio está abierto en otra ventana')).toBeVisible()
  await page2.close()
  // respaldo manual y restaurar
  await page.getByRole('button', { name: 'Abrir proyecto' }).click()
  await page.getByRole('button', { name: 'Respaldar ahora' }).click()
  await expect(page.getByRole('dialog').locator('li', { hasText: 'Automático' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await card(page, 1).getByLabel('Nombre de la escena').fill('Me equivoqué')
  await page.getByRole('button', { name: 'Abrir proyecto' }).click()
  await page.getByRole('dialog').locator('li', { hasText: 'Automático' }).getByRole('button', { name: 'Restaurar' }).click()
  await page.getByRole('button', { name: 'Restaurar', exact: true }).last().click()
  await expect(card(page, 1).getByLabel('Nombre de la escena')).toHaveValue('Editada en la ventana 2')
})

test('extra · soltar el .json sobre «Importar guion»', async ({ page }) => {
  const json = await readFile(fx('guion-ia.json'), 'utf8')
  await page.goto('./')
  await page.getByRole('button', { name: 'Edición', exact: true }).click()
  const btn = page.getByRole('button', { name: 'Importar guion' })
  const dt = await page.evaluateHandle((text) => {
    const d = new DataTransfer()
    d.items.add(new File([text], 'guion.json', { type: 'application/json' }))
    return d
  }, json)
  await btn.dispatchEvent('dragenter', { dataTransfer: dt })
  await btn.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.getByText('El guion es válido')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('Promo importada')
})

test('extra · varios videos seguidos en una escena', async ({ page }) => {
  await freshProject(page, 'Varios videos')
  await addScenes(page, 1)
  await importVideo(page, 1, 'clip1.mp4') // 3 s
  await chooseFile(page, () => card(page, 1).getByRole('button', { name: 'Otro video' }).click(), 'clip3.mp4') // 2 s
  await expect(page.locator('[aria-label="Video escena 1, 5 s"]')).toBeVisible()
  await expect(card(page, 1).getByText('Video 2 · 2 s')).toBeVisible()
  const preview = page.locator('[aria-label="Vista previa"]')
  await page.locator('[aria-label="Línea de tiempo"]').getByRole('switch').click() // loop off
  await preview.getByRole('button', { name: 'Reproducir' }).click()
  await page.waitForTimeout(4000)
  expect(await seconds(page)).toBeGreaterThanOrEqual(3) // ya va en el segundo video, sin saltar de escena
  await expect(preview.getByRole('button', { name: 'Reproducir' })).toBeVisible({ timeout: 4000 })
  expect(await seconds(page)).toBe(5)
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar edición para editor de video' }).click()
  const zip = await JSZip.loadAsync(await readFile(await (await dl).path()))
  const xml = await zip.file('Premiere-DaVinci.xml')!.async('string')
  expect(xml).toContain('(1/2)')
  expect(xml).toContain('(2/2)')
})

test('extra · subir desde la tarjeta cerrada y videos lado a lado', async ({ page }) => {
  await freshProject(page, 'Cerrada')
  await addScenes(page, 1)
  const c = card(page, 1)
  await c.getByRole('button', { name: 'Contraer escena' }).click()
  await chooseFile(page, () => c.getByRole('button', { name: 'Agregar imagen inicial' }).click(), 'inicio.png')
  await expect(c.getByRole('button', { name: 'Abrir imagen inicial' }).locator('img')).toBeVisible()
  await chooseFile(page, () => c.getByRole('button', { name: 'Agregar video generado' }).click(), 'clip1.mp4')
  await expect(page.locator('[aria-label="Video escena 1, 3 s"]')).toBeVisible()
  await c.getByRole('button', { name: 'Abrir video generado' }).click()
  await chooseFile(page, () => c.getByRole('button', { name: 'Otro video' }).click(), 'clip3.mp4')
  await expect(c.getByText('2 videos seguidos en esta escena')).toBeVisible()
  await expect(c.getByText(/^Video 1 ·/)).toBeVisible()
  await expect(c.getByText(/^Video 2 ·/)).toBeVisible()
  await expect(c.locator('video')).toHaveCount(2)
})

test('extra · recortar una imagen a 16:9 en la vista ampliada', async ({ page }) => {
  await freshProject(page, 'Recorte')
  await addScenes(page, 1)
  await page.getByRole('button', { name: /Vertical/ }).click()
  const c = card(page, 1)
  await chooseFile(page, () => c.getByText('Arrastra o elige imagen').first().click(), 'inicio.png') // 1280×720
  await page.getByRole('button', { name: 'Ampliar Imagen inicial' }).click({ force: true })
  await page.getByRole('button', { name: 'Recortar a 9:16' }).click()
  await expect(page.getByLabel('Área de recorte')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('Resultado: 405×720 (9:16)')
  await page.getByRole('button', { name: 'Recortar a 9:16' }).click()
  await expect(page.getByText(/Recortada a 9:16 · 405×720/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(c.getByText('405×720 · JPEG').or(c.getByText('405×720 · PNG'))).toBeVisible()
})

test('extra · arrastrar un fotograma a «Imagen final»', async ({ page }) => {
  await freshProject(page, 'Arrastrar fotograma')
  await addScenes(page, 1)
  const c = card(page, 1)
  await chooseFile(page, () => c.getByRole('button', { name: 'Agregar', exact: true }).click(), 'inicio.png')
  const frame = c.getByRole('button', { name: 'Ampliar fotograma 1' })
  await expect(frame).toBeVisible()
  const dt = await page.evaluateHandle(() => new DataTransfer())
  await frame.dispatchEvent('dragstart', { dataTransfer: dt })
  const target = c.getByText('Arrastra o elige imagen').nth(1) // Imagen final
  const zone = target.locator('xpath=ancestor::div[contains(@class,"media-frame")]')
  await zone.dispatchEvent('dragenter', { dataTransfer: dt })
  await zone.dispatchEvent('drop', { dataTransfer: dt })
  await expect(page.getByText('Imagen final actualizada')).toBeVisible()
  await expect(c.getByText('1280×720 · PNG')).toHaveCount(1)
})

test('extra · diálogos con caritas: inicio → mitad → final', async ({ page }) => {
  await freshProject(page, 'Caritas')
  await addScenes(page, 1)
  const c = card(page, 1)
  if (await c.getByRole('button', { name: 'Expandir escena' }).isVisible()) await c.getByRole('button', { name: 'Expandir escena' }).click()
  await c.getByRole('button', { name: 'Agregar línea' }).click()
  await c.getByLabel('Personaje de la línea 1').fill('Beto')
  await c.getByLabel('Texto de la línea 1').fill('—¡Ya me acordé!')
  await c.getByRole('button', { name: 'Emoción al inicio: sin emoción' }).click()
  await page.getByRole('dialog', { name: 'Emoción al inicio' }).getByRole('button', { name: 'nervioso' }).click()
  await c.getByRole('button', { name: 'Emoción al final: sin emoción' }).click()
  await page.getByRole('dialog', { name: 'Emoción al final' }).getByRole('button', { name: 'aliviado' }).click()
  await expect(c.getByRole('button', { name: 'Emoción al final: aliviado' })).toHaveText('😮‍💨')
  await c.getByRole('button', { name: 'Como texto' }).click()
  await expect(c.getByRole('textbox', { name: 'Diálogos' })).toHaveValue('Beto (nervioso → neutral → aliviado): —¡Ya me acordé!')
})

test('extra · lupita: buscar en el guion completo', async ({ page }) => {
  await freshProject(page, 'Lupita')
  await addScenes(page, 2)
  for (const n of [1, 2]) {
    const c = card(page, n)
    if (await c.getByRole('button', { name: 'Expandir escena' }).isVisible()) await c.getByRole('button', { name: 'Expandir escena' }).click()
  }
  await addLine(card(page, 1), 'Beto', '—Dos al pastor, sin cebolla.')
  await addLine(card(page, 2), 'Doña Chuy', '—¿Sin cebolla? ¡Sí, mi hijo! Sin Cebolla.')
  const panel = page.getByRole('region', { name: 'Guion completo' })
  await panel.getByRole('button', { name: 'Buscar en el guion' }).click()
  await panel.getByLabel('Texto a buscar en el guion').fill('CEBOLLA')
  await expect(panel.getByText('1 de 3')).toBeVisible()
  await expect(panel.locator('mark')).toHaveCount(3)
  await panel.getByLabel('Texto a buscar en el guion').press('Enter')
  await expect(panel.getByText('2 de 3')).toBeVisible()
  await expect(page.locator('[data-script-id]').nth(1)).toHaveClass(/bg-sel/)
  await panel.getByLabel('Texto a buscar en el guion').fill('pizza')
  await expect(panel.getByText('Sin resultados')).toBeVisible()
  await panel.getByLabel('Texto a buscar en el guion').press('Escape')
  await expect(panel.locator('mark')).toHaveCount(0)
})

test('extra · portafolio PDF con storyboard', async ({ page }) => {
  await freshProject(page, 'Portafolio')
  await addScenes(page, 2)
  await chooseFile(page, () => card(page, 1).getByText('Arrastra o elige imagen').first().click(), 'inicio.png')
  await addLine(card(page, 1), 'Beto', '—¡Sin cebolla!')
  const dl = page.waitForEvent('download', { timeout: 60000 })
  await page.getByRole('button', { name: 'Exportar portafolio PDF' }).click()
  const d = await dl
  expect(d.suggestedFilename()).toBe('Portafolio-portafolio.pdf')
  const pdf = await readFile(await d.path())
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.byteLength).toBeGreaterThan(50_000)
})

test('extra · inicio: Preproducción y Edición', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Preproducción', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Preproducción', exact: true }).click()
  await page.getByRole('button', { name: /Caricatura 2D/ }).click()
  await expect(page.getByText('1 de 4')).toBeVisible()
  await page.getByRole('button', { name: 'Ir a Edición' }).click()
  await expect(page.getByTitle('Clic para renombrar')).toBeVisible()
  await page.getByRole('button', { name: 'Inicio', exact: true }).click()
  await expect(page.getByText('Estilo 1 de 4')).toBeVisible()
})
