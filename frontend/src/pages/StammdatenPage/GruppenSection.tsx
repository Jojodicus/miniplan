import { Pencil, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fehlerText } from '../../api/client'
import { gruppeBearbeiten, gruppeErstellen, gruppeLoeschen, type Gruppe } from '../../api/gruppen'
import { Alert } from '../../components/ui/Alert'
import { Card, CardHeader } from '../../components/ui/Card'
import { Row } from '../../components/ui/CardSections'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconButton } from '../../components/ui/IconButton'
import { InlineConfirmButton } from '../../components/ui/InlineConfirmButton'
import { Popover } from '../../components/ui/Popover'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/useToast'
import { InlineNeuForm, InlineTextEdit, NeuButton } from './shared'

export function GruppenSection({
  pfarreiId,
  gruppen,
  geladen,
  reload,
  aktiv,
}: {
  pfarreiId: number
  gruppen: Gruppe[]
  geladen: boolean
  reload: () => void
  aktiv: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [neuOffen, setNeuOffen] = useState(false)
  const [bearbeitenId, setBearbeitenId] = useState<number | null>(null)
  const neuButtonRef = useRef<HTMLButtonElement>(null)

  // Diese Sektion bleibt beim Tab-Wechsel gemountet (siehe StammdatenPage), damit kein
  // Lade-Skeleton erneut aufblitzt - ein offenes Popover/Modal ist aber per Portal in
  // `document.body` gerendert und würde vom `hidden`-Wrapper des inaktiven Tabs NICHT versteckt.
  // Beim Verlassen also explizit schließen.
  useEffect(() => {
    if (!aktiv) {
      setNeuOffen(false)
      setBearbeitenId(null)
    }
  }, [aktiv])
  const { showToast } = useToast()

  async function handleErstellen(name: string) {
    setError(null)
    try {
      await gruppeErstellen(pfarreiId, name)
      showToast('Gruppe angelegt')
      setNeuOffen(false)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen der Gruppe'))
    }
  }

  async function handleBearbeiten(gruppeId: number, name: string) {
    setError(null)
    try {
      await gruppeBearbeiten(pfarreiId, gruppeId, name)
      showToast('Gruppe gespeichert')
      setBearbeitenId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Speichern der Gruppe'))
    }
  }

  async function handleDelete(gruppeId: number) {
    setError(null)
    try {
      await gruppeLoeschen(pfarreiId, gruppeId)
      showToast('Gruppe gelöscht')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen der Gruppe'))
    }
  }

  return (
    <Card>
      <CardHeader
        title="Gruppen"
        description="Erfahrungsstufen, auf die sich Mindestbesetzungen beziehen."
        action={<NeuButton ref={neuButtonRef} label="Gruppe" onClick={() => setNeuOffen(true)} />}
      />
      <Popover
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        anchorRef={neuButtonRef}
        title="Gruppe anlegen"
      >
        <InlineNeuForm
          fieldId="gruppe-neu-name"
          placeholder="z. B. Obermini"
          onSave={handleErstellen}
          onCancel={() => setNeuOffen(false)}
        />
      </Popover>
      {error && (
        <div className="px-5 pt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!geladen ? (
        <ListSkeleton rows={3} />
      ) : gruppen.length === 0 ? (
        <EmptyState icon={Users} title="Noch keine Gruppen angelegt" />
      ) : (
        <div>
          {gruppen.map((gruppe) =>
            bearbeitenId === gruppe.id ? (
              <Row key={gruppe.id}>
                <InlineTextEdit
                  fieldId={`gruppe-${gruppe.id}-name`}
                  value={gruppe.name}
                  onSave={(name) => handleBearbeiten(gruppe.id, name)}
                  onCancel={() => setBearbeitenId(null)}
                />
              </Row>
            ) : (
              <Row key={gruppe.id}>
                <span className="text-sm font-medium text-ink">{gruppe.name}</span>
                <div className="flex items-center gap-1">
                  <IconButton label="Bearbeiten" onClick={() => setBearbeitenId(gruppe.id)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <InlineConfirmButton onConfirm={() => handleDelete(gruppe.id)} />
                </div>
              </Row>
            ),
          )}
        </div>
      )}
    </Card>
  )
}
