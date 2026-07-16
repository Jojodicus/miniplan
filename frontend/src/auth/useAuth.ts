import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './authContextObject'

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  }
  return context
}
