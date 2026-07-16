import { createContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastContextValue {
  showToast: (text: string, tone?: ToastTone) => void
}

// Eigene Datei ohne Komponenten-Export, damit sowohl `Toast.tsx` (Provider-Komponente) als auch
// `useToast.ts` (Hook) darauf zugreifen können, ohne dass eine der beiden Dateien Komponenten und
// Nicht-Komponenten mischt (siehe oxlint react/only-export-components).
export const ToastContext = createContext<ToastContextValue | null>(null)
