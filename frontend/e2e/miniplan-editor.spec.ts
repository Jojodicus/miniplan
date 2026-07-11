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

// Stammdaten werden seit dem Redesign über ein zentriertes Modal (role=dialog) angelegt, das der
// "+ …"-Button in der Kartenkopfzeile öffnet.
async function legeGruppeAn(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Gruppen' }).click()
  await page.getByRole('button', { name: 'Gruppe', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })
}

async function legeMiniAn(page: Page, name: string, gruppe: string) {
  await page.getByRole('tab', { name: 'Minis' }).click()
  await page.getByRole('button', { name: 'Mini', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  // Die Gruppen-Liste dieser Pfarrei ist über alle parallel laufenden e2e-Tests hinweg geteilt -
  // die selbst angelegte Gruppe explizit auswählen statt sich auf die Default-Auswahl zu verlassen.
  await dialog.getByLabel(gruppe, { exact: true }).click({ force: true })
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 })
}

async function legeMiniplanAn(page: Page, monat: string, jahr: string) {
  await page.getByRole('link', { name: 'Minipläne' }).click()
  await expect(page).toHaveURL(/\/miniplaene$/)
  const form = page.getByRole('form', { name: 'Miniplan anlegen' })
  await form.getByLabel('Monat').selectOption(monat)
  await form.getByLabel('Jahr').fill(jahr)
  await form.getByRole('button', { name: 'Miniplan anlegen' }).click()
  await expect(page).toHaveURL(/\/miniplaene\/\d+$/)
}

// Das Datum-Feld ist ein Kalender-Popover (Button + Portal-Overlay) statt eines nativen
// <input type="date">, daher den Trigger-Button öffnen und den Tag im Monatsraster anklicken.
async function waehleDatum(page: Page, form: Locator, tag: number) {
  await form.getByLabel('Datum').click()
  await page.getByRole('button', { name: String(tag), exact: true }).click()
}

// Die Uhrzeit ist seit dem Redesign ebenfalls ein Popover (Button + Portal) statt eines nativen
// <input type="time">. Das Popover enthält ein "Genau"-Feld (natives time-input) für die
// minutengenaue Eingabe; danach den Trigger erneut klicken, um das Popover zu schließen (kein
// Escape, das sonst auch das umgebende Modal schlösse).
async function waehleUhrzeit(page: Page, form: Locator, wert: string) {
  const trigger = form.getByLabel('Uhrzeit', { exact: true })
  await trigger.click()
  await page.getByLabel('Uhrzeit minutengenau').fill(wert)
  await trigger.click()
}

// Legt einen Gottesdienst über das "Neuer Gottesdienst"-Modal an. Danach öffnet sich automatisch
// der Bearbeiten-Editor des frisch angelegten Gottesdienstes.
async function legeGottesdienstAn(
  page: Page,
  daten: { tag: number; uhrzeit: string; name: string },
) {
  await page.getByRole('button', { name: 'Gottesdienst', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await waehleDatum(page, dialog, daten.tag)
  await waehleUhrzeit(page, dialog, daten.uhrzeit)
  await dialog.getByLabel('Name').fill(daten.name)
  await dialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Gottesdienst bearbeiten' })).toBeVisible({
    timeout: 15_000,
  })
}

function autosaveGottesdienst(page: Page) {
  return page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/gottesdienste\/\d+$/.test(resp.url()),
  )
}

