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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { PerfSummaryAllData } from '@/features/performance-metrics/types'
import type { PricingData } from '@/features/pricing/types'
import { api } from '@/lib/api'
import type { ModelAvailabilitySearch } from '@/routes/_authenticated/model-availability'

import { AvailabilityDashboard } from '..'
import { AvailabilityModelRow } from '../components/availability-model-row'

const start = 1789387200

it('launches the chosen group when the same model has several availability rows', async () => {
  const onTest = vi.fn()
  const model = {
    model_name: 'grouped-model',
    enable_groups: ['default', 'vip'],
  }
  render(
    <ul>
      <AvailabilityModelRow
        item={{
          model,
          groups: ['default', 'vip'].map((group) => ({
            model,
            group,
            metrics: undefined,
            status: 'unknown',
          })),
        }}
        windowStart={start}
        windowEnd={start + 3600}
        onDetails={vi.fn()}
        onTest={onTest}
      />
    </ul>
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Test grouped-model in vip' })
  )
  expect(onTest).toHaveBeenCalledWith('grouped-model', 'vip')
})
const names = [
  'alpha-model',
  'beta-model',
  'gamma-model',
  'delta-model',
  'idle-model',
]
const catalog: PricingData = {
  success: true,
  data: names.map((name, index) => ({
    id: index + 1,
    model_name: name,
    vendor_id: 1,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  })),
  vendors: [{ id: 1, name: 'Example AI' }],
  group_ratio: {},
  usable_group: {},
  supported_endpoint: {},
  auto_groups: [],
}
const metrics: PerfSummaryAllData = {
  success: true,
  data: {
    window_start: start,
    window_end: start + 23 * 3600 + 1800,
    models: [
      {
        model_name: 'alpha-model',
        success_rate: 99.01,
        avg_latency_ms: 1009,
        avg_tps: 5,
        recent_success_series: [{ ts: start, success_rate: 99.01 }],
      },
      {
        model_name: 'beta-model',
        success_rate: 89.99,
        avg_latency_ms: 2000,
        avg_tps: 4,
      },
      {
        model_name: 'gamma-model',
        success_rate: 69.99,
        avg_latency_ms: 1500,
        avg_tps: 3,
      },
      {
        model_name: 'delta-model',
        success_rate: 0,
        avg_latency_ms: 6000,
        avg_tps: 0,
      },
      {
        model_name: 'hidden-model',
        success_rate: 100,
        avg_latency_ms: 1,
        avg_tps: 1,
      },
    ],
    recent_success_series: {
      'idle-model': [{ ts: start - 3600, success_rate: 100 }],
    },
  },
}
metrics.data.group_models = metrics.data.models.map((item) => ({
  ...item,
  group: 'default',
}))

const monitor = {
  success: true,
  data: {
    probe_enabled: false,
    alerts_enabled: false,
    last_run_at: 0,
    last_probe_at: 0,
    running: false,
    probe: {
      window_start: start,
      window_end: metrics.data.window_end,
      models: [],
      group_models: [],
    },
  },
}
const incidents = {
  success: true,
  data: { items: [], total: 0, page: 1, page_size: 20 },
}
function monitoringResponse(url: string | undefined) {
  if (url === '/api/model-availability/monitor') return monitor
  if (url === '/api/model-availability/incidents') return incidents
  return undefined
}

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {})
})
afterEach(() => client.clear())

function renderPage(initial: Partial<ModelAvailabilitySearch> = {}) {
  function Harness() {
    const [search, setSearch] = useState<ModelAvailabilitySearch>({
      source: 'real',
      hours: 24,
      q: '',
      status: 'all',
      group: '',
      page: 1,
      ...initial,
    })
    return (
      <AvailabilityDashboard
        search={search}
        onSearchChange={(changes) =>
          setSearch((previous) => ({ ...previous, ...changes }))
        }
      />
    )
  }
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
}
function mockRequests(options: { empty?: boolean; failure?: boolean } = {}) {
  return vi.spyOn(api, 'get').mockImplementation(async (url) => {
    const monitoring = monitoringResponse(url)
    if (monitoring) return { data: monitoring }
    if (url === '/api/pricing') {
      return { data: { ...catalog, data: options.empty ? [] : catalog.data } }
    }
    if (url === '/api/perf-metrics/summary') {
      if (options.failure) {
        return { data: { success: false, message: 'failed' } }
      }
      return { data: metrics }
    }
    throw new Error(`Unexpected API: ${url}`)
  })
}

