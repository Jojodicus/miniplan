import type { Nutzer } from './auth'
import { api } from './client'
import type { Bundesland, Pfarrei } from './pfarreien'

export type PfarreiRolle = 'pfarrei_verantwortlicher' | 'betrachter'

export function nutzerListe(): Promise<Nutzer[]> {
  return api.get<Nutzer[]>('/api/admin/nutzer')
}

export function nutzerAnlegen(daten: {
  email: string
  password: string
  ist_admin: boolean
}): Promise<Nutzer> {
  return api.post<Nutzer>('/api/admin/nutzer', daten)
}

export function nutzerBearbeiten(
  nutzerId: number,
  daten: { email: string; ist_admin: boolean },
): Promise<Nutzer> {
  return api.put<Nutzer>(`/api/admin/nutzer/${nutzerId}`, daten)
}

export function nutzerPasswortZuruecksetzen(nutzerId: number, password: string): Promise<void> {
  return api.post<void>(`/api/admin/nutzer/${nutzerId}/passwort`, { password })
}

export function nutzerLoeschen(nutzerId: number): Promise<void> {
  return api.delete<void>(`/api/admin/nutzer/${nutzerId}`)
}

export function nutzerRolleSetzen(
  nutzerId: number,
  pfarreiId: number,
  rolle: PfarreiRolle,
): Promise<Nutzer> {
  return api.put<Nutzer>(`/api/admin/nutzer/${nutzerId}/pfarrei-rollen`, {
    pfarrei_id: pfarreiId,
    rolle,
  })
}

export function nutzerRolleEntfernen(nutzerId: number, pfarreiId: number): Promise<Nutzer> {
  return api.delete<Nutzer>(`/api/admin/nutzer/${nutzerId}/pfarrei-rollen/${pfarreiId}`)
}

export function allePfarreien(): Promise<Pfarrei[]> {
  return api.get<Pfarrei[]>('/api/pfarreien')
}

export function pfarreiAnlegen(daten: {
  name: string
  bundesland?: Bundesland
}): Promise<Pfarrei> {
  return api.post<Pfarrei>('/api/admin/pfarreien', daten)
}

export function pfarreiUmbenennen(pfarreiId: number, name: string): Promise<Pfarrei> {
  return api.put<Pfarrei>(`/api/admin/pfarreien/${pfarreiId}`, { name })
}

export function pfarreiLoeschen(pfarreiId: number): Promise<void> {
  return api.delete<void>(`/api/admin/pfarreien/${pfarreiId}`)
}