// dnd-kit reagiert auf Pointer-Events (nicht die HTML5-Drag-API), Playwrights `dragTo()` greift
// hier daher nicht - stattdessen Pointer-Bewegung in mehreren Schritten simulieren.
async function ziehe(page: Page, quelle: Locator, ziel: Locator) {
  const quellBox = await quelle.boundingBox()
  const zielBox = await ziel.boundingBox()
  if (!quellBox || !zielBox) throw new Error('Drag-Quelle oder -Ziel nicht sichtbar')
  // Nicht die exakte Mitte treffen: Chips haben rechts einen Entfernen-/Pin-Button - ein Punkt im
  // linken Text-Drittel landet sicher auf dem (ziehbaren) Chip selbst.
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

test('Nutzer kann Miniplan mit Gottesdienst und Dienstbedarf befüllen', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)
  await legeGruppeAn(page, 'MP-Obermini')
  await legeMiniAn(page, 'MP-Mini', 'MP-Obermini')

  await page.getByRole('tab', { name: 'Dienst-Typen' }).click()
  await page.getByRole('button', { name: 'Dienst-Typ', exact: true }).click()
  const dienstTypDialog = page.getByRole('dialog')
  // exact: true, sonst matcht getByLabel('Name') auch die Checkbox "Name auf dem Plan zeigen".
  await dienstTypDialog.getByLabel('Name', { exact: true }).fill('MP-Weihrauch')
  await dienstTypDialog.getByLabel('Übliche Besetzung').fill('2')
  await dienstTypDialog.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await dienstTypDialog.locator('select').selectOption({ label: 'MP-Obermini' })
  await dienstTypDialog.locator('input[type="number"]').nth(1).fill('1')
  await dienstTypDialog.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('mind. 1× MP-Obermini')).toBeVisible({ timeout: 15_000 })

  await legeMiniplanAn(page, '7', '2031')
  await expect(page.getByRole('heading', { name: 'Miniplan Juli 2031' })).toBeVisible({ timeout: 15_000 })

  await legeGottesdienstAn(page, { tag: 6, uhrzeit: '10:00', name: 'Sonntagsmesse' })

  // Im automatisch geöffneten Bearbeiten-Editor die Dienste hinzufügen.
  const editDialog = page.getByRole('dialog')
  await editDialog.getByRole('button', { name: 'MP-Weihrauch', exact: true }).click()
  await editDialog.locator('input[type="number"]').first().fill('3')
  await editDialog.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await editDialog.getByLabel('Name des Dienstes').fill('Alle Ministranten')
  const dienstGespeichert = autosaveGottesdienst(page)
  await editDialog.getByRole('button', { name: 'Fertig' }).click()
  await dienstGespeichert

  // Mini-Belegung wird jetzt direkt in der (stets sichtbaren) Karte bearbeitet - kein Aufklappen
  // mehrerer Ebenen mehr. "Alle Ministranten" hat eine offene Stelle; über den "+ Mini"-Adder
  // (durchsuchbar) MP-Mini zuweisen.
  const alleBelegung = page.getByTestId('dienst-belegung').filter({ hasText: 'Alle Ministranten' })
  await alleBelegung.getByRole('button', { name: 'Mini', exact: true }).click()
  await alleBelegung.getByLabel('Minis durchsuchen').fill('MP-Mini')
  const zuweisungGespeichert = autosaveGottesdienst(page)
  await alleBelegung.getByRole('button', { name: 'MP-Mini', exact: true }).click()
  await zuweisungGespeichert
  await expect(page.getByTestId('chip-fest').filter({ hasText: 'MP-Mini' })).toBeVisible({
    timeout: 15_000,
  })

  // Die PDF-Vorschau rendert über react-pdf/<canvas>.
  const vorschauCanvas = page.locator('canvas').first()
  await expect(vorschauCanvas).toBeVisible({ timeout: 10_000 })

  await page.reload()
  // Nach dem Neuladen ist die Karte weiterhin sichtbar (kein Aufklappen nötig) - Dienste und
  // zugewiesener Mini stehen direkt in der Karte.
  await expect(page.getByText('MP-Weihrauch', { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Alle Ministranten', { exact: true })).toBeVisible()
  await expect(page.getByTestId('chip-fest').filter({ hasText: 'MP-Mini' })).toBeVisible()

  // Strukturelle Angaben (z.B. die geänderte Anzahl 3) liegen im Bearbeiten-Modal.
  await page.getByRole('button', { name: 'Bearbeiten' }).click()
  await expect(page.getByRole('dialog').locator('input[type="number"]').first()).toHaveValue('3')
  await page.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click()

  const freitextGespeichert = page.waitForResponse(
    (resp) => resp.request().method() === 'PUT' && /\/miniplaene\/\d+$/.test(resp.url()),
  )
  const vorschauAktualisiert = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && /\/vorschau$/.test(resp.url()),
  )
  await page.getByLabel('Veranstaltungen').fill('Pfarrfest am 20.07.')
  await page.getByLabel('Ankündigungen').fill('Bitte pünktlich erscheinen')
  await freitextGespeichert
  await vorschauAktualisiert
  await expect(vorschauCanvas).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Veranstaltungen')).toHaveValue('Pfarrfest am 20.07.')
  await expect(page.getByLabel('Ankündigungen')).toHaveValue('Bitte pünktlich erscheinen')
})

