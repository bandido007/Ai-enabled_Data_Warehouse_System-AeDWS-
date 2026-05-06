import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: string
  delta: string
  trend?: 'up' | 'down' | 'neutral'
  href?: string
}

export function MetricCard({ label, value, delta, trend = 'neutral', href }: MetricCardProps) {
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  const navigate = useNavigate()

  return (
    <Card
      className={cn(href && 'cursor-pointer transition-shadow hover:shadow-md hover:border-brand-teal/40')}
      onClick={href ? () => navigate(href) : undefined}
    >
      <CardContent className="p-4">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.05em] text-text-tertiary">{label}</div>
        <div className="mb-1 text-2xl font-semibold text-heading text-text-primary">{value}</div>
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              trend === 'up' && 'text-semantic-success',
              trend === 'down' && 'text-semantic-error'
            )}
          />
          <span>{delta}</span>
        </div>
      </CardContent>
    </Card>
  )
}
