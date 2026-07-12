import { api } from './client'

export interface Token {
  access_token: string
  token_type: string
}

export interface NutzerPfarreiRolle {
  pfarrei_id: number
  rolle: 'pfarrei_verantwortlicher' | 'betrachter'
}

export interface Nutzer {
  id: number
  email: string
  ist_admin: boolean
  pfarrei_rollen: NutzerPfarreiRolle[]
}

export function login(email: string, password: string): Promise<Token> {
  return api.post<Token>('/api/auth/login', { email, password })
}

export function logout(): Promise<void> {
  return api.post<void>('/api/auth/logout')
}

export function me(): Promise<Nutzer> {
  return api.get<Nutzer>('/api/auth/me')
}

export function eigeneEmailAendern(email: string): Promise<Nutzer> {
  return api.put<Nutzer>('/api/auth/me/email', { email })
}

export function eigenesPasswortAendern(
  aktuellesPasswort: string,
  neuesPasswort: string,
): Promise<void> {
  return api.post<void>('/api/auth/me/passwort', {
    aktuelles_passwort: aktuellesPasswort,
    neues_passwort: neuesPasswort,
  })
}
