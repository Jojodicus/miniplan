import { ChevronRight, Clock, Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react'
import { fehlerText } from '../../api/client'
import {
  filtertagBlockerBearbeiten,
  filtertagBlockerErstellen,
  filtertagBlockerListe,
  filtertagBlockerLoeschen,
  type FiltertagBlocker,
  type FiltertagBlockerEingabe,
} from '../../api/filtertagBlocker'
import {
  filtertagBearbeiten,
  filtertagErstellen,
  filtertagLoeschen,
  type Filtertag as FiltertagDef,
  type FiltertagEingabe,
} from '../../api/filtertags'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Collapse } from '../../components/ui/Collapse'
import { CheckboxChip, Input, Label, Select } from '../../components/ui/FormField'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconButton } from '../../components/ui/IconButton'
import { InlineConfirmButton } from '../../components/ui/InlineConfirmButton'
import { Popover } from '../../components/ui/Popover'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/useToast'
import { NeuButton } from './shared'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const STUNDEN_RASTER = Array.from({ length: 24 }, (_, i) => i)
const SPERRZEIT_ZEILENHOEHE = 16

function zeitZuMinuten(zeit: string): number {
  const [stunde, minute] = zeit.split(':').map(Number)
  return stunde * 60 + minute
}

function kurzeZeit(zeit: string): string {
  const hhmm = zeit.slice(0, 5)
  return hhmm.endsWith(':00') ? hhmm.slice(0, -3) : hhmm
}

// Eigene Spalte mit Stunden-Beschriftung, links und rechts vom Wochenraster verwendet - der
// leere Kopf oben sorgt dafür, dass die Stunden trotz der Wochentags-Kopfzeile im Raster mit den
// tatsächlichen Uhrzeiten fluchten.
function StundenSpalte({ align }: { align: 'right' | 'left' }) {
  return (
    <div className="w-8 shrink-0">
      <div className="py-1 text-center text-[10px] leading-none">&nbsp;</div>
      {STUNDEN_RASTER.filter((s) => s % 3 === 0).map((s) => (
        <div
          key={s}
          style={{ height: SPERRZEIT_ZEILENHOEHE * 3 }}
          className={`text-[10px] leading-none text-ink-faint ${align === 'right' ? 'text-left' : 'text-right'}`}
        >
          {String(s).padStart(2, '0')}
        </div>
      ))}
    </div>
  )
}

