import { CalendarRange, ChevronLeft, ChevronRight, Church, Search, Settings } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { pfarreiBildUrl, type Pfarrei } from '../api/pfarreien'
import { Input } from './ui/FormField'

function PfarreiKarte({ pfarrei }: { pfarrei: Pfarrei }) {
  return (
    <div className="animate-rise flex w-full shrink-0 snap-center flex-col overflow-hidden rounded-2xl border border-line bg-white/70 shadow-sm shadow-ink/5">
      <div className="relative h-56 w-full bg-pine-tint sm:h-72">
        {pfarrei.hat_bild ? (
          <img
            src={pfarreiBildUrl(pfarrei.id)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pine-tint to-paper-dim">
            <Church className="h-16 w-16 text-pine/40" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-6 py-4">
          <h2 className="font-display text-2xl font-semibold text-paper drop-shadow-sm">
            {pfarrei.name}
          </h2>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5">
        <Link
          to={`/pfarreien/${pfarrei.id}/stammdaten`}
          className="group flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-pine hover:bg-pine-tint hover:text-pine-dark"
        >
          <Settings className="h-4 w-4" />
          Stammdaten
        </Link>
        <Link
          to={`/pfarreien/${pfarrei.id}/miniplaene`}
          className="group flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-pine hover:bg-pine-tint hover:text-pine-dark"
        >
          <CalendarRange className="h-4 w-4" />
          Minipläne
        </Link>
      </div>
    </div>
  )
}

export function PfarreiCarousel({ pfarreien }: { pfarreien: Pfarrei[] }) {
  const [suche, setSuche] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    if (!q) return pfarreien
    return pfarreien.filter((p) => p.name.toLowerCase().includes(q))
  }, [pfarreien, suche])

  function blaettern(richtung: -1 | 1) {
    const container = scrollRef.current
    if (!container) return
    container.scrollBy({ left: richtung * container.clientWidth, behavior: 'smooth' })
  }

  const mehrfach = gefiltert.length > 1

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Pfarrei suchen …"
            className="pl-9"
            aria-label="Pfarrei suchen"
          />
        </div>
        {mehrfach && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => blaettern(-1)}
              aria-label="Vorherige"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:border-pine hover:text-pine-dark"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => blaettern(1)}
              aria-label="Nächste"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-line text-ink-soft transition-colors hover:border-pine hover:text-pine-dark"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {gefiltert.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/70 px-5 py-8 text-center text-sm text-ink-soft">
          Keine Pfarrei gefunden.
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {gefiltert.map((pfarrei) => (
            <PfarreiKarte key={pfarrei.id} pfarrei={pfarrei} />
          ))}
        </div>
      )}
    </div>
  )
}
