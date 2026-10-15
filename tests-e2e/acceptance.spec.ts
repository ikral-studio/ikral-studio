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
  await expect(c.locator('video')).toBeVisible()
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
  await expect(preview.getByText('Storyboard provisional')).toBeVisible()
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
