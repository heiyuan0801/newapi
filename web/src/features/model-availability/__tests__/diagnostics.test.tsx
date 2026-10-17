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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { AvailabilityAdminDiagnostics } from '../components/availability-admin-diagnostics'
import type { AvailabilityDiagnosticsData } from '../diagnostics-api'

const data: AvailabilityDiagnosticsData = {
  model_name: 'example-model',
  group: 'default',
  source: 'probe',
  window_start: 1789387200,
  window_end: 1789470000,
  request_count: 10,
  success_count: 7,
  failure_count: 3,
  unsupported_count: 1,
  latency_sample_count: 10,
  p50_latency_ms: 100,
  p95_latency_ms: 1000,
  p99_latency_ms: 2000,
  latest_sample_at: 1789469000,
  latest_bucket_at: 0,
  collection_delay_seconds: 0,
  sample_limit: 20000,
  truncated: false,
  percentile_unavailable_reason: '',
  error_categories: [{ category: 'probe_timeout', count: 3 }],
  affected_channels: [{ id: 1, name: 'Example route', failures: 2 }],
  affected_channels_truncated: false,
  unattributed_failures: 1,
}
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 10 })
})
afterEach(() => {
  client.clear()
  useAuthStore.getState().auth.setUser(null)
})
function diagnostics(
  props: Partial<React.ComponentProps<typeof AvailabilityAdminDiagnostics>> = {}
) {
  return (
    <QueryClientProvider client={client}>
      <AvailabilityAdminDiagnostics
        model='example-model'
        group='default'
        hours={24}
        source='probe'
        open
        {...props}
      />
    </QueryClientProvider>
  )
}

it('does not request administrator diagnostics for ordinary users or closed details', () => {
  const request = vi.spyOn(api, 'get')
  useAuthStore.getState().auth.setUser({ id: 2, username: 'viewer', role: 1 })
  const view = render(diagnostics())
  expect(request).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('region', { name: 'Administrator diagnostics' })
  ).not.toBeInTheDocument()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 10 })
  view.rerender(diagnostics({ open: false }))
  expect(request).not.toHaveBeenCalled()
})

it('shows complete counts, exact percentiles and explicitly unattributed historical failures', async () => {
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data } })
  render(diagnostics())
  const counts = await screen.findByLabelText('Diagnostic sample counts')
  expect(within(counts).getByText('10')).toBeVisible()
  expect(within(counts).getByText('7')).toBeVisible()
  expect(within(counts).getByText('3')).toBeVisible()
  const percentiles = screen.getByLabelText('Latency percentiles')
  expect(within(percentiles).getByText('100ms')).toBeVisible()
  expect(within(percentiles).getByText('1.00s')).toBeVisible()
  expect(screen.getByText('Probe timed out')).toBeVisible()
  expect(screen.getByText('Example route')).toBeVisible()
  expect(
    screen.getByText(/Failures without channel attribution: 1/)
  ).toBeVisible()
  expect(request).toHaveBeenCalledWith('/api/model-availability/diagnostics', {
    params: {
      model: 'example-model',
      group: 'default',
      source: 'probe',
      hours: 24,
    },
  })
})

it('leaves capped percentiles unknown while keeping complete sample counts visible', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...data,
        request_count: 20001,
        p50_latency_ms: null,
        p95_latency_ms: null,
        p99_latency_ms: null,
        truncated: true,
        percentile_unavailable_reason: 'sample_limit',
      },
    },
  })
  render(diagnostics())
  const percentiles = await screen.findByLabelText('Latency percentiles')
  expect(within(percentiles).getAllByText('—')).toHaveLength(3)
  expect(screen.getByRole('alert')).toHaveTextContent(
    /Counts still cover the entire window/
  )
  expect(
    within(screen.getByLabelText('Diagnostic sample counts')).getByText(
      '20,001'
    )
  ).toBeVisible()
})

it('explains completed-bucket delays and does not infer real percentiles or affected channels', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...data,
        source: 'real',
        p50_latency_ms: null,
        p95_latency_ms: null,
        p99_latency_ms: null,
        collection_delay_seconds: 3900,
        percentile_unavailable_reason: 'aggregated_real_metrics',
        error_categories: [],
        affected_channels: [],
      },
    },
  })
  render(diagnostics({ source: 'real' }))
  expect(
    await screen.findByText(
      /Collection cadence can delay persisted data by 65 minutes/
    )
  ).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent(
    /exact latency percentiles and affected channels are only available for measured probes/
  )
  expect(screen.queryByLabelText('Latency percentiles')).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('allows retry after diagnostics fail without replacing the failure with zero samples', async () => {
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({ data: { success: false, message: 'unavailable' } })
    .mockResolvedValueOnce({ data: { success: true, data } })
  render(diagnostics())
  expect(
    await screen.findByText('Unable to load availability diagnostics')
  ).toBeVisible()
  expect(
    screen.queryByLabelText('Diagnostic sample counts')
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByLabelText('Diagnostic sample counts')).toBeVisible()
  expect(request).toHaveBeenCalledTimes(2)
})

it('keeps model groups in separate diagnostic queries and shows a safe empty-channel fallback', async () => {
  const request = vi.spyOn(api, 'get').mockImplementation(
    async (_url, config) =>
      ({
        data: {
          success: true,
          data: {
            ...data,
            group: config?.params.group,
            affected_channels: [],
            error_categories: [],
            failure_count: 0,
          },
        },
      }) as Awaited<ReturnType<typeof api.get>>
  )
  const view = render(diagnostics())
  expect(await screen.findByText('No failed probes')).toBeVisible()
  expect(screen.getByText('No attributed channel failures')).toBeVisible()
  const table = screen.getByRole('table', {
    name: 'Channels with failed probes',
  })
  expect(table).toHaveClass('min-w-72')
  view.rerender(diagnostics({ group: 'vip' }))
  await screen.findByText('No failed probes')
  expect(request).toHaveBeenLastCalledWith(
    '/api/model-availability/diagnostics',
    {
      params: {
        model: 'example-model',
        group: 'vip',
        source: 'probe',
        hours: 24,
      },
    }
  )
})
