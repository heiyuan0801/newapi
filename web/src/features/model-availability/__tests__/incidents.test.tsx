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

import { api } from '@/lib/api'

import type {
  AvailabilityIncident,
  AvailabilityIncidentsResponse,
} from '../api'
import { AvailabilityIncidents } from '../components/availability-incidents'

const openIncident: AvailabilityIncident = {
  id: 1,
  model_name: 'same-model',
  group: 'default',
  source: 'real',
  status: 'open',
  started_at: 1789387200,
  last_observed_at: 1789387500,
  resolved_at: 0,
  success_rate: 40,
  reason_code: 'low_success_rate',
}
const resolvedIncident: AvailabilityIncident = {
  ...openIncident,
  id: 2,
  group: 'vip',
  source: 'probe',
  status: 'resolved',
  resolved_at: 1789387800,
  success_rate: 100,
  reason_code: 'probe_failed',
}

function response(
  items: AvailabilityIncident[],
  total = items.length,
  page = 1
): AvailabilityIncidentsResponse {
  return { success: true, data: { items, total, page, page_size: 20 } }
}

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  })
})
afterEach(() => client.clear())

function incidents(group = '') {
  return (
    <QueryClientProvider client={client}>
      <AvailabilityIncidents group={group} />
    </QueryClientProvider>
  )
}

it('shows independent open and resolved incidents for the same model in different groups', async () => {
  const request = vi.spyOn(api, 'get').mockResolvedValue({
    data: response([openIncident, resolvedIncident]),
  })
  render(incidents())

  const list = await screen.findByRole('list', {
    name: 'Availability incidents',
  })
  const rows = within(list).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByText('same-model')).toBeVisible()
  expect(within(rows[0]).getByText('default')).toBeVisible()
  expect(within(rows[0]).getByText('Open incident')).toBeVisible()
  expect(within(rows[0]).getByText('Real requests')).toBeVisible()
  expect(within(rows[0]).getByText('Ongoing')).toBeVisible()
  expect(within(rows[0]).getByText('40.00%')).toBeVisible()
  expect(within(rows[1]).getByText('same-model')).toBeVisible()
  expect(within(rows[1]).getByText('vip')).toBeVisible()
  expect(within(rows[1]).getByText('Resolved')).toBeVisible()
  expect(within(rows[1]).getByText('Active probes')).toBeVisible()
  expect(within(rows[1]).queryByText('Ongoing')).not.toBeInTheDocument()
  expect(within(rows[1]).getByText('100.00%')).toBeVisible()
  expect(request).toHaveBeenCalledWith('/api/model-availability/incidents', {
    params: {
      source: 'all',
      status: 'all',
      group: '',
      page: 1,
      page_size: 20,
    },
  })
})

it('combines source and status filters while retaining the selected group scope', async () => {
  const openProbe = {
    ...openIncident,
    group: 'vip',
    source: 'probe' as const,
  }
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: response([openProbe, resolvedIncident]),
    })
    .mockResolvedValueOnce({
      data: response([openProbe, resolvedIncident]),
    })
    .mockResolvedValueOnce({ data: response([resolvedIncident]) })
  render(incidents('vip'))
  await screen.findByRole('list', { name: 'Availability incidents' })

  await userEvent.click(
    screen.getByRole('combobox', { name: 'Incident source' })
  )
  await userEvent.click(
    await screen.findByRole('option', { name: 'Active probes' })
  )
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      '/api/model-availability/incidents',
      {
        params: {
          source: 'probe',
          status: 'all',
          group: 'vip',
          page: 1,
          page_size: 20,
        },
      }
    )
  )

  await userEvent.click(
    screen.getByRole('combobox', { name: 'Incident status' })
  )
  await userEvent.click(await screen.findByRole('option', { name: 'Resolved' }))
  await waitFor(() => {
    const list = screen.getByRole('list', { name: 'Availability incidents' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('Resolved')).toBeVisible()
    expect(within(list).queryByText('Open incident')).not.toBeInTheDocument()
  })
  expect(request).toHaveBeenLastCalledWith(
    '/api/model-availability/incidents',
    {
      params: {
        source: 'probe',
        status: 'resolved',
        group: 'vip',
        page: 1,
        page_size: 20,
      },
    }
  )
})

