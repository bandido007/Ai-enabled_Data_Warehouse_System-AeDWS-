import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { resetPassword } from '@/lib/queries'

export function ChangePasswordPage() {
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      toast({
        title: 'Password changed',
        description: 'You can now log in with your new password.',
      })
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error) => {
      toast({
        title: 'Unable to change password',
        description: error instanceof Error ? error.message : 'Check the reset link and try again.',
        variant: 'destructive',
      })
    },
  })

  const mismatch = newPassword && confirmPassword && newPassword !== confirmPassword

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-text-primary">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Link to="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-brand-teal">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="mb-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">Change password</h1>
          <p className="mt-1 text-sm text-text-secondary">Set a new password using your reset link.</p>
        </div>

        {!token ? (
          <div className="rounded-lg border border-semantic-error bg-semantic-error-bg px-4 py-3 text-sm text-semantic-error">
            This reset link is missing a token. Request a new password reset link.
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (newPassword !== confirmPassword) {
                toast({ title: 'Passwords do not match', variant: 'destructive' })
                return
              }
              mutation.mutate({ token, newPassword })
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
              {mismatch ? <p className="text-xs font-medium text-semantic-error">Passwords do not match.</p> : null}
            </div>

            <Button type="submit" className="w-full" disabled={mutation.isPending || !newPassword || !confirmPassword || Boolean(mismatch)}>
              {mutation.isPending ? 'Changing...' : 'Change password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
