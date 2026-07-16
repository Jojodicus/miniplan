import { expect, test, type Page } from '@playwright/test'

const BASE_URL = 'http://localhost:8100'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL(`${BASE_URL}/`)
}

test('Verantwortlicher lädt per Link einen Betrachter ein, der sich damit selbst registriert', async ({
  page,
  browser,
}) => {
  const pfarreiName = 'Einladungs-Test-Pfarrei'
  const verantwortlichEmail = 'einladung-verantwortlich@example.com'

  // Admin legt Pfarrei + Verantwortlichen an (analog admin.spec.ts), damit dieser Test unabhängig
  // von der geteilten "St. Beispiel"-Pfarrei läuft und nicht mit anderen parallelen Workern
  // kollidiert.
  await login(page, 'admin@example.com', 'geheim123')
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)

  await page.getByRole('button', { name: 'Neue Pfarrei' }).click()
  const pfarreiDialog = page.getByRole('dialog').filter({ hasText: 'Neue Pfarrei' })
  await pfarreiDialog.getByLabel('Name').fill(pfarreiName)
  await pfarreiDialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText(pfarreiName, { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(pfarreiDialog).toBeHidden()

  await page.getByRole('button', { name: 'Neuer Nutzer' }).click()
  const nutzerDialog = page.getByRole('dialog').filter({ hasText: 'Neuer Nutzer' })
  await nutzerDialog.getByLabel('E-Mail').fill(verantwortlichEmail)
  await nutzerDialog.getByLabel('Passwort').fill('geheim1234')
  await nutzerDialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText(verantwortlichEmail)).toBeVisible({ timeout: 10_000 })
  await expect(nutzerDialog).toBeHidden()

  const nutzerZeile = page.locator('li').filter({ hasText: verantwortlichEmail })
  await nutzerZeile.getByRole('button', { name: 'Bearbeiten' }).click()
  const bearbeitenDialog = page.getByRole('dialog').filter({ hasText: 'Nutzer bearbeiten' })
  await bearbeitenDialog.getByLabel('Pfarrei').selectOption({ label: pfarreiName })
  await bearbeitenDialog
    .getByLabel('Rolle', { exact: true })
    .selectOption('pfarrei_verantwortlicher')
  await bearbeitenDialog.getByRole('button', { name: 'Rolle hinzufügen' }).click()
  await bearbeitenDialog.getByRole('button', { name: 'Schließen' }).last().click()
  await expect(bearbeitenDialog).toBeHidden()

  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page).toHaveURL(/\/login$/)

  // Verantwortlicher loggt sich ein und erstellt eine Einladung.
  await login(page, verantwortlichEmail, 'geheim1234')
  await page
    .locator('div')
    .filter({ hasText: new RegExp(`^${pfarreiName}$`) })
    .locator('..')
    .getByRole('link', { name: 'Stammdaten' })
    .click()
  await expect(page).toHaveURL(/\/stammdaten$/)

  await page.getByRole('tab', { name: 'Einladungen' }).click()
  await page.getByRole('button', { name: 'Einladung erstellen' }).click()
  // Das schreibgeschützte Link-Feld ist das einzige Textfeld in der Sektion nach dem Erstellen.
  const linkInput = page.locator('input[readonly]')
  await expect(linkInput).toBeVisible({ timeout: 10_000 })
  const einladungsLink = await linkInput.inputValue()
  expect(einladungsLink).toContain('/einladung/')

  // Frischer, nicht authentifizierter Browser-Kontext (kein geteiltes Cookie mit dem
  // Verantwortlichen) simuliert die eingeladene Person, die den Link von außen öffnet.
  const gastContext = await browser.newContext()
  const gastPage = await gastContext.newPage()
  try {
    await gastPage.goto(einladungsLink)
    await expect(gastPage.getByText(pfarreiName)).toBeVisible({ timeout: 10_000 })
    await expect(gastPage.getByText('Betrachter', { exact: false })).toBeVisible()

    await gastPage.getByLabel('E-Mail').fill('neuer-betrachter@example.com')
    await gastPage.getByLabel('Passwort', { exact: true }).fill('geheim1234')
    await gastPage.getByLabel('Passwort wiederholen').fill('geheim1234')
    await gastPage.getByRole('button', { name: 'Zugang aktivieren' }).click()

    // Landet eingeloggt im Dashboard.
    await expect(gastPage).toHaveURL(`${BASE_URL}/`)
    await expect(gastPage.getByText(pfarreiName, { exact: true })).toBeVisible({
      timeout: 10_000,
    })

    // Betrachter-Zugriff: Lesen (Stammdaten-Seite öffnen) geht, Schreiben (Gruppe anlegen) wird
    // von der API abgelehnt - das Frontend blendet die Stammdaten-Navigation nicht rollenbasiert
    // aus, daher hier direkt gegen die API prüfen (siehe CLAUDE.md: betrachter ist nur für den
    // PDF-Download zusätzlich freigegeben, nicht für Stammdaten-Mutationen).
    const pfarreiRes = await gastPage.request.get(`${BASE_URL}/api/pfarreien/mine`)
    expect(pfarreiRes.ok()).toBeTruthy()
    const pfarreien = (await pfarreiRes.json()) as { id: number; name: string }[]
    const gefunden = pfarreien.find((p) => p.name === pfarreiName)
    expect(gefunden).toBeTruthy()

    const gesperrteMutation = await gastPage.request.post(
      `${BASE_URL}/api/pfarreien/${gefunden!.id}/gruppen`,
      { data: { name: 'Sollte-nicht-klappen' } },
    )
    expect(gesperrteMutation.status()).toBe(403)
  } finally {
    await gastContext.close()
  }

  // Die eingelöste Einladung erscheint nicht mehr in der offenen Liste des Verantwortlichen.
  await page.reload()
  await page.getByRole('tab', { name: 'Einladungen' }).click()
  await expect(page.getByText('Läuft ab am')).toHaveCount(0)
})
