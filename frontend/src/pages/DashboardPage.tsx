import { useAuth } from '../auth/AuthContext'

export function DashboardPage() {
  const { user, logout } = useAuth()

  return (
    <main>
      <h1>Miniplan</h1>
      <p>Angemeldet als {user?.email}</p>
      <button onClick={logout}>Abmelden</button>
    </main>
  )
}
