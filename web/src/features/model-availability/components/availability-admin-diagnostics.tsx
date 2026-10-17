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
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatLatency } from '@/features/performance-metrics/lib/format'
import { useIsAdmin } from '@/hooks/use-admin'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { AvailabilitySource } from '../api'
import { getAvailabilityDiagnostics } from '../diagnostics-api'

type DiagnosticsProps = {
  model: string
  group: string
  hours: 24 | 168
  source: AvailabilitySource
  open: boolean
}

export function AvailabilityAdminDiagnostics(props: DiagnosticsProps) {
  const isAdmin = useIsAdmin()
  if (!isAdmin || !props.open) return null
  return <AdminDiagnosticsContent {...props} />
}

function AdminDiagnosticsContent(props: DiagnosticsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const diagnostics = useQuery({
    queryKey: [
      'availability-admin-diagnostics',
      props.model,
      props.group,
      props.source,
      props.hours,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getAvailabilityDiagnostics({
          model: props.model,
          group: props.group,
          source: props.source,
          hours: props.hours,
        })
      ),
    staleTime: 30_000,
    retry: false,
    meta: { errorToast: false },
  })
  const data = diagnostics.data?.data
  const errorLabels: Record<string, string> = {
    probe_failed: t('Probe request failed'),
    probe_timeout: t('Probe timed out'),
    probe_unavailable: t('No probe channel available'),
    unknown: t('Unclassified probe failure'),
  }
  let unavailable = ''
  if (data?.percentile_unavailable_reason === 'aggregated_real_metrics') {
    unavailable = t(
      'Real diagnostics use persisted aggregates. Error categories, exact latency percentiles and affected channels are only available for measured probes.'
    )
  } else if (data?.percentile_unavailable_reason === 'sample_limit') {
    unavailable = t(
      'Exact percentiles are unavailable above {{limit}} latency samples. Counts still cover the entire window.',
      { limit: formatNumber(data.sample_limit, locale) }
    )
  } else if (data?.percentile_unavailable_reason === 'samples_changed') {
    unavailable = t(
      'Samples changed during collection. Refresh to calculate exact percentiles.'
    )
  } else if (data?.percentile_unavailable_reason) {
    unavailable = t('No measured latency samples are available.')
  }
  return (
    <section
      aria-label={t('Administrator diagnostics')}
      className='min-w-0 space-y-4 border-t pt-5'
    >
      <h3 className='text-sm font-semibold'>
        {t('Administrator diagnostics')}
      </h3>
      {diagnostics.isPending && (
        <div role='status'>
          <LoadingState inline message={t('Loading...')} />
        </div>
      )}
      {diagnostics.isError && (
        <ErrorState
          className='min-h-32'
          title={t('Unable to load availability diagnostics')}
          onRetry={() => void diagnostics.refetch()}
        />
      )}
      {data && (
        <>
          <p className='text-muted-foreground text-xs leading-5'>
            {props.source === 'real'
              ? t(
                  'Current buckets and pending flushes are excluded. Collection cadence can delay persisted data by {{minutes}} minutes while collection is healthy.',
                  {
                    minutes: formatNumber(
                      Math.ceil(data.collection_delay_seconds / 60),
                      locale
                    ),
                  }
                )
              : t(
                  'Probe diagnostics include persisted samples through the displayed window end.'
                )}
          </p>
          <dl
            aria-label={t('Diagnostic sample counts')}
            className='grid grid-cols-1 gap-3 sm:grid-cols-3'
          >
            {[
              { label: t('Sample count'), value: data.request_count },
              { label: t('Successful samples'), value: data.success_count },
              { label: t('Failed samples'), value: data.failure_count },
            ].map((item) => (
              <div key={item.label} className='rounded-xl border p-3'>
                <dt className='text-muted-foreground text-xs'>{item.label}</dt>
                <dd className='mt-2 text-lg font-semibold tabular-nums'>
                  {formatNumber(item.value, locale)}
                </dd>
              </div>
            ))}
          </dl>
          {unavailable && (
            <Alert>
              <AlertDescription>{unavailable}</AlertDescription>
            </Alert>
          )}
          {props.source === 'probe' && (
            <>
              <dl
                aria-label={t('Latency percentiles')}
                className='grid grid-cols-1 gap-3 sm:grid-cols-3'
              >
                {[
                  { label: 'P50', value: data.p50_latency_ms },
                  { label: 'P95', value: data.p95_latency_ms },
                  { label: 'P99', value: data.p99_latency_ms },
                ].map((item) => (
                  <div key={item.label} className='rounded-xl border p-3'>
                    <dt className='text-muted-foreground text-xs'>
                      {item.label}
                    </dt>
                    <dd className='mt-2 font-semibold tabular-nums'>
                      {formatLatency(item.value ?? Number.NaN)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Latency percentiles use all measured successful and failed probes.'
                )}{' '}
                {t('Unsupported probes excluded: {{count}}', {
                  count: formatNumber(data.unsupported_count, locale),
                })}
              </p>
              <div className='text-muted-foreground text-xs'>
                {t('Last recorded probe')}:{' '}
                {data.latest_sample_at > 0
                  ? new Date(data.latest_sample_at * 1000).toLocaleString(
                      locale
                    )
                  : t('Not checked yet')}
              </div>
              <div className='grid min-w-0 gap-4 sm:grid-cols-2'>
                <section
                  aria-label={t('Failure categories')}
                  className='min-w-0 space-y-3'
                >
                  <h4 className='text-xs font-medium'>
                    {t('Failure categories')}
                  </h4>
                  {data.error_categories.length === 0 ? (
                    <EmptyState
                      className='min-h-32'
                      title={t('No failed probes')}
                    />
                  ) : (
                    <dl className='space-y-2'>
                      {data.error_categories.map((item) => (
                        <div
                          key={item.category}
                          className='flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs'
                        >
                          <dt>
                            {errorLabels[item.category] ??
                              t('Unclassified probe failure')}
                          </dt>
                          <dd className='tabular-nums'>
                            {formatNumber(item.count, locale)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
                <section
                  aria-label={t('Affected channels')}
                  className='min-w-0 space-y-3'
                >
                  <h4 className='text-xs font-medium'>
                    {t('Affected channels')}
                  </h4>
                  <StaticDataTable
                    className='max-h-64 overflow-y-auto rounded-xl'
                    tableClassName='min-w-72'
                    tableProps={{
                      'aria-label': t('Channels with failed probes'),
                    }}
                    data={data.affected_channels}
                    getRowKey={(item) => item.id}
                    emptyContent={t('No attributed channel failures')}
                    columns={[
                      {
                        id: 'channel',
                        header: t('Channel'),
                        cell: (item) => (
                          <span className='break-all'>
                            {item.name ||
                              t('Deleted channel #{{id}}', {
                                id: formatNumber(item.id, locale),
                              })}
                          </span>
                        ),
                      },
                      {
                        id: 'failures',
                        header: t('Failed samples'),
                        className: 'text-right',
                        cellClassName: 'text-right tabular-nums',
                        cell: (item) => formatNumber(item.failures, locale),
                      },
                    ]}
                  />
                  {data.affected_channels_truncated && (
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'Only the 100 channels with the most failed probes are shown.'
                      )}
                    </p>
                  )}
                  {data.unattributed_failures > 0 && (
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'Failures without channel attribution: {{count}}. Historical samples may not have channel information.',
                        {
                          count: formatNumber(
                            data.unattributed_failures,
                            locale
                          ),
                        }
                      )}
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
