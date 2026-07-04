import { api } from './client'

export interface Pfarrei {
  id: number
  name: string
}

export function meinePfarreien(): Promise<Pfarrei[]> {
  return api.get<Pfarrei[]>('/api/pfarreien/mine')
}
