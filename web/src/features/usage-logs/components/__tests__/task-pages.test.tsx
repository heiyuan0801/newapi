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
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { UsageLogs } from '../../index'

let client: QueryClient

afterEach(() => {
  cleanup()
  client?.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  localStorage.clear()
})

function renderTaskPage(
  section: 'drawing' | 'task',
  failFirst = false,
  records: Record<string, unknown>[] = [],
  total = records.length
) {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'viewer', role: 1 })
  let failed = false
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/status') return { data: { success: true, data: {} } }
    if (url.startsWith('/api/mj/') || url.startsWith('/api/task/')) {
      if (failFirst && !failed) {
        failed = true
        return { data: { success: false, message: 'Temporary log outage' } }
      }
      return { data: { success: true, data: { items: records, total } } }
    }
    throw new Error(`Unexpected task page request: ${url}`)
  })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const logs = createRoute({
    getParentRoute: () => auth,
    path: '/usage-logs/$section',
    component: UsageLogs,
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([logs])]),
    history: createMemoryHistory({
      initialEntries: [`/usage-logs/${section}`],
    }),
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it.each([
  ['drawing', 'Drawing Logs'],
  ['task', 'Task Logs'],
] as const)('labels the %s page with its own title', async (section, title) => {
  renderTaskPage(section)
  expect(await screen.findByRole('heading', { name: title })).toBeVisible()
})

it.each(['drawing', 'task'] as const)(
  'shows a retryable error instead of an empty %s page when loading fails',
  async (section) => {
    const user = userEvent.setup()
    renderTaskPage(section, true)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.queryByText('No Logs Found')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No Logs Found')).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry' })
      ).not.toBeInTheDocument()
    )
  }
)

it.each(['drawing', 'task'] as const)(
  'keeps the filtered total distinct from current-page success and failure counts for %s logs',
  async (section) => {
    const records = ['SUCCESS', 'FAILURE', 'UNKNOWN'].map((status, index) => ({
      id: index + 1,
      user_id: 1,
      channel_id: 3,
      code: 1,
      mj_id: `drawing-${index + 1}`,
      task_id: `task-${index + 1}`,
      action: 'IMAGINE',
      platform: 'image',
      group: 'default',
      quota: 0,
      submit_time: 1788840000,
      status,
      progress: '0%',
      prompt: '',
    }))
    renderTaskPage(section, false, records, 42)
    const summary = await screen.findByLabelText('Task overview')
    expect(await within(summary).findByText('42')).toBeVisible()
    for (const label of ['Succeeded on this page', 'Failed on this page']) {
      const metric = within(summary).getByText(label)
        .parentElement as HTMLElement
      expect(within(metric).getByText('1')).toBeVisible()
    }
    const table = screen.getByRole('table')
    expect(table.closest('[data-slot=table-container]')).toHaveClass(
      'overflow-x-auto',
      'overflow-y-hidden'
    )
    expect(screen.getAllByRole('rowgroup')[0]).not.toHaveClass('sticky')
    expect(
      screen.getByRole('button', { name: 'Go to previous page' })
    ).toBeVisible()
  }
)

it('keeps loaded drawing rows visible and offers retry when a refresh fails', async () => {
  const user = userEvent.setup()
  renderTaskPage('drawing', false, [
    {
      id: 1,
      user_id: 1,
      channel_id: 3,
      code: 1,
      mj_id: 'retained-drawing',
      action: 'IMAGINE',
      submit_time: 1788840000,
      status: 'FAILURE',
      progress: '0%',
      prompt: '',
    },
  ])
  expect(await screen.findByText('retained-drawing')).toBeVisible()
  const previous = vi.mocked(api.get).getMockImplementation()
  if (!previous) throw new Error('Missing task page API fixture')
  vi.mocked(api.get).mockImplementation(async (...args) => {
    if (String(args[0]).startsWith('/api/mj/')) {
      return { data: { success: false, message: 'Temporary log outage' } }
    }
    return previous(...args)
  })
  await user.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(
    await screen.findByText(
      'Unable to refresh logs. Showing the last loaded records.'
    )
  ).toBeVisible()
  expect(screen.getByText('retained-drawing')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
})

it.each(['drawing', 'task'] as const)(
  'uses the task-specific empty guidance on the mobile %s page',
  async (section) => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    renderTaskPage(section)
    expect(
      await screen.findByText(
        'Submitted tasks will appear here. Try adjusting the date range or task ID.'
      )
    ).toBeVisible()
    expect(
      screen.queryByText(
        'No usage logs available. Logs will appear here once API calls are made.'
      )
    ).not.toBeInTheDocument()
  }
)
