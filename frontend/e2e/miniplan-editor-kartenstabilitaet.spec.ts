import { expect, test, type Locator, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill('admin@example.com')
  await page.getByLabel('Passwort').fill('geheim123')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')
}

async function zuStammdaten(page: Page, pfarreiName: string) {
  await page
    .locator('div')
    .filter({ hasText: new RegExp(`^${pfarreiName}$`) })
    .locator('..')
    .getByRole('link', { name: 'Stammdaten' })
    .click()
}

async function legeGruppeAn(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByRole('button', { name: 'Gruppe', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(dialog).toBeHidden()
}

async function legeMiniAn(page: Page, name: string, gruppe: string) {
  await page.getByRole('tab', { name: 'Minis' }).click()
  await page.getByRole('button', { name: 'Mini', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel(gruppe, { exact: true }).click({ force: true })
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(dialog).toBeHidden()
}

async function legeMiniplanAn(page: Page, monat: string, jahr: string) {
  await page.getByRole('navigation').getByRole('link', { name: 'Minipläne' }).click()
  await expect(page).toHaveURL(/\/miniplaene$/)
  const form = page.getByRole('form', { name: 'Miniplan anlegen' })
  await expect(form.getByLabel('Jahr')).not.toHaveValue('')
  await form.getByLabel('Monat').selectOption(monat)
  await form.getByLabel('Jahr').fill(jahr)
  await expect(form.getByLabel('Monat')).toHaveValue(monat)
  await expect(form.getByLabel('Jahr')).toHaveValue(jahr)
  await form.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
}

async function waehleDatum(page: Page, form: Locator, tag: number) {
  await form.getByLabel('Datum').click()
  await page.getByRole('button', { name: String(tag), exact: true }).click()
}

async function waehleUhrzeit(page: Page, form: Locator, wert: string) {
  const trigger = form.getByLabel('Uhrzeit', { exact: true })
  await trigger.click()
  const [stunde, minute] = wert.split(':')
  await page.getByRole('button', { name: stunde, exact: true }).click()
  await page.getByLabel('Minute genau').fill(minute)
  await trigger.click()
}

async function legeGottesdienstAn(
  page: Page,
  daten: { tag: number; uhrzeit: string; name: string },
) {
  await page
    .getByRole('button', { name: /^(Ersten Gottesdienst anlegen|Gottesdienst hinzufügen)$/ })
    .click()
  const dialog = page.getByRole('dialog')
  await waehleDatum(page, dialog, daten.tag)
  await waehleUhrzeit(page, dialog, daten.uhrzeit)
  await dialog.getByLabel('Name').fill(daten.name)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  const karte = page.getByTestId('gottesdienst-karte').filter({ hasText: daten.name })
  await karte.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.getByRole('heading', { name: 'Gottesdienst bearbeiten' })).toBeVisible({
    timeout: 15_000,
  })
}

function autosaveGottesdienst(page: Page) {
  return page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/gottesdienste\/\d+$/.test(resp.url()),
  )
}

function planReload(page: Page) {
  return page.waitForResponse(
    (resp) => resp.request().method() === 'GET' && /\/miniplaene\/\d+$/.test(resp.url()),
  )
}

// dnd-kit reagiert auf Pointer-Events (nicht die HTML5-Drag-API), Playwrights `dragTo()` greift
// hier daher nicht - stattdessen Pointer-Bewegung in mehreren Schritten simulieren.
async function ziehe(page: Page, quelle: Locator, ziel: Locator) {
  const quellBox = await quelle.boundingBox()
  const zielBox = await ziel.boundingBox()
  if (!quellBox || !zielBox) throw new Error('Drag-Quelle oder -Ziel nicht sichtbar')
  const startX = quellBox.x + quellBox.width * 0.25
  const startY = quellBox.y + quellBox.height / 2
  const endX = zielBox.x + zielBox.width * 0.25
  const endY = zielBox.y + zielBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 15, startY + 15, { steps: 5 })
  await page.mouse.move(endX, endY, { steps: 10 })
  await page.mouse.up()
}

// Deckt Issue #3 ab: der Autosave lädt den Miniplan nach jeder Änderung neu, der Server sortiert
// Gottesdienst-Karten nach Datum - eine Datums-Änderung darf die sichtbare Kartenreihenfolge daher
// nicht schon während der Bearbeitung ändern (MiniplanEditorPage friert sie ein, solange
// irgendeine Karte ihr Bearbeiten-Modal offen hat, und sortiert erst beim Schließen nach).
test('Datums-Änderung im offenen Bearbeiten-Modal sortiert die Kartenliste nicht sofort um', async ({
  page,
}) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)
  await legeMiniplanAn(page, '3', '2036')
  await expect(page.getByRole('heading', { name: 'Miniplan März 2036' })).toBeVisible({
    timeout: 15_000,
  })

  await legeGottesdienstAn(page, { tag: 5, uhrzeit: '09:00', name: 'Reihenfolge-Erster' })
  await page.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await legeGottesdienstAn(page, { tag: 20, uhrzeit: '09:00', name: 'Reihenfolge-Zweiter' })
  await page.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  const karten = page.getByTestId('gottesdienst-karte')
  await expect(karten).toHaveCount(2)
  await expect(karten.nth(0)).toContainText('Reihenfolge-Erster')
  await expect(karten.nth(1)).toContainText('Reihenfolge-Zweiter')

  // "Reihenfolge-Erster" (Tag 5) auf ein späteres Datum (Tag 25) verschieben, als "Reihenfolge-
  // Zweiter" (Tag 20) hat - nach servergesorteter Reihenfolge müsste er danach hinter dem zweiten
  // Termin stehen.
  const ersteKarte = page
    .getByTestId('gottesdienst-karte')
    .filter({ hasText: 'Reihenfolge-Erster' })
  await ersteKarte.getByRole('button', { name: 'Bearbeiten' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const gespeichert = autosaveGottesdienst(page)
  const neuGeladen = planReload(page)
  await waehleDatum(page, dialog, 25)
  await gespeichert
  await neuGeladen

  // Das Modal ist noch offen (der Nutzer bearbeitet weiter) - die Karte dahinter darf jetzt noch
  // nicht springen, obwohl der Reload gerade die neu sortierte Liste vom Server geliefert hat.
  await expect(dialog).toBeVisible()
  await expect(karten.nth(0)).toContainText('Reihenfolge-Erster')
  await expect(karten.nth(1)).toContainText('Reihenfolge-Zweiter')

  // Modal schließen ("die Karte verlassen") - erst jetzt darf die Liste nachziehen.
  await dialog.getByRole('button', { name: 'Fertig' }).click()
  await expect(dialog).toBeHidden()
  await expect(karten.nth(0)).toContainText('Reihenfolge-Zweiter')
  await expect(karten.nth(1)).toContainText('Reihenfolge-Erster')
})

// Deckt Issue #7 ab: Tauschen zweier Zuweisungen darf nur die davon tatsächlich betroffenen
// Gottesdienst-Karten synchronisieren (siehe `bumpKartenRevision`/`useGottesdienstAutosave` in
// MiniplanEditorPage) - eine dritte, unbeteiligte Karte darf dadurch weder neu gemountet werden
// noch ihren lokalen (noch ungespeicherten) Bearbeitungs-Zustand verlieren.
//
// Ursprünglich hatte dieser Test dafür das Bearbeiten-Modal von Karte C offen gehalten, während per
// rohem Maus-Drag auf Karten A/B gezogen wurde. Das ist über die echte UI aber gar nicht erreichbar:
// `Modal` ist ein `fixed inset-0`-Overlay mit Fokus-Falle (Issue #8) und schließt sich per
// Backdrop-`onMouseDown`, sobald außerhalb geklickt wird - genau das trifft `page.mouse.down()` auf
// den A/B-Chips, die während eines offenen Modals dahinter liegen (der Klick landet auf dem
// Backdrop, nicht auf dem Chip). Das ist korrektes Verhalten des Modals, kein Bug. Als lokaler,
// nicht im Draft/Server-Stand verankerter Zustand außerhalb jedes Modals dient stattdessen der
// unbestätigte Suchtext im `MiniAdder` einer offenen Stelle von Karte C (`sucheOffen`/`suche` sind
// reiner Komponenten-State von `DienstbedarfBelegung`/`MiniAdder` - ein Remount von Karte C würde
// beides zurücksetzen).
test('Tauschen zwischen zwei Karten lässt eine dritte, unbeteiligte Karte unangetastet', async ({
  page,
}) => {
  page.setDefaultTimeout(20_000)
  await page.setViewportSize({ width: 1280, height: 3200 })
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)
  await legeGruppeAn(page, 'KS-Gruppe')
  await legeMiniAn(page, 'KS-Mini-X', 'KS-Gruppe')
  await legeMiniAn(page, 'KS-Mini-Y', 'KS-Gruppe')

  await legeMiniplanAn(page, '4', '2037')
  await expect(page.getByRole('heading', { name: 'Miniplan April 2037' })).toBeVisible({
    timeout: 15_000,
  })

  async function ergaenzeKreuzDienst(dialog: Locator) {
    await dialog.getByRole('button', { name: 'Freitext-Dienst' }).click()
    await dialog.getByLabel('Name des Dienstes').fill('Kreuz')
    await dialog.locator('input[type="number"]').last().fill('1')
    const gespeichert = autosaveGottesdienst(page)
    await dialog.getByRole('button', { name: 'Fertig' }).click()
    await gespeichert
  }

  async function fixiereMini(karte: Locator, miniName: string) {
    const belegung = karte.getByTestId('dienst-belegung').filter({ hasText: 'Kreuz' })
    await belegung.getByRole('button', { name: /^offen/ }).click()
    await belegung.getByLabel('Minis durchsuchen').fill(miniName)
    const gespeichert = autosaveGottesdienst(page)
    await belegung.getByRole('button', { name: miniName, exact: true }).click()
    await gespeichert
  }

  const karteA = page.locator('.animate-rise').filter({ hasText: 'KS-Termin-A' })
  const karteB = page.locator('.animate-rise').filter({ hasText: 'KS-Termin-B' })
  const karteC = page.locator('.animate-rise').filter({ hasText: 'KS-Termin-C' })

  await legeGottesdienstAn(page, { tag: 2, uhrzeit: '09:00', name: 'KS-Termin-A' })
  await ergaenzeKreuzDienst(page.getByRole('dialog'))
  await fixiereMini(karteA, 'KS-Mini-X')

  await legeGottesdienstAn(page, { tag: 9, uhrzeit: '09:00', name: 'KS-Termin-B' })
  await ergaenzeKreuzDienst(page.getByRole('dialog'))
  await fixiereMini(karteB, 'KS-Mini-Y')

  await legeGottesdienstAn(page, { tag: 16, uhrzeit: '09:00', name: 'KS-Termin-C' })
  await ergaenzeKreuzDienst(page.getByRole('dialog'))
  await expect(page.getByRole('dialog')).toBeHidden()

  // In der dritten, am Tausch unbeteiligten Karte die (noch offene) Kreuz-Stelle aufklappen und
  // einen unbestätigten Suchtext eintippen (keine Zeit zum Debounce/Autosave lassen, und ohnehin
  // löst die reine Sucheingabe gar keinen Autosave aus) - dieser rein lokale Komponenten-Zustand
  // darf durch die Mutation an A/B nicht verloren gehen.
  const belegungC = karteC.getByTestId('dienst-belegung').filter({ hasText: 'Kreuz' })
  await belegungC.getByRole('button', { name: /^offen/ }).click()
  const sucheC = belegungC.getByLabel('Minis durchsuchen')
  await expect(sucheC).toBeVisible()
  await sucheC.fill('KS-Termin-C-unangetastete-Suche')

  const chipX = karteA.getByTestId('chip-fest').filter({ hasText: 'KS-Mini-X' })
  const chipY = karteB.getByTestId('chip-fest').filter({ hasText: 'KS-Mini-Y' })
  await expect(chipX).toBeVisible({ timeout: 10_000 })
  await expect(chipY).toBeVisible({ timeout: 10_000 })

  await ziehe(page, chipX, chipY)
  await expect(page.getByText('Zuweisungen getauscht')).toBeVisible({ timeout: 10_000 })

  // Der Tausch hat A und B betroffen - C (unbestätigter Suchtext in der offenen Stelle) darf davon
  // nichts mitbekommen haben. Ein Remount von Karte C würde sowohl `sucheOffen` (Klapp-Zustand)
  // als auch den Sucheingabe-Wert zurücksetzen.
  await expect(sucheC).toBeVisible()
  await expect(sucheC).toHaveValue('KS-Termin-C-unangetastete-Suche')

  await expect(karteA.getByTestId('chip-fest').filter({ hasText: 'KS-Mini-Y' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(karteB.getByTestId('chip-fest').filter({ hasText: 'KS-Mini-X' })).toBeVisible({
    timeout: 10_000,
  })
})
