import { api } from './client'

export type EinladungRolle = 'pfarrei_verantwortlicher' | 'betrachter'

export interface Einladung {
  id: number
  token: string
  pfarrei_id: number
  rolle: EinladungRolle
  erstellt_am: string
  laeuft_ab_am: string
  eingeloest_am: string | null
}

export interface EinladungVorschau {
  pfarrei_name: string
  rolle: EinladungRolle
  gueltig: boolean
}

export function einladungenListe(pfarreiId: number): Promise<Einladung[]> {
  return api.get<Einladung[]>(`/api/pfarreien/${pfarreiId}/einladungen`)
}

export function einladungErstellen(pfarreiId: number): Promise<Einladung> {
  return api.post<Einladung>(`/api/pfarreien/${pfarreiId}/einladungen`, {
    rolle: 'betrachter',
  })
}

export function einladungWiderrufen(pfarreiId: number, einladungId: number): Promise<void> {
  return api.delete<void>(`/api/pfarreien/${pfarreiId}/einladungen/${einladungId}`)
}

export function einladungVorschau(token: string): Promise<EinladungVorschau> {
  return api.get<EinladungVorschau>(`/api/einladungen/${token}`)
}

export function einladungAnnehmen(
  token: string,
  email: string,
  password: string,
): Promise<{ access_token: string; token_type: string }> {
  return api.post(`/api/einladungen/${token}/annehmen`, { email, password })
}
