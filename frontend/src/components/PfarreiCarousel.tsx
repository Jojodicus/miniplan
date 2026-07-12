import { CalendarRange, ChevronLeft, ChevronRight, Church, Search, Settings } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { pfarreiBildUrl, type Pfarrei } from '../api/pfarreien'
import { Input } from './ui/FormField'

function PfarreiKarte({ pfarrei }: { pfarrei: Pfarrei }) {
  return (
    <div className="animate-rise flex w-full shrink-0 snap-center flex-col overflow-hidden rounded-2xl border border-line bg-white/70 shadow-sm shadow-ink/5">
      <div className="relative h-56 w-full bg-pine-tint sm:h-72">
        {pfarrei.hat_bild ? (
          <img src={pfarreiBildUrl(pfarrei.id)} alt="" className="h-full w-full object-cover" />
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
  const [aktiverIndex, setAktiverIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    if (!q) return pfarreien
    return pfarreien.filter((p) => p.name.toLowerCase().includes(q))
  }, [pfarreien, suche])

  useEffect(() => {
    setAktiverIndex(0)
    scrollRef.current?.scrollTo({ left: 0 })
  }, [gefiltert.length])

  function scrolleZuIndex(index: number) {
    const container = scrollRef.current
    if (!container) return
    const ziel = Math.max(0, Math.min(index, gefiltert.length - 1))
    container.scrollTo({ left: ziel * container.clientWidth, behavior: 'smooth' })
  }

  function beiScroll() {
    const container = scrollRef.current
    if (!container || container.clientWidth === 0) return
    setAktiverIndex(Math.round(container.scrollLeft / container.clientWidth))
  }

  const mehrfach = gefiltert.length > 1
  const amAnfang = aktiverIndex <= 0
  const amEnde = aktiverIndex >= gefiltert.length - 1

  return (
    <div>
      <div className="mb-4">
        <div className="relative max-w-sm">
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
      </div>

      {gefiltert.length === 0 ? (
        <p className="rounded-xl border border-line bg-white/70 px-5 py-8 text-center text-sm text-ink-soft">
          Keine Pfarrei gefunden.
        </p>
      ) : (
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={beiScroll}
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {gefiltert.map((pfarrei) => (
              <PfarreiKarte key={pfarrei.id} pfarrei={pfarrei} />
            ))}
          </div>

          {mehrfach && (
            <>
              {!amAnfang && (
                <button
                  type="button"
                  onClick={() => scrolleZuIndex(aktiverIndex - 1)}
                  aria-label="Vorherige"
                  className="absolute top-[calc(50%-1rem)] left-2 inline-flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-white/90 text-ink-soft shadow-md backdrop-blur transition-colors hover:border-pine hover:text-pine-dark"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {!amEnde && (
                <button
                  type="button"
                  onClick={() => scrolleZuIndex(aktiverIndex + 1)}
                  aria-label="Nächste"
                  className="absolute top-[calc(50%-1rem)] right-2 inline-flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-white/90 text-ink-soft shadow-md backdrop-blur transition-colors hover:border-pine hover:text-pine-dark"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {mehrfach && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {gefiltert.map((pfarrei, index) => (
            <button
              key={pfarrei.id}
              type="button"
              onClick={() => scrolleZuIndex(index)}
              aria-label={`Zu ${pfarrei.name} springen`}
              aria-current={index === aktiverIndex}
              className={`h-2 cursor-pointer rounded-full transition-all ${
                index === aktiverIndex ? 'w-6 bg-pine' : 'w-2 bg-line hover:bg-pine/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
