import { Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { IconButton } from './IconButton'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const ZOOM_MIN = 0.6
const ZOOM_MAX = 2.2
const ZOOM_STEP = 0.15

export function PdfViewer({ data, className = '' }: { data: Uint8Array | null; className?: string }) {
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.15)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevScrollHeight = useRef(0)

  // Kopie der Daten, da react-pdf den `file`-Prop per Referenzgleichheit vergleicht
  // (siehe react-pdf-Doku) und wir Puffer-Bytes sonst bei jedem Re-Render neu laden würden.
  const file = useMemo(() => (data ? { data } : null), [data])

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

  if (!file) return null

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-end gap-1">
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
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-paper-dim">
        <div ref={contentRef} className="flex flex-col items-center gap-3 p-3">
          <Document
            file={file}
            loading={null}
            noData={null}
            onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
          >
            {Array.from({ length: numPages }, (_, index) => (
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
      </div>
    </div>
  )
}
