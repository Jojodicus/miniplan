import {
  Church,
  ImageOff,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Upload,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Nutzer } from '../api/auth'
import {
  allePfarreien,
  nutzerAnlegen,
  nutzerBearbeiten,
  nutzerListe,
  nutzerLoeschen,
  nutzerPasswortZuruecksetzen,
  nutzerRolleEntfernen,
  nutzerRolleSetzen,
  pfarreiAnlegen,
  pfarreiLoeschen,
  pfarreiUmbenennen,
  type PfarreiRolle,
} from '../api/admin'
import { ApiError } from '../api/client'
import {
  pfarreiBildEntfernen,
  pfarreiBildHochladen,
  pfarreiBildUrl,
  type Pfarrei,
} from '../api/pfarreien'
import { AppShell } from '../components/layout/AppShell'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { CheckboxChip, Input, Label, Select } from '../components/ui/FormField'
import { IconButton } from '../components/ui/IconButton'
import { InlineConfirmButton } from '../components/ui/InlineConfirmButton'
import { ListSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { Popover } from '../components/ui/Popover'
import { useToast } from '../components/ui/Toast'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const ROLLEN: { wert: PfarreiRolle; label: string }[] = [
  { wert: 'pfarrei_verantwortlicher', label: 'Verantwortlich' },
  { wert: 'betrachter', label: 'Betrachter' },
]

function fehlerText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ein Fehler ist aufgetreten'
}

export function AdminPage() {
  useDocumentTitle('Admin')
  const { user } = useAuth()
  if (user && !user.ist_admin) return <Navigate to="/" replace />

  return (
    <AppShell>
      <div className="animate-rise">
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold text-ink">
          <ShieldCheck className="h-7 w-7 text-pine" />
          Administration
        </h1>
        <div className="mt-8 flex flex-col gap-8">
          <PfarreienVerwaltung />
          <NutzerVerwaltung />
        </div>
      </div>
    </AppShell>
  )
}

// --- Pfarreien --------------------------------------------------------------

function PfarreienVerwaltung() {
  const { showToast } = useToast()
  const [pfarreien, setPfarreien] = useState<Pfarrei[] | null>(null)
  const [neuOffen, setNeuOffen] = useState(false)
  const [neuName, setNeuName] = useState('')
  const neuButtonRef = useRef<HTMLButtonElement>(null)

  async function laden() {
    setPfarreien(await allePfarreien())
  }
  useEffect(() => {
    laden()
  }, [])

  async function anlegen() {
    try {
      await pfarreiAnlegen({ name: neuName })
      setNeuName('')
      setNeuOffen(false)
      showToast('Pfarrei angelegt')
      await laden()
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Pfarreien"
        description="Pfarreien anlegen, umbenennen, Bild verwalten oder löschen."
        action={
          <Button ref={neuButtonRef} size="sm" onClick={() => setNeuOffen((o) => !o)}>
            <Plus className="h-4 w-4" />
            Neue Pfarrei
          </Button>
        }
      />
      <Popover
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        anchorRef={neuButtonRef}
        title="Neue Pfarrei"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            anlegen()
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <Label htmlFor="neu-pfarrei-name">Name</Label>
            <Input
              id="neu-pfarrei-name"
              autoFocus
              value={neuName}
              onChange={(e) => setNeuName(e.target.value)}
              placeholder="St. Beispiel"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setNeuOffen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={!neuName.trim()}>
              Anlegen
            </Button>
          </div>
        </form>
      </Popover>
      {pfarreien === null ? (
        <ListSkeleton />
      ) : pfarreien.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-soft">Noch keine Pfarreien.</p>
      ) : (
        <ul>
          {pfarreien.map((pfarrei) => (
            <PfarreiZeile key={pfarrei.id} pfarrei={pfarrei} onGeaendert={laden} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function PfarreiZeile({
  pfarrei,
  onGeaendert,
}: {
  pfarrei: Pfarrei
  onGeaendert: () => Promise<void>
}) {
  const { showToast } = useToast()
  const [bearbeiten, setBearbeiten] = useState(false)
  const [name, setName] = useState(pfarrei.name)
  const [bildVersion, setBildVersion] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  async function umbenennen() {
    try {
      await pfarreiUmbenennen(pfarrei.id, name)
      setBearbeiten(false)
      showToast('Umbenannt')
      await onGeaendert()
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  async function bildGewaehlt(datei: File | undefined) {
    if (!datei) return
    try {
      await pfarreiBildHochladen(pfarrei.id, datei)
      setBildVersion((v) => v + 1)
      showToast('Bild aktualisiert')
      await onGeaendert()
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  async function bildEntfernen() {
    try {
      await pfarreiBildEntfernen(pfarrei.id)
      showToast('Bild entfernt')
      await onGeaendert()
    } catch (err) {
      showToast(fehlerText(err), 'error')
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pine-tint text-pine-dark">
        {pfarrei.hat_bild ? (
          <img
            src={pfarreiBildUrl(pfarrei.id, bildVersion)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Church className="h-5 w-5" />
        )}
      </span>
      {bearbeiten ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            umbenennen()
          }}
          className="flex flex-1 items-center gap-2"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-9" />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Speichern
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setName(pfarrei.name)
              setBearbeiten(false)
            }}
          >
            Abbrechen
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 font-medium text-ink">{pfarrei.name}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => bildGewaehlt(e.target.files?.[0])}
          />
          <IconButton label="Bild hochladen" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
          </IconButton>
          {pfarrei.hat_bild && (
            <IconButton label="Bild entfernen" onClick={bildEntfernen}>
              <ImageOff className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton label="Umbenennen" onClick={() => setBearbeiten(true)}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <InlineConfirmButton
            confirmLabel="Pfarrei löschen?"
            onConfirm={async () => {
              try {
                await pfarreiLoeschen(pfarrei.id)
                showToast('Pfarrei gelöscht')
                await onGeaendert()
              } catch (err) {
                showToast(fehlerText(err), 'error')
              }
            }}
          />
        </>
      )}
    </li>
  )
}

// --- Nutzer -----------------------------------------------------------------

function NutzerVerwaltung() {
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
