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
import { HandCoins, TrendingUp, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { UserWalletData } from '../types'

interface AffiliateSummaryProps {
  user: UserWalletData | undefined
  loading: boolean
}

export function AffiliateSummary(props: AffiliateSummaryProps) {
  const { t, i18n } = useTranslation()
  useSystemConfigStore((state) => state.config.currency)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const stats = [
    {
      label: t('Available Rewards'),
      value: formatQuotaWithCurrency(props.user?.aff_quota, { locale }),
      icon: HandCoins,
      color: 'bg-pink-500',
    },
    {
      label: t('Total Earned'),
      value: formatQuotaWithCurrency(props.user?.aff_history_quota, {
        locale,
      }),
      icon: TrendingUp,
      color: 'bg-emerald-500',
    },
    {
      label: t('Successful invitations'),
      value:
        props.user?.aff_count == null
          ? '—'
          : formatNumber(props.user.aff_count, locale),
      icon: Users,
      color: 'bg-amber-500',
    },
  ]

  return (
    <dl
      aria-label={t('Referral statistics')}
      aria-busy={props.loading}
      className='grid min-w-0 gap-3 sm:grid-cols-3 sm:gap-4'
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className='bg-card border-border/70 flex min-w-0 items-center gap-3 rounded-2xl border p-4 sm:p-5'
        >
          <IconBadge
            size='lg'
            className={cn('rounded-full text-white', stat.color)}
          >
            <stat.icon />
          </IconBadge>
          <div className='min-w-0'>
            <dt className='text-muted-foreground text-xs'>{stat.label}</dt>
            <dd className='mt-1 text-xl leading-none font-semibold tracking-tight break-all tabular-nums'>
              {props.loading ? <Skeleton className='h-5 w-20' /> : stat.value}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  )
}
