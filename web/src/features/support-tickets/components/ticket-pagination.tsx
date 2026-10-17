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

import { DataTablePagination } from '@/components/data-table'

export function TicketPagination(props: {
  items: { id: number }[]
  page: number
  total: number
  disabled: boolean
  onPageChange: (page: number) => void
}) {
  const pagination = { pageIndex: props.page - 1, pageSize: 20 }
  const table = useReactTable({
    data: props.items,
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: props.total,
    state: { pagination },
    onPaginationChange: (updater) => {
      if (props.disabled) return
      const next = typeof updater === 'function' ? updater(pagination) : updater
      props.onPageChange(next.pageIndex + 1)
    },
  })
  return <DataTablePagination table={table} compact />
}
