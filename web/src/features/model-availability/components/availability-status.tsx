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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  AVAILABILITY_STATUS_LABELS,
  availabilityDotStyles,
  type AvailabilityStatus,
} from '../lib/availability'

const statusStyles: Record<AvailabilityStatus, string> = {
  healthy:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  degraded:
    'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  unknown: 'bg-muted text-muted-foreground',
}

export function AvailabilityStatusBadge(props: { status: AvailabilityStatus }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        statusStyles[props.status]
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          availabilityDotStyles[props.status]
        )}
      />
      {t(AVAILABILITY_STATUS_LABELS[props.status])}
    </span>
  )
}
