import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface BoundaryProps {
  children: ReactNode
  title: string
  description: string
  actionLabel: string
}

interface BoundaryState {
  hasError: boolean
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application render error', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
          <Card className="w-full max-w-xl">
            <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-semantic-error-bg text-semantic-error">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-text-primary">{this.props.title}</h1>
                <p className="text-sm leading-6 text-text-secondary">{this.props.description}</p>
              </div>
              <Button type="button" onClick={this.handleReset}>
                <RefreshCw className="h-4 w-4" />
                {this.props.actionLabel}
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <Boundary
      title={t('errors.boundary.title')}
      description={t('errors.boundary.description')}
      actionLabel={t('errors.boundary.action')}
    >
      {children}
    </Boundary>
  )
}
