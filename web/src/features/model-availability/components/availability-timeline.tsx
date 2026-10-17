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
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getSuccessRateDotClass } from '@/features/performance-metrics/lib/format'
import type { SuccessRatePoint } from '@/features/performance-metrics/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const HOUR_SECONDS = 3_600
const MAX_HOURLY_BUCKETS = 168

type HourlyBucket = { start: number; rate: number | undefined }

type AvailabilityTimelineProps = {
  series: SuccessRatePoint[]
  windowStart: number
  windowEnd: number
  modelName: string
  className?: string
}

function buildHourlyBuckets(
  series: SuccessRatePoint[],
  windowStart: number,
  windowEnd: number
): HourlyBucket[] {
  if (
    !Number.isFinite(windowStart) ||
    !Number.isFinite(windowEnd) ||
    windowEnd < windowStart
  ) {
    return []
  }

  const lastHour = Math.floor(windowEnd / HOUR_SECONDS)
  const firstHour = Math.max(
    Math.floor(windowStart / HOUR_SECONDS),
    lastHour - MAX_HOURLY_BUCKETS + 1
  )
  const rates = new Map<number, number>()
  for (const point of series) {
    if (!Number.isFinite(point.ts)) continue
    rates.set(Math.floor(point.ts / HOUR_SECONDS), point.success_rate)
  }

  return Array.from({ length: lastHour - firstHour + 1 }, (_, index) => {
    const hour = firstHour + index
    const rate = rates.get(hour)
    const isValid =
      rate !== undefined && Number.isFinite(rate) && rate >= 0 && rate <= 100
    return {
      start: hour * HOUR_SECONDS,
      rate: isValid ? rate : undefined,
    }
  })
}

export function AvailabilityTimeline(props: AvailabilityTimelineProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const tooltipId = useId()
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const buckets = useMemo(
    () => buildHourlyBuckets(props.series, props.windowStart, props.windowEnd),
    [props.series, props.windowStart, props.windowEnd]
  )
  const selectedIndex = buckets.findIndex(
    (bucket) => bucket.start === selectedHour
  )
  const activeIndex = selectedIndex < 0 ? buckets.length - 1 : selectedIndex
  const activeBucket = buckets[activeIndex]
  const dateFormat = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (!activeBucket) return null

  const now = Date.now() / 1_000
  const isCurrentHour =
    activeBucket.start <= now && activeBucket.start + HOUR_SECONDS > now
  const activeStart = dateFormat.format(activeBucket.start * 1_000)
  const activeEnd = dateFormat.format(
    (activeBucket.start + HOUR_SECONDS) * 1_000
  )
  const activeStatus =
    activeBucket.rate === undefined
      ? t('No samples in this hour')
      : `${t('Success rate')}: ${formatNumber(activeBucket.rate, locale)}%`

  return (
    <div className={cn('min-w-0 max-w-full', props.className)}>
      <Tooltip open={open} onOpenChange={setOpen} trackCursorAxis='x'>
        <TooltipTrigger
          closeOnClick={false}
          delay={0}
          render={
            <Button
              variant='ghost'
              aria-label={t('Hourly availability for {{model}}', {
                model: props.modelName,
              })}
              aria-description={t(
                'Use the left and right arrow keys to inspect each hour.'
              )}
              aria-describedby={open ? tooltipId : undefined}
              className='group/timeline flex h-8 w-full min-w-0 gap-[min(2px,0.25%)] rounded-sm px-0 hover:bg-transparent'
              onClick={() => setOpen(true)}
              onKeyDown={(event) => {
                let nextIndex = activeIndex
                if (event.key === 'ArrowLeft') nextIndex -= 1
                else if (event.key === 'ArrowRight') nextIndex += 1
                else if (event.key === 'Home') nextIndex = 0
                else if (event.key === 'End') nextIndex = buckets.length - 1
                else return
                event.preventDefault()
                nextIndex = Math.max(0, Math.min(buckets.length - 1, nextIndex))
                setSelectedHour(buckets[nextIndex].start)
                setOpen(true)
              }}
            />
          }
        >
          {buckets.map((bucket, index) => (
            <span
              key={bucket.start}
              aria-hidden='true'
              data-slot='availability-hour'
              data-status={bucket.rate === undefined ? 'unknown' : 'sampled'}
              className={cn(
                'h-6 min-w-0 flex-1 rounded-[2px] transition-opacity hover:opacity-75',
                bucket.rate === undefined
                  ? 'bg-muted-foreground/15'
                  : getSuccessRateDotClass(bucket.rate),
                index === activeIndex &&
                  'group-focus-visible/timeline:ring-foreground group-focus-visible/timeline:ring-2 group-focus-visible/timeline:ring-offset-1'
              )}
              onPointerEnter={() => setSelectedHour(bucket.start)}
              onClick={() => setSelectedHour(bucket.start)}
            />
          ))}
        </TooltipTrigger>
        <TooltipContent
          id={tooltipId}
          role='tooltip'
          aria-live='polite'
          aria-atomic='true'
          className='max-w-[min(20rem,calc(100vw-2rem))] flex-col items-start gap-1'
        >
          <span className='font-medium tabular-nums'>
            {activeStart} – {activeEnd}
          </span>
          <span>{activeStatus}</span>
          {isCurrentHour && (
            <span className='text-background/75'>
              {t('Current hour is still in progress')}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
      <div className='text-muted-foreground mt-1 flex min-w-0 justify-between gap-2 text-[10px] tabular-nums'>
        <span>{dateFormat.format(buckets[0].start * 1_000)}</span>
        <span>{dateFormat.format(props.windowEnd * 1_000)}</span>
      </div>
    </div>
  )
}
