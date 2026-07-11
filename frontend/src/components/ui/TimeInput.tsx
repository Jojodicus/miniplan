import { Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from './FormField'

const STUNDEN = Array.from({ length: 24 }, (_, i) => i)
const MINUTEN = ['00', '15', '30', '45']

function teile(value: string): { stunde: string; minute: string } {
  const [stunde = '', minute = ''] = value.split(':')
  return { stunde, minute }
}

/**
 * Styled 24h-Uhrzeitwähler als Popover statt des kaum stylebaren nativen `<input type="time">`:
 * ein Raster für die volle Stunde und Schnellbuttons für die gängigen Viertelstunden decken die
 * häufigen Fälle mit einem Klick ab; ein natives Feld darunter erlaubt weiterhin minutengenaue
 * Eingabe. Der Wert bleibt im Format `HH:MM`.
 */
export function TimeInput({
  id,
  value,
  onChange,
  required,
  error,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: string
}) {
  const [offen, setOffen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const { stunde, minute } = teile(value)

  useEffect(() => {
    if (!offen) return
    function aktualisierePosition() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
    }
    aktualisierePosition()
    window.addEventListener('scroll', aktualisierePosition, true)
    window.addEventListener('resize', aktualisierePosition)
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

  function setStunde(neueStunde: number) {
    const min = minute || '00'
    onChange(`${String(neueStunde).padStart(2, '0')}:${min}`)
  }

  function setMinute(neueMinute: string) {
    const std = stunde || '09'
    onChange(`${std}:${neueMinute}`)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOffen((wert) => !wert)}
        aria-required={required}
        aria-invalid={error ? true : undefined}
        className={`flex h-10 w-full items-center justify-between rounded-md border bg-paper px-3 text-left text-sm outline-none transition-shadow focus:ring-2 focus:ring-pine/15 ${
          error ? 'border-wine focus:border-wine focus:ring-wine/15' : 'border-line focus:border-pine'
        } ${value ? 'text-ink' : 'text-ink-faint'}`}
      >
        <span>{value ? `${value} Uhr` : 'Uhrzeit wählen'}</span>
        <Clock className="h-4 w-4 text-ink-faint" />
      </button>
      {error && <p className="mt-1 text-xs text-wine">{error}</p>}
      {offen &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-64 rounded-lg border border-line bg-paper p-3 shadow-lg"
          >
            <p className="mb-1.5 text-xs font-medium text-ink-faint">Stunde</p>
            <div className="grid grid-cols-6 gap-1">
              {STUNDEN.map((s) => {
                const label = String(s).padStart(2, '0')
                const aktiv = stunde === label
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStunde(s)}
                    className={`flex h-7 items-center justify-center rounded text-xs tabular-nums transition-colors ${
                      aktiv
                        ? 'bg-pine font-medium text-paper'
                        : 'text-ink hover:bg-pine-tint'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 mb-1.5 text-xs font-medium text-ink-faint">Minute</p>
            <div className="grid grid-cols-4 gap-1">
              {MINUTEN.map((m) => {
                const aktiv = minute === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinute(m)}
                    className={`flex h-8 items-center justify-center rounded text-sm tabular-nums transition-colors ${
                      aktiv ? 'bg-pine font-medium text-paper' : 'text-ink hover:bg-pine-tint'
                    }`}
                  >
                    :{m}
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <span className="text-xs text-ink-faint">Genau</span>
              <Input
                aria-label="Uhrzeit minutengenau"
                type="time"
                step={60}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8"
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