test('Nutzer kann Miniplan abschließen und das finale PDF herunterladen', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await legeMiniplanAn(page, '8', '2032')
  await expect(page.getByRole('heading', { name: 'Miniplan August 2032' })).toBeVisible({ timeout: 15_000 })

  await expect(page.getByText('In Bearbeitung')).toBeVisible()
  await expect(page.getByRole('button', { name: 'PDF herunterladen' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Plan abschließen' }).click()
  await expect(page.getByText('Abgeschlossen', { exact: true })).toBeVisible({ timeout: 10_000 })

  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF herunterladen' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('miniplan-2032-08.pdf')

  await page.getByRole('button', { name: 'Wieder öffnen' }).click()
  await expect(page.getByText('In Bearbeitung')).toBeVisible({ timeout: 10_000 })
})

test('Füllen-Button teilt Minis automatisch einem Dienstbedarf zu', async ({ page }) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await expect(page).toHaveURL(/\/stammdaten$/)
  await legeGruppeAn(page, 'FT-Gruppe')
  await legeMiniAn(page, 'FT-Mini-A', 'FT-Gruppe')
  await legeMiniAn(page, 'FT-Mini-B', 'FT-Gruppe')

  await legeMiniplanAn(page, '9', '2033')
  await expect(page.getByRole('heading', { name: 'Miniplan September 2033' })).toBeVisible({ timeout: 15_000 })

  await legeGottesdienstAn(page, { tag: 4, uhrzeit: '10:00', name: 'Sonntagsmesse' })

  const editDialog = page.getByRole('dialog')
  await editDialog.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await editDialog.getByLabel('Name des Dienstes').fill('Sammeldienst')
  await editDialog.locator('input[type="number"]').first().fill('2')
  // "mind. 2 aus FT-Gruppe" macht die Zuteilung deterministisch: FT-Gruppe enthält nur die beiden
  // hier angelegten Minis.
  await editDialog.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await editDialog.locator('select').selectOption({ label: 'FT-Gruppe' })
  await editDialog.locator('input[type="number"]').nth(1).fill('2')
  const gespeichert = autosaveGottesdienst(page)
  await editDialog.getByRole('button', { name: 'Fertig' }).click()
  await gespeichert

  const fuellenAbgeschlossen = page.waitForResponse(
    (resp) => resp.request().method() === 'POST' && /\/fuellen$/.test(resp.url()),
  )
  await page.getByRole('button', { name: 'Füllen' }).click()
  await fuellenAbgeschlossen
  await expect(page.getByText('Miniplan automatisch befüllt')).toBeVisible()

  // Automatisch zugewiesene Minis stehen direkt (als gold gestrichelte Chips) in der Karte.
  await expect(page.getByTestId('chip-auto').filter({ hasText: 'FT-Mini-A' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId('chip-auto').filter({ hasText: 'FT-Mini-B' })).toBeVisible()
})

test('Automatisch zugewiesener Mini lässt sich fest übernehmen und übersteht erneutes Füllen', async ({
  page,
}) => {
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await legeGruppeAn(page, 'PIN-Gruppe')
  await legeMiniAn(page, 'PIN-Mini-A', 'PIN-Gruppe')
  await legeMiniAn(page, 'PIN-Mini-B', 'PIN-Gruppe')

  await legeMiniplanAn(page, '10', '2034')
  await expect(page.getByRole('heading', { name: 'Miniplan Oktober 2034' })).toBeVisible({ timeout: 15_000 })

  await legeGottesdienstAn(page, { tag: 1, uhrzeit: '10:00', name: 'Sonntagsmesse' })

  const editDialog = page.getByRole('dialog')
  await editDialog.getByRole('button', { name: 'Freitext-Dienst' }).click()
  await editDialog.getByLabel('Name des Dienstes').fill('Sammeldienst')
  await editDialog.locator('input[type="number"]').first().fill('2')
  await editDialog.getByRole('button', { name: 'Zeile hinzufügen' }).click()
  await editDialog.locator('select').selectOption({ label: 'PIN-Gruppe' })
  await editDialog.locator('input[type="number"]').nth(1).fill('2')
  const gespeichert = autosaveGottesdienst(page)
  await editDialog.getByRole('button', { name: 'Fertig' }).click()
  await gespeichert

  await page.getByRole('button', { name: 'Füllen' }).click()
  await expect(page.getByText('Miniplan automatisch befüllt')).toBeVisible({ timeout: 10_000 })

  // Über den Pin-Button am automatischen Chip fest übernehmen (ersetzt das frühere Ziehen in einen
  // "Fest zugewiesen"-Bereich).
  await expect(page.getByTestId('chip-auto').filter({ hasText: 'PIN-Mini-A' })).toBeVisible({
    timeout: 10_000,
  })
  // exact: true - der Chip-Span selbst ist (via dnd-kit) ebenfalls role=button und enthält den
  // Pin-Label im Accessible Name; nur der innere Pin-Button trägt exakt diesen Namen.
  await page.getByRole('button', { name: 'PIN-Mini-A fest zuweisen', exact: true }).click()
  await expect(page.getByText('Zuweisung fest übernommen')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('chip-fest').filter({ hasText: 'PIN-Mini-A' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Füllen' }).click()
  await expect(page.getByText('Miniplan automatisch befüllt')).toBeVisible({ timeout: 10_000 })
  // Fest übernommen bleibt fest, auch nach erneutem Füllen.
  await expect(page.getByTestId('chip-fest').filter({ hasText: 'PIN-Mini-A' })).toBeVisible({
    timeout: 10_000,
  })
})

test('Zwei fest zugewiesene Minis lassen sich über zwei Gottesdienst-Karten hinweg per Drag tauschen', async ({
  page,
}) => {
  // Großzügige Viewport-Höhe: beide Gottesdienst-Karten sollen gleichzeitig ohne Scrollen
  // sichtbar sein (boundingBox() liefert sonst durch Scroll veraltete Koordinaten).
  await page.setViewportSize({ width: 1280, height: 3200 })
  await login(page)

  await zuStammdaten(page, 'St. Beispiel')
  await legeGruppeAn(page, 'SWAP-Gruppe')
  await legeMiniAn(page, 'SWAP-Mini-X', 'SWAP-Gruppe')
  await legeMiniAn(page, 'SWAP-Mini-Y', 'SWAP-Gruppe')

  await legeMiniplanAn(page, '11', '2034')
  await expect(page.getByRole('heading', { name: 'Miniplan November 2034' })).toBeVisible({ timeout: 15_000 })

  async function ergaenzeKreuzDienst(dialog: Locator) {
    await dialog.getByRole('button', { name: 'Freitext-Dienst' }).click()
    await dialog.getByLabel('Name des Dienstes').fill('Kreuz')
    const gespeichert = autosaveGottesdienst(page)
    await dialog.getByRole('button', { name: 'Fertig' }).click()
    await gespeichert
  }

  async function fixiereMini(karte: Locator, miniName: string) {
    const belegung = karte.getByTestId('dienst-belegung').filter({ hasText: 'Kreuz' })
    await belegung.getByRole('button', { name: 'Mini', exact: true }).click()
    await belegung.getByLabel('Minis durchsuchen').fill(miniName)
    const gespeichert = autosaveGottesdienst(page)
    await belegung.getByRole('button', { name: miniName, exact: true }).click()
    await gespeichert
  }

  const ersteKarte = page.locator('.animate-rise').filter({ hasText: 'Erster Termin' })
  const zweiteKarte = page.locator('.animate-rise').filter({ hasText: 'Zweiter Termin' })

  await legeGottesdienstAn(page, { tag: 5, uhrzeit: '10:00', name: 'Erster Termin' })
  await ergaenzeKreuzDienst(page.getByRole('dialog'))
  await fixiereMini(ersteKarte, 'SWAP-Mini-X')

  await legeGottesdienstAn(page, { tag: 12, uhrzeit: '11:00', name: 'Zweiter Termin' })
  await ergaenzeKreuzDienst(page.getByRole('dialog'))
  await fixiereMini(zweiteKarte, 'SWAP-Mini-Y')

  const chipX = ersteKarte.getByTestId('chip-fest').filter({ hasText: 'SWAP-Mini-X' })
  const chipY = zweiteKarte.getByTestId('chip-fest').filter({ hasText: 'SWAP-Mini-Y' })
  await expect(chipX).toBeVisible({ timeout: 10_000 })
  await expect(chipY).toBeVisible({ timeout: 10_000 })

  await ziehe(page, chipX, chipY)
  await expect(page.getByText('Zuweisungen getauscht')).toBeVisible({ timeout: 10_000 })

  // Nach dem Tausch (Remount über zuteilungsRevision) stehen die getauschten Minis direkt in den
  // jeweils anderen Karten - kein Aufklappen nötig.
  await expect(
    ersteKarte.getByTestId('chip-fest').filter({ hasText: 'SWAP-Mini-Y' }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    zweiteKarte.getByTestId('chip-fest').filter({ hasText: 'SWAP-Mini-X' }),
  ).toBeVisible({ timeout: 10_000 })
})
