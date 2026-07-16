import { CalendarDays, ChevronLeft, ChevronRight, Info, Landmark, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fehlerText } from '../../api/client'
import { feiertagEinstellungSetzen, feiertageListe, type Feiertag } from '../../api/feiertage'
import { ferienAktualisieren, ferienListe, type Ferienzeitraum } from '../../api/ferien'
import {
  bundeslandSetzen,
  pfarreiDetail,
  BUNDESLAENDER,
  type Bundesland,
} from '../../api/pfarreien'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Row } from '../../components/ui/CardSections'
import { EmptyState } from '../../components/ui/EmptyState'
import { CheckboxChip, Label, Select } from '../../components/ui/FormField'
import { IconButton } from '../../components/ui/IconButton'
import { Popover } from '../../components/ui/Popover'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { formatDatum } from '../../lib/datum'

const BUNDESLAND_NAMEN: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
}

// Feiertage, deren Arbeitsfrei-Status nicht landesweit einheitlich ist, sondern (auch innerhalb
// des per Bundesland berechneten `holidays`-Datensatzes) davon abhängt, ob die jeweilige
// Gemeinde/der Landkreis mehrheitlich katholisch/evangelisch ist (z.B. Fronleichnam in Sachsen/
// Thüringen nur in katholisch geprägten Gemeinden, Mariä Himmelfahrt in Bayern nur dort) - simple
// Namens-Heuristik statt Bundesland-spezifischer Sonderfall-Liste, da `holidays.Germany` diese
// Gemeinde-Ebene nicht selbst abbildet.
const REGIONALE_AUSNAHME_KEYWORDS = ['fronleichnam', 'mariä himmelfahrt', 'mariae himmelfahrt']

function hatRegionaleAusnahme(name: string): boolean {
  const normalisiert = name.toLowerCase()
  return REGIONALE_AUSNAHME_KEYWORDS.some((keyword) => normalisiert.includes(keyword))
}

