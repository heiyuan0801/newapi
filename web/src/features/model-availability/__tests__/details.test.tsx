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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type {
  PerformanceMetricsData,
  PerfSummaryAllData,
} from '@/features/performance-metrics/types'
import type { PricingModel } from '@/features/pricing/types'
import { api } from '@/lib/api'

import { AvailabilityDetails } from '../components/availability-details'

const model: PricingModel = {
  id: 1,
  model_name: 'example-model',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
}
const start = 1789387200
const response: PerformanceMetricsData = {
  success: true,
  data: {
    model_name: model.model_name,
    window_start: start,
    window_end: start + 23 * 3600 + 1800,
    summary: { success_rate: 99.01, avg_latency_ms: 1009, avg_tps: 5 },
    series: [
      {
        ts: start,
        success_rate: 100,
        avg_latency_ms: 1000,
        avg_ttft_ms: 100,
        avg_tps: 5,
      },
      {
        ts: start + 3600,
        success_rate: 0,
        avg_latency_ms: 2000,
        avg_ttft_ms: 0,
        avg_tps: 0,
      },
    ],
    groups: [],
  },
}
const defaultGroupSummary = {
  model_name: model.model_name,
  group: 'default',
  success_rate: 99.01,
  avg_latency_ms: 1009,
  avg_tps: 5,
  recent_success_series: [{ ts: start, success_rate: 99.01 }],
}
const hourlyResponse: PerfSummaryAllData = {
  success: true,
  data: {
    window_start: start,
    window_end: response.data.window_end,
    group_models: [defaultGroupSummary],
    models: [
      {
        model_name: model.model_name,
        success_rate: 99.01,
        avg_latency_ms: 1009,
        avg_tps: 5,
        recent_success_series: [{ ts: start, success_rate: 99.01 }],
      },
    ],
  },
}

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['model-availability-summary', 24], hourlyResponse)
  client.setQueryData(['model-availability-summary', 168], hourlyResponse)
})
afterEach(() => client.clear())

function details(
  props: Partial<React.ComponentProps<typeof AvailabilityDetails>> = {}
) {
  return (
    <QueryClientProvider client={client}>
      <AvailabilityDetails
        model={model}
        group='default'
        hours={24}
        open
        onOpenChange={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  )
}

it('does not request performance while the details dialog is closed or no model is selected', () => {
  const request = vi.spyOn(api, 'get')
  const view = render(details({ open: false }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(request).not.toHaveBeenCalled()

  view.rerender(details({ model: null }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(request).not.toHaveBeenCalled()
})

it('announces a loading state without treating the in-flight request as empty samples', () => {
  vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined))
  render(details())

  expect(screen.getByRole('status')).toHaveTextContent('Loading...')
  expect(screen.queryByText('No samples')).not.toBeInTheDocument()
  expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
})

it('shows the weighted server summary and actual hourly metrics rather than averaging rates', async () => {
  const request = vi.spyOn(api, 'get').mockResolvedValue({ data: response })
  render(details())

  const summary = await screen.findByLabelText('Overview')
  expect(within(summary).getByText('99.01%')).toBeVisible()
  expect(within(summary).getByText('1.01s')).toBeVisible()
  expect(within(summary).getByText('5.00 t/s')).toBeVisible()
  expect(within(summary).queryByText('50.00%')).not.toBeInTheDocument()
  const table = screen.getByRole('table', { name: 'Metrics samples' })
  expect(within(table).getByText('0.00%')).toBeVisible()
  expect(within(table).getByText('100.00%')).toBeVisible()
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(request).toHaveBeenCalledWith('/api/perf-metrics', {
    params: { model: model.model_name, hours: 24, group: 'default' },
  })
  expect(request).toHaveBeenCalledTimes(1)
})

it('keeps a missing summary unknown while still exposing returned hourly data', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { ...response, data: { ...response.data, summary: null } },
  })
  render(details())

  const summary = await screen.findByLabelText('Overview')
  expect(within(summary).getAllByText('—')).toHaveLength(3)
  expect(within(summary).queryByText('50.00%')).not.toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'Metrics samples' })).toBeVisible()
})

it('shows empty samples instead of a zero success rate when the server returns no calls', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      ...response,
      data: { ...response.data, summary: null, series: [] },
    },
  })
  render(details())

  expect(await screen.findByText('No samples')).toBeVisible()
  expect(
    screen.getByText(
      'No calls were recorded for this model in the selected period.'
    )
  ).toBeVisible()
  expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('lets users retry a failed business response without misreporting no samples', async () => {
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({ data: { success: false, message: 'unavailable' } })
    .mockResolvedValueOnce({ data: response })
  render(details())

  expect(
    await screen.findByText('Unable to load model availability.')
  ).toBeVisible()
  expect(screen.queryByText('No samples')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('99.01%')).toBeVisible()
  expect(request).toHaveBeenCalledTimes(2)
})

