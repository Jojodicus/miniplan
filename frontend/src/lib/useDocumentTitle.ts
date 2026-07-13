import { useEffect } from 'react'

/** Setzt den Browser-/Tab-Titel für die aktuelle Seite; stellt beim Verlassen den vorherigen
 * Titel wieder her (relevant z.B. bei Suspense-Fallbacks oder schnellem Seitenwechsel). */
export function useDocumentTitle(titel: string) {
  useEffect(() => {
    const vorher = document.title
    document.title = `${titel} · Miniplan`
    return () => {
      document.title = vorher
    }
  }, [titel])
}
