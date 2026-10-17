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
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  formatLatency,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import {
  formatSuccessRate,
  type AvailabilityModel,
  type GroupedAvailabilityModel,
} from '../lib/availability'
import { AvailabilityStatusBadge } from './availability-status'
import { AvailabilityTimeline } from './availability-timeline'

export function AvailabilityModelRow(props: {
  item: GroupedAvailabilityModel
  windowStart: number
  windowEnd: number
  onDetails: (item: AvailabilityModel) => void
}) {
  const { t } = useTranslation()
  const model = props.item.model
  const iconKey = model.icon || model.vendor_icon
  const icon = iconKey ? getLobeIcon(iconKey, 24) : null
  return (
    <li aria-label={model.model_name} className='min-w-0'>
      <Card className='min-w-0 gap-0 rounded-xl py-0'>
        <CardHeader className='bg-muted/20 flex flex-row items-center gap-3 border-b px-4 py-3 sm:px-5'>
          <div
            aria-hidden
            className='bg-background flex size-10 shrink-0 items-center justify-center rounded-xl border text-base font-semibold'
          >
            {icon || model.model_name.charAt(0).toUpperCase()}
          </div>
          <div className='min-w-0'>
            <CardTitle
              role='heading'
              aria-level={3}
              className='text-sm font-semibold [overflow-wrap:anywhere]'
            >
              {model.model_name}
            </CardTitle>
            {model.vendor_name && (
              <CardDescription className='mt-1 text-xs [overflow-wrap:anywhere]'>
                {model.vendor_name}
              </CardDescription>
            )}
          </div>
        </CardHeader>
        <div className='text-muted-foreground hidden grid-cols-[minmax(100px,0.75fr)_110px_minmax(200px,2fr)_90px] gap-5 border-b px-5 py-2 text-xs xl:grid'>
          <span>{t('Group')}</span>
          <span>{t('Success rate')}</span>
          <span>{t('Availability history')}</span>
          <span>{t('Average latency')}</span>
        </div>
        <CardContent className='min-w-0 divide-y px-0'>
          {props.item.groups.map((item) => (
            <div
              key={item.group}
              role='group'
              aria-label={`${model.model_name} · ${item.group}`}
              className='grid min-w-0 gap-3 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(100px,0.75fr)_110px_minmax(200px,2fr)_90px] xl:items-center xl:gap-5 xl:py-3'
            >
              <div className='flex min-w-0 items-center justify-between gap-3'>
                <Button
                  variant='ghost'
                  onClick={() => props.onDetails(item)}
                  aria-label={t(
                    'View availability details for {{model}} in {{group}}',
                    { model: model.model_name, group: item.group }
                  )}
                  className='h-auto max-w-full min-w-0 justify-start gap-2 rounded-md px-1.5 py-1 text-left'
                >
                  <GroupBadge group={item.group} />
                  <ChevronRight
                    aria-hidden
                    className='text-muted-foreground size-3.5 shrink-0'
                  />
                </Button>
                <span className='xl:hidden'>
                  <AvailabilityStatusBadge status={item.status} />
                </span>
              </div>
              <div className='flex items-center justify-between gap-2 xl:block'>
                <span className='text-muted-foreground text-xs xl:hidden'>
                  {t('Success rate')}
                </span>
                <div>
                  <span
                    className={cn(
                      'font-mono text-base font-semibold tabular-nums',
                      getSuccessRateTextClass(
                        item.status === 'unknown'
                          ? Number.NaN
                          : (item.metrics?.success_rate ?? Number.NaN)
                      )
                    )}
                  >
                    {formatSuccessRate(item.metrics?.success_rate)}
                  </span>
                  <span className='mt-1 hidden xl:block'>
                    <AvailabilityStatusBadge status={item.status} />
                  </span>
                </div>
              </div>
              <div className='min-w-0'>
                <AvailabilityTimeline
                  modelName={`${model.model_name} · ${item.group}`}
                  series={item.metrics?.recent_success_series ?? []}
                  windowStart={props.windowStart}
                  windowEnd={props.windowEnd}
                />
              </div>
              <div className='flex items-center justify-between gap-2 xl:block'>
                <span className='text-muted-foreground text-xs xl:hidden'>
                  {t('Average latency')}
                </span>
                <span className='font-mono text-sm tabular-nums'>
                  {formatLatency(item.metrics?.avg_latency_ms ?? Number.NaN)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </li>
  )
}
