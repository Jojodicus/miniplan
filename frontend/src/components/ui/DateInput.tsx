import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { feiertageListe, type Feiertag } from '../../api/feiertage'
import { ferienListe, type Ferienzeitraum } from '../../api/ferien'
import { formatDatum, MONATE } from '../../lib/datum'
import { IconButton } from './IconButton'

const WOCHENTAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WOCHENTAGE_LANG = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
]

function formatIso(jahr: number, monat: number, tag: number): string {
  return `${jahr}-${String(monat + 1).padStart(2, '0')}-${String(tag).padStart(2, '0')}`
}

// Montag = 0 ... Sonntag = 6, damit die Woche wie im deutschen Kalender mit Montag beginnt
// (JS Date.getDay() liefert Sonntag = 0, daher die Verschiebung).
function montagBasierterWochentag(datum: Date): number {
  return (datum.getDay() + 6) % 7
}

/**
 * Kalender-Popover statt des nativen `<input type="date">`, das sich browserübergreifend nicht
 * pro Tag einfärben lässt: markiert Sonntage und (per `GET /feiertage` berechnete) Feiertage
 * direkt im Monatsraster. Der Status des aktuell gewählten Datums wird zusätzlich als Text unter
 * dem Feld angezeigt (Fallback/Barrierefreiheit).
 */
