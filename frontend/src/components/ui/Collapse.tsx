import type { ReactNode } from 'react'

/**
 * Sanft ein-/ausklappender Container über den CSS-Grid-`0fr`/`1fr`-Trick - anders als ein simples
 * `{open && <div>...}` bleibt der Inhalt beim Schließen kurz sichtbar und schrumpft mit, statt
 * abrupt zu verschwinden. Braucht keine gemessene Höhe und respektiert automatisch
 * `prefers-reduced-motion` (siehe globale Regel in `index.css`).
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}
