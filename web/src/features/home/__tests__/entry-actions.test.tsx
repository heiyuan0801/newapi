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
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SystemStatus } from '@/features/auth/types'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { CTA } from '../components/sections/cta'
import { Hero } from '../components/sections/hero'

const clients: QueryClient[] = []

async function renderEntryAction(
  section: 'hero' | 'cta',
  status: SystemStatus = {},
  isAuthenticated = false
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, status)
  clients.push(client)
  const root = createRootRoute({ component: Outlet })
  const entry = createRoute({
    getParentRoute: () => root,
    path: '/entry',
    component: () =>
      section === 'hero' ? (
        <Hero isAuthenticated={isAuthenticated} />
      ) : (
        <CTA isAuthenticated={isAuthenticated} />
      ),
  })
  const destinations = (['/sign-up', '/sign-in', '/dashboard'] as const).map(
    (path) =>
      createRoute({
        getParentRoute: () => root,
        path,
        component: () => <h1>Account destination</h1>,
      })
  )
  const router = createRouter({
    routeTree: root.addChildren([entry, ...destinations]),
    history: createMemoryHistory({ initialEntries: ['/entry'] }),
  })
  await router.load()
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { router, ...view }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

describe.each(['hero', 'cta'] as const)(
  '%s account entry action',
  (section) => {
    it('opens registration for anonymous visitors when registration uses the default setting', async () => {
      const { router } = await renderEntryAction(section)
      const user = userEvent.setup()
      const start = screen.getByRole('button', { name: 'Get Started' })
      expect(start).toHaveAttribute('href', '/sign-up')
      await user.click(start)
      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/sign-up')
      )
    })

    it.each([
      { name: 'registration is disabled', status: { register_enabled: false } },
      {
        name: 'self-use mode is enabled',
        status: { self_use_mode_enabled: true },
      },
    ])(
      'opens sign-in for anonymous visitors when $name',
      async ({ status }) => {
        const { router } = await renderEntryAction(section, status)
        const user = userEvent.setup()
        const start = screen.getByRole('button', { name: 'Get Started' })
        expect(start).toHaveAttribute('href', '/sign-in')
        await user.click(start)
        await waitFor(() =>
          expect(router.state.location.pathname).toBe('/sign-in')
        )
      }
    )
  }
)

it('opens the dashboard for authenticated visitors even when registration is disabled', async () => {
  const { router } = await renderEntryAction(
    'hero',
    { register_enabled: false, self_use_mode_enabled: true },
    true
  )
  const user = userEvent.setup()
  const dashboard = screen.getByRole('button', { name: 'Go to Dashboard' })
  expect(dashboard).toHaveAttribute('href', '/dashboard')
  await user.click(dashboard)
  await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
})

it('omits the registration call to action for authenticated visitors', async () => {
  const { container } = await renderEntryAction('cta', {}, true)
  expect(
    screen.queryByRole('button', { name: 'Get Started' })
  ).not.toBeInTheDocument()
  expect(container).toBeEmptyDOMElement()
})

it('opens the official documentation when no documentation link is configured', async () => {
  await renderEntryAction('hero')
  expect(screen.getByRole('button', { name: 'Docs' })).toHaveAttribute(
    'href',
    'https://docs.newapi.pro'
  )
})

it('uses the configured documentation link instead of the default', async () => {
  await renderEntryAction('hero', { docs_link: 'https://docs.example.com' })
  expect(screen.getByRole('button', { name: 'Docs' })).toHaveAttribute(
    'href',
    'https://docs.example.com'
  )
})
