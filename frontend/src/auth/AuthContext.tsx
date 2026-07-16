import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { login as loginRequest, logout as logoutRequest, me, type Nutzer } from '../api/auth'
import { AuthContext } from './authContextObject'

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

  const refreshUser = useCallback(async () => {
    setUser(await me())
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
