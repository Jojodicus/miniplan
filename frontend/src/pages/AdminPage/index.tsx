import { ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { AppShell } from '../../components/layout/AppShell'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { NutzerSection } from './NutzerSection'
import { PfarreienSection } from './PfarreienSection'

export function AdminPage() {
  useDocumentTitle('Admin')
  const { user } = useAuth()
  if (user && !user.ist_admin) return <Navigate to="/" replace />

  return (
    <AppShell>
      <div className="animate-rise">
        <h1 className="flex items-center gap-2 font-display text-3xl font-semibold text-ink">
          <ShieldCheck className="h-7 w-7 text-pine" />
          Administration
        </h1>
        <div className="mt-8 flex flex-col gap-8">
          <PfarreienSection />
          <NutzerSection />
        </div>
      </div>
    </AppShell>
  )
}