it('shows catalog models with real rates, preserves zero, and does not leak models outside the catalog', async () => {
  mockRequests()
  renderPage()
  const list = await screen.findByRole('list', { name: 'Model Availability' })
  expect(within(list).getByText('99.01%')).toBeVisible()
  expect(within(list).getByText('0.00%')).toBeVisible()
  expect(within(list).queryByText('hidden-model')).not.toBeInTheDocument()
  expect(within(list).getAllByRole('listitem')).toHaveLength(5)
  expect(
    within(screen.getByRole('group', { name: 'Healthy' })).getByText('1')
  ).toBeVisible()
  expect(
    within(screen.getByRole('group', { name: 'Degraded' })).getByText('1')
  ).toBeVisible()
  expect(
    within(screen.getByRole('group', { name: 'High failure rate' })).getByText(
      '2'
    )
  ).toBeVisible()
})

it('keeps an idle model gray despite older top-level recent samples outside the selected window', async () => {
  mockRequests()
  renderPage({ status: 'unknown' })
  const list = await screen.findByRole('list', { name: 'Model Availability' })
  expect(within(list).getByText('idle-model')).toBeVisible()
  expect(within(list).getAllByText('—')).toHaveLength(2)
  expect(within(list).queryByText('100.00%')).not.toBeInTheDocument()
  expect(list.querySelectorAll('[data-status="sampled"]')).toHaveLength(0)
})

it('uses a loading state while the first metrics request is pending rather than announcing missing models', () => {
  vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined))
  renderPage()
  expect(
    screen.getByRole('status', { name: 'Checking model availability' })
  ).toBeVisible()
  expect(screen.queryByText('No models available')).not.toBeInTheDocument()
})

it('shows an API failure as an error and lets the user retry successfully', async () => {
  const request = mockRequests({ failure: true })
  renderPage()
  expect(
    await screen.findByText('Unable to load model availability.')
  ).toBeVisible()
  expect(screen.queryByText('No models available')).not.toBeInTheDocument()
  request.mockImplementation(async (url) => ({
    data:
      monitoringResponse(url) ?? (url === '/api/pricing' ? catalog : metrics),
  }))
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('list', { name: 'Model Availability' })
  ).toBeVisible()
})

it('keeps loaded rows visible when a refresh fails and explains that the data is stale', async () => {
  const request = mockRequests()
  renderPage()
  await screen.findByRole('list', { name: 'Model Availability' })
  request.mockRejectedValue(new Error('temporary outage'))
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(
    await screen.findByText(
      'Unable to refresh availability. Showing the last loaded data.'
    )
  ).toBeVisible()
  expect(screen.getByText('99.01%')).toBeVisible()
})

it('shows a genuine empty catalog without fabricated models', async () => {
  mockRequests({ empty: true })
  renderPage()
  expect(await screen.findByText('No models available')).toBeVisible()
  expect(
    screen.queryByRole('list', { name: 'Model Availability' })
  ).not.toBeInTheDocument()
})

it('filters by submitted model or vendor search and clears an unmatched filter', async () => {
  mockRequests()
  renderPage({ q: 'nothing-matches', page: 3 })
  expect(await screen.findByText('No models match your filters.')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(
    await screen.findByRole('list', { name: 'Model Availability' })
  ).toBeVisible()
  await userEvent.type(
    screen.getByRole('searchbox', { name: 'Search models' }),
    'alpha'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('list', { name: 'Model Availability' })
      ).getAllByRole('listitem')
    ).toHaveLength(1)
  )
  expect(screen.getByText('alpha-model')).toBeVisible()
})

