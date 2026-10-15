// Las 13 pruebas de aceptación de la sección 21 del prompt maestro.
import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const FX = path.join(import.meta.dirname, 'fixtures')
const fx = (f: string) => path.join(FX, f)

async function freshProject(page: Page, title = 'Proyecto de prueba') {
  await page.goto('./')
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
  await c4.getByPlaceholder('Quién habla y qué dice. Ej.: Joven: —¡Mire!').fill('Joven: —¡Mire esto!')
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
