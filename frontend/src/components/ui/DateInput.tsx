import { useEffect, useState } from 'react'
import { feiertageListe, type Feiertag } from '../../api/feiertage'
import { Input } from './FormField'

/**
 * Wrapper um das native `<input type="date">`, der zusätzlich anzeigt, ob das gewählte Datum
 * ein Sonntag oder ein (per `GET /feiertage` berechneter) Feiertag ist - inkl. Namen des
 * Feiertags. Eine vollständig selbstgebaute Kalender-Grafik mit pro-Tag-Einfärbung wäre hier
 * unverhältnismäßig aufwendig (native Datums-Picker lassen sich browserübergreifend nicht
 * zuverlässig pro Tag einfärben); stattdessen wird der Status des aktuell gewählten Datums
 * direkt unter dem Feld angezeigt.
 */
export function DateInput({
  id,
  pfarreiId,
  jahr,
  value,
  onChange,
  required,
  error,
}: {
  id?: string
  pfarreiId: number
  jahr: number
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: string
}) {
  const angezeigtesJahr = value ? Number(value.slice(0, 4)) : jahr
  const [feiertage, setFeiertage] = useState<Feiertag[]>([])

  useEffect(() => {
    let abgebrochen = false
    feiertageListe(pfarreiId, angezeigtesJahr).then((liste) => {
      if (!abgebrochen) setFeiertage(liste)
    })
    return () => {
      abgebrochen = true
    }
  }, [pfarreiId, angezeigtesJahr])

  const feiertag = value ? feiertage.find((f) => f.datum === value) : undefined
  const istSonntag = value ? new Date(`${value}T00:00:00`).getDay() === 0 : false

  return (
    <div>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        error={error}
        title={feiertag ? feiertag.name : undefined}
        className={
          feiertag
            ? 'border-gold/60 ring-1 ring-gold/20'
            : istSonntag
              ? 'border-wine/40'
              : ''
        }
      />
      {(feiertag || istSonntag) && (
        <p
          className={`mt-1 text-xs ${feiertag ? 'text-[#7a5a20]' : 'text-wine'}`}
          title={feiertag?.name}
        >
          {feiertag ? `Feiertag: ${feiertag.name}` : 'Sonntag'}
        </p>
      )}
    </div>
  )
}
