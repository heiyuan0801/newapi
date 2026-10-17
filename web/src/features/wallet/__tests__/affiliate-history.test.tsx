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

import { AffiliateHistory } from '../components/affiliate-history'

const clients: QueryClient[] = []
function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <AffiliateHistory />
    </QueryClientProvider>
  )
}
function success(page = 1) {
  return {
    data: {
      success: true,
      data: {
        items: [{ id: page, quota: page * 500000, created_at: 1770000000 }],
        total: 11,
        page,
        page_size: 10,
      },
    },
  }
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
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

describe('per-reward referral history', () => {
  it('paginates real rewards without exposing invitee identities or suggesting retroactive records', async () => {
    const user = userEvent.setup()
    const get = vi
      .spyOn(api, 'get')
      .mockImplementation(async (_url, options) => success(options?.params.p))
    renderHistory()
    const table = await screen.findByRole('table', { name: 'Referral rewards' })
    expect(within(table).getByText('$1')).toBeVisible()
    expect(within(table).getByText('Registration reward')).toBeVisible()
    expect(within(table).getByText('Issued')).toBeVisible()
    expect(
      screen.getByText(
        'Detailed records begin with rewards issued after this upgrade. Earlier cumulative rewards remain unchanged.'
      )
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(await screen.findByText('$2')).toBeVisible()
    expect(get).toHaveBeenLastCalledWith('/api/user/aff/rewards', {
      params: { p: 2, page_size: 10 },
    })
    expect(
      screen.getByRole('button', { name: 'Go to next page' })
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'Go to previous page' })
    )
    expect(await screen.findByText('$1')).toBeVisible()
  })

  it('uses a distinct empty state for an existing account with no detailed rewards', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 10 },
      },
    })
    renderHistory()
    expect(
      await screen.findByText('No detailed referral rewards yet')
    ).toBeVisible()
    expect(
      screen.queryByRole('table', { name: 'Referral rewards' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'New registration rewards will appear here after they are issued.'
      )
    ).toBeVisible()
  })

  it('retries failed history and keeps old records visible with an explicit refresh warning', async () => {
    const user = userEvent.setup()
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: { success: false, message: 'Rewards unavailable' },
      })
      .mockResolvedValue(success())
    renderHistory()
    expect(
      await screen.findByText('Unable to load referral reward history')
    ).toBeVisible()
    expect(
      screen.queryByText('No detailed referral rewards yet')
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    const table = await screen.findByRole('table', { name: 'Referral rewards' })
    expect(within(table).getByText('$1')).toBeVisible()
    get.mockResolvedValue({
      data: { success: false, message: 'Rewards unavailable' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Refresh referral reward history' })
    )
    expect(
      await screen.findByText(
        'Unable to refresh rewards. Showing the last loaded records.'
      )
    ).toBeVisible()
    expect(within(table).getByText('$1')).toBeVisible()
  })

  it('clamps a removed last page and refreshes the previously cached first page', async () => {
    const user = userEvent.setup()
    let firstPageReads = 0
    const get = vi
      .spyOn(api, 'get')
      .mockImplementation(async (_url, options) => {
        if (options?.params.p === 2) {
          return {
            data: {
              success: true,
              data: { items: [], total: 0, page: 1, page_size: 10 },
            },
          }
        }
        firstPageReads += 1
        if (firstPageReads > 1) {
          return {
            data: {
              success: true,
              data: { items: [], total: 0, page: 1, page_size: 10 },
            },
          }
        }
        return success()
      })
    renderHistory()
    await screen.findByRole('table', { name: 'Referral rewards' })
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(
      await screen.findByText('No detailed referral rewards yet')
    ).toBeVisible()
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/user/aff/rewards', {
        params: { p: 1, page_size: 10 },
      })
    )
    expect(
      screen.queryByRole('table', { name: 'Referral rewards' })
    ).not.toBeInTheDocument()
  })
})
