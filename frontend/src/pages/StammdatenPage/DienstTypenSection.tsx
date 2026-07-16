import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import {
  dienstTypBearbeiten,
  dienstTypErstellen,
  dienstTypLoeschen,
  dienstTypenListe,
  type DienstTyp,
  type DienstTypEingabe,
  type GruppenAnforderung,
} from '../../api/dienstTypen'
import { fehlerText } from '../../api/client'
import type { Gruppe } from '../../api/gruppen'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Row } from '../../components/ui/CardSections'
import { EmptyState } from '../../components/ui/EmptyState'
import { CheckboxChip, Input, Label, Select } from '../../components/ui/FormField'
import { IconButton } from '../../components/ui/IconButton'
import { InlineConfirmButton } from '../../components/ui/InlineConfirmButton'
import { Modal } from '../../components/ui/Modal'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/useToast'
import { ModalAktionen, NeuButton } from './shared'

function GruppenAnforderungenEditor({
  gruppen,
  anforderungen,
  onChange,
  idPrefix,
  maxAnzahl,
}: {
  gruppen: Gruppe[]
  anforderungen: GruppenAnforderung[]
  onChange: (anforderungen: GruppenAnforderung[]) => void
  idPrefix: string
  maxAnzahl: number
}) {
  function addRow() {
    const belegteIds = new Set(anforderungen.map((a) => a.gruppe_id))
    const naechsteGruppe = gruppen.find((g) => !belegteIds.has(g.id))
    if (!naechsteGruppe) return
    onChange([...anforderungen, { gruppe_id: naechsteGruppe.id, mindest_anzahl: 1 }])
  }

  function updateRow(index: number, patch: Partial<GruppenAnforderung>) {
    onChange(anforderungen.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  function removeRow(index: number) {
    onChange(anforderungen.filter((_, i) => i !== index))
  }

  return (
    <div>
      <Label hint="z. B. mind. 1 aus Gruppe Obermini">Gruppen-Mindestanzahl</Label>
      <div className="flex flex-col gap-2">
        {anforderungen.map((anforderung, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-ink-soft">mind.</span>
            <Input
              id={`${idPrefix}-mindestanzahl-${index}`}
              type="number"
              min={1}
              max={maxAnzahl}
              value={anforderung.mindest_anzahl}
              onChange={(e) =>
                updateRow(index, {
                  mindest_anzahl: Math.min(Number(e.target.value), maxAnzahl),
                })
              }
              className="!w-16 shrink-0 text-center"
            />
            <span className="shrink-0 text-sm text-ink-soft">aus</span>
            <Select
              id={`${idPrefix}-gruppe-${index}`}
              value={anforderung.gruppe_id}
              onChange={(e) => updateRow(index, { gruppe_id: Number(e.target.value) })}
              className="min-w-0 flex-1"
            >
              {gruppen.map((gruppe) => (
                <option key={gruppe.id} value={gruppe.id}>
                  {gruppe.name}
                </option>
              ))}
            </Select>
            <IconButton label="Zeile entfernen" tone="danger" onClick={() => removeRow(index)}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 self-start"
        onClick={addRow}
        disabled={anforderungen.length >= gruppen.length}
      >
        <Plus className="h-4 w-4" />
        Zeile hinzufügen
      </Button>
    </div>
  )
}

export function DienstTypenSection({
  pfarreiId,
  gruppen,
  aktiv,
}: {
  pfarreiId: number
  gruppen: Gruppe[]
  aktiv: boolean
}) {
  const [dienstTypen, setDienstTypen] = useState<DienstTyp[]>([])
  const [geladen, setGeladen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOffen, setModalOffen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [standardAnzahl, setStandardAnzahl] = useState(1)
  const [gruppenAnforderungen, setGruppenAnforderungen] = useState<GruppenAnforderung[]>([])
  const [zeigeLabel, setZeigeLabel] = useState(false)
  const { showToast } = useToast()

  const reload = useCallback(() => {
    dienstTypenListe(pfarreiId).then((liste) => {
      setDienstTypen(liste)
      setGeladen(true)
    })
  }, [pfarreiId])

  // Siehe Kommentar in GruppenSection - portalte Modals überstehen sonst einen Tab-Wechsel.
  useEffect(() => {
    if (!aktiv) setModalOffen(false)
  }, [aktiv])

  useEffect(() => {
    reload()
  }, [reload])

  function oeffnenNeu() {
    setEditId(null)
    setName('')
    setStandardAnzahl(1)
    setGruppenAnforderungen([])
    setZeigeLabel(true)
    setError(null)
    setModalOffen(true)
  }

  function oeffnenBearbeiten(dienstTyp: DienstTyp) {
    setEditId(dienstTyp.id)
    setName(dienstTyp.name)
    setStandardAnzahl(dienstTyp.standard_anzahl)
    setGruppenAnforderungen(
      dienstTyp.gruppen_anforderungen.map((a) => ({
        gruppe_id: a.gruppe.id,
        mindest_anzahl: a.mindest_anzahl,
      })),
    )
    setZeigeLabel(dienstTyp.zeige_label)
    setError(null)
    setModalOffen(true)
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    const daten: DienstTypEingabe = {
      name,
      standard_anzahl: standardAnzahl,
      gruppen_anforderungen: gruppenAnforderungen,
      zeige_label: zeigeLabel,
    }
    try {
      if (editId === null) {
        await dienstTypErstellen(pfarreiId, daten)
        showToast('Dienst-Typ angelegt')
      } else {
        await dienstTypBearbeiten(pfarreiId, editId, daten)
        showToast('Dienst-Typ gespeichert')
      }
      setModalOffen(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern des Dienst-Typs'))
    }
  }

  async function handleDelete(dienstTypId: number) {
    setError(null)
    try {
      await dienstTypLoeschen(pfarreiId, dienstTypId)
      showToast('Dienst-Typ gelöscht')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Dienst-Typs'))
    }
  }

  return (
    <Card>
      <CardHeader
        title="Dienst-Typen"
        description="Arten von Diensten mit üblicher Besetzung."
        action={<NeuButton label="Dienst-Typ" onClick={oeffnenNeu} />}
      />
      {error && !modalOffen && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={3} />
      ) : dienstTypen.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Noch keine Dienst-Typen angelegt" />
      ) : (
        <div>
          {dienstTypen.map((dienstTyp) => (
            <Row key={dienstTyp.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{dienstTyp.name}</span>
                <Badge tone="neutral">{dienstTyp.standard_anzahl}× besetzt</Badge>
                {dienstTyp.zeige_label && <Badge tone="neutral">auf Plan sichtbar</Badge>}
                {dienstTyp.gruppen_anforderungen.map((a) => (
                  <Badge key={a.gruppe.id} tone="pine">
                    mind. {a.mindest_anzahl}× {a.gruppe.name}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Bearbeiten" onClick={() => oeffnenBearbeiten(dienstTyp)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <InlineConfirmButton onConfirm={() => handleDelete(dienstTyp.id)} />
              </div>
            </Row>
          ))}
        </div>
      )}
      <Modal
        open={modalOffen}
        onClose={() => setModalOffen(false)}
        title={editId === null ? 'Dienst-Typ anlegen' : 'Dienst-Typ bearbeiten'}
      >
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="dienst-typ-name">Name</Label>
            <Input
              id="dienst-typ-name"
              placeholder="z. B. Messdiener"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <div className="mt-2">
              <CheckboxChip
                id="dienst-typ-zeige-label"
                checked={zeigeLabel}
                onChange={() => setZeigeLabel((wert) => !wert)}
                title="Ist dies aus, erscheint auf dem Plan nur die Anzahl/Einschränkung, nicht der Name."
              >
                Name auf dem Plan zeigen
              </CheckboxChip>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Bewusst kein `Label` hier: das trägt für die übliche Stapelung (Label über Feld) ein
                `mb-1.5`, das in dieser einzeiligen Anordnung Label und Feld vertikal gegeneinander
                verschieben würde. */}
            <label
              htmlFor="dienst-typ-anzahl"
              className="shrink-0 text-sm font-medium text-ink-soft"
            >
              Übliche Besetzung
            </label>
            <Input
              id="dienst-typ-anzahl"
              type="number"
              min={0}
              value={standardAnzahl}
              onChange={(e) => setStandardAnzahl(Number(e.target.value))}
              required
              className="!w-16"
            />
            <span className="text-xs text-ink-faint">Minis pro Termin</span>
          </div>
          <GruppenAnforderungenEditor
            gruppen={gruppen}
            anforderungen={gruppenAnforderungen}
            maxAnzahl={standardAnzahl}
            onChange={setGruppenAnforderungen}
            idPrefix="dienst-typ"
          />
          <ModalAktionen
            onCancel={() => setModalOffen(false)}
            submitLabel={editId === null ? 'Anlegen' : 'Speichern'}
          />
        </form>
      </Modal>
    </Card>
  )
}
