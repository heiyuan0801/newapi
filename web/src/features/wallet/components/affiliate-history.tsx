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

import { DataTablePagination, StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { getAffiliateRewards } from '../report-api'

const PAGE_SIZE = 10

export function AffiliateHistory() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  useSystemConfigStore((state) => state.config.currency)
  const userID = useAuthStore((state) => state.auth.user?.id)
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['affiliate-reward-history', userID, page],
    queryFn: async () =>
      requireServerSuccess(await getAffiliateRewards(page, PAGE_SIZE)),
    retry: false,
    staleTime: 30_000,
    meta: { errorToast: false },
  })
  const data = query.data?.data
  useEffect(() => {
    if (data && data.page !== page) {
      void queryClient.invalidateQueries({
        queryKey: ['affiliate-reward-history', userID, data.page],
        exact: true,
        refetchType: 'none',
      })
      setPage(data.page)
    }
  }, [data, page, userID, queryClient])
  const table = useReactTable({
    data: data?.items ?? [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: data?.total ?? 0,
    state: {
      pagination: { pageIndex: (data?.page ?? page) - 1, pageSize: PAGE_SIZE },
    },
    onPaginationChange: (updater) => {
      if (query.isFetching) return
      const current = { pageIndex: page - 1, pageSize: PAGE_SIZE }
      const next = typeof updater === 'function' ? updater(current) : updater
      setPage(next.pageIndex + 1)
    },
  })
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <section
      aria-label={t('Referral reward history')}
      className='bg-card border-border/70 min-w-0 rounded-2xl border'
    >
      <div className='flex items-center justify-between gap-3 border-b p-4 sm:px-5'>
        <h3 className='flex items-center gap-2 text-sm font-semibold'>
          <History aria-hidden className='size-4' />
          {t('Referral reward history')}
        </h3>
        <Button
          variant='outline'
          size='icon'
          disabled={query.isFetching}
          aria-label={t('Refresh referral reward history')}
          onClick={() => void query.refetch()}
        >
          <RefreshCw aria-hidden className='size-4' />
        </Button>
      </div>
      <p className='text-muted-foreground px-4 pt-4 text-xs leading-6 sm:px-5'>
        {t(
          'Detailed records begin with rewards issued after this upgrade. Earlier cumulative rewards remain unchanged.'
        )}
      </p>
      {query.isPending && <LoadingState />}
      {query.isError && !data && (
        <ErrorState
          title={t('Unable to load referral reward history')}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isError && data && (
        <Alert className='m-4 w-auto'>
          <AlertDescription>
            {t('Unable to refresh rewards. Showing the last loaded records.')}
          </AlertDescription>
        </Alert>
      )}
      {data && data.items.length === 0 && (
        <EmptyState
          className='min-h-44'
          title={t('No detailed referral rewards yet')}
          description={t(
            'New registration rewards will appear here after they are issued.'
          )}
        />
      )}
      {data && data.items.length > 0 && (
        <div className='min-w-0 space-y-3 p-4 sm:p-5'>
          <StaticDataTable
            tableProps={{ 'aria-label': t('Referral rewards') }}
            data={data.items}
            getRowKey={(row) => row.id}
            columns={[
              {
                id: 'time',
                header: t('Time'),
                cell: (row) => dateFormat.format(row.created_at * 1000),
              },
              {
                id: 'type',
                header: t('Type'),
                cell: () => t('Registration reward'),
              },
              {
                id: 'amount',
                header: t('Reward amount'),
                cell: (row) => formatQuotaWithCurrency(row.quota, { locale }),
              },
              {
                id: 'status',
                header: t('Status'),
                cell: () => (
                  <StatusBadge
                    copyable={false}
                    variant='success'
                    label={t('Issued')}
                  />
                ),
              },
            ]}
          />
          <DataTablePagination table={table} compact />
        </div>
      )}
    </section>
  )
}
