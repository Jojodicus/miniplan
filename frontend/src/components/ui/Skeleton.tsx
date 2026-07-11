/**
 * Platzhalter-Zeilen, die während des ersten Ladens einer Liste angezeigt werden – verhindert das
 * kurze Aufblitzen des „Noch keine …“-Leerzustands, bevor die Daten da sind.
 */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0"
        >
          <div className="h-4 w-40 rounded bg-paper-dim" />
          <div className="h-4 w-16 rounded bg-paper-dim" />
        </div>
      ))}
    </div>
  )
}
