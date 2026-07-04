import { LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-svh">
      <header className="border-b border-line bg-white/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-pine text-sm font-semibold text-paper">
              M
            </span>
            <span className="font-display text-xl font-semibold text-ink">Miniplan</span>
          </Link>
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-ink-soft sm:inline">{user.email}</span>
              <button
                onClick={logout}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-soft transition-colors hover:bg-paper-dim hover:text-ink"
              >
                <LogOut className="h-3.5 w-3.5" />
                Abmelden
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  )
}
