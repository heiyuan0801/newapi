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
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { AffiliateDetails } from '../components/affiliate-details'
import { AffiliatePage } from '../components/affiliate-page'
import type { UserWalletData } from '../types'

const account: UserWalletData = {
  id: 19,
  username: 'referrer',
  group: 'default',
  quota: 2000000,
  used_quota: 500000,
  request_count: 12,
  aff_quota: 1000000,
  aff_history_quota: 3000000,
  aff_count: 4,
}

const clients: QueryClient[] = []

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <AffiliatePage />
    </QueryClientProvider>
  )
}

function mockRequests(options?: {
  quota?: number
  compliance?: boolean
  failCompliance?: boolean
}) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self') {
      return {
        data: {
          success: true,
          data: { ...account, aff_quota: options?.quota ?? account.aff_quota },
        },
      }
    }
    if (url === '/api/user/aff/rewards') {
      return {
        data: {
          success: true,
          data: { items: [], total: 0, page: 1, page_size: 10 },
        },
      }
    }
    if (url === '/api/user/aff') {
      return { data: { success: true, data: 'invite-19' } }
    }
    if (url === '/api/user/topup/info') {
      return {
        data: {
          success: !options?.failCompliance,
          data: {
            payment_compliance_confirmed: options?.compliance ?? true,
          },
        },
      }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  const base = get.getMockImplementation()
  if (!base) throw new Error('Expected the referral API fixture')
  return { get, base }
}

beforeEach(() => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 19, username: 'referrer', role: 1 })
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
})

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG },
  })
})

describe('referral overview', () => {
  it('keeps long invitation codes breakable and the read-only link input within its responsive column', () => {
    const code = 'long-invitation-'.repeat(40)
    render(
      <AffiliateDetails
        affiliateCode={code}
        affiliateLink={`https://example.test/sign-up?aff=${code}`}
        loading={false}
        onRetry={vi.fn()}
      />
    )
    expect(screen.getByText(code, { selector: 'code' })).toHaveClass(
      'break-all',
      'max-w-full'
    )
    expect(screen.getByRole('textbox', { name: 'Referral Link' })).toHaveClass(
      'min-w-0'
    )
    expect(screen.getByLabelText('Referral details')).toHaveClass('min-w-0')
  })

  it('shows actual pending rewards, lifetime rewards and invitation count with a responsive three-card layout', async () => {
    mockRequests()
    renderPage()
    await screen.findByDisplayValue(
      'http://localhost:3000/sign-up?aff=invite-19'
    )
    const summary = screen.getByLabelText('Referral statistics')
    expect(summary).toHaveClass('sm:grid-cols-3', 'min-w-0')
    expect(summary).toHaveAttribute('aria-busy', 'false')
    expect(within(summary).getByText('$2')).toBeVisible()
    expect(within(summary).getByText('$6')).toBeVisible()
    expect(within(summary).getByText('4')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /withdraw/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: /record/i })
    ).not.toBeInTheDocument()
  })

  it('copies the actual referral link and code through the shared accessible copy buttons', async () => {
    const user = userEvent.setup()
    mockRequests()
    renderPage()
    const link = await screen.findByRole('textbox', { name: 'Referral Link' })
    expect(link).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Copy referral link' }))
    expect(await navigator.clipboard.readText()).toBe(
      'http://localhost:3000/sign-up?aff=invite-19'
    )
    await user.click(screen.getByRole('button', { name: 'Copy referral code' }))
    expect(await navigator.clipboard.readText()).toBe('invite-19')
  })

  it('switches between real link and reward guidance with accessible capsule tabs', async () => {
    const user = userEvent.setup()
    mockRequests()
    renderPage()
    const rules = await screen.findByRole('tab', { name: 'Reward rules' })
    await user.click(rules)
    expect(rules).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByText('Referral rewards are configured by the administrator.')
    ).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: 'Referral Link' })
    ).not.toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Referral Link' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Referral Link' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('textbox', { name: 'Referral Link' })).toBeVisible()
  })

  it('retries a failed referral-code request without presenting a copyable empty link', async () => {
    const user = userEvent.setup()
    let affiliateAttempts = 0
    const { get, base } = mockRequests()
    get.mockImplementation(async (url, options) => {
      if (url === '/api/user/aff' && affiliateAttempts++ === 0) {
        return { data: { success: false, message: 'Unavailable' } }
      }
      return base(url, options)
    })
    renderPage()
    expect(
      await screen.findByText('Unable to load your referral link')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Copy referral link' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('textbox', { name: 'Referral Link' })
    ).toHaveValue('http://localhost:3000/sign-up?aff=invite-19')
  })

  it('shows an account-data error and permits retry without treating missing values as zero rewards', async () => {
    const user = userEvent.setup()
    let selfAttempts = 0
    const { get, base } = mockRequests()
    get.mockImplementation(async (url, options) => {
      if (url === '/api/user/self' && selfAttempts++ === 0) {
        return { data: { success: false, message: 'Unavailable' } }
      }
      return base(url, options)
    })
    renderPage()
    expect(
      await screen.findByText('Unable to load your referral statistics')
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Transfer to Balance' })
    ).toBeDisabled()
    expect(
      within(screen.getByLabelText('Referral statistics')).queryByText('$0')
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('$2')).toBeVisible()
    expect(
      screen.queryByText('Unable to load your referral statistics')
    ).not.toBeInTheDocument()
  })
})

