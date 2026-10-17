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
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { QuotaDataItem } from '../../types'
import { useOverviewUsage } from '../use-overview-usage'

let client: QueryClient
let rows: QuotaDataItem[]

beforeEach(() => {
  vi.setSystemTime(new Date(2026, 9, 16, 23, 59))
  useAuthStore
    .getState()
    .auth.setUser({ id: 7, username: 'console-user', role: 1 })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  rows = [
    {
      created_at: new Date(2026, 9, 16, 12).getTime() / 1000,
      count: 10,
      quota: 500000,
      token_used: 900,
    },
  ]
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/data/self') return { data: { success: true, data: rows } }
    throw new Error(`Unexpected overview usage request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  window.localStorage.clear()
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})

function Wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}

describe('overview usage date rollover', () => {
  it('refreshes the current calendar range and both shared observers after midnight', async () => {
    const { result } = renderHook(
      () => ({ cards: useOverviewUsage(), chart: useOverviewUsage() }),
      { wrapper: Wrapper }
    )
    await waitFor(() =>
      expect(result.current.cards.todayStats.totalCount).toBe(10)
    )
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(2026, 9, 17, 0, 5))
    rows = [
      ...rows,
      {
        created_at: new Date(2026, 9, 17, 0, 1).getTime() / 1000,
        count: 3,
        quota: 250000,
        token_used: 700,
      },
    ]
    await act(async () => {
      await result.current.chart.refetch()
    })

    await waitFor(() =>
      expect(result.current.cards.todayStats).toEqual({
        totalQuota: 250000,
        totalCount: 3,
        totalTokens: 700,
      })
    )
    expect(result.current.chart.todayStats).toEqual(
      result.current.cards.todayStats
    )
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.get).mock.calls.at(-1)).toEqual([
      '/api/data/self',
      {
        params: {
          start_timestamp: new Date(2026, 9, 11).getTime() / 1000,
          end_timestamp: new Date(2026, 9, 17, 23, 59, 59).getTime() / 1000,
          default_time: 'hour',
        },
      },
    ])
  })

  it('refreshes on the new calendar day even when a focused page is within the cache freshness window', async () => {
    vi.setSystemTime(new Date(2026, 9, 16, 23, 59, 50))
    const { result } = renderHook(useOverviewUsage, { wrapper: Wrapper })
    await waitFor(() => expect(result.current.todayStats.totalCount).toBe(10))
    act(() => focusManager.setFocused(false))
    vi.setSystemTime(new Date(2026, 9, 17, 0, 0, 10))
    rows = []
    act(() => focusManager.setFocused(true))

    await waitFor(() => expect(result.current.todayStats.totalCount).toBe(0))
    expect(vi.mocked(api.get).mock.calls.at(-1)?.[1]).toEqual({
      params: {
        start_timestamp: new Date(2026, 9, 11).getTime() / 1000,
        end_timestamp: new Date(2026, 9, 17, 23, 59, 59).getTime() / 1000,
        default_time: 'hour',
      },
    })
  })
})
