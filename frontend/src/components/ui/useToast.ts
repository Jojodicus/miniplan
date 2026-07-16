import { useContext } from 'react'
import { ToastContext, type ToastContextValue } from './toastContextObject'

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast muss innerhalb eines ToastProvider verwendet werden')
  }
  return ctx
}
