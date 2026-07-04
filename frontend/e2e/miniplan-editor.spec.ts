import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')
}

test('Nutzer kann Miniplan mit Gottesdienst und Dienstbedarf befüllen', async ({ page }) => {
  await login(page)

  await page.getByRole('link', { name: 'St. Beispiel' }).click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('button', { name: 'Gruppen' }).click()
  await page.getByLabel('Neue Gruppe').fill('MP-Obermini')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('MP-Obermini', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Minis' }).click()
  const miniForm = page.locator('form').filter({ hasText: 'Mini anlegen' })
  await miniForm.getByLabel('Name').fill('MP-Mini')
  await miniForm.getByRole('button', { name: 'Mini anlegen' }).click()
  await expect(page.getByText('MP-Mini')).toBeVisible()

  await page.getByRole('button', { name: 'Dienst-Typen' }).click()
  const dienstTypForm = page.locator('form').filter({ hasText: 'Dienst-Typ anlegen' })
  await dienstTypForm.getByLabel('Name').fill('MP-Weihrauch')
  await dienstTypForm.getByLabel('Standard-Anzahl').fill('2')
  await dienstTypForm.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypForm.locator('select').selectOption({ label: 'MP-Obermini' })
  await dienstTypForm.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypForm.getByRole('button', { name: 'Dienst-Typ anlegen' }).click()
  await expect(page.getByText('mind. 1× MP-Obermini')).toBeVisible()

  await page.getByRole('link', { name: 'Zu den Miniplänen' }).click()
  await expect(page).toHaveURL(/\/miniplaene$/)

  const miniplanForm = page.getByRole('form', { name: 'Miniplan anlegen' })
  await miniplanForm.getByLabel('Monat').selectOption('7')
  await miniplanForm.getByLabel('Jahr').fill('2031')
  await miniplanForm.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Miniplan 7/2031' })).toBeVisible()

  const gottesdienstForm = page.getByRole('form', { name: 'Gottesdienst anlegen' })
  await gottesdienstForm.getByLabel('Datum').fill('2031-07-06')
  await gottesdienstForm.getByLabel('Uhrzeit').fill('10:00')
  await gottesdienstForm.getByLabel('Name').fill('Sonntagsmesse')
  await gottesdienstForm.getByRole('button', { name: 'Gottesdienst anlegen' }).click()
  await expect(page.getByLabel('Name', { exact: true }).nth(0)).toHaveValue('Sonntagsmesse')

  await page.getByLabel('Dienst-Typ hinzufügen').selectOption({ label: 'MP-Weihrauch' })
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await expect(page.getByText('MP-Weihrauch', { exact: true }).first()).toBeVisible()

  const anzahlFelder = page.locator('input[type="number"]')
  await anzahlFelder.first().fill('3')

  await page.getByRole('button', { name: 'Freitext-Dienst hinzufügen' }).click()
  await page.getByLabel('Name des Dienstes').fill('Alle Ministranten')

  await page.getByLabel('MP-Mini').first().click({ force: true })

  await page.getByRole('button', { name: 'Speichern' }).first().click()
  await expect(page.getByLabel('Name des Dienstes')).toHaveValue('Alle Ministranten')

  await page.reload()
  await expect(page.getByText('MP-Weihrauch', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('Name des Dienstes')).toHaveValue('Alle Ministranten')
  const weihrauchAnzahl = page.locator('input[type="number"]').first()
  await expect(weihrauchAnzahl).toHaveValue('3')
  await expect(page.getByLabel('MP-Mini').first()).toBeChecked()

  await page.getByLabel('Veranstaltungen').fill('Pfarrfest am 20.07.')
  await page.getByLabel('Ankündigungen').fill('Bitte pünktlich erscheinen')
  await page.getByRole('button', { name: 'Speichern' }).last().click()

  await page.reload()
  await expect(page.getByLabel('Veranstaltungen')).toHaveValue('Pfarrfest am 20.07.')
  await expect(page.getByLabel('Ankündigungen')).toHaveValue('Bitte pünktlich erscheinen')
})
