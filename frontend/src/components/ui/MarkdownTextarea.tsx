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
  disabled = false,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Text wird bewusst per `document.execCommand('insertText', ...)` statt per direktem
  // React-State-Update eingefügt: Nur so landet die Änderung im nativen Undo-Stack des
  // Textfelds (der native `input`-Event löst dann ganz normal das `onChange` der Textarea
  // unten aus) - ein direkter State-Set würde den Undo-Stack der Textarea "unsichtbar"
  // verändern, sodass Strg+Z/Strg+Y danach nicht mehr funktionieren.
  function einfuegen(text: string, selectionRange?: (insertStart: number) => [number, number]) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    el.focus()
    document.execCommand('insertText', false, text)
    if (selectionRange) {
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(...selectionRange(start))
      })
    }
  }

  function umschliessen({ vor, nach }: Umschliessung) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const ausgewaehlt = value.slice(start, end)
    einfuegen(`${vor}${ausgewaehlt}${nach}`, (insertStart) => [
      insertStart + vor.length,
      insertStart + vor.length + ausgewaehlt.length,
    ])
  }

  function listeEinfuegen(markierung: string) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    el.setSelectionRange(start, start)
    const zeilenStart = value.lastIndexOf('\n', start - 1) + 1
    const praefix = start === zeilenStart ? '' : '\n'
    const einfuegung = `${praefix}${markierung} `
    einfuegen(einfuegung, (insertStart) => {
      const position = insertStart + einfuegung.length
      return [position, position]
    })
  }

  function linkEinfuegen() {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const ausgewaehlt = value.slice(start, end)
    const linktext = ausgewaehlt || 'Linktext'
    einfuegen(`[${linktext}](https://)`, (insertStart) => [
      insertStart + 1,
      insertStart + 1 + linktext.length,
    ])
  }

  return (
    <div>
      <div className="mb-1.5 flex gap-1">
        <button
          type="button"
          aria-label="Fett"
          title="Fett"
          disabled={disabled}
          onClick={() => umschliessen({ vor: '**', nach: '**' })}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark disabled:pointer-events-none disabled:opacity-40"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Kursiv"
          title="Kursiv"
          disabled={disabled}
          onClick={() => umschliessen({ vor: '*', nach: '*' })}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark disabled:pointer-events-none disabled:opacity-40"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Aufzählung"
          title="Aufzählung"
          disabled={disabled}
          onClick={() => listeEinfuegen('-')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark disabled:pointer-events-none disabled:opacity-40"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Nummerierte Liste"
          title="Nummerierte Liste"
          disabled={disabled}
          onClick={() => listeEinfuegen('1.')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark disabled:pointer-events-none disabled:opacity-40"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Link"
          title="Link"
          disabled={disabled}
          onClick={linkEinfuegen}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-pine-tint hover:text-pine-dark disabled:pointer-events-none disabled:opacity-40"
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
        disabled={disabled}
        className={`${textareaChrome} disabled:cursor-not-allowed disabled:opacity-60`}
      />
    </div>
  )
}
