import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { IconButton } from './IconButton'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const ZOOM_MIN = 0.6
const ZOOM_MAX = 2.2
const ZOOM_STEP = 0.15
const PAGE_PADDING_X = 24 // entspricht dem seitlichen `p-3` (12px) auf beiden Seiten des Contents

type PdfFile = { data: Uint8Array }

// Zwei feste "Slots" für abwechselnd das sichtbare und das im Hintergrund vorgeladene Dokument.
// Wichtig: pdf.js übergibt den Uint8Array-Puffer eines `file`-Objekts per Transfer an seinen
// Worker und "entkoppelt" (detached) ihn dabei auf dem Hauptthread - würde man dasselbe Objekt
// später ein zweites Mal an eine neue <Document>-Instanz übergeben (z.B. beim Umschalten von
// versteckt auf sichtbar), schlägt das mit "ArrayBuffer is detached" fehl. Jeder Slot bekommt
// daher bei jedem Laden eine frische Kopie der Bytes, nie dasselbe Objekt wie der andere Slot.
type SlotName = 'a' | 'b'

export function PdfViewer({
  data,
  className = '',
}: {
  data: Uint8Array | null
  className?: string
}) {
  // "100%" heißt hier: die Seite füllt den (bewusst A4-förmigen) Container exakt aus - nicht die
  // tatsächliche PDF-Punktgröße. Da der Container dasselbe Seitenverhältnis wie eine A4-Seite hat,
  // ergibt Breite-passend automatisch auch Höhe-passend. `zoomFactor` ist der Multiplikator auf
  // diesen Fit-Wert (1 = 100%, 1.5 = 150%, ...) - so bleibt die Prozentanzeige unabhängig von
  // Container-/Fenstergröße konsistent (100% ist immer "eine Seite passt genau").
  const [zoomFactor, setZoomFactor] = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)
  const [nativePageWidth, setNativePageWidth] = useState<number | null>(null)
  const fitScale =
    nativePageWidth && containerWidth > 0 ? (containerWidth - PAGE_PADDING_X) / nativePageWidth : 1
  const scale = fitScale * zoomFactor
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevScrollHeight = useRef(0)
  const zoomFactorRef = useRef(zoomFactor)
  zoomFactorRef.current = zoomFactor

  const [slotFiles, setSlotFiles] = useState<Record<SlotName, PdfFile | null>>({ a: null, b: null })
  const [slotNumPages, setSlotNumPages] = useState<Record<SlotName, number>>({ a: 0, b: 0 })
  const [activeSlot, setActiveSlot] = useState<SlotName>('a')
  const geladeneDaten = useRef<Uint8Array | null>(null)

  useEffect(() => {
    if (data === geladeneDaten.current) return
    if (!data) {
      geladeneDaten.current = null
      return
    }
    const zielSlot: SlotName = activeSlot === 'a' ? 'b' : 'a'
    setSlotFiles((slots) => ({ ...slots, [zielSlot]: { data: new Uint8Array(data) } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Abhängigkeit `Boolean(data)` statt `[]`: Beim allerersten Mount ist `data` noch `null`, die
  // Komponente rendert also (noch) keinen der untenstehenden Divs - `scrollRef`/`contentRef` wären
  // zu dem Zeitpunkt `null` und ein Effekt mit leerem Dependency-Array (läuft nur einmal beim
  // Mount) würde die Refs nie wieder neu auswerten, selbst nachdem die erste Vorschau geladen ist
  // und die Divs tatsächlich existieren.
  useEffect(() => {
    const scrollEl = scrollRef.current
    const contentEl = contentRef.current
    if (!scrollEl || !contentEl) return

    const observer = new ResizeObserver(() => {
      const neueHoehe = scrollEl.scrollHeight
      const alteHoehe = prevScrollHeight.current
      const scrollbereich = alteHoehe - scrollEl.clientHeight
      if (alteHoehe > 0 && neueHoehe !== alteHoehe && scrollbereich > 0) {
        const verhaeltnis = scrollEl.scrollTop / scrollbereich
        scrollEl.scrollTop = verhaeltnis * (neueHoehe - scrollEl.clientHeight)
      }
      prevScrollHeight.current = neueHoehe
    })
    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [Boolean(data)])

  // Container-Breite laufend messen (Layout-Wechsel, Fenster-/Orientierungswechsel), damit der
  // Fit-Wert (= 100%) aktuell bleibt.
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(scrollEl)
    return () => observer.disconnect()
  }, [Boolean(data)])

  function zoom(delta: number) {
    setZoomFactor(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomFactor + delta)))
  }

  // Strg+Scrollen (bzw. das Pinch-Zoom-Gesture, das Browser als `wheel`-Event mit `ctrlKey: true`
  // ausliefern) soll die PDF-Vorschau zoomen statt die ganze Seite - ohne `preventDefault` würde
  // stattdessen der Browser-Zoom der gesamten Seite greifen.
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey) return
      event.preventDefault()
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoomFactor(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomFactorRef.current + delta)))
    }
    scrollEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => scrollEl.removeEventListener('wheel', handleWheel)
  }, [Boolean(data)])

  function slotGeladen(slot: SlotName, dieseDaten: Uint8Array, numPages: number) {
    setSlotNumPages((seiten) => ({ ...seiten, [slot]: numPages }))
    setActiveSlot(slot)
    // Bewusst weder Zoom noch native Seitenbreite zurücksetzen: die Vorschau lädt bei jeder
    // Änderung im Editor (debounced) neu nach - ein Reset hier würde den Zoom des Nutzers bei
    // jeder Eingabe verwerfen.
    geladeneDaten.current = dieseDaten
  }

  if (!data) return null

  return (
    <div className={`relative min-h-0 ${className}`}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full border border-line bg-white/85 px-1 py-1 shadow-sm backdrop-blur-sm">
        <IconButton
          label="Verkleinern"
          onClick={() => zoom(-ZOOM_STEP)}
          disabled={zoomFactor <= ZOOM_MIN}
        >
          <Minus className="h-4 w-4" />
        </IconButton>
        <span className="w-11 text-center text-xs tabular-nums text-ink-soft">
          {Math.round(zoomFactor * 100)}%
        </span>
        <IconButton
          label="Vergrößern"
          onClick={() => zoom(ZOOM_STEP)}
          disabled={zoomFactor >= ZOOM_MAX}
        >
          <Plus className="h-4 w-4" />
        </IconButton>
      </div>
      <div
        ref={scrollRef}
        // Mobil (gestapeltes, nicht-sticky Layout): Breite bestimmt die Höhe über
        // `aspect-ratio` (`w-full`) - der Container ist dort durch die schmale Viewport-Breite
        // begrenzt, nicht durch Höhe. Ab `lg:` (sticky Sidebar mit reichlich Breite, aber
        // begrenzter Höhe) kehrt sich das um: `w-fit` lässt die Breite offen, sodass sie aus der
        // (durch `h-full` definitiven) Höhe abgeleitet wird - mit dem Bug ohne diese Umkehrung:
        // auf schmalen Bildschirmen ergab eine von der vollen Panel-Höhe (80svh) abgeleitete
        // Breite oft mehr als die verfügbare Viewport-Breite, `max-w-full` kappte sie dann zwar,
        // aber die Höhe blieb unverändert bei 80svh - der Container wirkte dadurch fast leer
        // (PDF-Seite oben, darunter viel graue Fläche bis 80svh).
        className="mx-auto aspect-[210/297] h-auto w-full overflow-auto rounded-lg border border-line bg-paper-dim lg:h-full lg:w-fit lg:max-w-full"
      >
        {/* Kein `items-center` auf dem scrollenden Container: zentrierte Flex-Kinder, die breiter
            als der Container werden (Zoom), lassen sich nur auf einer Seite wegscrollen - die
            andere Hälfte des Überstands bleibt permanent abgeschnitten. `mx-auto` je Seite
            vermeidet das (kein Überstand -> zentriert, sonst linksbündig und vollständig
            scrollbar). */}
        <div ref={contentRef} className="flex flex-col gap-3 p-3">
          {(['a', 'b'] as const).map((slot) => {
            const slotFile = slotFiles[slot]
            if (!slotFile) return null
            const istSichtbar = slot === activeSlot
            return (
              <div
                key={slot}
                className={istSichtbar ? 'contents' : 'absolute h-0 w-0 overflow-hidden opacity-0'}
                aria-hidden={istSichtbar ? undefined : true}
              >
                <Document
                  file={slotFile}
                  loading={null}
                  noData={null}
                  onLoadSuccess={(pdf) => slotGeladen(slot, slotFile.data, pdf.numPages)}
                >
                  {istSichtbar &&
                    Array.from({ length: slotNumPages[slot] }, (_, index) => (
                      <div key={index} className="w-fit mx-auto">
                        <Page
                          pageNumber={index + 1}
                          scale={scale}
                          className="shadow-sm"
                          loading={null}
                          onLoadSuccess={
                            index === 0
                              ? (page) =>
                                  setNativePageWidth((breite) => breite ?? page.originalWidth)
                              : undefined
                          }
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </div>
                    ))}
                </Document>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
