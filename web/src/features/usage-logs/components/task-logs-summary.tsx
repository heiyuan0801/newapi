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
import { CircleCheck, CircleX, ListChecks } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

interface TaskLogsSummaryProps {
  total?: number
  statuses: readonly string[]
  loading: boolean
  busy: boolean
}

export function TaskLogsSummary(props: TaskLogsSummaryProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const stats = [
    {
      label: t('Total matching records'),
      value: props.total,
      icon: ListChecks,
    },
    {
      label: t('Succeeded on this page'),
      value:
        props.total == null
          ? undefined
          : props.statuses.filter((status) => status === 'SUCCESS').length,
      icon: CircleCheck,
    },
    {
      label: t('Failed on this page'),
      value:
        props.total == null
          ? undefined
          : props.statuses.filter((status) => status === 'FAILURE').length,
      icon: CircleX,
    },
  ]

  return (
    <dl
      aria-label={t('Task overview')}
      aria-busy={props.busy}
      className={cn(
        'grid min-w-0 gap-3 sm:grid-cols-3 sm:gap-4',
        props.busy && !props.loading && 'opacity-60'
      )}
    >
      {stats.map((stat) => {
        let value: ReactNode = '—'
        if (props.loading) value = <Skeleton className='h-6 w-14' />
        else if (stat.value != null) value = formatNumber(stat.value, locale)
        return (
          <Card
            key={stat.label}
            className='flex min-w-0 flex-row items-center gap-3 rounded-[14px] border p-4 shadow-none ring-0'
          >
            <IconBadge
              size='lg'
              className='bg-primary text-primary-foreground rounded-full'
            >
              <stat.icon />
            </IconBadge>
            <div className='min-w-0'>
              <dt className='text-muted-foreground text-xs leading-5 sm:text-sm'>
                {stat.label}
              </dt>
              <dd className='mt-1 text-xl font-semibold break-all tabular-nums'>
                {value}
              </dd>
            </div>
          </Card>
        )
      })}
    </dl>
  )
}
