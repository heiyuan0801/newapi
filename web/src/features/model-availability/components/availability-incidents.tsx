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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { History, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePagination } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { GroupBadge } from '@/components/group-badge'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { deliveryStatusLabels } from '@/features/notification-deliveries/constants'
import { useIsAdmin } from '@/hooks/use-admin'
import { toIntlLocale } from '@/i18n/languages'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  getAvailabilityIncidents,
  type AvailabilityIncidentStatus,
  type AvailabilitySource,
} from '../api'
import { formatSuccessRate } from '../lib/availability'

const PAGE_SIZE = 20

export function AvailabilityIncidents(props: { group: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const admin = useIsAdmin()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [filters, setFilters] = useState<{
    source: AvailabilitySource | 'all'
    status: AvailabilityIncidentStatus
    page: number
  }>({ source: 'all', status: 'all', page: 1 })
  const query = useQuery({
    queryKey: ['availability-incidents', props.group, filters],
    queryFn: async () =>
      requireServerSuccess(
        await getAvailabilityIncidents({
          ...filters,
          group: props.group,
          page_size: PAGE_SIZE,
        })
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
    meta: { errorToast: false },
  })
  const items = query.data?.data.items ?? []
  const lastPage = Math.max(
    1,
    Math.ceil((query.data?.data.total ?? 0) / PAGE_SIZE)
  )
  const clampingPage = Boolean(query.data && filters.page > lastPage)
  useEffect(() => {
    if (clampingPage) {
      void queryClient.invalidateQueries({
        queryKey: [
          'availability-incidents',
          props.group,
          { ...filters, page: lastPage },
        ],
        exact: true,
        refetchType: 'none',
      })
      setFilters((current) => ({ ...current, page: lastPage }))
    }
  }, [clampingPage, lastPage, filters, props.group, queryClient])
  const table = useReactTable({
    data: items,
    columns: [],
    rowCount: query.data?.data.total ?? 0,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    state: {
      pagination: {
        pageIndex: query.data
          ? Math.min(filters.page, lastPage) - 1
          : filters.page - 1,
        pageSize: PAGE_SIZE,
      },
    },
    onPaginationChange: (updater) => {
      if (query.isFetching) return
      const previous = { pageIndex: filters.page - 1, pageSize: PAGE_SIZE }
      const next = typeof updater === 'function' ? updater(previous) : updater
      setFilters((current) => ({ ...current, page: next.pageIndex + 1 }))
    },
  })
  const dateFormat = new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <section
      aria-label={t('Incident history')}
      className='bg-card border-border/70 min-w-0 rounded-2xl border'
    >
      <div className='flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5'>
        <div className='flex min-w-0 items-center gap-2'>
          <History aria-hidden className='size-4 shrink-0' />
          <h3 className='text-sm font-semibold'>{t('Incident history')}</h3>
          {props.group && <GroupBadge group={props.group} />}
        </div>
        <div className='grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto'>
          <Select
            value={filters.source}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                source: value === 'real' || value === 'probe' ? value : 'all',
                page: 1,
              })
            }
            items={[
              { value: 'all', label: t('All sources') },
              { value: 'real', label: t('Real requests') },
              { value: 'probe', label: t('Active probes') },
            ]}
          >
            <SelectTrigger
              aria-label={t('Incident source')}
              className='h-9 w-full min-w-0 sm:w-36'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='all'>{t('All sources')}</SelectItem>
                <SelectItem value='real'>{t('Real requests')}</SelectItem>
                <SelectItem value='probe'>{t('Active probes')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.status}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                status:
                  value === 'open' || value === 'resolved' ? value : 'all',
                page: 1,
              })
            }
            items={[
              { value: 'all', label: t('All incidents') },
              { value: 'open', label: t('Open incident') },
              { value: 'resolved', label: t('Resolved') },
            ]}
          >
            <SelectTrigger
              aria-label={t('Incident status')}
              className='h-9 w-full min-w-0 sm:w-36'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='all'>{t('All incidents')}</SelectItem>
                <SelectItem value='open'>{t('Open incident')}</SelectItem>
                <SelectItem value='resolved'>{t('Resolved')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            size='icon'
            variant='outline'
            aria-label={t('Refresh incident history')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden className='size-4' />
          </Button>
        </div>
      </div>
      {query.isError && query.data && (
        <Alert className='m-4 w-auto'>
          <AlertDescription>
            {t('Unable to refresh incidents. Showing the last loaded records.')}
          </AlertDescription>
        </Alert>
      )}
      {(query.isPending || clampingPage) && (
        <div role='status' aria-label={t('Loading incident history')}>
          <LoadingState />
        </div>
      )}
      {query.isError && !query.data && (
        <ErrorState
          title={t('Unable to load incident history.')}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && !clampingPage && items.length === 0 && (
        <EmptyState
          className='min-h-48'
          title={t('No incidents match these filters.')}
          description={t(
            'Only confirmed incidents are recorded. Missing or insufficient samples do not count as failures.'
          )}
        />
      )}
      {items.length > 0 && (
        <ul
          aria-label={t('Availability incidents')}
          aria-busy={query.isFetching}
          className='min-w-0 divide-y px-4 sm:px-5'
        >
          {items.map((item) => (
            <li
              key={item.id}
              className='grid min-w-0 gap-3 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.5fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)]'
            >
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm font-semibold [overflow-wrap:anywhere]'>
                    {item.model_name}
                  </span>
                  <GroupBadge group={item.group} />
                </div>
                <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs'>
                  <span>
                    {item.source === 'probe'
                      ? t('Active probes')
                      : t('Real requests')}
                  </span>
                  <StatusBadge
                    copyable={false}
                    variant={item.status === 'open' ? 'danger' : 'success'}
                    label={
                      item.status === 'open'
                        ? t('Open incident')
                        : t('Resolved')
                    }
                  />
                </div>
              </div>
              {admin && (
                <div className='text-muted-foreground col-span-full flex flex-wrap gap-4 text-xs'>
                  <span>
                    {t('Incident notification')}:{' '}
                    {t(
                      deliveryStatusLabels[
                        item.notification_status || 'not_requested'
                      ] || 'Not requested'
                    )}
                  </span>
                  {item.status === 'resolved' && (
                    <span>
                      {t('Recovery notification')}:{' '}
                      {t(
                        deliveryStatusLabels[
                          item.recovery_notification_status || 'not_requested'
                        ] || 'Not requested'
                      )}
                    </span>
                  )}
                </div>
              )}
              <div className='min-w-0 space-y-1 text-sm'>
                <p className='text-muted-foreground text-xs'>
                  {t('Incident started')}
                </p>
                <p className='tabular-nums'>
                  {item.started_at > 0
                    ? dateFormat.format(item.started_at * 1000)
                    : '—'}
                </p>
              </div>
              <div className='min-w-0 space-y-1 text-sm'>
                <p className='text-muted-foreground text-xs'>
                  {t('Recovered at')}
                </p>
                <p className='tabular-nums'>
                  {item.resolved_at > 0
                    ? dateFormat.format(item.resolved_at * 1000)
                    : t('Ongoing')}
                </p>
              </div>
              <div className='min-w-0 space-y-1 text-sm'>
                <p className='text-muted-foreground text-xs'>
                  {t('Observed success rate')}
                </p>
                <p className='font-mono tabular-nums'>
                  {formatSuccessRate(item.success_rate)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.data && query.data.data.total > 0 && (
        <div className='border-t px-4 py-3 sm:px-5'>
          <DataTablePagination table={table} compact />
        </div>
      )}
    </section>
  )
}