// Wochenraster (7 Tage × 24 Stunden) statt einer reinen Liste: Sperrzeiten lassen sich per Ziehen
// direkt anlegen (auf volle Stunden geklippt) und per Klick auf ein bestehendes Zeitfenster
// bearbeiten - das `NeuerBlockerForm` bleibt als Text-Alternative für minutengenaue Eingaben
// erreichbar, ersetzt aber nicht mehr die Hauptansicht.
function WochenSperrzeiten({
  filtertagId,
  blocker,
  onCreate,
  onUpdate,
  onDelete,
}: {
  filtertagId: number
  blocker: FiltertagBlocker[]
  onCreate: (daten: FiltertagBlockerEingabe) => void
  onUpdate: (blockerId: number, daten: FiltertagBlockerEingabe) => void
  onDelete: (blockerId: number) => void
}) {
  const [drag, setDrag] = useState<{
    wochentag: number
    startStunde: number
    endStunde: number
  } | null>(null)
  const [bearbeiten, setBearbeiten] = useState<FiltertagBlocker | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnde, setEditEnde] = useState('')
  const editAnchorRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag

  useEffect(() => {
    if (!drag) return
    function beenden() {
      const aktuell = dragRef.current
      if (!aktuell) return
      const von = Math.min(aktuell.startStunde, aktuell.endStunde)
      const bis = Math.max(aktuell.startStunde, aktuell.endStunde) + 1
      onCreate({
        filtertag_id: filtertagId,
        wochentag: aktuell.wochentag,
        start_zeit: `${String(von).padStart(2, '0')}:00:00`,
        end_zeit: `${String(bis).padStart(2, '0')}:00:00`,
      })
      setDrag(null)
    }
    window.addEventListener('mouseup', beenden)
    return () => window.removeEventListener('mouseup', beenden)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  function oeffnenBearbeiten(b: FiltertagBlocker, anker: HTMLDivElement) {
    editAnchorRef.current = anker
    setBearbeiten(b)
    setEditStart(b.start_zeit.slice(0, 5))
    setEditEnde(b.end_zeit.slice(0, 5))
  }

  function speichernBearbeiten(event: SubmitEvent) {
    event.preventDefault()
    if (!bearbeiten) return
    onUpdate(bearbeiten.id, {
      filtertag_id: filtertagId,
      wochentag: bearbeiten.wochentag,
      start_zeit: `${editStart}:00`,
      end_zeit: `${editEnde}:00`,
    })
    setBearbeiten(null)
  }

  return (
    <div className="px-5 py-3">
      <p className="mb-2 text-xs text-ink-faint">
        Ziehen für eine neue Sperrzeit (auf volle Stunden geklippt) · Klick auf ein bestehendes
        Zeitfenster zum Bearbeiten.
      </p>
      <div className="flex select-none">
        <StundenSpalte align="left" />
        <div className="mx-1 grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-md bg-line">
          {WOCHENTAGE.map((label, wochentag) => {
            const tagesBlocker = blocker.filter((b) => b.wochentag === wochentag)
            return (
              <div key={label} className="bg-paper">
                <p className="py-1 text-center text-[10px] font-medium text-ink-faint">
                  {label.slice(0, 2)}
                </p>
                <div
                  className="relative"
                  style={{ height: SPERRZEIT_ZEILENHOEHE * 24 }}
                  onMouseLeave={() => {
                    if (drag?.wochentag === wochentag) setDrag(null)
                  }}
                >
                  {STUNDEN_RASTER.map((stunde) => {
                    const inDrag =
                      drag &&
                      drag.wochentag === wochentag &&
                      stunde >= Math.min(drag.startStunde, drag.endStunde) &&
                      stunde <= Math.max(drag.startStunde, drag.endStunde)
                    return (
                      <div
                        key={stunde}
                        onMouseDown={() =>
                          setDrag({ wochentag, startStunde: stunde, endStunde: stunde })
                        }
                        onMouseEnter={() =>
                          setDrag((aktuell) =>
                            aktuell && aktuell.wochentag === wochentag
                              ? { ...aktuell, endStunde: stunde }
                              : aktuell,
                          )
                        }
                        style={{ height: SPERRZEIT_ZEILENHOEHE }}
                        className={`cursor-pointer border-t border-line/50 first:border-t-0 ${
                          inDrag ? 'bg-pine/25' : 'hover:bg-pine-tint'
                        }`}
                      />
                    )
                  })}
                  {tagesBlocker.map((b) => {
                    const startMin = zeitZuMinuten(b.start_zeit)
                    const endMin = zeitZuMinuten(b.end_zeit)
                    return (
                      <div
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => oeffnenBearbeiten(b, e.currentTarget)}
                        title={`${b.start_zeit.slice(0, 5)}–${b.end_zeit.slice(0, 5)} Uhr (bearbeiten)`}
                        style={{
                          top: (startMin / 60) * SPERRZEIT_ZEILENHOEHE,
                          height: Math.max(((endMin - startMin) / 60) * SPERRZEIT_ZEILENHOEHE, 4),
                        }}
                        className="absolute inset-x-0.5 flex cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-wine/50 bg-wine-tint/80 transition-colors hover:bg-wine-tint"
                      >
                        <span className="truncate px-0.5 text-[8px] leading-none whitespace-nowrap text-wine-dark">
                          {kurzeZeit(b.start_zeit)}–{kurzeZeit(b.end_zeit)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <StundenSpalte align="right" />
      </div>
      <Popover
        open={bearbeiten !== null}
        onClose={() => setBearbeiten(null)}
        anchorRef={editAnchorRef}
        title={bearbeiten ? `Sperrzeit · ${WOCHENTAGE[bearbeiten.wochentag]}` : undefined}
      >
        {bearbeiten && (
          <form onSubmit={speichernBearbeiten} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div>
                <Label htmlFor="sperrzeit-edit-start">Startzeit</Label>
                <Input
                  id="sperrzeit-edit-start"
                  type="time"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="sperrzeit-edit-ende">Endzeit</Label>
                <Input
                  id="sperrzeit-edit-ende"
                  type="time"
                  value={editEnde}
                  onChange={(e) => setEditEnde(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <InlineConfirmButton
                label="Löschen"
                size="sm"
                onConfirm={() => {
                  onDelete(bearbeiten.id)
                  setBearbeiten(null)
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setBearbeiten(null)}
                >
                  Abbrechen
                </Button>
                <Button type="submit" size="sm">
                  Speichern
                </Button>
              </div>
            </div>
          </form>
        )}
      </Popover>
    </div>
  )
}

function NeuerBlockerForm({
  filtertagId,
  onCreate,
}: {
  filtertagId: number
  onCreate: (daten: FiltertagBlockerEingabe) => void
}) {
  const [wochentag, setWochentag] = useState(0)
  const [startZeit, setStartZeit] = useState('08:00')
  const [endZeit, setEndZeit] = useState('13:00')

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    onCreate({
      filtertag_id: filtertagId,
      wochentag,
      start_zeit: `${startZeit}:00`,
      end_zeit: `${endZeit}:00`,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 px-5 py-3">
      <div>
        <Label htmlFor={`blocker-neu-${filtertagId}-wochentag`}>Wochentag</Label>
        <Select
          id={`blocker-neu-${filtertagId}-wochentag`}
          value={wochentag}
          onChange={(e) => setWochentag(Number(e.target.value))}
        >
          {WOCHENTAGE.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`blocker-neu-${filtertagId}-start`}>Startzeit</Label>
        <Input
          id={`blocker-neu-${filtertagId}-start`}
          type="time"
          value={startZeit}
          onChange={(e) => setStartZeit(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor={`blocker-neu-${filtertagId}-ende`}>Endzeit</Label>
        <Input
          id={`blocker-neu-${filtertagId}-ende`}
          type="time"
          value={endZeit}
          onChange={(e) => setEndZeit(e.target.value)}
          required
        />
      </div>
      <Button type="submit" variant="secondary">
        <Plus className="h-4 w-4" />
        Zeitfenster hinzufügen
      </Button>
    </form>
  )
}

// Bezeichnung + "folgt Schulferien-Regeln"-Checkbox, gemeinsam für Inline-Bearbeiten und
// Popover-Anlegen verwendet.
function FiltertagFormFelder({
  idPrefix,
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  idPrefix: string
  initial: FiltertagEingabe
  onSave: (daten: FiltertagEingabe) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [label, setLabel] = useState(initial.label)
  const [istSchuelerArtig, setIstSchuelerArtig] = useState(initial.ist_schueler_artig)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ label, ist_schueler_artig: istSchuelerArtig })
      }}
      className="flex flex-col gap-3"
    >
      <div>
        <Label htmlFor={`${idPrefix}-label`}>Bezeichnung</Label>
        <Input
          id={`${idPrefix}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="z. B. Azubi"
          autoFocus
          required
        />
      </div>
      <CheckboxChip
        id={`${idPrefix}-schueler-artig`}
        checked={istSchuelerArtig}
        onChange={() => setIstSchuelerArtig((wert) => !wert)}
        title="Ferien und schulfreie Feiertage gelten für diesen Status als frei."
      >
        folgt Schulferien-Regeln
      </CheckboxChip>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" size="sm" disabled={!label.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function FiltertagsSection({
  pfarreiId,
  filtertags,
  geladen,
  reload,
  aktiv,
}: {
  pfarreiId: number
  filtertags: FiltertagDef[]
  geladen: boolean
  reload: () => void
  aktiv: boolean
}) {
  const [blocker, setBlocker] = useState<FiltertagBlocker[]>([])
  const [offeneSperrzeiten, setOffeneSperrzeiten] = useState<Set<number>>(new Set())
  const [offenesTextForm, setOffenesTextForm] = useState<Set<number>>(new Set())
  const [neuOffen, setNeuOffen] = useState(false)
  const [bearbeitenId, setBearbeitenId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const neuButtonRef = useRef<HTMLButtonElement>(null)
  const { showToast } = useToast()

  // Siehe Kommentar in GruppenSection - portalte Popover/Modals überstehen sonst einen
  // (Sub-)Tab-Wechsel.
  useEffect(() => {
    if (!aktiv) {
      setNeuOffen(false)
      setBearbeitenId(null)
    }
  }, [aktiv])

  const reloadBlocker = useCallback(() => {
    filtertagBlockerListe(pfarreiId).then(setBlocker)
  }, [pfarreiId])

  useEffect(() => {
    reloadBlocker()
  }, [reloadBlocker])

  async function handleErstellen(daten: FiltertagEingabe) {
    setError(null)
    try {
      await filtertagErstellen(pfarreiId, daten)
      showToast('Verfügbarkeits-Status angelegt')
      setNeuOffen(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Verfügbarkeits-Status'))
    }
  }

  async function handleBearbeiten(filtertagId: number, daten: FiltertagEingabe) {
    setError(null)
    try {
      await filtertagBearbeiten(pfarreiId, filtertagId, daten)
      showToast('Verfügbarkeits-Status gespeichert')
      setBearbeitenId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Verfügbarkeits-Status'))
    }
  }

  async function handleDelete(filtertagId: number) {
    setError(null)
    try {
      await filtertagLoeschen(pfarreiId, filtertagId)
      showToast('Verfügbarkeits-Status gelöscht')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Verfügbarkeits-Status'))
    }
  }

  async function handleBlockerCreate(daten: FiltertagBlockerEingabe) {
    setError(null)
    try {
      await filtertagBlockerErstellen(pfarreiId, daten)
      reloadBlocker()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Zeitfensters'))
    }
  }

  async function handleBlockerUpdate(blockerId: number, daten: FiltertagBlockerEingabe) {
    setError(null)
    try {
      await filtertagBlockerBearbeiten(pfarreiId, blockerId, daten)
      showToast('Zeitfenster gespeichert')
      reloadBlocker()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Zeitfensters'))
    }
  }

  async function handleBlockerDelete(blockerId: number) {
    setError(null)
    try {
      await filtertagBlockerLoeschen(pfarreiId, blockerId)
      showToast('Zeitfenster gelöscht')
      reloadBlocker()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Zeitfensters'))
    }
  }

  function toggleSperrzeiten(filtertagId: number) {
    setOffeneSperrzeiten((offen) => {
      const neu = new Set(offen)
      if (neu.has(filtertagId)) {
        neu.delete(filtertagId)
      } else {
        neu.add(filtertagId)
      }
      return neu
    })
  }

  function toggleTextForm(filtertagId: number) {
    setOffenesTextForm((offen) => {
      const neu = new Set(offen)
      if (neu.has(filtertagId)) {
        neu.delete(filtertagId)
      } else {
        neu.add(filtertagId)
      }
      return neu
    })
  }

  return (
    <Card>
      <CardHeader
        title="Verfügbarkeits-Status"
        description="Wöchentliche Sperrzeiten je Status, z. B. Schulzeiten für „Schüler“."
        action={<NeuButton ref={neuButtonRef} label="Status" onClick={() => setNeuOffen(true)} />}
      />
      <Popover
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        anchorRef={neuButtonRef}
        title="Verfügbarkeits-Status anlegen"
      >
        <FiltertagFormFelder
          idPrefix="filtertag-neu"
          initial={{ label: '', ist_schueler_artig: false }}
          onSave={handleErstellen}
          onCancel={() => setNeuOffen(false)}
          submitLabel="Anlegen"
        />
      </Popover>
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={3} />
      ) : filtertags.length === 0 ? (
        <EmptyState icon={Clock} title="Noch keine Verfügbarkeits-Status angelegt" />
      ) : (
        <div>
          {filtertags.map((filtertag) => (
            <div
              key={filtertag.id}
              data-testid="filtertag-zeile"
              className="border-b border-line last:border-b-0"
            >
              {bearbeitenId === filtertag.id ? (
                <div className="px-5 py-3">
                  <FiltertagFormFelder
                    idPrefix={`filtertag-${filtertag.id}`}
                    initial={{
                      label: filtertag.label,
                      ist_schueler_artig: filtertag.ist_schueler_artig,
                    }}
                    onSave={(daten) => handleBearbeiten(filtertag.id, daten)}
                    onCancel={() => setBearbeitenId(null)}
                    submitLabel="Speichern"
                  />
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSperrzeiten(filtertag.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSperrzeiten(filtertag.id)
                    }
                  }}
                  className="flex cursor-pointer items-center justify-between gap-3 border-b border-line px-5 py-3 transition-colors last:border-b-0 hover:bg-pine-tint/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform ${
                        offeneSperrzeiten.has(filtertag.id) ? 'rotate-90' : ''
                      }`}
                    />
                    <span className="text-sm font-medium text-ink">{filtertag.label}</span>
                    {filtertag.ist_schueler_artig && (
                      <Badge tone="gold">folgt Schulferien-Regeln</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft">
                      <span className="rounded-full bg-pine-tint px-1.5 text-[10px] text-pine-dark">
                        {blocker.filter((b) => b.filtertag_id === filtertag.id).length}
                      </span>
                      Sperrzeiten
                    </span>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <IconButton label="Bearbeiten" onClick={() => setBearbeitenId(filtertag.id)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <InlineConfirmButton onConfirm={() => handleDelete(filtertag.id)} />
                    </div>
                  </div>
                </div>
              )}
              <Collapse open={offeneSperrzeiten.has(filtertag.id)}>
                <div className="bg-pine-tint/20">
                  <WochenSperrzeiten
                    filtertagId={filtertag.id}
                    blocker={blocker.filter((b) => b.filtertag_id === filtertag.id)}
                    onCreate={handleBlockerCreate}
                    onUpdate={handleBlockerUpdate}
                    onDelete={handleBlockerDelete}
                  />
                  <div className="border-t border-line/60 px-5 py-2">
                    <button
                      type="button"
                      onClick={() => toggleTextForm(filtertag.id)}
                      className="text-xs text-ink-faint underline decoration-dotted underline-offset-2 hover:text-pine-dark"
                    >
                      {offenesTextForm.has(filtertag.id)
                        ? 'Text-Formular ausblenden'
                        : 'Stattdessen per Text-Formular hinzufügen'}
                    </button>
                  </div>
                  {offenesTextForm.has(filtertag.id) && (
                    <NeuerBlockerForm filtertagId={filtertag.id} onCreate={handleBlockerCreate} />
                  )}
                </div>
              </Collapse>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
