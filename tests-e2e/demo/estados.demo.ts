// Captura: ficha de locación con un estado por escena y «¿Para qué es la imagen?» (base o fotograma de escena).
// Uso: npx playwright test -c tests-e2e/demo estados
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const OUT = process.env.CAPTURAS ?? path.join(import.meta.dirname, '..', '..', 'docs', 'qa', 'capturas')
const FX = path.join(import.meta.dirname, '..', 'fixtures')
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

test('estados por escena en una locación', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Preproducción', exact: true }).click()
  await page.getByRole('button', { name: 'Importar guion' }).last().click()
  await page.getByRole('tab', { name: 'Cargar archivo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Elegir archivo .json' }).click()
  await (await chooser).setFiles(path.join(FX, 'guion-ia.json'))
  await page.getByRole('button', { name: 'Crear proyecto nuevo' }).click()
  await page.getByRole('button', { name: 'Nueva locación' }).click()
  const name = 'Pase de cocina dentro del food truck'
  await page.getByLabel('Nombre del nuevo locación').fill(name)
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await page.getByLabel(`Descripción de ${name}`).fill('Plancha a la izquierda, ventanilla al frente, acero inoxidable.')
  const states = page.getByRole('group', { name: `Estados por escena de ${name}` })
  const rows: [string, number, string, string][] = [
    ['Antes: papel', 1, 'comandas de papel colgadas sobre la plancha', 'tablet o celular'],
    ['Después: app', 2, 'tablet con la app y botón LISTO', 'comandas de papel'],
  ]
  for (const [i, [label, scene, shows, hides]] of rows.entries()) {
    await states.getByRole('button', { name: 'Agregar estado' }).click()
    await states.getByLabel('Nombre del estado').nth(i).fill(label)
    await states.getByLabel('Agregar escena al estado').nth(i).selectOption({ index: scene })
    await states.getByLabel(`Se ve en ${label}`, { exact: true }).fill(shows)
    await states.getByLabel(`No se ve en ${label}`).fill(hides)
  }
  await page.getByLabel(`Para qué es la imagen de ${name}`).selectOption({ index: 1 })
  const prompt = page.getByLabel(`Prompt de ${name}`)
  await prompt.scrollIntoViewIfNeeded()
  await expect(prompt).toHaveValue(/papel/)
  await shot(page, '15-ficha-estado-por-escena')
})
