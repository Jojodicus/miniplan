import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(password)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL('http://localhost:8100/')
}

// Deckt Issue #8 ab: `Modal` (components/ui/Modal.tsx) muss beim Öffnen den Fokus in den Dialog
// holen, Tab/Shift+Tab darin gefangen halten (kein Herausrutschen zur Seite dahinter) und ihn
// beim Schließen auf das auslösende Element zurückstellen. Genutzt wird das "Nutzer
// bearbeiten"-Modal in der Admin-Seite - im Gegensatz zu den meisten "Neu anlegen"-Formularen
// (die ein kompakteres `Popover` sind) ist das ein echtes `Modal`.
test('Modal fängt den Tab-Fokus und stellt ihn beim Schließen auf den Auslöser zurück', async ({
  page,
}) => {
  await login(page, 'admin@example.com', 'geheim123')

  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)

  // Eigenen Nutzer anlegen statt einen aus einem anderen Test wiederzuverwenden - die Nutzerliste
  // ist über den ganzen e2e-Lauf hinweg geteilt (siehe CLAUDE.md).
  await page.getByRole('button', { name: 'Neuer Nutzer' }).click()
  const nutzerPopover = page.getByRole('dialog').filter({ hasText: 'Neuer Nutzer' })
  await nutzerPopover.getByLabel('E-Mail').fill('fokustest@example.com')
  await nutzerPopover.getByLabel('Passwort').fill('geheim1234')
  await nutzerPopover.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByText('fokustest@example.com')).toBeVisible({ timeout: 10_000 })
  // Vor dem Öffnen des Bearbeiten-Modals sicherstellen, dass das Popover wirklich weg ist (siehe
  // CLAUDE.md zu `usePresence`-Exit-Animationen) - sonst könnten kurzzeitig zwei
  // `role="dialog"`-Elemente gleichzeitig existieren.
  await expect(nutzerPopover).toBeHidden()

  const nutzerZeile = page.locator('li').filter({ hasText: 'fokustest@example.com' })
  const bearbeitenButton = nutzerZeile.getByRole('button', { name: 'Bearbeiten' })
  await bearbeitenButton.click()

  const dialog = page.getByRole('dialog').filter({ hasText: 'Nutzer bearbeiten' })
  await expect(dialog).toBeVisible()

  // Fokus wurde beim Öffnen in den Dialog geholt: erstes fokussierbares Element ist der
  // ×-"Schließen"-Button im Header (kommt im DOM vor dem restlichen Formularinhalt).
  const schliessenButton = dialog.getByRole('button', { name: 'Schließen' }).first()
  await expect(schliessenButton).toBeFocused()

  // Shift+Tab vom ersten fokussierbaren Element muss innerhalb des Dialogs zum letzten springen
  // (Trap), statt zur Seite dahinter (z. B. der Navigation) herauszulaufen.
  await page.keyboard.press('Shift+Tab')
  await expect(schliessenButton).not.toBeFocused()
  await expect(dialog.locator(':focus')).toHaveCount(1)

  // Von dort wieder Tab muss den vollen Zyklus schließen und zurück zum ×-Button führen.
  await page.keyboard.press('Tab')
  await expect(schliessenButton).toBeFocused()

  // ESC schließt den Dialog und stellt den Fokus auf den ursprünglichen Auslöser (den
  // "Bearbeiten"-Button der Zeile) zurück - auch während/nach der kurzen Exit-Animation.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(bearbeitenButton).toBeFocused()
})
