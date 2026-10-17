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
import {
  Database02Icon,
  DollarCircleIcon,
  FlashIcon,
  TextFirstlineLeftIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatLogQuota, formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getLogStats, getUserLogStats } from '../api'
import { DEFAULT_LOG_STATS } from '../constants'
import { buildApiParams } from '../lib/utils'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

export function CommonLogsStats() {
  const { t, i18n } = useTranslation()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const searchParams = route.useSearch()
  const { sensitiveVisible } = useUsageLogsContext()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const {
    data: stats,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['usage-logs-stats', isAdmin, searchParams],
    queryFn: async () => {
      const params = buildApiParams({
        page: 1,
        pageSize: 1,
        searchParams,
        columnFilters: [],
        isAdmin,
      })
      const result = isAdmin
        ? requireServerSuccess(await getLogStats(params))
        : requireServerSuccess(await getUserLogStats(params))
      return result.data || DEFAULT_LOG_STATS
    },
    placeholderData: (previousData) => previousData,
  })

  const unavailable = isError && !stats
  const consumption = sensitiveVisible
    ? formatLogQuota(stats?.quota || 0)
    : '••••'
  const cards = [
    {
      label: t('Period Consumption'),
      description: t('Total consumption in the selected period'),
      value: unavailable ? '—' : consumption,
      icon: Database02Icon,
    },
    {
      label: t('Current RPM'),
      description: t('Requests per minute'),
      value: unavailable ? '—' : formatNumber(stats?.rpm || 0, locale),
      icon: FlashIcon,
    },
    {
      label: t('Current TPM'),
      description: t('Tokens per minute'),
      value: unavailable ? '—' : formatNumber(stats?.tpm || 0, locale),
      icon: TextFirstlineLeftIcon,
    },
    {
      label: t('Current MPM'),
      description: t('Temporarily unavailable'),
      value: '—',
      icon: DollarCircleIcon,
    },
  ]

  return (
    <section
      aria-label={t('Usage statistics')}
      className='grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4'
    >
      {cards.map((card) => (
        <Card
          key={card.label}
          className='min-w-0 rounded-[14px] border py-0 shadow-none ring-0'
        >
          <CardHeader className='flex min-w-0 flex-wrap items-center gap-2.5 p-3 sm:flex-nowrap sm:p-4'>
            <span className='bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full'>
              <HugeiconsIcon icon={card.icon} size={19} aria-hidden='true' />
            </span>
            <div className='min-w-0 flex-1'>
              <CardTitle className='text-xs font-medium sm:text-sm'>
                {card.label}
              </CardTitle>
              <CardDescription className='mt-1 text-[11px] leading-4 sm:text-xs'>
                {card.description}
              </CardDescription>
            </div>
            <CardAction className='w-full min-w-0 self-center text-lg font-semibold [overflow-wrap:anywhere] tabular-nums sm:w-auto sm:text-right'>
              {isLoading && card.label !== t('Current MPM') ? (
                <Skeleton className='h-6 w-12' />
              ) : (
                card.value
              )}
            </CardAction>
          </CardHeader>
        </Card>
      ))}
    </section>
  )
}
