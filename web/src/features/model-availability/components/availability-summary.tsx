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
import { Activity, CircleAlert, CircleCheck, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { AvailabilityModel } from '../lib/availability'

export function AvailabilitySummary(props: {
  models: AvailabilityModel[]
  loading: boolean
  ready: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const stats = [
    {
      label: t('Model-group pairs'),
      value: props.models.length,
      icon: Layers,
      color: 'bg-foreground text-background',
    },
    {
      label: t('Healthy'),
      value: props.models.filter((item) => item.status === 'healthy').length,
      icon: CircleCheck,
      color: 'bg-emerald-500 text-white',
    },
    {
      label: t('Degraded'),
      value: props.models.filter((item) => item.status === 'degraded').length,
      icon: Activity,
      color: 'bg-amber-500 text-white',
    },
    {
      label: t('High failure rate'),
      value: props.models.filter((item) => item.status === 'critical').length,
      icon: CircleAlert,
      color: 'bg-red-500 text-white',
    },
  ]
  return (
    <dl
      aria-label={t('Model availability overview')}
      aria-busy={props.loading}
      className='grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4'
    >
      {stats.map((stat) => {
        const value = props.ready ? formatNumber(stat.value, locale) : '—'
        return (
          <div
            key={stat.label}
            role='group'
            aria-label={stat.label}
            className='bg-card border-border/70 flex min-w-0 items-center gap-3 rounded-2xl border p-4 sm:p-5'
          >
            <IconBadge
              size='lg'
              className={cn('rounded-full max-sm:hidden', stat.color)}
            >
              <stat.icon />
            </IconBadge>
            <div className='min-w-0'>
              <dt className='text-muted-foreground text-xs'>{stat.label}</dt>
              <dd className='mt-1.5 text-2xl leading-none font-semibold tracking-tight tabular-nums'>
                {props.loading ? <Skeleton className='h-6 w-12' /> : value}
              </dd>
            </div>
          </div>
        )
      })}
    </dl>
  )
}
