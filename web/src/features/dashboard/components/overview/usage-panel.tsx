/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { MessageSquareText, RefreshCw, TrendingUp } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatQuota } from '@/lib/format'
import type { TimeGranularity } from '@/lib/time'

import { useOverviewUsage } from '../../hooks/use-overview-usage'
import { calculateDashboardStats } from '../../lib/stats'
import type { FlowMetric } from '../../types'

const UsageChart = lazy(() =>
  import('../models/consumption-distribution-chart').then((module) => ({
    default: module.ConsumptionDistributionChart,
  }))
)
const METRICS = [
  { value: 'quota', label: 'Consumption share' },
  { value: 'requests', label: 'Request share' },
  { value: 'tokens', label: 'Token share' },
] as const

export function UsagePanel() {
  const { t } = useTranslation()
  const usage = useOverviewUsage()
  const [metric, setMetric] = useState<FlowMetric>('quota')
  const [granularity, setGranularity] = useState<TimeGranularity>('day')
  const stats = useMemo(
    () => calculateDashboardStats(usage.data ?? []),
    [usage.data]
  )

  return (
    <section
      aria-label={t('Model usage statistics')}
      className='bg-card flex min-w-0 flex-col rounded-2xl border p-4 sm:p-5'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h3 className='flex items-center gap-2 text-sm font-semibold'>
          <TrendingUp className='size-[18px]' aria-hidden='true' />
          {t('Model usage statistics')}
        </h3>
        <div className='flex items-center gap-2'>
          <ToggleGroup
            size='sm'
            value={[granularity]}
            onValueChange={(values) => {
              if (values[0]) setGranularity(values[0] as TimeGranularity)
            }}
            aria-label={t('Time Granularity')}
            className='bg-muted/60'
          >
            <ToggleGroupItem value='hour' aria-label={t('Hour')}>
              {t('Hour')}
            </ToggleGroupItem>
            <ToggleGroupItem value='day' aria-label={t('Day')}>
              {t('Day')}
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              void usage.refetch()
            }}
            disabled={usage.isFetching}
          >
            <RefreshCw className='size-3.5' aria-hidden='true' />
            {t('Refresh')}
          </Button>
        </div>
      </div>
      <Tabs
        value={metric}
        onValueChange={(value) => setMetric(value as FlowMetric)}
        className='mt-4 flex-1'
      >
        <TabsList
          aria-label={t('Model usage statistics')}
          className='max-w-full rounded-full border bg-transparent group-data-horizontal/tabs:h-9'
        >
          {METRICS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className='data-active:bg-foreground data-active:text-background rounded-full px-3 text-xs data-active:shadow-none'
            >
              {t(item.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className='text-muted-foreground mt-3 text-xs'>
          {t('Last 7 days: {{total}}; daily average {{average}}', {
            total:
              usage.isError && !usage.data
                ? '—'
                : formatQuota(stats.totalQuota),
            average:
              usage.isError && !usage.data
                ? '—'
                : formatQuota(stats.totalQuota / 7),
          })}
        </p>
        {METRICS.map((item) => (
          <TabsContent
            key={item.value}
            value={item.value}
            className='mt-1 min-h-[340px] sm:min-h-[420px]'
          >
            {usage.isPending ? (
              <Skeleton className='mt-5 h-[300px] w-full sm:h-96' />
            ) : null}
            {usage.isError && !usage.data ? (
              <ErrorState
                onRetry={() => {
                  void usage.refetch()
                }}
                className='min-h-[340px] sm:min-h-[420px]'
              />
            ) : null}
            {!usage.isPending &&
            !(usage.isError && !usage.data) &&
            !usage.data?.length ? (
              <EmptyState
                icon={MessageSquareText}
                className='min-h-[340px] sm:min-h-[420px]'
              />
            ) : null}
            {Boolean(usage.data?.length) && (
              <Suspense
                fallback={<Skeleton className='h-[300px] w-full sm:h-96' />}
              >
                <UsageChart
                  data={usage.data ?? []}
                  metric={metric}
                  timeGranularity={granularity}
                  embedded
                  defaultChartType='area'
                />
              </Suspense>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