export function DateInput({
  id,
  pfarreiId,
  jahr,
  monat,
  value,
  onChange,
  required,
  error,
}: {
  id?: string
  pfarreiId: number
  jahr: number
  /** 1-12, z. B. der Monat des Miniplans - bestimmt den initial angezeigten Kalendermonat,
   * solange noch kein Datum gewählt ist. */
  monat?: number
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: string
}) {
  const angezeigtesJahr = value ? Number(value.slice(0, 4)) : jahr
  const [feiertage, setFeiertage] = useState<Feiertag[]>([])
  const [ferien, setFerien] = useState<Ferienzeitraum[]>([])
  const [offen, setOffen] = useState(false)
  const [ansichtJahr, setAnsichtJahr] = useState(angezeigtesJahr)
  const [ansichtMonat, setAnsichtMonat] = useState(
    value ? Number(value.slice(5, 7)) - 1 : monat ? monat - 1 : new Date().getMonth(),
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    let abgebrochen = false
    feiertageListe(pfarreiId, ansichtJahr).then((liste) => {
      if (!abgebrochen) setFeiertage(liste)
    })
    // `jahr` löst serverseitig einen Sync an, falls dieses Jahr noch nicht gecached ist - Ferien
    // werden dadurch automatisch nachgeladen, sobald ein neuer Kalendermonat angezeigt wird, ohne
    // dass die Pfarrei-Verantwortlichen manuell "Aktualisieren" klicken müssen.
    ferienListe(pfarreiId, ansichtJahr).then((liste) => {
      if (!abgebrochen) setFerien(liste)
    })
    return () => {
      abgebrochen = true
    }
  }, [pfarreiId, ansichtJahr])

  function istFerienTag(iso: string): Ferienzeitraum | undefined {
    return ferien.find((f) => f.start_datum <= iso && iso <= f.end_datum)
  }

  useEffect(() => {
    if (!offen) return

    function aktualisierePosition() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      // Der Popover ist `position: fixed` (viewport-relativ, siehe unten) - `getBoundingClientRect`
      // liefert bereits viewport-relative Koordinaten. `window.scrollY/scrollX` zusätzlich
      // aufzuaddieren war ein Bug: dadurch wanderte der Popover bei gescrollter Seite um genau den
      // Scroll-Betrag zu weit nach unten/rechts, oft aus dem sichtbaren Bereich heraus.
      const links = Math.min(rect.left, window.innerWidth - 288 - 8)
      setPosition({ top: rect.bottom + 4, left: Math.max(8, links) })
    }
    aktualisierePosition()
    window.addEventListener('scroll', aktualisierePosition, true)
    window.addEventListener('resize', aktualisierePosition)

    // Popover ist per Portal außerhalb des containerRef gerendert (siehe Kommentar unten), daher
    // muss beim Klick-außerhalb-Check auch der Popover selbst berücksichtigt werden.
    function handleClick(event: MouseEvent) {
      const target = event.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOffen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOffen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('scroll', aktualisierePosition, true)
      window.removeEventListener('resize', aktualisierePosition)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [offen])

  const feiertag = value ? feiertage.find((f) => f.datum === value) : undefined
  const ferienzeit = value ? istFerienTag(value) : undefined
  const wochentagIndex = value ? new Date(`${value}T00:00:00`).getDay() : null
  const istSonntag = wochentagIndex === 0
  const wochentagName = wochentagIndex !== null ? WOCHENTAGE_LANG[wochentagIndex] : null

  function oeffnen() {
    if (value) {
      setAnsichtJahr(Number(value.slice(0, 4)))
      setAnsichtMonat(Number(value.slice(5, 7)) - 1)
    }
    setOffen((wert) => !wert)
  }

  function monatWechseln(delta: number) {
    let neuerMonat = ansichtMonat + delta
    let neuesJahr = ansichtJahr
    if (neuerMonat < 0) {
      neuerMonat = 11
      neuesJahr -= 1
    } else if (neuerMonat > 11) {
      neuerMonat = 0
      neuesJahr += 1
    }
    setAnsichtMonat(neuerMonat)
    setAnsichtJahr(neuesJahr)
  }

  function tagWaehlen(tag: number) {
    onChange(formatIso(ansichtJahr, ansichtMonat, tag))
    setOffen(false)
  }

  const anzahlTage = new Date(ansichtJahr, ansichtMonat + 1, 0).getDate()
  const startOffset = montagBasierterWochentag(new Date(ansichtJahr, ansichtMonat, 1))
  const heuteDate = new Date()
  const heute = formatIso(heuteDate.getFullYear(), heuteDate.getMonth(), heuteDate.getDate())

  const zellen: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: anzahlTage }, (_, i) => i + 1),
  ]

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={oeffnen}
        aria-required={required}
        aria-invalid={error ? true : undefined}
        className={`h-10 w-full rounded-md border bg-paper px-3 text-left text-sm outline-none transition-shadow focus:ring-2 focus:ring-pine/15 ${
          error ? 'border-wine focus:border-wine focus:ring-wine/15' : 'focus:border-pine'
        } ${
          !error && feiertag
            ? 'border-gold/60 ring-1 ring-gold/20'
            : !error && ferienzeit
              ? 'border-pine/50 ring-1 ring-pine/15'
              : !error && istSonntag
                ? 'border-wine/40'
                : !error
                  ? 'border-line'
                  : ''
        } ${value ? 'text-ink' : 'text-ink-faint'}`}
      >
        {value ? formatDatum(value) : 'Datum wählen'}
      </button>
      {value && wochentagName && !error && (
        <p
          className={`mt-1 text-xs ${
            feiertag
              ? 'text-gold-dark'
              : ferienzeit
                ? 'text-pine'
                : istSonntag
                  ? 'text-wine'
                  : 'text-ink-faint'
          }`}
          title={feiertag?.name ?? ferienzeit?.name}
        >
          {feiertag
            ? `${wochentagName} · Feiertag: ${feiertag.name}`
            : ferienzeit
              ? `${wochentagName} · Ferien: ${ferienzeit.name}`
              : wochentagName}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-wine">{error}</p>}
      {offen &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-72 rounded-lg border border-line bg-paper p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <IconButton label="Vorheriger Monat" onClick={() => monatWechseln(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <span className="text-sm font-medium text-ink">
                {MONATE[ansichtMonat]} {ansichtJahr}
              </span>
              <IconButton label="Nächster Monat" onClick={() => monatWechseln(1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-faint">
              {WOCHENTAGE_KURZ.map((tag) => (
                <span key={tag} className="py-1">
                  {tag}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {zellen.map((tag, index) => {
                if (tag === null) return <div key={`leer-${index}`} />
                const iso = formatIso(ansichtJahr, ansichtMonat, tag)
                const istAusgewaehlt = iso === value
                const tagFeiertag = feiertage.find((f) => f.datum === iso)
                const tagFerien = istFerienTag(iso)
                const tagIstSonntag = new Date(ansichtJahr, ansichtMonat, tag).getDay() === 0
                const istHeute = iso === heute
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => tagWaehlen(tag)}
                    title={tagFeiertag?.name ?? tagFerien?.name}
                    className={`flex h-8 items-center justify-center rounded-md text-sm transition-colors ${
                      istAusgewaehlt
                        ? 'bg-pine font-medium text-paper'
                        : tagFeiertag
                          ? 'bg-gold/15 text-gold-dark hover:bg-gold/25'
                          : tagFerien
                            ? 'bg-pine/10 text-pine hover:bg-pine/20'
                            : tagIstSonntag
                              ? 'text-wine hover:bg-wine-tint'
                              : 'text-ink hover:bg-pine-tint'
                    } ${istHeute && !istAusgewaehlt ? 'ring-1 ring-inset ring-pine/40' : ''}`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