describe('referral transfer availability and confirmation', () => {
  it('keeps transfer disabled until the compliance request finishes successfully', async () => {
    let resolveCompliance: (value: unknown) => void = () => undefined
    const { get, base } = mockRequests()
    get.mockImplementation((url, options) => {
      if (url === '/api/user/topup/info') {
        return new Promise((resolve) => {
          resolveCompliance = resolve
        })
      }
      return base(url, options)
    })
    renderPage()
    await screen.findByRole('textbox', { name: 'Referral Link' })
    const transfer = screen.getByRole('button', { name: 'Transfer to Balance' })
    expect(transfer).toBeDisabled()
    await act(async () =>
      resolveCompliance({
        data: { success: true, data: { payment_compliance_confirmed: true } },
      })
    )
    await waitFor(() => expect(transfer).toBeEnabled())
  })

  it.each([0, 250000])(
    'keeps transfer disabled when the available reward is %i quota units, below the server minimum',
    async (quota) => {
      mockRequests({ quota })
      const post = vi.spyOn(api, 'post')
      renderPage()
      await screen.findByRole('textbox', { name: 'Referral Link' })
      expect(
        screen.getByRole('button', { name: 'Transfer to Balance' })
      ).toBeDisabled()
      expect(post).not.toHaveBeenCalled()
    }
  )

  it('keeps transfer disabled while compliance has not been confirmed and explains the restriction', async () => {
    mockRequests({ compliance: false })
    const post = vi.spyOn(api, 'post')
    renderPage()
    expect(
      await screen.findByText(
        'Referral reward transfer is disabled until the administrator confirms compliance terms.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Transfer to Balance' })
    ).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })

  it('keeps transfer disabled when compliance cannot be verified and provides a retry action', async () => {
    mockRequests({ failCompliance: true })
    renderPage()
    expect(
      await screen.findByText('Unable to verify reward transfer availability')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Transfer to Balance' })
    ).toBeDisabled()
  })

  it('opens the existing amount-confirmation dialog without moving funds and lets the user cancel', async () => {
    const user = userEvent.setup()
    mockRequests()
    const post = vi.spyOn(api, 'post')
    renderPage()
    const transfer = screen.getByRole('button', { name: 'Transfer to Balance' })
    await waitFor(() => expect(transfer).toBeEnabled())
    await user.click(transfer)
    const dialog = await screen.findByRole('dialog', {
      name: 'Transfer Rewards',
    })
    expect(
      within(dialog).getByRole('spinbutton', { name: 'Transfer Amount' })
    ).toHaveValue(1)
    expect(post).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('validates the amount, waits for confirmation and keeps the dialog visible during a transfer', async () => {
    const user = userEvent.setup()
    let transferred = false
    let resolveTransfer: (value: unknown) => void = () => undefined
    const { get, base } = mockRequests()
    get.mockImplementation(async (url, options) => {
      if (transferred && url === '/api/user/self') {
        return { data: { success: true, data: { ...account, aff_quota: 0 } } }
      }
      return base(url, options)
    })
    const post = vi.spyOn(api, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTransfer = resolve
        })
    )
    renderPage()
    const transfer = screen.getByRole('button', { name: 'Transfer to Balance' })
    await waitFor(() => expect(transfer).toBeEnabled())
    await user.click(transfer)
    const dialog = await screen.findByRole('dialog', {
      name: 'Transfer Rewards',
    })
    const amount = within(dialog).getByRole('spinbutton', {
      name: 'Transfer Amount',
    })
    const confirm = within(dialog).getByRole('button', { name: 'Transfer' })
    await user.clear(amount)
    await user.type(amount, '3')
    expect(confirm).toBeDisabled()
    await user.clear(amount)
    await user.type(amount, '2')
    expect(confirm).toBeEnabled()
    expect(post).not.toHaveBeenCalled()
    await user.click(confirm)
    expect(post).toHaveBeenCalledWith('/api/user/aff_transfer', {
      quota: 1000000,
    })
    expect(dialog).toBeVisible()
    expect(confirm).toBeDisabled()
    await act(async () => {
      transferred = true
      resolveTransfer({ data: { success: true } })
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(
      within(screen.getByLabelText('Referral statistics')).getByText('$0')
    ).toBeVisible()
    expect(transfer).toBeDisabled()
  })

  it('keeps the confirmation open when the server refuses a transfer', async () => {
    const user = userEvent.setup()
    mockRequests()
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { success: false, message: 'Transfer refused' },
    })
    renderPage()
    const transfer = screen.getByRole('button', { name: 'Transfer to Balance' })
    await waitFor(() => expect(transfer).toBeEnabled())
    await user.click(transfer)
    const dialog = await screen.findByRole('dialog', {
      name: 'Transfer Rewards',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }))
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Transfer' })
      ).toBeEnabled()
    )
    expect(dialog).toBeVisible()
    expect(
      within(screen.getByLabelText('Referral statistics')).getByText('$2')
    ).toBeVisible()
  })
})