export function FerienFeiertageSection({
  pfarreiId,
  aktiv,
}: {
  pfarreiId: number
  aktiv: boolean
}) {
  const [auswahl, setAuswahl] = useState<Bundesland>('BY')
  const [ferien, setFerien] = useState<Ferienzeitraum[]>([])
  const [ferienGeladen, setFerienGeladen] = useState(false)
  const [speichertGerade, setSpeichertGerade] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)

  const [feiertage, setFeiertage] = useState<Feiertag[]>([])
  const [feiertageGeladen, setFeiertageGeladen] = useState(false)
  const [feiertageError, setFeiertageError] = useState<string | null>(null)
  // Umschaltbar, weil z. B. im Dezember bereits der Januar des Folgejahres geplant wird.
  const [jahr, setJahr] = useState(() => new Date().getFullYear())

  const reloadFerien = useCallback(() => {
    pfarreiDetail(pfarreiId).then((info) => setAuswahl(info.bundesland))
    ferienListe(pfarreiId).then((liste) => {
      setFerien(liste)
      setFerienGeladen(true)
    })
  }, [pfarreiId])

  const reloadFeiertage = useCallback(() => {
    feiertageListe(pfarreiId, jahr).then((liste) => {
      setFeiertage(liste)
      setFeiertageGeladen(true)
    })
  }, [pfarreiId, jahr])

  useEffect(() => {
    reloadFerien()
  }, [reloadFerien])

  useEffect(() => {
    reloadFeiertage()
  }, [reloadFeiertage])

  async function handleSpeichern() {
    setError(null)
    setRateLimited(false)
    setGespeichert(false)
    setSpeichertGerade(true)
    try {
      // Setzt das Bundesland der gesamten Pfarrei (gilt für alle Ministranten/Dienstpläne) und
      // stößt serverseitig bereits einen Ferien-Sync an - explizit erneut abrufen statt nur der
      // Server-Antwort zu vertrauen, damit auch bei einem Ferien-Sync-Fehler klares Feedback kommt
      // (statt eines still veralteten Kalenders) und die Liste hier sicher aktuell ist. Feiertage
      // hängen ebenfalls vom Bundesland ab, daher hier ebenfalls neu laden.
      await bundeslandSetzen(pfarreiId, auswahl)
      const neueFerien = await ferienAktualisieren(pfarreiId)
      setFerien(neueFerien)
      reloadFeiertage()
      setGespeichert(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setRateLimited(true)
      } else {
        setError(fehlerText(err, 'Fehler beim Speichern des Bundeslands'))
      }
    } finally {
      setSpeichertGerade(false)
    }
  }

  async function handleToggle(feiertag: Feiertag, feld: 'schulfrei' | 'arbeiter_frei') {
    setFeiertageError(null)
    const aktualisiert = { ...feiertag, [feld]: !feiertag[feld] }
    setFeiertage((aktuell) => aktuell.map((f) => (f.key === feiertag.key ? aktualisiert : f)))
    try {
      await feiertagEinstellungSetzen(pfarreiId, feiertag.key, {
        schulfrei: aktualisiert.schulfrei,
        arbeiter_frei: aktualisiert.arbeiter_frei,
      })
    } catch (err) {
      setFeiertageError(fehlerText(err, 'Fehler beim Speichern der Feiertags-Einstellung'))
      reloadFeiertage()
    }
  }

  // Ein einzelnes Popover für alle Hinweis-Buttons der Liste statt eines pro Zeile - der
  // Auslöser-Ref wird beim Klick auf den jeweiligen Button neu gesetzt.
  const [hinweisFeiertag, setHinweisFeiertag] = useState<Feiertag | null>(null)
  const hinweisAnchorRef = useRef<HTMLButtonElement>(null)

  function toggleRegionaleAusnahmeHinweis(feiertag: Feiertag, anchor: HTMLButtonElement) {
    hinweisAnchorRef.current = anchor
    setHinweisFeiertag((aktuell) => (aktuell?.key === feiertag.key ? null : feiertag))
  }

  // Siehe Kommentar in GruppenSection - das Popover ist per Portal gerendert und würde einen
  // Tab-Wechsel sonst überstehen.
  useEffect(() => {
    if (!aktiv) setHinweisFeiertag(null)
  }, [aktiv])

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Bundesland" description="Bestimmt Ferien- und Feiertagskalender." />
        {error && (
          <div className="px-5 pt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        {rateLimited && (
          <div className="px-5 pt-4">
            <Alert tone="info">
              Die externe Ferien-Quelle begrenzt aktuell die Anfragen. Bitte in ein paar Minuten
              erneut versuchen.
            </Alert>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4 p-5">
          <div>
            <Label htmlFor="ferien-bundesland" hint="gilt für die ganze Pfarrei">
              Bundesland
            </Label>
            <Select
              id="ferien-bundesland"
              value={auswahl}
              onChange={(e) => {
                setAuswahl(e.target.value as Bundesland)
                setGespeichert(false)
              }}
            >
              {BUNDESLAENDER.map((code) => (
                <option key={code} value={code}>
                  {BUNDESLAND_NAMEN[code]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={handleSpeichern} disabled={speichertGerade}>
            <RefreshCw className="h-4 w-4" />
            {speichertGerade ? 'Speichert…' : 'Speichern'}
          </Button>
          {gespeichert && (
            <span className="text-sm text-ink-soft">
              Gespeichert, Ferien- und Feiertagskalender aktualisiert.
            </span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Ferien"
          description="Automatisch abgerufen für das gewählte Bundesland."
        />
        {!ferienGeladen ? (
          <ListSkeleton rows={3} />
        ) : ferien.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Noch keine Ferien geladen" />
        ) : (
          <div>
            {ferien.map((f) => (
              <Row key={f.id}>
                <span className="text-sm text-ink">
                  {f.name} ({formatDatum(f.start_datum)}–{formatDatum(f.end_datum)})
                </span>
                <Badge tone="neutral">Schuljahr {f.schuljahr}</Badge>
              </Row>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Gesetzliche Feiertage"
          description="Mit Unterscheidung ob schulfrei und/oder arbeitsfrei."
          action={
            <div className="flex items-center gap-1">
              <IconButton label="Vorheriges Jahr" onClick={() => setJahr((j) => j - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <span className="w-12 text-center text-sm font-medium tabular-nums text-ink">
                {jahr}
              </span>
              <IconButton label="Nächstes Jahr" onClick={() => setJahr((j) => j + 1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
          }
        />
        {feiertageError && (
          <div className="px-5 pt-4">
            <Alert>{feiertageError}</Alert>
          </div>
        )}
        {!feiertageGeladen ? (
          <ListSkeleton rows={4} />
        ) : feiertage.length === 0 ? (
          <EmptyState icon={Landmark} title="Keine Feiertage gefunden" />
        ) : (
          <div>
            {feiertage.map((f) => (
              <Row key={f.key}>
                <span className="text-sm text-ink">
                  {f.name} ({formatDatum(f.datum)})
                </span>
                <div className="flex items-center gap-2">
                  {hatRegionaleAusnahme(f.name) && (
                    <IconButton
                      label={`Hinweis zu ${f.name}`}
                      onClick={(e) => toggleRegionaleAusnahmeHinweis(f, e.currentTarget)}
                      className="h-6 w-6 text-gold-dark hover:text-gold-dark"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                  <CheckboxChip
                    id={`feiertag-${f.key}-schulfrei`}
                    checked={f.schulfrei}
                    onChange={() => handleToggle(f, 'schulfrei')}
                  >
                    schulfrei
                  </CheckboxChip>
                  <CheckboxChip
                    id={`feiertag-${f.key}-arbeiterfrei`}
                    checked={f.arbeiter_frei}
                    onChange={() => handleToggle(f, 'arbeiter_frei')}
                  >
                    arbeitsfrei
                  </CheckboxChip>
                </div>
              </Row>
            ))}
          </div>
        )}
      </Card>

      <Popover
        open={hinweisFeiertag !== null}
        onClose={() => setHinweisFeiertag(null)}
        anchorRef={hinweisAnchorRef}
        title={hinweisFeiertag?.name}
        width={280}
      >
        <p className="text-sm text-ink-soft">
          Nicht überall einheitlich arbeitsfrei: Ob dieser Tag gesetzlich arbeitsfrei ist, hängt
          hier von der mehrheitlichen Konfession der Gemeinde/des Landkreises ab. Bitte bei Bedarf
          oben von Hand anpassen.
        </p>
      </Popover>
    </div>
  )
}
