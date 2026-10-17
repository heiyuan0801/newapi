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
import type { Table } from '@tanstack/react-table'
import { HeartPulse } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePagination } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ModelAvailabilitySearch } from '@/routes/_authenticated/model-availability'

import type {
  AvailabilityModel,
  GroupedAvailabilityModel,
} from '../lib/availability'
import { AvailabilityModelRow } from './availability-model-row'
import { AvailabilityToolbar } from './availability-toolbar'

export function AvailabilityList(props: {
  table: Table<GroupedAvailabilityModel>
  totalModels: number
  window: { start: number; end: number }
  search: ModelAvailabilitySearch
  groups: string[]
  loading: boolean
  ready: boolean
  failed: boolean
  refreshing: boolean
  onRefresh: () => void
  onSearchChange: (changes: Partial<ModelAvailabilitySearch>) => void
  onDetails: (model: AvailabilityModel) => void
}) {
  const { t } = useTranslation()
  const [resetToken, setResetToken] = useState(0)
  let content: ReactNode
  if (props.loading) {
    content = (
      <div
        role='status'
        aria-label={t('Checking model availability')}
        className='space-y-6 border-t px-5 py-6'
      >
        {[0, 1, 2].map((item) => (
          <div key={item} className='flex items-center gap-4'>
            <Skeleton className='size-10 shrink-0 rounded-xl' />
            <div className='flex-1 space-y-2'>
              <Skeleton className='h-4 w-36' />
              <Skeleton className='h-6 w-full' />
            </div>
          </div>
        ))}
      </div>
    )
  } else if (!props.ready && props.failed) {
    content = (
      <ErrorState
        title={t('Unable to load model availability.')}
        onRetry={props.onRefresh}
      />
    )
  } else if (props.totalModels === 0) {
    content = (
      <EmptyState
        icon={HeartPulse}
        title={t('No models available')}
        description={t(
          'Models will appear here when they are available in the model catalog.'
        )}
      />
    )
  } else if (props.table.getRowCount() === 0) {
    content = (
      <EmptyState
        icon={HeartPulse}
        title={t('No models match your filters.')}
        action={
          <Button
            variant='outline'
            onClick={() => {
              setResetToken((previous) => previous + 1)
              props.onSearchChange({ q: '', status: 'all', group: '', page: 1 })
            }}
          >
            {t('Clear filters')}
          </Button>
        }
      />
    )
  } else {
    content = (
      <>
        <ul
          aria-label={t('Model Availability')}
          aria-busy={props.refreshing}
          className={cn(
            'min-w-0 space-y-4 border-t p-4 sm:p-5',
            props.refreshing && 'opacity-60'
          )}
        >
          {props.table.getRowModel().rows.map(({ original }) => (
            <AvailabilityModelRow
              key={original.model.model_name}
              item={original}
              windowStart={props.window.start}
              windowEnd={props.window.end}
              onDetails={props.onDetails}
            />
          ))}
        </ul>
        <div className='border-t px-4 py-3 sm:px-5'>
          <DataTablePagination table={props.table} compact />
        </div>
      </>
    )
  }
  return (
    <section
      aria-label={t('Availability history')}
      className='bg-card border-border/70 min-w-0 rounded-2xl border'
    >
      <AvailabilityToolbar
        query={props.search.q}
        groups={props.groups}
        group={props.search.group}
        status={props.search.status}
        resetToken={resetToken}
        onQueryChange={(q) => props.onSearchChange({ q, page: 1 })}
        onStatusChange={(status) => props.onSearchChange({ status, page: 1 })}
        onGroupChange={(group) => props.onSearchChange({ group, page: 1 })}
      />
      {props.failed && props.ready && (
        <p
          role='alert'
          className='mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:mx-5 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
        >
          {t('Unable to refresh availability. Showing the last loaded data.')}
        </p>
      )}
      {content}
    </section>
  )
}
