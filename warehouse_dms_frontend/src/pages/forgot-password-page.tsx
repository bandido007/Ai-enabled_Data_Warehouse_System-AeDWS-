import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { forgotPassword } from '@/lib/queries'

export function ForgotPasswordPage() {
  const { toast } = useToast()
  const [email, setEmail] = useState('')

  const mutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: () => {
      toast({
        title: 'Reset request received',
        description: 'If that email exists, a reset link will be sent.',
      })
    },
    onError: (error) => {
      toast({
        title: 'Unable to request reset',
        description: error instanceof Error ? error.message : 'Try again in a moment.',
        variant: 'destructive',
      })
    },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-text-primary">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Link to="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-brand-teal">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="mb-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Mail className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">Forgot password</h1>
          <p className="mt-1 text-sm text-text-secondary">Enter your account email to request a reset link.</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate(email.trim())
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending || !email.trim()}>
            {mutation.isPending ? 'Sending...' : 'Send reset link'}
          </Button>
        </form>
      </div>
    </div>
  )
}
