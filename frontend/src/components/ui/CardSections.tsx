import { Plus } from 'lucide-react'

// Optische Trennung von "neu anlegen" (Formular am Karten-Ende, dezent hervorgehoben) und
// "bearbeiten" (Zeile expandiert inline, Akzentbalken links) - vorher waren beide kaum
// unterscheidbar.
export function NeuAnlegenAbschnitt({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-line bg-paper-dim/50 p-5">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-pine-dark">
        <Plus className="h-4 w-4" />
        Neu anlegen
      </div>
      {children}
    </div>
  )
}

export function BearbeitenAbschnitt({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-l-4 border-line border-l-pine p-4 last:border-b-0">
      {children}
    </div>
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0">
      {children}
    </div>
  )
}
