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
import { Activity, BarChart3, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const stats = [
    {
      label: t('Account Balance'),
      value: props.user ? formatQuota(props.user.quota) : '—',
      icon: WalletCards,
    },
    {
      label: t('Total Usage'),
      value: props.user ? formatQuota(props.user.used_quota) : '—',
      icon: BarChart3,
    },
    {
      label: t('API Requests'),
      value: props.user ? formatNumber(props.user.request_count, locale) : '—',
      icon: Activity,
    },
  ]

  return (
    <Card
      data-card-hover='false'
      className='gap-4 rounded-[14px] border py-5 ring-0'
    >
      <CardHeader className='px-4'>
        <CardTitle>{t('Account overview')}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 px-4'>
        {stats.map((item) => (
          <div
            key={item.label}
            className='bg-muted/20 flex min-w-0 items-center gap-3 rounded-[10px] border p-3'
          >
            <span className='bg-background flex size-9 shrink-0 items-center justify-center rounded-full border'>
              <item.icon
                aria-hidden='true'
                className='text-muted-foreground size-4'
              />
            </span>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <span className='text-muted-foreground text-xs'>
                {item.label}
              </span>
              {props.loading ? (
                <Skeleton className='h-5 w-20' />
              ) : (
                <span className='text-base font-semibold break-all tabular-nums'>
                  {item.value}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
