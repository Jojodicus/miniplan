import type { PfarreiRolle } from '../../api/admin'

export const ROLLEN: { wert: PfarreiRolle; label: string }[] = [
  { wert: 'pfarrei_verantwortlicher', label: 'Verantwortlich' },
  { wert: 'betrachter', label: 'Betrachter' },
]