it('switches to seven days using the real API window rather than relabeling the old samples', async () => {
  const request = mockRequests()
  renderPage()
  await screen.findByRole('list', { name: 'Model Availability' })
  await userEvent.click(screen.getByRole('tab', { name: 'Last 7 days' }))
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/api/perf-metrics/summary', {
      params: { hours: 168, recent_model: undefined, include_groups: true },
      paramsSerializer: { indexes: null },
    })
  )
  expect(screen.getByRole('tab', { name: 'Last 7 days' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
})

it('paginates whole models while keeping every group together on the same page', async () => {
  const data = Array.from({ length: 13 }, (_, index) => ({
    ...catalog.data[0],
    id: index + 1,
    model_name: `model-${String(index + 1).padStart(2, '0')}`,
    enable_groups: ['default', 'vip'],
  }))
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      monitoringResponse(url) ??
      (url === '/api/pricing' ? { ...catalog, data } : metrics),
  }))
  renderPage()
  const list = await screen.findByRole('list', { name: 'Model Availability' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(12)
  expect(
    within(screen.getByRole('navigation', { name: 'Page' })).getByText('13')
  ).toBeVisible()
  const lastModelOnFirstPage = within(list).getByRole('listitem', {
    name: 'model-12',
  })
  expect(
    within(lastModelOnFirstPage).getByRole('group', {
      name: 'model-12 · default',
    })
  ).toBeVisible()
  expect(
    within(lastModelOnFirstPage).getByRole('group', {
      name: 'model-12 · vip',
    })
  ).toBeVisible()
  expect(screen.queryByText('Rows per page')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  expect(within(list).getByText('model-13')).toBeVisible()
  expect(
    within(list).getByRole('group', { name: 'model-13 · default' })
  ).toBeVisible()
  expect(
    within(list).getByRole('group', { name: 'model-13 · vip' })
  ).toBeVisible()
})

it('uses the authenticated model directory when the public model square is disabled', async () => {
  client.setQueryData(['status'], {
    HeaderNavModules: { pricing: { enabled: false, requireAuth: false } },
  })
  const request = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    const monitoring = monitoringResponse(url)
    if (monitoring) return { data: monitoring }
    if (url === '/api/user/self/groups') {
      return {
        data: {
          success: true,
          data: { default: { desc: 'Default', ratio: 1 } },
        },
      }
    }
    if (url === '/api/user/models') {
      return { data: { success: true, data: ['alpha-model', 'idle-model'] } }
    }
    if (url === '/api/perf-metrics/summary') return { data: metrics }
    throw new Error('The public model square is disabled')
  })
  renderPage()
  const list = await screen.findByRole('list', { name: 'Model Availability' })
  expect(within(list).getByText('alpha-model')).toBeVisible()
  expect(within(list).getByText('idle-model')).toBeVisible()
  expect(request).toHaveBeenCalledWith('/api/user/models', {
    params: { group: 'default' },
  })
  expect(request).not.toHaveBeenCalledWith('/api/pricing')
})

it('shows a model once with independent group rates and opens details for the selected group', async () => {
  const groupedCatalog = {
    ...catalog,
    data: catalog.data.map((model) =>
      model.model_name === 'alpha-model'
        ? { ...model, enable_groups: ['default', 'vip'] }
        : model
    ),
  }
  const groupedMetrics = {
    ...metrics,
    data: {
      ...metrics.data,
      group_models: [
        ...(metrics.data.group_models ?? []),
        {
          model_name: 'alpha-model',
          group: 'vip',
          success_rate: 20,
          avg_latency_ms: 3000,
          avg_tps: 2,
        },
      ],
    },
  }
  const request = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    const monitoring = monitoringResponse(url)
    if (monitoring) return { data: monitoring }
    if (url === '/api/perf-metrics') {
      return {
        data: {
          success: true,
          data: {
            model_name: 'alpha-model',
            window_start: start,
            window_end: metrics.data.window_end,
            summary: { success_rate: 20, avg_latency_ms: 3000, avg_tps: 2 },
            series: [],
            groups: [],
          },
        },
      }
    }
    return { data: url === '/api/pricing' ? groupedCatalog : groupedMetrics }
  })
  renderPage({ q: 'alpha' })
  const list = await screen.findByRole('list', { name: 'Model Availability' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  expect(
    within(list).getAllByRole('heading', { name: 'alpha-model' })
  ).toHaveLength(1)
  const model = within(list).getByRole('listitem', { name: 'alpha-model' })
  const defaultRow = within(model).getByRole('group', {
    name: 'alpha-model · default',
  })
  const vipRow = within(model).getByRole('group', {
    name: 'alpha-model · vip',
  })
  expect(within(defaultRow).getByText('99.01%')).toBeVisible()
  expect(within(defaultRow).getAllByText('Healthy').length).toBeGreaterThan(0)
  expect(within(vipRow).getByText('20.00%')).toBeVisible()
  expect(
    within(vipRow).getAllByText('High failure rate').length
  ).toBeGreaterThan(0)
  await userEvent.click(
    within(vipRow).getByRole('button', {
      name: 'View availability details for alpha-model in vip',
    })
  )
  const dialog = await screen.findByRole('dialog', {
    name: 'Model availability details',
  })
  expect(await within(dialog).findByText('20.00%')).toBeVisible()
  expect(within(dialog).queryByText('99.01%')).not.toBeInTheDocument()
  expect(request).toHaveBeenCalledWith('/api/perf-metrics', {
    params: { model: 'alpha-model', hours: 24, group: 'vip' },
  })
})

