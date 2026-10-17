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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { usageLogSchema } from '../../data/schema'
import { UsageLogsProvider } from '../usage-logs-provider'
import { UsageLogsTable } from '../usage-logs-table'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  localStorage.clear()
})

it.each([false, true])(
  'keeps common-log pagination inline and constrains only the empty row height (empty=%s)',
  async (empty) => {
    useAuthStore.getState().auth.setUser({ id: 1, username: 'viewer', role: 1 })
    const record = usageLogSchema.parse({
      id: 1,
      user_id: 1,
      created_at: 1788840000,
      type: 4,
      content: 'Registration credit',
    })
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      let data: unknown = { quota: 0, rpm: 0, tpm: 0 }
      if (url.startsWith('/api/log/self?')) {
        data = { items: empty ? [] : [record], total: empty ? 0 : 1 }
      }
      if (url === '/api/user/self/groups') data = {}
      if (url === '/api/subscription/self') data = { subscriptions: [] }
      return { data: { success: true, data } }
    })
    const root = createRootRoute()
    const auth = createRoute({
      getParentRoute: () => root,
      id: '_authenticated',
    })
    const logs = createRoute({
      getParentRoute: () => auth,
      path: '/usage-logs/$section',
      component: () => <UsageLogsTable logCategory='common' />,
      validateSearch: (search: Record<string, unknown>) => search,
    })
    const router = createRouter({
      routeTree: root.addChildren([auth.addChildren([logs])]),
      history: createMemoryHistory({ initialEntries: ['/usage-logs/common'] }),
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <UsageLogsProvider>
          <RouterProvider router={router} />
        </UsageLogsProvider>
      </QueryClientProvider>
    )

    expect(
      await screen.findByText(empty ? 'No Logs Found' : 'Registration credit')
    ).toBeVisible()
    const table = screen.getByRole('table')
    expect(table.closest('.rounded-none')).toHaveClass(
      '[&_td[colspan]]:h-[200px]'
    )
    expect(table.closest('[data-slot=table-container]')).toHaveClass(
      'overflow-x-auto',
      'overflow-y-hidden'
    )
    expect(screen.getAllByRole('rowgroup')[0]).not.toHaveClass('sticky')
    expect(
      screen.getByRole('button', { name: 'Go to previous page' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Go to previous page' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Go to next page' })
    ).toBeDisabled()
  }
)