it.each(['transport', 'business'] as const)(
  'offers retry after an initial %s failure without showing failed response records as data',
  async (failure) => {
    const request = vi.spyOn(api, 'get')
    if (failure === 'transport') {
      request.mockRejectedValueOnce(new Error('incidents unavailable'))
    } else {
      request.mockResolvedValueOnce({
        data: {
          ...response([{ ...openIncident, model_name: 'invalid-response' }]),
          success: false,
          message: 'incidents unavailable',
        },
      })
    }
    request.mockResolvedValueOnce({ data: response([resolvedIncident]) })
    render(incidents())

    expect(
      await screen.findByText('Unable to load incident history.')
    ).toBeVisible()
    expect(screen.queryByText('invalid-response')).not.toBeInTheDocument()
    expect(
      screen.queryByText('No incidents match these filters.')
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    const list = await screen.findByRole('list', {
      name: 'Availability incidents',
    })
    expect(within(list).getByText('same-model')).toBeVisible()
    expect(within(list).getByText('Resolved')).toBeVisible()
    expect(
      screen.queryByText('Unable to load incident history.')
    ).not.toBeInTheDocument()
  }
)

it.each(['transport', 'business'] as const)(
  'retains the last records after a refresh %s failure and replaces them after recovery',
  async (failure) => {
    const recoveredIncident: AvailabilityIncident = {
      ...openIncident,
      status: 'resolved',
      resolved_at: 1789387800,
      success_rate: 100,
    }
    const request = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ data: response([openIncident]) })
    if (failure === 'transport') {
      request.mockRejectedValueOnce(new Error('refresh unavailable'))
    } else {
      request.mockResolvedValueOnce({
        data: { ...response([]), success: false },
      })
    }
    request.mockResolvedValueOnce({ data: response([recoveredIncident]) })
    render(incidents())
    const list = await screen.findByRole('list', {
      name: 'Availability incidents',
    })
    expect(within(list).getByText('Open incident')).toBeVisible()

    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh incident history' })
    )
    expect(
      await screen.findByText(
        'Unable to refresh incidents. Showing the last loaded records.'
      )
    ).toBeVisible()
    expect(within(list).getByText('default')).toBeVisible()
    expect(within(list).getByText('Open incident')).toBeVisible()
    expect(within(list).getByText('40.00%')).toBeVisible()
    expect(
      screen.queryByText('No incidents match these filters.')
    ).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh incident history' })
    )
    await waitFor(() => {
      expect(within(list).getByText('Resolved')).toBeVisible()
      expect(within(list).queryByText('Open incident')).not.toBeInTheDocument()
    })
    expect(within(list).getByText('default')).toBeVisible()
    expect(within(list).getByText('100.00%')).toBeVisible()
    expect(
      screen.queryByText(
        'Unable to refresh incidents. Showing the last loaded records.'
      )
    ).not.toBeInTheDocument()
  }
)

it('loads the second page of 21 incidents and returns to page one when a filter changes', async () => {
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    ...openIncident,
    id: index + 1,
    model_name: `first-page-model-${index + 1}`,
  }))
  const last = { ...openIncident, id: 21, model_name: 'last-page-model' }
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({ data: response(firstPage, 21) })
    .mockResolvedValueOnce({ data: response([last], 21, 2) })
    .mockResolvedValueOnce({ data: response([resolvedIncident]) })
  render(incidents())
  const list = await screen.findByRole('list', {
    name: 'Availability incidents',
  })
  expect(within(list).getAllByRole('listitem')).toHaveLength(20)
  const navigation = screen.getByRole('navigation', { name: 'Page' })
  expect(within(navigation).getByText('1 / 2')).toBeVisible()
  await userEvent.click(
    within(navigation).getByRole('button', { name: 'Go to next page' })
  )
  expect(await screen.findByText('last-page-model')).toBeVisible()
  const lastPageList = screen.getByRole('list', {
    name: 'Availability incidents',
  })
  expect(within(lastPageList).getAllByRole('listitem')).toHaveLength(1)
  expect(
    within(screen.getByRole('navigation', { name: 'Page' })).getByText('2 / 2')
  ).toBeVisible()
  expect(request).toHaveBeenLastCalledWith(
    '/api/model-availability/incidents',
    {
      params: {
        source: 'all',
        status: 'all',
        group: '',
        page: 2,
        page_size: 20,
      },
    }
  )

  await userEvent.click(
    screen.getByRole('combobox', { name: 'Incident status' })
  )
  await userEvent.click(await screen.findByRole('option', { name: 'Resolved' }))
  const filteredList = await screen.findByRole('list', {
    name: 'Availability incidents',
  })
  expect(await within(filteredList).findByText('same-model')).toBeVisible()
  expect(
    within(filteredList).queryByText('last-page-model')
  ).not.toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: 'Page' })).getByText('1 / 1')
  ).toBeVisible()
  expect(request).toHaveBeenLastCalledWith(
    '/api/model-availability/incidents',
    {
      params: {
        source: 'all',
        status: 'resolved',
        group: '',
        page: 1,
        page_size: 20,
      },
    }
  )
})

it('returns to a valid page when history retention removes the last page', async () => {
  const request = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({ data: response([openIncident], 21) })
    .mockResolvedValueOnce({ data: response([resolvedIncident], 21, 2) })
    .mockResolvedValueOnce({ data: response([], 1, 2) })
    .mockResolvedValue({ data: response([openIncident], 1) })
  render(incidents())
  await screen.findByText('Open incident')
  await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
  await screen.findByText('Resolved')
  await userEvent.click(
    screen.getByRole('button', { name: 'Refresh incident history' })
  )
  await screen.findByText('Open incident')
  await waitFor(() => {
    expect(request).toHaveBeenLastCalledWith(
      '/api/model-availability/incidents',
      {
        params: {
          source: 'all',
          status: 'all',
          group: '',
          page: 1,
          page_size: 20,
        },
      }
    )
    expect(screen.getByText('1 / 1')).toBeVisible()
  })
  expect(screen.queryByText('2 / 1')).not.toBeInTheDocument()
  expect(
    screen.queryByText('No incidents match these filters.')
  ).not.toBeInTheDocument()
})
