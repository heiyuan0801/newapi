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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { NotificationDeliveriesPanel } from '..'

const clients: QueryClient[] = []
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  useAuthStore.getState().auth.setUser(null)
  vi.restoreAllMocks()
})
function show(role: number) {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <NotificationDeliveriesPanel />
    </QueryClientProvider>
  )
}
it('ordinary accounts cannot load admin delivery records', () => {
  const get = vi.spyOn(api, 'get')
  show(1)
  expect(
    screen.queryByText('Notification delivery records')
  ).not.toBeInTheDocument()
  expect(get).not.toHaveBeenCalled()
})
it('operators distinguish retries and failures and test only their own configured account', async () => {
  const user = userEvent.setup()
  const item = {
    id: 2,
    kind: 'availability_fault',
    status: 'retry',
    attempts: 1,
    max_attempts: 4,
    updated_at: 100,
    next_attempt_at: 200,
    last_error_code: 'delivery_failed',
  }
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { items: [item], total: 21, page: 1, page_size: 20 },
    },
  })
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { ...item, status: 'pending' } },
  })
  show(10)
  expect(await screen.findByText('Retry scheduled')).toBeVisible()
  expect(
    screen.getByText('Provider did not accept the notification')
  ).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Send test notification' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/notification-deliveries/test')
  )
  expect(
    await screen.findByText(/Test notification recorded/)
  ).toHaveTextContent('Queued')
  await user.click(screen.getByRole('button', { name: 'Go to next page' }))
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith('/api/notification-deliveries', {
      params: { status: 'all', page: 2, page_size: 20 },
    })
  )
})
