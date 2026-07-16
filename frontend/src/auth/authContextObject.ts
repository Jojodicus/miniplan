import { createContext } from 'react'
import type { Nutzer } from '../api/auth'

export interface AuthContextValue {
  user: Nutzer | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

// Eigene Datei ohne Komponenten-Export, damit sowohl `AuthContext.tsx` (Provider-Komponente) als
// auch `useAuth.ts` (Hook) darauf zugreifen können, ohne dass eine der beiden Dateien Komponenten
// und Nicht-Komponenten mischt (siehe oxlint react/only-export-components).
export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
