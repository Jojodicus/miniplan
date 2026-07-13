/** App-Icon (Kalenderblatt mit Kreuz), lädt dieselbe Datei wie der Browser-Tab
 * (`public/favicon.svg`) statt einer eigenen Kopie - ein Pfad, ein Browser-Cache-Eintrag. Das
 * Icon bringt Badge-Hintergrund und Rundung bereits mit, braucht also keinen umschließenden
 * Farb-Container mehr. */
export function AppIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return <img src="/favicon.svg" alt="" className={className} />
}
