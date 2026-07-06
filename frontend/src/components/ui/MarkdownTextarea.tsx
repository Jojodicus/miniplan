import { Bold, Italic, Link, List, ListOrdered } from 'lucide-react'
import { useRef } from 'react'

const textareaChrome =
  'w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-shadow focus:border-pine focus:ring-2 focus:ring-pine/15'

interface Umschliessung {
  vor: string
  nach: string
}

/**
 * Textarea mit einer kleinen Markdown-Toolbar (fett/kursiv/Aufzählung/nummerierte Liste/Link),
 * die Markdown-Syntax an der Cursorposition einfügt bzw. die aktuelle Selektion umschließt -
 * bewusst ohne WYSIWYG-Abhängigkeit, da die Live-PDF-Vorschau bereits das tatsächliche
 * Rendering-Ergebnis zeigt.
 */
export function MarkdownTextarea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function umschliessen({ vor, nach }: Umschliessung) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const ausgewaehlt = value.slice(start, end)
    const neuerWert = `${value.slice(0, start)}${vor}${ausgewaehlt}${nach}${value.slice(end)}`
    onChange(neuerWert)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + vor.length, start + vor.length + ausgewaehlt.length)
    })
  }

  function listeEinfuegen(markierung: string) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const zeilenStart = value.lastIndexOf('\n', start - 1) + 1
    const praefix = start === zeilenStart ? '' : '\n'
    const einfuegung = `${praefix}${markierung} `
    const neuerWert = `${value.slice(0, start)}${einfuegung}${value.slice(start)}`
    onChange(neuerWert)
    requestAnimationFrame(() => {
      el.focus()
      const position = start + einfuegung.length
      el.setSelectionRange(position, position)
    })
  }

  function linkEinfuegen() {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const ausgewaehlt = value.slice(start, end)
    const linktext = ausgewaehlt || 'Linktext'
    const einfuegung = `[${linktext}](https://)`
    const neuerWert = `${value.slice(0, start)}${einfuegung}${value.slice(end)}`
    onChange(neuerWert)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + 1, start + 1 + linktext.length)
    })
  }

  return (
    <div>
      <div className="mb-1.5 flex gap-1">
        <button
          type="button"
          aria-label="Fett"
          title="Fett"
          onClick={() => umschliessen({ vor: '**', nach: '**' })}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Kursiv"
          title="Kursiv"
          onClick={() => umschliessen({ vor: '*', nach: '*' })}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Aufzählung"
          title="Aufzählung"
          onClick={() => listeEinfuegen('-')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Nummerierte Liste"
          title="Nummerierte Liste"
          onClick={() => listeEinfuegen('1.')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Link"
          title="Link"
          onClick={linkEinfuegen}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark"
        >
          <Link className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={textareaChrome}
      />
    </div>
  )
}
