import { AlertCircle } from 'lucide-react'

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-wine/25 bg-wine-tint px-3 py-2 text-sm text-wine"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
