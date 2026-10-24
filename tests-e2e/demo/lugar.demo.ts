// Captura: el guion dice restaurante y la Biblia food truck → UNA pregunta, vista previa de impacto, aplicar y deshacer.
// Uso: npx playwright test -c tests-e2e/demo lugar
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const OUT = process.env.CAPTURAS ?? path.join(import.meta.dirname, '..', '..', 'docs', 'qa', 'capturas')
const FX = path.join(import.meta.dirname, '..', 'fixtures')
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

test('guion vs Biblia: restaurante → food truck', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Preproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Importar guion' }).last().click()
  await page.getByRole('tab', { name: 'Cargar archivo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Elegir archivo .json' }).click()
  await (await chooser).setFiles(path.join(FX, 'guion-ia.json'))
  await page.getByRole('button', { name: 'Crear proyecto nuevo' }).click()
  await page.getByRole('button', { name: 'Nueva locación' }).click()
  await page.getByLabel('Nombre del nuevo locación').fill('Pase de cocina dentro del food truck')
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const card = page.getByRole('region', { name: 'El guion y la Biblia no dicen el mismo lugar' })
  await expect(card).toContainText('La historia dice RESTAURANTE, pero ahora la Biblia dice FOOD TRUCK. ¿Qué quieres conservar?')
  await expect(card.getByRole('button', { name: 'Escuchar pregunta' })).toBeVisible()
  await card.getByRole('button', { name: 'Adaptar historia a food truck' }).click()
  const preview = card.getByLabel('Vista previa de impacto')
  await expect(preview).toContainText('El food truck funciona tranquilo.')
  await expect(preview).toContainText('Imágenes y Canon: sin tocar')
  await card.scrollIntoViewIfNeeded()
  await shot(page, '16-lugar-guion-vs-biblia')

  await preview.getByRole('button', { name: 'Aplicar estos cambios' }).click()
  const done = page.getByRole('region', { name: 'Decisión del lugar' })
  await expect(done).toContainText('Adaptaste la historia')
  await done.getByRole('button', { name: 'Deshacer' }).click()
  await expect(card).toBeVisible()
})
