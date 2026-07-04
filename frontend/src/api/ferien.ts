import { api } from './client'

export interface Ferienzeitraum {
  id: number
  name: string
  start_datum: string
  end_datum: string
  schuljahr: string
}

export function ferienListe(pfarreiId: number): Promise<Ferienzeitraum[]> {
  return api.get<Ferienzeitraum[]>(`/api/pfarreien/${pfarreiId}/ferien`)
}

export function ferienAktualisieren(pfarreiId: number): Promise<Ferienzeitraum[]> {
  return api.post<Ferienzeitraum[]>(`/api/pfarreien/${pfarreiId}/ferien/aktualisieren`)
}
