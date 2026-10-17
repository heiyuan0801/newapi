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
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { DataTablePagination, StaticDataTable } from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import type { MonthlyUsageRow } from '../report-api'

export function MonthlyUsageTable(props: {
  rows: MonthlyUsageRow[]
  page?: number
  pageSize?: number
  total?: number
  disabled?: boolean
  onPageChange?: (page: number) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const table = useReactTable({
    data: props.rows,
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: props.total ?? props.rows.length,
    state: {
      pagination: {
        pageIndex: (props.page ?? 1) - 1,
        pageSize: props.pageSize ?? 50,
      },
    },
    onPaginationChange: (updater) => {
      if (props.disabled) return
      const previous = {
        pageIndex: (props.page ?? 1) - 1,
        pageSize: props.pageSize ?? 50,
      }
      const next = typeof updater === 'function' ? updater(previous) : updater
      props.onPageChange?.(next.pageIndex + 1)
    },
  })
  return (
    <div className='min-w-0 space-y-3'>
      <StaticDataTable
        tableProps={{ 'aria-label': t('Monthly usage breakdown') }}
        data={table.getRowModel().rows.map((row) => row.original)}
        getRowKey={(row) =>
          JSON.stringify([row.model_name, row.use_group, row.token_id])
        }
        columns={[
          {
            id: 'model',
            header: t('Model'),
            cell: (row) => (
              <span className='block max-w-64 truncate font-medium'>
                {row.model_name || '—'}
              </span>
            ),
          },
          {
            id: 'group',
            header: t('Group'),
            cell: (row) =>
              row.use_group ? <GroupBadge group={row.use_group} /> : '—',
          },
          {
            id: 'token',
            header: t('Token'),
            cell: (row) => (
              <span className='block max-w-48 truncate'>
                {row.token_name ||
                  (row.token_id > 0
                    ? t('Deleted token #{{id}}', { id: row.token_id })
                    : '—')}
              </span>
            ),
          },
          {
            id: 'count',
            header: t('Requests'),
            cell: (row) => formatNumber(row.count, locale),
          },
          {
            id: 'tokens',
            header: t('Tokens'),
            cell: (row) => formatNumber(row.token_used, locale),
          },
          {
            id: 'cost',
            header: t('Collected usage'),
            cell: (row) => formatQuotaWithCurrency(row.quota, { locale }),
          },
        ]}
      />
      <fieldset disabled={props.disabled}>
        <DataTablePagination table={table} compact />
      </fieldset>
    </div>
  )
}
