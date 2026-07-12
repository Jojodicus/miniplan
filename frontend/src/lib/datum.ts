export const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

export function monatsName(monat: number): string {
  return MONATE[monat - 1] ?? String(monat)
}

export function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export function formatDatumMitWochentag(iso: string): string {
  const [jahr, monat, tag] = iso.split('-').map(Number)
  const wochentagIndex = (new Date(jahr, monat - 1, tag).getDay() + 6) % 7
  return `${WOCHENTAGE[wochentagIndex]}, ${formatDatum(iso)}`
}
