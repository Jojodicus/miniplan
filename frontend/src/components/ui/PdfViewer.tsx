import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { IconButton } from './IconButton'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const ZOOM_MIN = 0.6
const ZOOM_MAX = 2.2
const ZOOM_STEP = 0.15

type PdfFile = { data: Uint8Array }

// Zwei feste "Slots" für abwechselnd das sichtbare und das im Hintergrund vorgeladene Dokument.
// Wichtig: pdf.js übergibt den Uint8Array-Puffer eines `file`-Objekts per Transfer an seinen
// Worker und "entkoppelt" (detached) ihn dabei auf dem Hauptthread - würde man dasselbe Objekt
// später ein zweites Mal an eine neue <Document>-Instanz übergeben (z.B. beim Umschalten von
// versteckt auf sichtbar), schlägt das mit "ArrayBuffer is detached" fehl. Jeder Slot bekommt
// daher bei jedem Laden eine frische Kopie der Bytes, nie dasselbe Objekt wie der andere Slot.
type SlotName = 'a' | 'b'

export function PdfViewer({ data, className = '' }: { data: Uint8Array | null; className?: string }) {
  const [scale, setScale] = useState(1.15)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevScrollHeight = useRef(0)

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
  }, [])

  function zoom(delta: number) {
    setScale((wert) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, wert + delta)))
  }

  function slotGeladen(slot: SlotName, dieseDaten: Uint8Array, numPages: number) {
    setSlotNumPages((seiten) => ({ ...seiten, [slot]: numPages }))
    setActiveSlot(slot)
    geladeneDaten.current = dieseDaten
  }

  if (!data) return null

  return (
    <div className={`relative min-h-0 ${className}`}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full border border-line bg-white/85 px-1 py-1 shadow-sm backdrop-blur-sm">
        <IconButton label="Verkleinern" onClick={() => zoom(-ZOOM_STEP)} disabled={scale <= ZOOM_MIN}>
          <Minus className="h-4 w-4" />
        </IconButton>
        <span className="w-11 text-center text-xs tabular-nums text-ink-soft">
          {Math.round(scale * 100)}%
        </span>
        <IconButton label="Vergrößern" onClick={() => zoom(ZOOM_STEP)} disabled={scale >= ZOOM_MAX}>
          <Plus className="h-4 w-4" />
        </IconButton>
      </div>
      <div
        ref={scrollRef}
        className="h-full min-h-0 overflow-auto rounded-lg border border-line bg-paper-dim"
      >
        <div ref={contentRef} className="flex flex-col items-center gap-3 p-3">
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
                      <Page
                        key={index}
                        pageNumber={index + 1}
                        scale={scale}
                        className="shadow-sm"
                        loading={null}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
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
