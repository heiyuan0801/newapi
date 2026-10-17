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
import type { ReactNode } from 'react'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { AnnouncementItem, QuotaDataItem } from '../../../types'
import { AnnouncementsPanel } from '../announcements-panel'
import { SummaryCards } from '../summary-cards'
import { UsagePanel } from '../usage-panel'

let client: QueryClient
let rows: QuotaDataItem[]
let announcements: AnnouncementItem[]
let usageError: boolean
const animationsDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

afterAll(() => {
  if (animationsDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      animationsDescriptor
    )
  } else Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({
    id: 7,
    username: 'console-user',
    role: 1,
    group: 'team',
    quota: 2500000,
    used_quota: 750000,
    request_count: 12,
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  rows = []
  announcements = []
  usageError = false
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/data/self') {
      if (usageError) throw new Error('Usage unavailable')
      return { data: { success: true, data: rows } }
    }
    if (url === '/api/status') {
      return { data: { data: { announcements_enabled: true, announcements } } }
    }
    throw new Error(`Unexpected overview request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
})

async function renderOverviewContent(content: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => content }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('overview metric cards', () => {
  it('uses account totals and only today records for the three daily cards', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const midnight = today.getTime() / 1000
    rows = [
      {
        created_at: midnight - 3600,
        quota: 5000000,
        count: 40,
        token_used: 9000,
      },
      { created_at: midnight + 60, quota: 500000, count: 2, token_used: 1200 },
      { created_at: midnight + 3600, quota: 250000, count: 3, token_used: 300 },
    ]
    await renderOverviewContent(<SummaryCards />)

    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: 'Today requests' })
      ).toHaveTextContent('5')
    )
    expect(
      screen.getByRole('group', { name: 'Account balance' })
    ).toHaveTextContent('$5')
    expect(
      screen.getByRole('group', { name: 'Total consumption' })
    ).toHaveTextContent('$1.5')
    expect(
      screen.getByRole('group', { name: 'Total requests' })
    ).toHaveTextContent('12')
    expect(
      screen.getByRole('group', { name: 'Today consumption' })
    ).toHaveTextContent('$1.5')
    expect(
      screen.getByRole('group', { name: 'Today tokens' })
    ).toHaveTextContent('1,500')
    expect(screen.getByText('User group: team')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add credits' })).toHaveAttribute(
      'href',
      '/wallet'
    )
    expect(screen.getByRole('button', { name: 'View logs' })).toHaveAttribute(
      'href',
      '/usage-logs'
    )
    const region = screen.getByRole('region', { name: 'Usage at a glance' })
    for (const row of region.children) {
      expect(row).toHaveClass('grid-cols-1', 'sm:grid-cols-3')
    }
  })

  it('keeps daily values unavailable after a failed query instead of displaying zero', async () => {
    usageError = true
    await renderOverviewContent(<SummaryCards />)
    await waitFor(() => expect(screen.getAllByText('—')).toHaveLength(3))
    expect(
      screen.getByRole('group', { name: 'Account balance' })
    ).toHaveTextContent('$5')
  })
})

describe('overview usage controls', () => {
  it('shows a real empty state while keeping metric tabs and time controls operable', async () => {
    const user = userEvent.setup()
    await renderOverviewContent(
      <>
        <SummaryCards />
        <UsagePanel />
      </>
    )
    const panel = screen.getByRole('region', { name: 'Model usage statistics' })
    await within(panel).findByText('No Data')
    expect(
      within(panel).getByRole('tab', { name: 'Consumption share' })
    ).toHaveAttribute('aria-selected', 'true')
    await user.click(within(panel).getByRole('tab', { name: 'Request share' }))
    expect(
      within(panel).getByRole('tab', { name: 'Request share' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(within(panel).getByRole('tabpanel')).toHaveTextContent('No Data')
    await user.click(within(panel).getByRole('button', { name: 'Hour' }))
    expect(within(panel).getByRole('button', { name: 'Hour' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const requestsBeforeRefresh = vi
      .mocked(api.get)
      .mock.calls.filter(([url]) => url === '/api/data/self').length
    expect(requestsBeforeRefresh).toBe(1)
    await user.click(within(panel).getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(
        vi
          .mocked(api.get)
          .mock.calls.filter(([url]) => url === '/api/data/self')
      ).toHaveLength(2)
    )
  })

  it('shows an error and recovers to the empty state when retry succeeds', async () => {
    usageError = true
    const user = userEvent.setup()
    await renderOverviewContent(<UsagePanel />)
    await screen.findByText('Oops! Something went wrong')
    expect(screen.queryByText('No Data')).not.toBeInTheDocument()
    usageError = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No Data')).toBeVisible()
  })
})

describe('overview announcement tabs', () => {
  it('filters existing pricing notices and opens their original details', async () => {
    announcements = [
      { id: 1, content: 'Service maintenance is complete.' },
      {
        id: 2,
        content: 'Model pricing update: rates adjusted.',
        extra: 'Existing credits are unchanged.',
      },
    ]
    const user = userEvent.setup()
    await renderOverviewContent(<AnnouncementsPanel />)
    await screen.findByRole('button', { name: /Service maintenance/ })
    const pricingTab = screen.getByRole('tab', { name: 'Pricing notices' })
    await user.click(pricingTab)
    expect(pricingTab).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.queryByRole('button', { name: /Service maintenance/ })
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /Model pricing update/ })
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Announcement Details',
    })
    expect(
      within(dialog).getByText('Existing credits are unchanged.')
    ).toBeVisible()
  })

  it('shows an honest empty state when no pricing notices exist', async () => {
    announcements = [{ id: 1, content: 'Service maintenance is complete.' }]
    const user = userEvent.setup()
    await renderOverviewContent(<AnnouncementsPanel />)
    await screen.findByRole('button', { name: /Service maintenance/ })
    await user.click(screen.getByRole('tab', { name: 'Pricing notices' }))
    expect(
      await screen.findByText('No pricing notices at this time')
    ).toBeVisible()
  })
})
