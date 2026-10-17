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
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Info, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { toIntlLocale } from '@/i18n/languages'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import type { ModelAvailabilitySearch } from '@/routes/_authenticated/model-availability'

import { AvailabilityDetails } from './components/availability-details'
import { AvailabilityList } from './components/availability-list'
import { AvailabilitySummary } from './components/availability-summary'
import { useAvailabilityCatalog } from './hooks/use-availability-catalog'
import {
  availabilityDotStyles,
  buildAvailabilityModels,
  groupAvailabilityModels,
  type AvailabilityModel,
} from './lib/availability'

const route = getRouteApi('/_authenticated/model-availability')
const PAGE_SIZE = 12

export function ModelAvailabilityPage() {
  const search = route.useSearch()
  const navigate = useNavigate({ from: '/model-availability' })
  return (
    <AvailabilityDashboard
      search={search}
      onSearchChange={(changes) => {
        void navigate({
          search: (previous) => ({ ...previous, ...changes }),
          replace: true,
        })
      }}
    />
  )
}

export function AvailabilityDashboard(props: {
  search: ModelAvailabilitySearch
  onSearchChange: (changes: Partial<ModelAvailabilitySearch>) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const catalog = useAvailabilityCatalog()
  const metricsQuery = useQuery({
    queryKey: ['model-availability-summary', props.search.hours],
    queryFn: async () =>
      requireServerSuccess(
        await getPerfMetricsSummary(props.search.hours, undefined, true)
      ),
    staleTime: 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })
  const [detailsModel, setDetailsModel] = useState<AvailabilityModel | null>(
    null
  )
  const models = useMemo(
    () =>
      buildAvailabilityModels(
        catalog.models,
        metricsQuery.data?.data.group_models ?? []
      ),
    [catalog.models, metricsQuery.data]
  )
  const filteredModels = useMemo(() => {
    const query = props.search.q.trim().toLowerCase()
    return models.filter(
      (item) =>
        (props.search.status === 'all' ||
          item.status === props.search.status) &&
        (!props.search.group || item.group === props.search.group) &&
        (!query ||
          `${item.model.model_name} ${item.model.vendor_name ?? ''} ${item.group}`
            .toLowerCase()
            .includes(query))
    )
  }, [models, props.search.q, props.search.status, props.search.group])
  const groupedModels = useMemo(
    () => groupAvailabilityModels(filteredModels),
    [filteredModels]
  )
  const groups = useMemo(
    () =>
      [...new Set(models.map((item) => item.group))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [models]
  )
  const ready = catalog.hasData && metricsQuery.data !== undefined
  const loading = catalog.isLoading || metricsQuery.isPending
  const refreshing = catalog.isFetching || metricsQuery.isFetching
  const failed = Boolean(catalog.error || metricsQuery.error)
  const currentPage = Math.min(
    props.search.page,
    Math.max(1, Math.ceil(groupedModels.length / PAGE_SIZE))
  )
  const table = useReactTable({
    data: groupedModels,
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination: { pageIndex: currentPage - 1, pageSize: PAGE_SIZE } },
    onPaginationChange: (updater) => {
      const previous = { pageIndex: currentPage - 1, pageSize: PAGE_SIZE }
      const next = typeof updater === 'function' ? updater(previous) : updater
      props.onSearchChange({ page: next.pageIndex + 1 })
    },
  })
  const window = useMemo(() => {
    const end =
      metricsQuery.data?.data.window_end ??
      Math.floor((metricsQuery.dataUpdatedAt || Date.now()) / 1000)
    return {
      end,
      start:
        metricsQuery.data?.data.window_start ??
        Math.floor(end / 3600) * 3600 - (props.search.hours - 1) * 3600,
    }
  }, [metricsQuery.data, metricsQuery.dataUpdatedAt, props.search.hours])
  const noSamples = models.filter((item) => item.status === 'unknown').length
  const refresh = () => {
    void Promise.allSettled([catalog.refetch(), metricsQuery.refetch()])
  }

  return (
    <>
      <SectionPageLayout stackActionsOnMobile>
        <SectionPageLayout.Title>
          {t('Model Availability')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Tabs
            value={String(props.search.hours)}
            onValueChange={(value) =>
              props.onSearchChange({
                hours: value === '168' ? 168 : 24,
                page: 1,
              })
            }
          >
            <TabsList className='bg-background rounded-full border p-1 group-data-horizontal/tabs:h-9'>
              <TabsTrigger
                value='24'
                className='data-active:bg-foreground data-active:text-background rounded-full px-3 text-xs'
              >
                {t('Last 24 hours')}
              </TabsTrigger>
              <TabsTrigger
                value='168'
                className='data-active:bg-foreground data-active:text-background rounded-full px-3 text-xs'
              >
                {t('Last 7 days')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            onClick={refresh}
            disabled={refreshing}
            size='sm'
            className='h-9 gap-2 rounded-lg'
          >
            <RefreshCw
              aria-hidden
              className={cn(
                'size-3.5',
                refreshing && 'animate-spin motion-reduce:animate-none'
              )}
            />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='min-w-0 space-y-5'>
            <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs'>
              <p>
                {t('Based on actual requests across the site.')}{' '}
                {t('Each group is measured independently for the same model.')}
              </p>
              {ready && (
                <p>
                  {t('Updated at {{time}}', {
                    time: new Date(
                      metricsQuery.dataUpdatedAt
                    ).toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })}
                </p>
              )}
            </div>
            <AvailabilitySummary
              models={models}
              loading={loading}
              ready={ready}
            />
            <AvailabilityList
              table={table}
              totalModels={models.length}
              window={window}
              search={props.search}
              groups={groups}
              loading={loading}
              ready={ready}
              failed={failed}
              refreshing={refreshing}
              onRefresh={refresh}
              onSearchChange={props.onSearchChange}
              onDetails={setDetailsModel}
            />
            <aside
              aria-label={t('Status thresholds')}
              className='text-muted-foreground space-y-3 px-1 text-xs'
            >
              <div className='flex flex-wrap items-center gap-x-5 gap-y-2'>
                <span className='inline-flex items-center gap-1.5'>
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      availabilityDotStyles.healthy
                    )}
                  />
                  {t('Healthy: at least 90% success.')}
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      availabilityDotStyles.degraded
                    )}
                  />
                  {t('Degraded: 70% to below 90%.')}
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      availabilityDotStyles.critical
                    )}
                  />
                  {t('High failure rate: below 70%.')}
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      availabilityDotStyles.unknown
                    )}
                  />
                  {t('No samples')}
                </span>
              </div>
              <p className='flex items-start gap-1.5'>
                <Info aria-hidden className='mt-0.5 size-3 shrink-0' />
                <span>
                  {t('No samples does not mean a model is unavailable.')}{' '}
                  {ready &&
                    noSamples > 0 &&
                    t(
                      '{{count}} model-group pairs have no samples in this period.',
                      {
                        count: noSamples,
                      }
                    )}{' '}
                  {t(
                    'Success rate excludes business rejections and includes the current partial hour.'
                  )}
                </span>
              </p>
            </aside>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <AvailabilityDetails
        model={detailsModel?.model ?? null}
        group={detailsModel?.group ?? ''}
        hours={props.search.hours}
        open={detailsModel !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsModel(null)
        }}
      />
    </>
  )
}
