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
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { TaskLogsFilterBar } from '../task-logs-filter-bar'
import { UsageLogsProvider } from '../usage-logs-provider'
import { UsageLogsTable } from '../usage-logs-table'

const captureDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'setPointerCapture'
)

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  if (captureDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'setPointerCapture',
      captureDescriptor
    )
  } else Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
})

async function renderTaskFilter(
  options: {
    category?: 'drawing' | 'task'
    mobile?: boolean
    admin?: boolean
    search?: string
    actualTable?: boolean
  } = {}
) {
  const category = options.category ?? 'task'
  const originalMatchMedia = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...originalMatchMedia(query),
    matches: !!options.mobile && query === '(max-width: 640px)',
  }))
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'viewer',
    role: options.admin ? 10 : 1,
  })
  function Fixture() {
    const table = useReactTable({
      data: [],
      columns: [],
      getCoreRowModel: getCoreRowModel(),
    })
    return <TaskLogsFilterBar table={table} logCategory={category} />
  }
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const logs = createRoute({
    getParentRoute: () => auth,
    path: '/usage-logs/$section',
    component: options.actualTable
      ? () => <UsageLogsTable logCategory={category} />
      : Fixture,
    validateSearch: (search: Record<string, unknown>) => search,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([logs])]),
    history: createMemoryHistory({
      initialEntries: [`/usage-logs/${category}${options.search ?? '?page=3'}`],
    }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10_000 } },
  })
  render(
    <QueryClientProvider client={client}>
      <UsageLogsProvider>
        <RouterProvider router={router} />
      </UsageLogsProvider>
    </QueryClientProvider>
  )
  await screen.findByRole('button', { name: 'Search' })
  return { router, client }
}

it('does not search while Enter confirms text from an input method editor', async () => {
  const { router } = await renderTaskFilter()
  const input = await screen.findByRole('textbox', { name: 'Task ID' })
  fireEvent.change(input, { target: { value: '任务-17' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(router.state.location.search).toMatchObject({ page: 3 })
  expect(router.state.location.search).not.toHaveProperty('filter')
})

it('allows resetting a historical date range without another field being active', async () => {
  const { router } = await renderTaskFilter({
    search: '?page=3&startTime=1788739200000&endTime=1788825600000',
  })
  const reset = screen.getByRole('button', { name: 'Reset' })
  expect(reset).toBeEnabled()
  await userEvent.setup().click(reset)
  await waitFor(() => expect(router.state.location.search.page).toBe(1))
  expect(router.state.location.search.startTime).not.toBe(1788739200000)
  expect(router.state.location.search.endTime).not.toBe(1788825600000)
})

it.each(['drawing', 'task'] as const)(
  'keeps the %s task ID visible on mobile and submits drafts only on Search',
  async (category) => {
    const { router } = await renderTaskFilter({ category, mobile: true })
    const user = userEvent.setup()
    const input = screen.getByRole('textbox', { name: 'Task ID' })
    expect(input).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Filter' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible()
    await user.type(input, 'job-17')
    expect(router.state.location.search).not.toHaveProperty('filter')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        page: 1,
        filter: 'job-17',
      })
    )
  }
)

it('keeps administrator channel filters in the advanced panel and applies them with Enter', async () => {
  const { router } = await renderTaskFilter({
    admin: true,
    search: '?page=3&pageSize=50',
  })
  const user = userEvent.setup()
  const filter = screen.getByRole('button', { name: 'Filter' })
  expect(filter).toHaveAttribute('aria-expanded', 'false')
  expect(
    screen.queryByRole('textbox', { name: 'Channel ID' })
  ).not.toBeInTheDocument()
  await user.click(filter)
  const channel = screen.getByRole('textbox', { name: 'Channel ID' })
  await user.type(channel, '17')
  await user.click(filter)
  await user.click(filter)
  expect(channel).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Channel ID' })).toHaveValue('17')
  await user.type(
    screen.getByRole('textbox', { name: 'Channel ID' }),
    '{Enter}'
  )
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      page: 1,
      channel: '17',
      pageSize: 50,
    })
  )
})

it('keeps a mobile administrator channel draft in the drawer until Search and closes after applying it', async () => {
  const { router } = await renderTaskFilter({ admin: true, mobile: true })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Filter' }))
  const drawer = await screen.findByRole('dialog', { name: 'Filter' })
  await user.type(
    within(drawer).getByRole('textbox', { name: 'Channel ID' }),
    '17'
  )
  expect(router.state.location.search).not.toHaveProperty('channel')
  await user.click(within(drawer).getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      page: 1,
      channel: '17',
    })
  )
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Filter' })
    ).not.toBeInTheDocument()
  )
})

it('retains the selected page size when Reset clears task and channel filters', async () => {
  const { router } = await renderTaskFilter({
    admin: true,
    search: '?page=3&pageSize=50&filter=job-17&channel=17',
  })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reset' }))
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      page: 1,
      pageSize: 50,
    })
  )
  expect(router.state.location.search).not.toHaveProperty('filter')
  expect(router.state.location.search).not.toHaveProperty('channel')
  expect(screen.getByRole('textbox', { name: 'Task ID' })).toHaveValue('')
})

it('disables keyboard submission and Refresh while task logs are loading', async () => {
  const { router, client } = await renderTaskFilter()
  let finish: ((value: null) => void) | undefined
  const pending = client.fetchQuery({
    queryKey: ['logs', 'task', 'loading-regression'],
    queryFn: () =>
      new Promise<null>((resolve) => {
        finish = resolve
      }),
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  )
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Task ID' }), {
    target: { value: 'job-17' },
  })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Task ID' }), {
    key: 'Enter',
  })
  expect(router.state.location.search).not.toHaveProperty('filter')
  finish?.(null)
  await pending
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  )
})

it('requests only the new applied filter and refreshes without submitting a draft', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [], total: 0 } },
  })
  const { router } = await renderTaskFilter({
    actualTable: true,
    search: '?page=1&pageSize=50&startTime=1788739200000&endTime=1788825600000',
  })
  const user = userEvent.setup()
  await screen.findByText('No Logs Found')
  const input = screen.getByRole('textbox', { name: 'Task ID' })
  get.mockClear()
  await user.type(input, 'job-17')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(router.state.location.search.filter).toBe('job-17')
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  )
  const requests = get.mock.calls.filter(([url]) =>
    url.startsWith('/api/task/self?')
  )
  expect(requests).toHaveLength(1)
  expect(requests[0][0]).toContain('task_id=job-17')
  expect(requests[0][0]).toContain('page_size=50')
  get.mockClear()
  await user.clear(input)
  await user.type(input, 'unsubmitted-job')
  await user.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(get).toHaveBeenCalled())
  const refreshRequests = get.mock.calls.filter(([url]) =>
    url.startsWith('/api/task/self?')
  )
  expect(refreshRequests).toHaveLength(1)
  expect(refreshRequests[0][0]).toContain('task_id=job-17')
  expect(refreshRequests[0][0]).not.toContain('unsubmitted-job')
  expect(input).toHaveValue('unsubmitted-job')
})
