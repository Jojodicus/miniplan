import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { login as loginRequest, logout as logoutRequest, me, type Nutzer } from '../api/auth'

interface AuthContextValue {
  user: Nutzer | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Nutzer | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await loginRequest(email, password)
    setUser(await me())
  }, [])

  const logout = useCallback(() => {
    logoutRequest().finally(() => setUser(null))
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  }
  return context
}
