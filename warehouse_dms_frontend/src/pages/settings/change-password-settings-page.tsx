import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { changeOwnPassword } from '@/lib/queries'

export function ChangePasswordSettingsPage() {
  const { toast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: changeOwnPassword,
    onSuccess: () => {
      toast({ title: 'Password changed', description: 'Your account password has been updated.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (error) => {
      toast({
        title: 'Unable to change password',
        description: error instanceof Error ? error.message : 'Check your current password and try again.',
        variant: 'destructive',
      })
    },
  })

  const mismatch = newPassword && confirmPassword && newPassword !== confirmPassword

  return (
    <div className="space-y-6">
      <PageHeader title="Change Password" subtitle="Update the password for your signed-in account." />

      <Card className="max-w-xl">
        <CardContent className="space-y-5 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-text-primary">Account password</p>
              <p className="text-sm text-text-secondary">Use your current password to confirm this change.</p>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (newPassword !== confirmPassword) {
                toast({ title: 'Passwords do not match', variant: 'destructive' })
                return
              }
              mutation.mutate({ currentPassword, newPassword })
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>

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
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
              {mismatch ? <p className="text-xs font-medium text-semantic-error">Passwords do not match.</p> : null}
            </div>

            <Button
              type="submit"
              disabled={mutation.isPending || !currentPassword || !newPassword || !confirmPassword || Boolean(mismatch)}
            >
              {mutation.isPending ? 'Changing...' : 'Change password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