it('filters a specific group without mixing in another group of the same model', async () => {
  const groupedCatalog = {
    ...catalog,
    data: [{ ...catalog.data[0], enable_groups: ['default', 'vip'] }],
  }
  const groupedMetrics = {
    ...metrics,
    data: {
      ...metrics.data,
      group_models: [
        ...(metrics.data.group_models ?? []),
        {
          model_name: 'alpha-model',
          group: 'vip',
          success_rate: 20,
          avg_latency_ms: 3000,
          avg_tps: 2,
        },
      ],
    },
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      monitoringResponse(url) ??
      (url === '/api/pricing' ? groupedCatalog : groupedMetrics),
  }))
  renderPage()
  await screen.findByRole('list', { name: 'Model Availability' })
  await userEvent.click(screen.getByRole('combobox', { name: 'Group' }))
  await userEvent.click(screen.getByRole('option', { name: 'vip' }))
  const list = screen.getByRole('list', { name: 'Model Availability' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  expect(
    within(list).getByRole('listitem', { name: 'alpha-model' })
  ).toBeVisible()
  expect(
    within(list).getByRole('group', { name: 'alpha-model · vip' })
  ).toBeVisible()
  expect(
    within(list).queryByRole('group', { name: 'alpha-model · default' })
  ).not.toBeInTheDocument()
  expect(within(list).queryByText('99.01%')).not.toBeInTheDocument()
})

it('keeps a missing group unknown even when another group and the model aggregate are healthy', async () => {
  const groupedCatalog = {
    ...catalog,
    data: [{ ...catalog.data[0], enable_groups: ['default', 'vip'] }],
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      monitoringResponse(url) ??
      (url === '/api/pricing' ? groupedCatalog : metrics),
  }))
  renderPage({ group: 'vip' })
  const list = await screen.findByRole('list', { name: 'Model Availability' })
  expect(list).toHaveTextContent('No samples')
  expect(within(list).getAllByText('—')).toHaveLength(2)
  expect(within(list).queryByText('99.01%')).not.toBeInTheDocument()
  expect(list.querySelectorAll('[data-status="sampled"]')).toHaveLength(0)
})

it('switches to disabled probes without borrowing real-request rates or sending upstream requests', async () => {
  mockRequests()
  const post = vi.spyOn(api, 'post')
  renderPage({ q: 'alpha' })
  const list = await screen.findByRole('list', { name: 'Model Availability' })
  expect(within(list).getByText('99.01%')).toBeVisible()
  await userEvent.click(screen.getByRole('tab', { name: 'Active probes' }))
  expect(screen.getByRole('tab', { name: 'Active probes' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(await screen.findByText('Active probes are disabled')).toBeVisible()
  expect(within(list).queryByText('99.01%')).not.toBeInTheDocument()
  expect(within(list).getAllByText('—')).toHaveLength(2)
  expect(post).not.toHaveBeenCalled()
})
