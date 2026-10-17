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
import { readFileSync } from 'node:fs'

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
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from '../sign-in/components/user-auth-form'
import { SignUpForm } from '../sign-up/components/sign-up-form'
import type { SystemStatus } from '../types'

const queryClients: QueryClient[] = []
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'scrollIntoView'
)

function renderEntry(kind: 'sign-in' | 'sign-up', status: SystemStatus = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  queryClient.setQueryData(STATUS_QUERY_KEY, status)
  queryClients.push(queryClient)
  const root = createRootRoute({ component: Outlet })
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/entry',
      component: () => (
        <AuthLayout>
          {kind === 'sign-in' ? (
            <UserAuthForm redirectTo='/pricing' />
          ) : (
            <SignUpForm />
          )}
        </AuthLayout>
      ),
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/otp',
      component: () => <div>Additional verification required</div>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: '/sign-in',
      component: () => <div>Sign-in destination</div>,
    }),
  ]
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/entry'] }),
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme='light'>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  )
  return { router, ...view }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useAuthStore.getState().auth.reset('idle')
  useSystemConfigStore.getState().setLoading(false)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  queryClients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
  if (originalScrollIntoView) {
    Object.defineProperty(
      Element.prototype,
      'scrollIntoView',
      originalScrollIntoView
    )
  } else {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  }
  useAuthStore.getState().auth.reset('idle')
  localStorage.clear()
  sessionStorage.clear()
})

it('keeps the authentication card within 510px and allows long forms to expand the page', async () => {
  const view = renderEntry('sign-up')
  const main = await screen.findByRole('main')
  const card = main.firstElementChild
  const surface = main.parentElement
  const stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync(
    'src/features/auth/auth-surface.css',
    'utf8'
  )
  document.head.append(stylesheet)
  try {
    expect(card).toBeInstanceOf(HTMLElement)
    expect(getComputedStyle(card as HTMLElement).maxWidth).toBe('510px')
    expect(surface).toHaveClass('min-h-svh')
    expect(surface).not.toHaveClass('h-svh', 'overflow-hidden')
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeVisible()
    expect(view.container.querySelector('footer')).toHaveTextContent(
      'New API · QuantumNous'
    )
  } finally {
    stylesheet.remove()
  }
})

it('submits the original username contract and requires server-requested MFA before authenticating', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: {
        require_verification: true,
        flow_token: 'login-challenge',
        expires_at: Math.floor(Date.now() / 1000) + 300,
        methods: [{ method: '2fa', available: true }],
      },
    },
  })
  const { router } = renderEntry('sign-in')
  const user = userEvent.setup()
  const username = await screen.findByLabelText('Username or Email')
  const password = screen.getByLabelText('Password')
  expect(username).toHaveAttribute('autocomplete', 'username')
  expect(password).toHaveAttribute('autocomplete', 'current-password')
  await user.type(username, 'gateway-user')
  await user.tab()
  expect(password).toHaveFocus()
  await user.type(password, 'correct password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/otp'))
  expect(post).toHaveBeenCalledWith(
    '/api/user/login?turnstile=',
    { username: 'gateway-user', password: 'correct password' },
    { skipAuthRefresh: true }
  )
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(
    useAuthStore.getState().auth.pendingLoginVerification?.redirectTo
  ).toBe('/pricing')
})

it('blocks password and OAuth login while required legal consent is unchecked', async () => {
  const post = vi.spyOn(api, 'post')
  const errorToast = vi.spyOn(toast, 'error')
  renderEntry('sign-in', { user_agreement_enabled: true, github_oauth: true })
  const user = userEvent.setup()
  await user.type(
    await screen.findByLabelText('Username or Email'),
    'gateway-user'
  )
  await user.type(screen.getByLabelText('Password'), 'correct password')
  expect(
    screen.getByRole('button', { name: 'Continue with GitHub' })
  ).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(errorToast).toHaveBeenCalledWith(
    'Please agree to the legal terms first'
  )
  expect(post).not.toHaveBeenCalled()
  await user.click(screen.getByRole('checkbox'))
  expect(
    screen.getByRole('button', { name: 'Continue with GitHub' })
  ).toBeEnabled()
})

it('hides password fields and their divider when password login is disabled', async () => {
  renderEntry('sign-in', { password_login_enabled: false, github_oauth: true })
  expect(
    await screen.findByRole('button', { name: 'Continue with GitHub' })
  ).toBeVisible()
  expect(screen.queryByLabelText('Username or Email')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  expect(
    screen.queryByText('Or continue with your account')
  ).not.toBeInTheDocument()
})

it('keeps password mismatch validation accessible after restyling registration', async () => {
  const post = vi.spyOn(api, 'post')
  renderEntry('sign-up')
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username'), 'new-user')
  await user.type(screen.getByLabelText('Password'), 'first password')
  await user.type(screen.getByLabelText('Confirm password'), 'other password')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(await screen.findByText("Passwords don't match.")).toBeVisible()
  expect(screen.getByLabelText('Confirm password')).toHaveAttribute(
    'aria-invalid',
    'true'
  )
  expect(post).not.toHaveBeenCalled()
})

it('requires the email verification code before sending registration', async () => {
  const post = vi.spyOn(api, 'post')
  const errorToast = vi.spyOn(toast, 'error')
  renderEntry('sign-up', { email_verification: true })
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username'), 'new-user')
  await user.type(screen.getByLabelText('Password'), 'correct password')
  await user.type(screen.getByLabelText('Confirm password'), 'correct password')
  await user.type(
    screen.getByLabelText('Email (required for verification)'),
    'new@example.com'
  )
  expect(screen.getByLabelText('Verification code')).toHaveAttribute(
    'autocomplete',
    'one-time-code'
  )
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(errorToast).toHaveBeenCalledWith('Please enter the verification code')
  expect(post).not.toHaveBeenCalled()
})

it('preserves registration fields and returns to sign-in after server confirmation', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  const { router } = renderEntry('sign-up', {
    email_verification: true,
    user_agreement_enabled: true,
  })
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username'), 'new-user')
  await user.type(screen.getByLabelText('Password'), 'correct password')
  await user.type(screen.getByLabelText('Confirm password'), 'correct password')
  await user.type(
    screen.getByLabelText('Email (required for verification)'),
    'new@example.com'
  )
  await user.type(screen.getByLabelText('Verification code'), '123456')
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Create account' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
  expect(post).toHaveBeenCalledWith(
    '/api/user/register',
    expect.objectContaining({
      username: 'new-user',
      password: 'correct password',
      email: 'new@example.com',
      verification_code: '123456',
    }),
    { params: { turnstile: '' } }
  )
  expect(useAuthStore.getState().auth.user).toBeNull()
})

it('omits OAuth registration buttons when server configuration disables them', async () => {
  renderEntry('sign-up', { oauth_register_enabled: false, github_oauth: true })
  await screen.findByLabelText('Username')
  expect(
    screen.queryByRole('button', { name: 'Continue with GitHub' })
  ).not.toBeInTheDocument()
})
