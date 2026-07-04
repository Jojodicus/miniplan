import { api } from './client'

export interface Gruppe {
  id: number
  pfarrei_id: number
  name: string
}

export function gruppenListe(pfarreiId: number): Promise<Gruppe[]> {
  return api.get<Gruppe[]>(`/api/pfarreien/${pfarreiId}/gruppen`)
}

export function gruppeErstellen(pfarreiId: number, name: string): Promise<Gruppe> {
  return api.post<Gruppe>(`/api/pfarreien/${pfarreiId}/gruppen`, { name })
}

export function gruppeBearbeiten(
  pfarreiId: number,
  gruppeId: number,
  name: string,
): Promise<Gruppe> {
  return api.put<Gruppe>(`/api/pfarreien/${pfarreiId}/gruppen/${gruppeId}`, { name })
}

export function gruppeLoeschen(pfarreiId: number, gruppeId: number): Promise<void> {
  return api.delete<void>(`/api/pfarreien/${pfarreiId}/gruppen/${gruppeId}`)
}