it('requests distinct results after changing the selected period or model', async () => {
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({ data: response })
    .mockResolvedValueOnce({
      data: {
        ...response,
        data: {
          ...response.data,
          summary: { success_rate: 71, avg_latency_ms: 2000, avg_tps: 10 },
        },
      },
    })
    .mockResolvedValueOnce({
      data: {
        ...response,
        data: {
          ...response.data,
          model_name: 'second-model',
          summary: { success_rate: 96, avg_latency_ms: 3000, avg_tps: 15 },
        },
      },
    })
  const view = render(details())
  await screen.findByText('99.01%')

  view.rerender(details({ hours: 168 }))
  expect(await screen.findByText('71.00%')).toBeVisible()
  expect(request).toHaveBeenLastCalledWith('/api/perf-metrics', {
    params: { model: model.model_name, hours: 168, group: 'default' },
  })

  view.rerender(
    details({ hours: 168, model: { ...model, model_name: 'second-model' } })
  )
  expect(await screen.findByText('96.00%')).toBeVisible()
  expect(request).toHaveBeenLastCalledWith('/api/perf-metrics', {
    params: { model: 'second-model', hours: 168, group: 'default' },
  })
})

it('provides a named mobile-safe dialog and closes it with the keyboard', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: response })
  const onOpenChange = vi.fn()
  render(details({ onOpenChange }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Model availability details',
  })
  expect(dialog).toHaveAccessibleDescription(
    `${model.model_name} Group: default`
  )
  expect(dialog).toHaveClass('max-w-[calc(100%-2rem)]', 'overflow-y-auto')
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
})

it('uses server-weighted hourly rates while preserving five-minute samples as individual timestamps', async () => {
  client.setQueryData(['model-availability-summary', 24], {
    ...hourlyResponse,
    data: {
      ...hourlyResponse.data,
      recent_success_series: {
        [model.model_name]: [{ ts: start, success_rate: 0 }],
      },
    },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      ...response,
      data: {
        ...response.data,
        series: [
          {
            ts: start,
            success_rate: 100,
            avg_latency_ms: 1000,
            avg_ttft_ms: 100,
            avg_tps: 5,
          },
          {
            ts: start + 300,
            success_rate: 0,
            avg_latency_ms: 2000,
            avg_ttft_ms: 0,
            avg_tps: 0,
          },
        ],
      },
    },
  })
  render(details())

  const table = await screen.findByRole('table', { name: 'Metrics samples' })
  expect(
    within(table).getByRole('columnheader', { name: 'Sample time' })
  ).toBeVisible()
  const rows = within(table).getAllByRole('row').slice(1)
  expect(rows).toHaveLength(2)
  const latestTime = within(rows[0]).getAllByRole('cell')[0]
  const earlierTime = within(rows[1]).getAllByRole('cell')[0]
  expect(latestTime).toHaveTextContent(/:05/)
  expect(earlierTime).toHaveTextContent(/:00/)
  expect(latestTime).not.toHaveTextContent(' – ')
  expect(earlierTime).not.toHaveTextContent(' – ')

  await userEvent.click(
    screen.getByRole('button', {
      name: `Hourly availability for ${model.model_name}`,
    })
  )
  await userEvent.keyboard('{Home}')
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Success rate: 99.01%'
  )
})

it('keeps hourly loading separate from available summary and raw metrics', async () => {
  client.removeQueries({ queryKey: ['model-availability-summary', 24] })
  const request = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/api/perf-metrics/summary') {
      return new Promise(() => undefined)
    }
    return { data: response } as Awaited<ReturnType<typeof api.get>>
  })
  render(details())

  expect(await screen.findByLabelText('Overview')).toBeVisible()
  expect(request).toHaveBeenCalledWith('/api/perf-metrics/summary', {
    params: { hours: 24, recent_model: undefined, include_groups: true },
    paramsSerializer: { indexes: null },
  })
  expect(
    screen.getByRole('status', { name: 'Hourly success rate' })
  ).toHaveTextContent('Loading...')
  expect(screen.getByRole('table', { name: 'Metrics samples' })).toBeVisible()
  expect(
    screen.queryByRole('button', {
      name: `Hourly availability for ${model.model_name}`,
    })
  ).not.toBeInTheDocument()
})

