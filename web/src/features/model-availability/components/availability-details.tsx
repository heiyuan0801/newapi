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
import { useQuery } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  StaticDataTable,
  staticDataTableClassNames as tableStyles,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { GroupBadge } from '@/components/group-badge'
import { LoadingState } from '@/components/loading-state'
import {
  getPerfMetrics,
  getPerfMetricsSummary,
} from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerformanceSeriesPoint } from '@/features/performance-metrics/types'
import { toIntlLocale } from '@/i18n/languages'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  getAvailabilityMonitor,
  getProbeMetrics,
  type AvailabilitySource,
} from '../api'
import {
  formatSuccessRate,
  getAvailabilityStatus,
  type AvailabilityCatalogModel,
} from '../lib/availability'
import { AvailabilityTimeline } from './availability-timeline'

type AvailabilityDetailsProps = {
  model: AvailabilityCatalogModel | null
  group: string
  hours: 24 | 168
  source?: AvailabilitySource
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AvailabilityDetails(props: AvailabilityDetailsProps) {
  const { t, i18n } = useTranslation()
  const modelName = props.model?.model_name ?? ''
  const isProbe = props.source === 'probe'
  const metrics = useQuery({
    queryKey: [
      'model-availability',
      'details',
      modelName,
      props.hours,
      props.group,
      isProbe ? 'probe' : 'real',
    ],
    queryFn: async () =>
      requireServerSuccess(
        isProbe
          ? await getProbeMetrics(modelName, props.group, props.hours)
          : await getPerfMetrics(modelName, props.hours, props.group)
      ),
    enabled: props.open && Boolean(modelName),
    staleTime: 60 * 1000,
    meta: { errorToast: false },
  })
  const hourly = useQuery({
    queryKey: [
      isProbe
        ? 'model-availability-probe-summary'
        : 'model-availability-summary',
      props.hours,
    ],
    queryFn: async () => {
      if (isProbe) {
        const result = requireServerSuccess(
          await getAvailabilityMonitor(props.hours)
        )
        return { success: true, data: result.data.probe }
      }
      return requireServerSuccess(
        await getPerfMetricsSummary(props.hours, undefined, true)
      )
    },
    enabled: props.open && Boolean(modelName),
    staleTime: 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })
  if (!props.model) return null

  const data = metrics.data?.data
  const summary = data?.summary
  const start = data?.window_start
  const end = data?.window_end
  const hasWindow =
    typeof start === 'number' &&
    typeof end === 'number' &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start > 0 &&
    end >= start
  const hourlyData = hourly.data?.data
  const hourlyStart = hourlyData?.window_start
  const hourlyEnd = hourlyData?.window_end
  const hasHourlyWindow =
    typeof hourlyStart === 'number' &&
    typeof hourlyEnd === 'number' &&
    Number.isFinite(hourlyStart) &&
    Number.isFinite(hourlyEnd) &&
    hourlyStart > 0 &&
    hourlyEnd >= hourlyStart
  const hourlySeries =
    hourlyData?.group_models?.find(
      (item) => item.model_name === modelName && item.group === props.group
    )?.recent_success_series ?? []
  const series = (data?.series ?? [])
    .filter(
      (point) =>
        Number.isFinite(point.ts) &&
        point.ts > 0 &&
        (!hasWindow || (point.ts >= start && point.ts <= end))
    )
    .sort((a, b) => b.ts - a.ts)
  const successRate = summary?.success_rate
  const hasSummary = getAvailabilityStatus(successRate) !== 'unknown'
  const dateFormat = new Intl.DateTimeFormat(
    toIntlLocale(i18n.resolvedLanguage || i18n.language),
    {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
  )

  let content: ReactNode
  if (metrics.isPending) {
    content = (
      <div role='status' aria-live='polite'>
        <LoadingState />
      </div>
    )
  } else if (metrics.isError) {
    content = (
      <ErrorState
        title={t('Unable to load model availability.')}
        onRetry={() => void metrics.refetch()}
      />
    )
  } else if (!hasSummary && series.length === 0) {
    content = (
      <EmptyState
        title={t('No samples')}
        description={
          isProbe
            ? t(
                'No probes were recorded for this model in the selected period.'
              )
            : t('No calls were recorded for this model in the selected period.')
        }
      />
    )
  } else {
    content = (
      <>
        <dl
          aria-label={t('Overview')}
          className={cn(
            'grid grid-cols-1 gap-3',
            isProbe ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
          )}
        >
          <div className='flex flex-col gap-2 rounded-xl border p-4'>
            <dt className='text-muted-foreground text-xs'>
              {t('Success rate')}
            </dt>
            <dd
              className={cn(
                'text-xl font-semibold tabular-nums',
                getSuccessRateTextClass(
                  hasSummary ? (successRate ?? Number.NaN) : Number.NaN
                )
              )}
            >
              {formatSuccessRate(successRate)}
            </dd>
          </div>
          <div className='flex flex-col gap-2 rounded-xl border p-4'>
            <dt className='text-muted-foreground text-xs'>
              {t('Average latency')}
            </dt>
            <dd className='text-xl font-semibold tabular-nums'>
              {formatLatency(summary?.avg_latency_ms ?? Number.NaN)}
            </dd>
          </div>
          {!isProbe && (
            <div className='flex flex-col gap-2 rounded-xl border p-4'>
              <dt className='text-muted-foreground text-xs'>
                {t('Sustained tokens per second')}
              </dt>
              <dd className='text-xl font-semibold tabular-nums'>
                {formatThroughput(summary?.avg_tps ?? Number.NaN)}
              </dd>
            </div>
          )}
        </dl>

        <section className='flex min-w-0 flex-col gap-3'>
          <h3 className='text-sm font-semibold'>{t('Hourly success rate')}</h3>
          {hourly.isPending && (
            <div role='status' aria-label={t('Hourly success rate')}>
              <LoadingState inline message={t('Loading...')} />
            </div>
          )}
          {hourly.isError && (
            <ErrorState
              className='min-h-32'
              title={t('Unable to load hourly availability.')}
              onRetry={() => void hourly.refetch()}
            />
          )}
          {!hourly.isPending && !hourly.isError && hasHourlyWindow && (
            <>
              <AvailabilityTimeline
                series={hourlySeries}
                windowStart={hourlyStart}
                windowEnd={hourlyEnd}
                modelName={modelName}
              />
              <p className='text-muted-foreground text-xs'>
                {t('Statistics window')}:{' '}
                {dateFormat.format(hourlyStart * 1000)}
                {' – '}
                {dateFormat.format(hourlyEnd * 1000)}
              </p>
            </>
          )}
        </section>

        <p className='text-muted-foreground text-xs leading-5'>
          {isProbe
            ? t('Probe results do not include real user requests.')
            : t(
                'Success rate excludes business rejections and includes the current partial hour.'
              )}
        </p>

        {series.length > 0 && (
          <AvailabilitySamplesTable
            key={JSON.stringify([modelName, props.hours, props.group, isProbe])}
            series={series}
            dateFormat={dateFormat}
            showThroughput={!isProbe}
          />
        )}
      </>
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => props.onOpenChange(open)}
      title={t('Model availability details')}
      description={
        <span className='flex min-w-0 flex-wrap items-center gap-2'>
          <span className='font-mono break-all'>{modelName}</span>{' '}
          <span>{isProbe ? t('Active probes') : t('Real requests')}</span>{' '}
          <span className='inline-flex min-w-0 items-center gap-1'>
            {t('Group')}: <GroupBadge group={props.group} />
          </span>
        </span>
      }
      contentClassName='sm:max-w-3xl'
      descriptionClassName='pr-7 text-xs sm:text-sm'
      bodyClassName='flex min-w-0 flex-col gap-5'
    >
      {content}
    </Dialog>
  )
}

function AvailabilitySamplesTable(props: {
  series: PerformanceSeriesPoint[]
  dateFormat: Intl.DateTimeFormat
  showThroughput: boolean
}) {
  const { t } = useTranslation()
  const [pageIndex, setPageIndex] = useState(0)
  const currentPageIndex = Math.min(
    pageIndex,
    Math.max(0, Math.ceil(props.series.length / 50) - 1)
  )
  const table = useReactTable({
    data: props.series,
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    state: { pagination: { pageIndex: currentPageIndex, pageSize: 50 } },
    onPaginationChange: (updater) => {
      const previous = { pageIndex: currentPageIndex, pageSize: 50 }
      const next = typeof updater === 'function' ? updater(previous) : updater
      setPageIndex(next.pageIndex)
    },
  })

  return (
    <div className='flex min-w-0 flex-col gap-3'>
      <StaticDataTable
        className='max-h-96 overflow-y-auto rounded-xl'
        tableClassName='min-w-[32rem]'
        tableProps={{ 'aria-label': t('Metrics samples') }}
        data={table.getRowModel().rows.map((row) => row.original)}
        getRowKey={(point) => point.ts}
        headerRowClassName={tableStyles.compactHeaderRow}
        columns={[
          {
            id: 'time',
            header: t('Sample time'),
            className: tableStyles.compactHeaderCell,
            cellClassName: tableStyles.compactCell,
            cell: (point) => props.dateFormat.format(point.ts * 1000),
          },
          {
            id: 'success',
            header: t('Success rate'),
            className: tableStyles.compactHeaderCellRight,
            cellClassName: tableStyles.compactNumericCell,
            cell: (point) => {
              if (getAvailabilityStatus(point.success_rate) === 'unknown') {
                return t('No samples')
              }
              return (
                <span className={getSuccessRateTextClass(point.success_rate)}>
                  {formatSuccessRate(point.success_rate)}
                </span>
              )
            },
          },
          {
            id: 'latency',
            header: t('Average latency'),
            className: tableStyles.compactHeaderCellRight,
            cellClassName: tableStyles.compactNumericCell,
            cell: (point) => formatLatency(point.avg_latency_ms),
          },
          ...(props.showThroughput
            ? [
                {
                  id: 'tps',
                  header: 'TPS',
                  className: tableStyles.compactHeaderCellRight,
                  cellClassName: tableStyles.compactNumericCell,
                  cell: (point: PerformanceSeriesPoint) =>
                    formatThroughput(point.avg_tps),
                },
              ]
            : []),
        ]}
      />
      {props.series.length > 50 && (
        <DataTablePagination table={table} compact />
      )}
    </div>
  )
}
