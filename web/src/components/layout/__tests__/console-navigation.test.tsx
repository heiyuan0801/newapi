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
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { LayoutProvider } from '@/context/layout-provider'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { AppSidebar } from '../components/app-sidebar'
import { ConsoleBreadcrumb } from '../components/console-breadcrumb'

let client: QueryClient
let walletVisible: boolean
const animationsDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)
const initialWidth = window.innerWidth

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1280,
  })
  for (const cookie of [
    'layout_variant',
    'layout_collapsible',
    'sidebar_state',
  ]) {
    document.cookie = `${cookie}=; max-age=0; path=/`
  }
  window.localStorage.clear()
  useAuthStore.getState().auth.setUser({
    id: 7,
    username: 'console-user',
    display_name: 'Console User',
    role: 1,
  })
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  walletVisible = true
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/status') {
      return {
        data: {
          data: {
            SidebarModulesAdmin: JSON.stringify({
              chat: { enabled: false },
              personal: {
                enabled: true,
                topup: walletVisible,
                personal: true,
                security: true,
              },
            }),
          },
        },
      }
    }
    throw new Error(`Unexpected navigation request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: initialWidth,
  })
  for (const cookie of [
    'layout_variant',
    'layout_collapsible',
    'sidebar_state',
  ]) {
    document.cookie = `${cookie}=; max-age=0; path=/`
  }
})

afterAll(() => {
  if (animationsDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      animationsDescriptor
    )
  } else Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})

async function renderNavigation() {
  const root = createRootRoute({
    component: () => (
      <LayoutProvider>
        <SidebarProvider>
          <AppSidebar />
          <ConsoleBreadcrumb />
        </SidebarProvider>
      </LayoutProvider>
    ),
  })
  const paths = [
    '/keys',
    '/profile',
    '/wallet',
    '/wallet/affiliate',
    '/usage-logs/$section',
    '/dashboard/$section',
  ] as const
  const children = paths.map((path) =>
    createRoute({ getParentRoute: () => root, path, component: () => null })
  )
  const router = createRouter({
    routeTree: root.addChildren(children),
    history: createMemoryHistory({ initialEntries: ['/keys'] }),
  })
  await router.load()
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(
      vi.mocked(api.get).mock.calls.some(([url]) => url === '/api/status')
    ).toBe(true)
  )
  return { ...result, router }
}

function breadcrumbToggle() {
  const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' })
  return within(breadcrumb.parentElement as HTMLElement).getByRole('button', {
    name: 'Toggle Sidebar',
  })
}

describe('console navigation', () => {
  it('defaults to a sidebar and keeps the breadcrumb collapse control operable', async () => {
    const user = userEvent.setup()
    const { container } = await renderNavigation()
    const sidebar = container.querySelector('[data-slot="sidebar"][data-state]')
    expect(sidebar).toHaveAttribute('data-variant', 'sidebar')
    expect(sidebar).toHaveAttribute('data-state', 'expanded')
    await user.click(breadcrumbToggle())
    expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    expect(document.cookie).toContain('sidebar_state=false')
    await user.keyboard('{Enter}')
    expect(sidebar).toHaveAttribute('data-state', 'expanded')
  })

  it('preserves a saved inset preference and returns to the dashboard through its breadcrumb', async () => {
    document.cookie = 'layout_variant=inset; path=/'
    const user = userEvent.setup()
    const { container, router } = await renderNavigation()
    expect(
      container.querySelector('[data-slot="sidebar"][data-state]')
    ).toHaveAttribute('data-variant', 'inset')
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(breadcrumb).getByText('API Keys')).toHaveAttribute(
      'aria-current',
      'page'
    )
    await user.click(
      within(breadcrumb).getByRole('link', { name: 'Dashboard' })
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard/overview')
    )
    expect(within(breadcrumb).getByText('Dashboard')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('reuses account actions in the footer while honoring the wallet display setting', async () => {
    walletVisible = false
    const user = userEvent.setup()
    await renderNavigation()
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: /Manage your balance/ })
      ).not.toBeInTheDocument()
    )
    expect(
      screen.queryByRole('link', { name: 'Channels' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Console User')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(
      await screen.findByRole('menuitem', { name: 'Profile' })
    ).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    expect(
      screen.queryByRole('menuitem', { name: 'Wallet' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'System Settings' })
    ).not.toBeInTheDocument()
  })

  it('keeps all administrator destinations available after navigation groups are reordered', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'root-user', role: 100 })
    await renderNavigation()
    for (const name of [
      'Channels',
      'Models',
      'Users',
      'Redemption Codes',
      'Subscriptions',
      'System Info',
      'Task Plugins',
      'System Settings',
    ]) {
      expect(screen.getByRole('link', { name })).toBeVisible()
    }
  })

  it('closes the mobile sidebar when the footer wallet action navigates', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })
    const user = userEvent.setup()
    const { router } = await renderNavigation()
    await user.click(breadcrumbToggle())
    const sidebar = await screen.findByRole('dialog', { name: 'Sidebar' })
    await user.click(
      within(sidebar).getByRole('link', { name: /Manage your balance/ })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/wallet'))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Sidebar' })
      ).not.toBeInTheDocument()
    )
  })

  it('closes the mobile sidebar after choosing a footer account destination', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })
    const user = userEvent.setup()
    const { router } = await renderNavigation()
    await user.click(breadcrumbToggle())
    const sidebar = await screen.findByRole('dialog', { name: 'Sidebar' })
    await user.click(
      within(sidebar).getByRole('button', { name: 'Account menu' })
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Profile' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Sidebar' })
      ).not.toBeInTheDocument()
    )
  })

  it('opens grouped logs with the keyboard and shows the parent in the breadcrumb', async () => {
    const user = userEvent.setup()
    const { router } = await renderNavigation()
    screen.getByRole('button', { name: 'Logs' }).focus()
    await user.keyboard('{Enter}')
    screen.getByRole('link', { name: 'Usage Logs' }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/usage-logs/common')
    )
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(breadcrumb).getByText('Logs')).toBeVisible()
    expect(within(breadcrumb).getByText('Usage Logs')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('closes the mobile sidebar after navigating to the referral program', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })
    const user = userEvent.setup()
    const { router } = await renderNavigation()
    await user.click(breadcrumbToggle())
    const sidebar = await screen.findByRole('dialog', { name: 'Sidebar' })
    await user.click(
      within(sidebar).getByRole('link', { name: 'Referral Program' })
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/wallet/affiliate')
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Sidebar' })
      ).not.toBeInTheDocument()
    )
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(breadcrumb).getByText('Referral Program')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('carries the console theme into the mobile sidebar portal', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })
    const user = userEvent.setup()
    await renderNavigation()
    await user.click(breadcrumbToggle())
    const sidebar = await screen.findByRole('dialog', { name: 'Sidebar' })
    expect(sidebar).toHaveClass('console-surface')
  })
})
