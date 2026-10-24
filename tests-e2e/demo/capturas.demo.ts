// Capturas de las novedades (Fases 2–4) para el QA visual del director.
// Uso: npx playwright test -c tests-e2e/demo
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const OUT = process.env.CAPTURAS ?? path.join(import.meta.dirname, '..', '..', 'docs', 'qa', 'capturas')
const FX = path.join(import.meta.dirname, '..', 'fixtures')
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

test('novedades de las Fases 2–4', async ({ page }) => {
  await page.goto('./')
  await shot(page, '01-inicio')
  await page.getByRole('button', { name: 'Edición', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click()
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await expect(page.getByText('Tu proyecto está vacío')).toBeVisible()
  const add = page.locator('aside').getByRole('button', { name: 'Agregar escena', exact: true })
  await add.click()
  await add.click()
  const c1 = page.locator('article[data-scene-id]').first()
  await c1.getByLabel('Acción visual').fill('Doña Chuy voltea la carne y contesta el teléfono.')
  await shot(page, '02-edicion-al-abrir')

  // Consultar GPT en guion (Edición)
  await c1.getByRole('button', { name: 'Consultar GPT', exact: true }).click()
  await c1.getByLabel('Consultar GPT sobre el guion').scrollIntoViewIfNeeded()
  await shot(page, '03-gpt-guion')
  await c1.getByRole('button', { name: 'Consultar GPT', exact: true }).first().click()

  // Preproducción → escena → cobertura con planos
  await page.getByRole('button', { name: 'Preproducción', exact: true }).click()
  await shot(page, '04-preproduccion')
  const scenes = page.getByRole('region', { name: 'Escenas del proyecto' })
  await scenes.getByRole('button', { name: /Escena 01/ }).click()
  const cov = scenes.getByRole('region', { name: 'Cobertura de escena' })
  await cov.scrollIntoViewIfNeeded()
  await shot(page, '05-escena-un-plano')
  await cov.getByRole('button', { name: 'Pasar a cobertura' }).click()
  for (let i = 0; i < 2; i++) await cov.getByRole('button', { name: 'Agregar plano' }).click()
  const list = cov.getByRole('list', { name: 'Planos de la escena' })
  const names = ['Plano general', 'Detalle de manos', 'Primer plano del rostro']
  for (let i = 0; i < 3; i++) {
    await list.getByRole('button', { name: `Abrir plano ${i + 1}` }).click()
    await list.getByLabel(`Nombre del plano ${i + 1}`).fill(names[i])
    await list.getByRole('button', { name: `Abrir plano ${i + 1}` }).click()
  }
  await cov.scrollIntoViewIfNeeded()
  await shot(page, '06-cobertura-3-planos')

  // Imagen inicial y final por plano
  await list.getByRole('button', { name: 'Abrir plano 2' }).click()
  const chooser = page.waitForEvent('filechooser')
  await list.getByRole('button', { name: 'Escoger imagen inicial del plano 2 de escena 01' }).click()
  await (await chooser).setFiles(path.join(FX, 'inicio.png'))
  await list.getByRole('img', { name: 'Imagen inicial del plano 2 de escena 01 aprobada' }).scrollIntoViewIfNeeded()
  await shot(page, '07-plano-imagen-inicial-final')

  // Consultar GPT en un plano
  await list.getByRole('button', { name: 'Consultar GPT', exact: true }).click()
  await list.getByLabel('Consultar GPT sobre el plano 2').scrollIntoViewIfNeeded()
  await shot(page, '08-gpt-plano')

  // Consultar GPT en la Biblia (estilo)
  const style = page.getByRole('region', { name: 'Preguntas de estilo' })
  await style.getByRole('button', { name: 'Consultar GPT', exact: true }).click()
  await style.getByLabel('Consultar GPT sobre Estilo y tono visual').scrollIntoViewIfNeeded()
  await shot(page, '09-gpt-biblia')

  // Edición: línea de tiempo con planos y GPT de edición
  await page.getByRole('button', { name: 'Ir a Edición' }).click()
  await expect(c1.getByText(/Cobertura: 3 planos/)).toBeVisible()
  await shot(page, '10-edicion-con-cobertura')
  const tl = page.locator('[aria-label="Línea de tiempo"]')
  await tl.getByRole('button', { name: 'Consultar GPT', exact: true }).first().click()
  await shot(page, '11-gpt-edicion')

  // Biblia de Producción PDF
  await page.getByRole('button', { name: 'Exportar portafolio PDF' }).click()
  await page.getByRole('dialog').getByRole('checkbox', { name: /Guion/ }).waitFor()
  await shot(page, '12-biblia-produccion-pdf')
  await page.keyboard.press('Escape')

  // Después del arreglo: la cobertura se abre en la misma escena de Edición
  await page.reload()
  const c2 = page.locator('article[data-scene-id]').nth(1)
  if (await c2.getByRole('button', { name: 'Expandir escena' }).isVisible()) await c2.getByRole('button', { name: 'Expandir escena' }).click()
  await c2.getByRole('button', { name: /Cobertura: un solo plano/ }).click()
  await c2.getByRole('region', { name: 'Cobertura de escena' }).getByRole('button', { name: 'Pasar a cobertura' }).click()
  await c2.getByRole('region', { name: 'Cobertura de escena' }).scrollIntoViewIfNeeded()
  await shot(page, '13-despues-cobertura-en-edicion')
})
