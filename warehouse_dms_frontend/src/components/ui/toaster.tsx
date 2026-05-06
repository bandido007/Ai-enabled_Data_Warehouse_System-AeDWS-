import { useToastStore } from '@/hooks/use-toast'

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from './toast'

export function Toaster() {
  const { toasts, remove } = useToastStore()

  return (
    <ToastProvider>
      {toasts.map((toast) => (
        <Toast key={toast.id} open onOpenChange={(open) => !open && remove(toast.id)} variant={toast.variant}>
          <div className="grid gap-1">
            <ToastTitle>{toast.title}</ToastTitle>
            {toast.description ? <ToastDescription>{toast.description}</ToastDescription> : null}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
