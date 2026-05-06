import { ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DocumentsStatusBar } from '@/components/regulator/documents-status-bar'
import { RiskBadge } from '@/components/regulator/risk-badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRelativeTime } from '@/lib/utils'
import type { Warehouse, WarehouseStatistics } from '@/types/api'

export interface RegulatoryWarehouseRow {
  warehouse: Warehouse
  statistics: WarehouseStatistics | null
}

export function WarehouseRankingsTable({
  rows,
  onSelect,
}: {
  rows: RegulatoryWarehouseRow[]
  onSelect: (warehouseId: number) => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('regulator.dashboard.table.position')}</TableHead>
          <TableHead>{t('regulator.dashboard.table.warehouse')}</TableHead>
          <TableHead>{t('regulator.dashboard.table.score')}</TableHead>
          <TableHead>{t('regulator.dashboard.table.documents')}</TableHead>
          <TableHead>{t('regulator.dashboard.table.activity')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={row.warehouse.id} className="cursor-pointer" onClick={() => onSelect(row.warehouse.id)}>
            <TableCell className="font-mono text-xs text-text-tertiary">{String(index + 1).padStart(2, '0')}</TableCell>
            <TableCell>
              <div className="font-medium text-text-primary">{row.warehouse.name}</div>
              <div className="mt-0.5 text-xs text-text-tertiary">
                {row.statistics?.region || row.warehouse.regionName || '—'}
                {row.warehouse.tenantName ? ` · ${row.warehouse.tenantName}` : ''}
              </div>
            </TableCell>
            <TableCell>
              <div className="text-lg font-semibold text-text-primary">
                {row.statistics?.currentRankingScore == null ? '—' : row.statistics.currentRankingScore.toFixed(1)}
              </div>
              <div className="mt-1">
                <RiskBadge riskCategory={row.statistics?.riskCategory} />
              </div>
            </TableCell>
            <TableCell>
              <DocumentsStatusBar counts={row.statistics?.documentsByStatus ?? {}} />
            </TableCell>
            <TableCell>
              <div className="text-sm text-text-secondary">
                {formatRelativeTime(row.statistics?.lastActivityAt, i18n.language)}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function WarehouseSortButton({ label }: { label: string }) {
  return (
    <Button type="button" size="sm" variant="secondary">
      <ArrowUpDown className="h-4 w-4" />
      {label}
    </Button>
  )
}