it('retries a failed hourly query without substituting unweighted raw samples', async () => {
  client.removeQueries({ queryKey: ['model-availability-summary', 24] })
  let hourlyRequests = 0
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/api/perf-metrics/summary') {
      hourlyRequests += 1
      return {
        data:
          hourlyRequests === 1
            ? { success: false, message: 'temporarily unavailable' }
            : hourlyResponse,
      } as Awaited<ReturnType<typeof api.get>>
    }
    return { data: response } as Awaited<ReturnType<typeof api.get>>
  })
  render(details())

  expect(
    await screen.findByText('Unable to load hourly availability.')
  ).toBeVisible()
  expect(screen.getByRole('table', { name: 'Metrics samples' })).toBeVisible()
  expect(
    screen.queryByRole('button', {
      name: `Hourly availability for ${model.model_name}`,
    })
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('button', {
      name: `Hourly availability for ${model.model_name}`,
    })
  ).toBeVisible()
})

it.each(['period', 'model', 'group'] as const)(
  'paginates 51 samples in bounded pages and resets after changing the selected %s',
  async (selection) => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        ...response,
        data: {
          ...response.data,
          series: Array.from({ length: 51 }, (_, index) => ({
            ts: start + index * 60,
            success_rate: index === 0 ? 17 : 100,
            avg_latency_ms: 1000,
            avg_ttft_ms: 100,
            avg_tps: 5,
          })),
        },
      },
    })
    const view = render(details())

    const table = await screen.findByRole('table', { name: 'Metrics samples' })
    expect(within(table).getAllByRole('row')).toHaveLength(51)
    expect(within(table).queryByText('17.00%')).not.toBeInTheDocument()
    const pagination = screen.getByRole('navigation', { name: 'Page' })
    expect(within(pagination).getByText('1 / 2')).toBeVisible()
    await userEvent.click(
      within(pagination).getByRole('button', { name: 'Go to next page' })
    )
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByText('17.00%')).toBeVisible()
    expect(within(pagination).getByText('2 / 2')).toBeVisible()

    if (selection === 'period') {
      view.rerender(details({ hours: 168 }))
    } else if (selection === 'model') {
      view.rerender(
        details({ model: { ...model, model_name: 'second-model' } })
      )
    } else {
      view.rerender(details({ group: 'vip' }))
    }
    const resetTable = await screen.findByRole('table', {
      name: 'Metrics samples',
    })
    expect(within(resetTable).getAllByRole('row')).toHaveLength(51)
    expect(within(resetTable).queryByText('17.00%')).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Page' })).getByText(
        '1 / 2'
      )
    ).toBeVisible()
  }
)

it('loads and caches independent summaries when the selected group changes for the same model', async () => {
  const request = vi
    .spyOn(api, 'get')
    .mockImplementation(async (_path, config) => {
      const group = config?.params?.group
      return {
        data: {
          ...response,
          data: {
            ...response.data,
            summary: {
              success_rate: group === 'vip' ? 23 : 99.01,
              avg_latency_ms: 1000,
              avg_tps: 5,
            },
          },
        },
      } as Awaited<ReturnType<typeof api.get>>
    })
  const view = render(details())
  await screen.findByText('99.01%')

  view.rerender(details({ group: 'vip' }))
  expect(await screen.findByText('23.00%')).toBeVisible()
  expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
    `${model.model_name} Group: vip`
  )
  expect(request).toHaveBeenLastCalledWith('/api/perf-metrics', {
    params: { model: model.model_name, hours: 24, group: 'vip' },
  })

  view.rerender(details())
  expect(await screen.findByText('99.01%')).toBeVisible()
  expect(screen.queryByText('23.00%')).not.toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(2)
})

it('uses only the selected group hourly series when the model has multiple groups', async () => {
  client.setQueryData(['model-availability-summary', 24], {
    ...hourlyResponse,
    data: {
      ...hourlyResponse.data,
      group_models: [
        defaultGroupSummary,
        {
          ...defaultGroupSummary,
          group: 'vip',
          recent_success_series: [{ ts: start, success_rate: 73 }],
        },
      ],
    },
  })
  vi.spyOn(api, 'get').mockResolvedValue({ data: response })
  render(details({ group: 'vip' }))
  const timeline = await screen.findByRole('button', {
    name: `Hourly availability for ${model.model_name}`,
  })
  await userEvent.click(timeline)
  await userEvent.keyboard('{Home}')

  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Success rate: 73%'
  )
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('99.01%')
})

it('leaves an unsampled group hourly timeline unknown without falling back to model-wide or another group data', async () => {
  client.setQueryData(['model-availability-summary', 24], {
    ...hourlyResponse,
    data: {
      ...hourlyResponse.data,
      group_models: [{ ...defaultGroupSummary, group: 'vip' }],
      recent_success_series: {
        [model.model_name]: [{ ts: start, success_rate: 100 }],
      },
    },
  })
  vi.spyOn(api, 'get').mockResolvedValue({ data: response })
  render(details())
  const timeline = await screen.findByRole('button', {
    name: `Hourly availability for ${model.model_name}`,
  })
  await userEvent.click(timeline)
  await userEvent.keyboard('{Home}')

  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'No samples in this hour'
  )
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('Success rate:')
})
