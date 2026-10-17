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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  CircleDollarSign,
  Coins,
  Database,
  MessageSquareText,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StaggerContainer, StaggerItem } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { useOverviewUsage } from '../../hooks/use-overview-usage'
import { StatCard } from '../ui/stat-card'

export function SummaryCards() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const usage = useOverviewUsage()
  const totals = [
    {
      key: 'balance',
      title: t('Account balance'),
      value: formatQuota(Number(user?.quota ?? 0)),
      description: t('User group: {{group}}', {
        group: user?.group || 'default',
      }),
      icon: Wallet,
      color: 'bg-pink-500',
      action: (
        <Button
          size='sm'
          variant='outline'
          className='h-6 rounded-full px-2 text-[11px]'
          render={<Link to='/wallet' />}
        >
          {t('Add credits')}
          <ArrowRight className='size-3' aria-hidden='true' />
        </Button>
      ),
    },
    {
      key: 'usage',
      title: t('Total consumption'),
      value: formatQuota(Number(user?.used_quota ?? 0)),
      description: t('All-time consumption'),
      icon: CircleDollarSign,
      color: 'bg-emerald-500',
      action: (
        <Button
          size='sm'
          variant='outline'
          className='h-6 rounded-full px-2 text-[11px]'
          render={<Link to='/usage-logs' />}
        >
          {t('View logs')}
          <ArrowRight className='size-3' aria-hidden='true' />
        </Button>
      ),
    },
    {
      key: 'requests',
      title: t('Total requests'),
      value: formatNumber(Number(user?.request_count ?? 0), locale),
      description: t('All-time successful requests'),
      icon: MessageSquareText,
      color: 'bg-amber-500',
    },
  ]
  const daily = [
    {
      key: 'quota',
      title: t('Today consumption'),
      value: formatQuota(usage.todayStats.totalQuota),
      icon: Database,
      color: 'bg-pink-500',
    },
    {
      key: 'requests',
      title: t('Today requests'),
      value: formatNumber(usage.todayStats.totalCount, locale),
      icon: Database,
      color: 'bg-teal-500',
    },
    {
      key: 'tokens',
      title: t('Today tokens'),
      value: formatNumber(usage.todayStats.totalTokens, locale),
      icon: Coins,
      color: 'bg-amber-500',
    },
  ]

  return (
    <section aria-label={t('Usage at a glance')} className='space-y-5'>
      <StaggerContainer className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        {totals.map((item) => (
          <StaggerItem key={item.key}>
            <StatCard
              appearance='overview'
              title={item.title}
              value={item.value}
              description={item.description}
              icon={item.icon}
              iconClassName={item.color}
              action={item.action}
              loading={!user}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>
      <StaggerContainer className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        {daily.map((item) => (
          <StaggerItem key={item.key}>
            <StatCard
              appearance='daily'
              title={item.title}
              value={item.value}
              description=''
              icon={item.icon}
              iconClassName={item.color}
              loading={usage.isPending}
              error={usage.isError && !usage.data}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  )
}
