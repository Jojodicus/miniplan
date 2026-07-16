import type { Filtertag } from '../../api/minis'
import type { Filtertag as FiltertagDef } from '../../api/filtertags'

// Reine Helfer (keine Komponenten), von mehreren Stammdaten-Sektionen genutzt. Bewusst getrennt
// von `shared.tsx`, damit dessen Datei ausschließlich Komponenten exportiert (React-Fast-Refresh-
// Regel `only-export-components`).

export function filtertagLabel(filtertags: FiltertagDef[], key: Filtertag): string {
  return filtertags.find((f) => f.key === key)?.label ?? key
}
