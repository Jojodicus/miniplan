import { Church, ImageOff, Pencil, Plus, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { allePfarreien, pfarreiAnlegen, pfarreiLoeschen, pfarreiUmbenennen } from '../../api/admin'
import { fehlerText } from '../../api/client'
import {
  pfarreiBildEntfernen,
  pfarreiBildHochladen,
  pfarreiBildUrl,
  type Pfarrei,
} from '../../api/pfarreien'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Input, Label } from '../../components/ui/FormField'
import { IconButton } from '../../components/ui/IconButton'
import { InlineConfirmButton } from '../../components/ui/InlineConfirmButton'
import { ListSkeleton } from '../../components/ui/Skeleton'
import { Popover } from '../../components/ui/Popover'
import { useToast } from '../../components/ui/useToast'

export function PfarreienSection() {
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
