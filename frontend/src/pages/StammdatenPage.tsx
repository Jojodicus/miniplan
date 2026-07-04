import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  dienstTypErstellen,
  dienstTypLoeschen,
  dienstTypenListe,
  type DienstTyp,
  type DienstTypEingabe,
} from '../api/dienstTypen'
import {
  gruppeBearbeiten,
  gruppeErstellen,
  gruppeLoeschen,
  gruppenListe,
  type Gruppe,
} from '../api/gruppen'
import {
  miniErstellen,
  miniLoeschen,
  minisListe,
  FILTERTAGS,
  type Filtertag,
  type Mini,
} from '../api/minis'

function fehlerText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

function GruppenSection({
  pfarreiId,
  onGruppenChange,
}: {
  pfarreiId: number
  onGruppenChange: (gruppen: Gruppe[]) => void
}) {
  const [gruppen, setGruppen] = useState<Gruppe[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const reload = useCallback(() => {
    gruppenListe(pfarreiId).then((geladen) => {
      setGruppen(geladen)
      onGruppenChange(geladen)
    })
  }, [pfarreiId, onGruppenChange])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    try {
      await gruppeErstellen(pfarreiId, name)
      setName('')
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen der Gruppe'))
    }
  }

  async function handleUpdate(event: SubmitEvent) {
    event.preventDefault()
    if (editId === null) return
    setError(null)
    try {
      await gruppeBearbeiten(pfarreiId, editId, editName)
      setEditId(null)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Bearbeiten der Gruppe'))
    }
  }

  async function handleDelete(gruppeId: number) {
    setError(null)
    try {
      await gruppeLoeschen(pfarreiId, gruppeId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen der Gruppe'))
    }
  }

  return (
    <section>
      <h2>Gruppen</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {gruppen.map((gruppe) => (
          <li key={gruppe.id}>
            {editId === gruppe.id ? (
              <form onSubmit={handleUpdate}>
                <label>
                  Gruppenname bearbeiten
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </label>
                <button type="submit">Speichern</button>
                <button type="button" onClick={() => setEditId(null)}>
                  Abbrechen
                </button>
              </form>
            ) : (
              <>
                <span>{gruppe.name}</span>
                <button
                  onClick={() => {
                    setEditId(gruppe.id)
                    setEditName(gruppe.name)
                  }}
                >
                  Bearbeiten
                </button>
                <button onClick={() => handleDelete(gruppe.id)}>Löschen</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={handleCreate}>
        <label>
          Neue Gruppe
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button type="submit">Gruppe anlegen</button>
      </form>
    </section>
  )
}

function filtertagLabel(tag: Filtertag): string {
  return { grundschueler: 'Grundschüler', schueler: 'Schüler', arbeiter: 'Arbeiter' }[tag]
}

function FiltertagCheckboxen({
  ausgewaehlt,
  onChange,
  idPrefix,
}: {
  ausgewaehlt: Filtertag[]
  onChange: (tags: Filtertag[]) => void
  idPrefix: string
}) {
  function toggle(tag: Filtertag) {
    if (ausgewaehlt.includes(tag)) {
      onChange(ausgewaehlt.filter((t) => t !== tag))
    } else {
      onChange([...ausgewaehlt, tag])
    }
  }

  return (
    <fieldset>
      <legend>Filtertags</legend>
      {FILTERTAGS.map((tag) => (
        <label key={tag} htmlFor={`${idPrefix}-${tag}`}>
          <input
            id={`${idPrefix}-${tag}`}
            type="checkbox"
            checked={ausgewaehlt.includes(tag)}
            onChange={() => toggle(tag)}
          />
          {filtertagLabel(tag)}
        </label>
      ))}
    </fieldset>
  )
}

function MinisSection({ pfarreiId, gruppen }: { pfarreiId: number; gruppen: Gruppe[] }) {
  const [minis, setMinis] = useState<Mini[]>([])
  const [name, setName] = useState('')
  const [gruppeId, setGruppeId] = useState<number | ''>('')
  const [filtertags, setFiltertags] = useState<Filtertag[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    minisListe(pfarreiId).then(setMinis)
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (gruppeId === '' && gruppen.length > 0) {
      setGruppeId(gruppen[0].id)
    }
  }, [gruppen, gruppeId])

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    if (gruppeId === '') return
    try {
      await miniErstellen(pfarreiId, { name, gruppe_id: gruppeId, filtertags })
      setName('')
      setFiltertags([])
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Minis'))
    }
  }

  async function handleDelete(miniId: number) {
    setError(null)
    try {
      await miniLoeschen(pfarreiId, miniId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Minis'))
    }
  }

  function gruppenName(id: number): string {
    return gruppen.find((g) => g.id === id)?.name ?? '?'
  }

  return (
    <section>
      <h2>Minis</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {minis.map((mini) => (
          <li key={mini.id}>
            <span>
              {mini.name} ({gruppenName(mini.gruppe_id)})
              {mini.filtertags.length > 0 && ` – ${mini.filtertags.map(filtertagLabel).join(', ')}`}
            </span>
            <button onClick={() => handleDelete(mini.id)}>Löschen</button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleCreate}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Gruppe
          <select
            value={gruppeId}
            onChange={(e) => setGruppeId(Number(e.target.value))}
            required
          >
            {gruppen.map((gruppe) => (
              <option key={gruppe.id} value={gruppe.id}>
                {gruppe.name}
              </option>
            ))}
          </select>
        </label>
        <FiltertagCheckboxen
          ausgewaehlt={filtertags}
          onChange={setFiltertags}
          idPrefix="mini-neu"
        />
        <button type="submit" disabled={gruppen.length === 0}>
          Mini anlegen
        </button>
      </form>
    </section>
  )
}

function DienstTypenSection({ pfarreiId, gruppen }: { pfarreiId: number; gruppen: Gruppe[] }) {
  const [dienstTypen, setDienstTypen] = useState<DienstTyp[]>([])
  const [name, setName] = useState('')
  const [standardAnzahl, setStandardAnzahl] = useState(1)
  const [erforderlicheTags, setErforderlicheTags] = useState<Filtertag[]>([])
  const [erlaubteGruppenIds, setErlaubteGruppenIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    dienstTypenListe(pfarreiId).then(setDienstTypen)
  }, [pfarreiId])

  useEffect(() => {
    reload()
  }, [reload])

  function toggleGruppe(gruppeId: number) {
    setErlaubteGruppenIds((aktuell) =>
      aktuell.includes(gruppeId)
        ? aktuell.filter((id) => id !== gruppeId)
        : [...aktuell, gruppeId],
    )
  }

  async function handleCreate(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    const daten: DienstTypEingabe = {
      name,
      standard_anzahl: standardAnzahl,
      erforderliche_filtertags: erforderlicheTags,
      erlaubte_gruppen_ids: erlaubteGruppenIds,
    }
    try {
      await dienstTypErstellen(pfarreiId, daten)
      setName('')
      setStandardAnzahl(1)
      setErforderlicheTags([])
      setErlaubteGruppenIds([])
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Anlegen des Dienst-Typs'))
    }
  }

  async function handleDelete(dienstTypId: number) {
    setError(null)
    try {
      await dienstTypLoeschen(pfarreiId, dienstTypId)
      reload()
    } catch (err) {
      setError(fehlerText(err, 'Fehler beim Löschen des Dienst-Typs'))
    }
  }

  return (
    <section>
      <h2>Dienst-Typen</h2>
      {error && <p role="alert">{error}</p>}
      <ul>
        {dienstTypen.map((dienstTyp) => (
          <li key={dienstTyp.id}>
            <span>
              {dienstTyp.name} ({dienstTyp.standard_anzahl}
              {dienstTyp.erlaubte_gruppen.length > 0 &&
                `, nur ${dienstTyp.erlaubte_gruppen.map((g) => g.name).join(', ')}`}
              {dienstTyp.erforderliche_filtertags.length > 0 &&
                `, mind. ${dienstTyp.erforderliche_filtertags.map(filtertagLabel).join(', ')}`}
              )
            </span>
            <button onClick={() => handleDelete(dienstTyp.id)}>Löschen</button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleCreate}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Standard-Anzahl
          <input
            type="number"
            min={1}
            value={standardAnzahl}
            onChange={(e) => setStandardAnzahl(Number(e.target.value))}
            required
          />
        </label>
        <fieldset>
          <legend>Erlaubte Gruppen (leer = alle)</legend>
          {gruppen.map((gruppe) => (
            <label key={gruppe.id} htmlFor={`dienst-typ-gruppe-${gruppe.id}`}>
              <input
                id={`dienst-typ-gruppe-${gruppe.id}`}
                type="checkbox"
                checked={erlaubteGruppenIds.includes(gruppe.id)}
                onChange={() => toggleGruppe(gruppe.id)}
              />
              {gruppe.name}
            </label>
          ))}
        </fieldset>
        <FiltertagCheckboxen
          ausgewaehlt={erforderlicheTags}
          onChange={setErforderlicheTags}
          idPrefix="dienst-typ-neu"
        />
        <button type="submit">Dienst-Typ anlegen</button>
      </form>
    </section>
  )
}

export function StammdatenPage() {
  const { pfarreiId } = useParams<{ pfarreiId: string }>()
  const id = Number(pfarreiId)
  const [gruppen, setGruppen] = useState<Gruppe[]>([])

  return (
    <main>
      <Link to="/">Zurück zur Übersicht</Link>
      <h1>Stammdaten</h1>
      <GruppenSection pfarreiId={id} onGruppenChange={setGruppen} />
      <MinisSection pfarreiId={id} gruppen={gruppen} />
      <DienstTypenSection pfarreiId={id} gruppen={gruppen} />
    </main>
  )
}
