import { KeyRound, Pencil, Plus, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Nutzer } from '../../api/auth'
import {
  allePfarreien,
  nutzerAnlegen,
  nutzerBearbeiten,
  nutzerListe,
  nutzerLoeschen,
  nutzerPasswortZuruecksetzen,
  nutzerRolleEntfernen,
  nutzerRolleSetzen,
  type PfarreiRolle,
} from '../../api/admin'
import { fehlerText } from '../../api/client'
import type { Pfarrei } from '../../api/pfarreien'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { CheckboxChip, Input, Label, Select } from '../../components/ui/FormField'
import { IconButton } from '../../components/ui/IconButton'
import { InlineConfirmButton } from '../../components/ui/InlineConfirmButton'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { Modal } from '../../components/ui/Modal'
import { Popover } from '../../components/ui/Popover'
import { useToast } from '../../components/ui/useToast'
import { ROLLEN } from './shared'

export function NutzerSection() {
  const { showToast } = useToast()
  const [nutzer, setNutzer] = useState<Nutzer[] | null>(null)
  const [pfarreien, setPfarreien] = useState<Pfarrei[]>([])
  const [bearbeiten, setBearbeiten] = useState<Nutzer | null>(null)
  const [neuOffen, setNeuOffen] = useState(false)
  const [neu, setNeu] = useState({ email: '', password: '', ist_admin: false })
  const neuButtonRef = useRef<HTMLButtonElement>(null)

  async function laden() {
    const [n, p] = await Promise.all([nutzerListe(), allePfarreien()])
    setNutzer(n)
    setPfarreien(p)
  }
  useEffect(() => {
    laden()
  }, [])

  async function anlegen() {
    try {
      await nutzerAnlegen(neu)
      setNeu({ email: '', password: '', ist_admin: false })
      setNeuOffen(false)
      showToast('Nutzer angelegt')
      await laden()
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  const pfarreiName = (id: number) => pfarreien.find((p) => p.id === id)?.name ?? `#${id}`

  return (
    <Card>
      <CardHeader
        title="Nutzer"
        description="Nutzer anlegen, Rollen je Pfarrei zuweisen, Passwörter zurücksetzen."
        action={
          <Button ref={neuButtonRef} size="sm" onClick={() => setNeuOffen((o) => !o)}>
            <UserPlus className="h-4 w-4" />
            Neuer Nutzer
          </Button>
        }
      />
      <Popover
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        anchorRef={neuButtonRef}
        title="Neuer Nutzer"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            anlegen()
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <Label htmlFor="neu-email">E-Mail</Label>
            <Input
              id="neu-email"
              type="email"
              autoFocus
              value={neu.email}
              onChange={(e) => setNeu({ ...neu, email: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="neu-passwort" hint="mind. 8 Zeichen">
              Passwort
            </Label>
            <Input
              id="neu-passwort"
              type="text"
              value={neu.password}
              onChange={(e) => setNeu({ ...neu, password: e.target.value })}
            />
          </div>
          <CheckboxChip
            id="neu-admin"
            checked={neu.ist_admin}
            onChange={() => setNeu({ ...neu, ist_admin: !neu.ist_admin })}
          >
            Globaler Admin
          </CheckboxChip>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setNeuOffen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={!neu.email.trim() || neu.password.length < 8}>
              Anlegen
            </Button>
          </div>
        </form>
      </Popover>
      {nutzer === null ? (
        <ListSkeleton />
      ) : (
        <ul>
          {nutzer.map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-ink">{n.email}</span>
                  {n.ist_admin && <Badge tone="pine">Admin</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {n.pfarrei_rollen.length === 0 && !n.ist_admin ? (
                    <span className="text-xs text-ink-faint">Keine Pfarrei zugewiesen</span>
                  ) : (
                    n.pfarrei_rollen.map((r) => (
                      <Badge key={r.pfarrei_id} tone="neutral">
                        {pfarreiName(r.pfarrei_id)} ·{' '}
                        {r.rolle === 'pfarrei_verantwortlicher' ? 'Verantw.' : 'Betrachter'}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <IconButton label="Bearbeiten" onClick={() => setBearbeiten(n)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {bearbeiten && (
        <NutzerBearbeitenModal
          nutzer={bearbeiten}
          pfarreien={pfarreien}
          onClose={() => setBearbeiten(null)}
          onGeaendert={async () => {
            await laden()
          }}
        />
      )}
    </Card>
  )
}

function NutzerBearbeitenModal({
  nutzer,
  pfarreien,
  onClose,
  onGeaendert,
}: {
  nutzer: Nutzer
  pfarreien: Pfarrei[]
  onClose: () => void
  onGeaendert: () => Promise<void>
}) {
  const { showToast } = useToast()
  const [email, setEmail] = useState(nutzer.email)
  const [istAdmin, setIstAdmin] = useState(nutzer.ist_admin)
  const [neuesPasswort, setNeuesPasswort] = useState('')
  const [rollen, setRollen] = useState(nutzer.pfarrei_rollen)
  const [neuPfarreiId, setNeuPfarreiId] = useState<number | ''>('')
  const [neuRolle, setNeuRolle] = useState<PfarreiRolle>('pfarrei_verantwortlicher')
  const [fehler, setFehler] = useState<string | null>(null)

  const pfarreiName = (id: number) => pfarreien.find((p) => p.id === id)?.name ?? `#${id}`
  const verfuegbarePfarreien = pfarreien.filter((p) => !rollen.some((r) => r.pfarrei_id === p.id))

  async function stammdatenSpeichern() {
    try {
      await nutzerBearbeiten(nutzer.id, { email, ist_admin: istAdmin })
      if (neuesPasswort) {
        await nutzerPasswortZuruecksetzen(nutzer.id, neuesPasswort)
        setNeuesPasswort('')
      }
      showToast('Nutzer gespeichert')
      await onGeaendert()
      onClose()
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  async function rolleHinzufuegen() {
    if (neuPfarreiId === '') return
    try {
      const aktualisiert = await nutzerRolleSetzen(nutzer.id, neuPfarreiId, neuRolle)
      setRollen(aktualisiert.pfarrei_rollen)
      setNeuPfarreiId('')
      await onGeaendert()
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  async function rolleEntfernen(pfarreiId: number) {
    try {
      const aktualisiert = await nutzerRolleEntfernen(nutzer.id, pfarreiId)
      setRollen(aktualisiert.pfarrei_rollen)
      await onGeaendert()
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  return (
    <Modal open onClose={onClose} title="Nutzer bearbeiten">
      <div className="flex flex-col gap-5">
        {fehler && <Alert>{fehler}</Alert>}

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="edit-email">E-Mail</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <CheckboxChip id="edit-admin" checked={istAdmin} onChange={() => setIstAdmin(!istAdmin)}>
            Globaler Admin
          </CheckboxChip>
          <div>
            <Label htmlFor="edit-passwort" hint="leer lassen = unverändert">
              Passwort zurücksetzen
            </Label>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 shrink-0 text-ink-faint" />
              <Input
                id="edit-passwort"
                type="text"
                value={neuesPasswort}
                onChange={(e) => setNeuesPasswort(e.target.value)}
                placeholder="Neues Passwort (mind. 8 Zeichen)"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-medium text-ink-soft">Pfarrei-Rollen</h3>
          {rollen.length === 0 ? (
            <p className="mb-2 text-sm text-ink-faint">Keine Rollen zugewiesen.</p>
          ) : (
            <ul className="mb-3 flex flex-col gap-2">
              {rollen.map((r) => (
                <li key={r.pfarrei_id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-ink">{pfarreiName(r.pfarrei_id)}</span>
                  <Badge tone="neutral">
                    {r.rolle === 'pfarrei_verantwortlicher' ? 'Verantwortlich' : 'Betrachter'}
                  </Badge>
                  <IconButton
                    label="Rolle entfernen"
                    tone="danger"
                    onClick={() => rolleEntfernen(r.pfarrei_id)}
                  >
                    <X className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {verfuegbarePfarreien.length > 0 && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="rolle-pfarrei">Pfarrei</Label>
                <Select
                  id="rolle-pfarrei"
                  value={neuPfarreiId}
                  onChange={(e) => setNeuPfarreiId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">– wählen –</option>
                  {verfuegbarePfarreien.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="rolle-wahl">Rolle</Label>
                <Select
                  id="rolle-wahl"
                  value={neuRolle}
                  onChange={(e) => setNeuRolle(e.target.value as PfarreiRolle)}
                >
                  {ROLLEN.map((r) => (
                    <option key={r.wert} value={r.wert}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                aria-label="Rolle hinzufügen"
                onClick={rolleHinzufuegen}
                disabled={neuPfarreiId === ''}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <NutzerLoeschenButton
            nutzer={nutzer}
            onGeloescht={async () => {
              await onGeaendert()
              onClose()
            }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Schließen
            </Button>
            <Button type="button" size="sm" onClick={stammdatenSpeichern}>
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function NutzerLoeschenButton({
  nutzer,
  onGeloescht,
}: {
  nutzer: Nutzer
  onGeloescht: () => Promise<void>
}) {
  const { showToast } = useToast()
  return (
    <InlineConfirmButton
      label="Nutzer löschen"
      confirmLabel="Nutzer löschen?"
      onConfirm={async () => {
        try {
          await nutzerLoeschen(nutzer.id)
          showToast('Nutzer gelöscht')
          await onGeloescht()
        } catch (err) {
          showToast(fehlerText(err), 'error')
        }
      }}
    />
  )
}
