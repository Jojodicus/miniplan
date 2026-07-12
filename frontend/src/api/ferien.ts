import { api } from './client'

export interface Ferienzeitraum {
  id: number
  name: string
  start_datum: string
  end_datum: string
  schuljahr: string
}

export function ferienListe(pfarreiId: number, jahr?: number): Promise<Ferienzeitraum[]> {
  // `jahr` löst serverseitig best-effort einen Sync für dieses Jahr aus, falls es noch nicht
  // gecached ist (siehe `sync_ferien_falls_fehlend`) - so bleiben Ferien ohne manuellen
  // "Aktualisieren"-Klick aktuell, z.B. beim Öffnen eines neuen Kalendermonats.
  const query = jahr ? `?jahr=${jahr}` : ''
  return api.get<Ferienzeitraum[]>(`/api/pfarreien/${pfarreiId}/ferien${query}`)
}

export function ferienAktualisieren(pfarreiId: number): Promise<Ferienzeitraum[]> {
  return api.post<Ferienzeitraum[]>(`/api/pfarreien/${pfarreiId}/ferien/aktualisieren`)
}
