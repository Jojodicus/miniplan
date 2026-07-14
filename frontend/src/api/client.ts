export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface ValidationErrorEintrag {
  msg?: unknown
  [key: string]: unknown
}

function detailZuNachricht(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const nachrichten = (detail as ValidationErrorEintrag[]).map((eintrag) =>
      eintrag && typeof eintrag === 'object' && 'msg' in eintrag
        ? String(eintrag.msg)
        : String(eintrag),
    )
    return nachrichten.join('; ') || 'Unbekannter Fehler'
  }
  // z.B. der Typst-Vorschau-Endpunkt: {"detail": {"fehler": ["error: ..."]}}
  if (detail && typeof detail === 'object' && 'fehler' in detail) {
    const fehler = (detail as { fehler: unknown }).fehler
    if (Array.isArray(fehler)) return fehler.map(String).join('; ') || 'Unbekannter Fehler'
  }
  return 'Unbekannter Fehler'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new ApiError(response.status, detailZuNachricht(body.detail))
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
