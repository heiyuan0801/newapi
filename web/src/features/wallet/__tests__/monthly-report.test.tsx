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
  fireEvent,
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

import { MonthlyUsageReport } from '../components/monthly-usage-report'
import { buildMonthlyReportCsv } from '../lib/monthly-report'
import type { MonthlyWalletReport } from '../report-api'

const currentMonth = new Date().toISOString().slice(0, 7)
const fixture: MonthlyWalletReport = {
  month: currentMonth,
  window_start: Date.UTC(2026, 0, 1) / 1000,
  window_end: Date.UTC(2026, 1, 1) / 1000,
  generated_at: 1770000000,
  source: 'quota_data',
  collection_enabled: true,
  flush_interval_minutes: 5,
  truncated: false,
  row_limit: 5000,
  summary: { quota: 1500000, count: 8, token_used: 1234 },
  completed_topups: 2,
  rows: [
    {
      model_name: 'model-a',
      use_group: 'default',
      token_id: 11,
      token_name: 'primary',
      quota: 1000000,
      count: 6,
      token_used: 1000,
    },
    {
      model_name: 'model-a',
      use_group: 'vip',
      token_id: 12,
      token_name: '',
      quota: 500000,
      count: 2,
      token_used: 234,
    },
  ],
}
const clients: QueryClient[] = []
function renderReport() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <MonthlyUsageReport />
    </QueryClientProvider>
  )
}
function mockReport(data: Partial<MonthlyWalletReport> = {}) {
  return vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { ...fixture, ...data } },
  })
}
beforeEach(() => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 19, username: 'report-owner', role: 1 })
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

describe('monthly collected-usage report', () => {
  it('keeps groups and tokens distinct and shows collection limits beside real amounts', async () => {
    const get = mockReport()
    renderReport()
    const table = await screen.findByRole('table', {
      name: 'Monthly usage breakdown',
    })
    expect(within(table).getAllByText('model-a')).toHaveLength(2)
    expect(within(table).getByText('default')).toBeVisible()
    expect(within(table).getByText('vip')).toBeVisible()
    expect(within(table).getByText('Deleted token #12')).toBeVisible()
    expect(
      within(screen.getByLabelText('Monthly usage summary')).getByText('$3')
    ).toBeVisible()
    expect(
      screen.getByText(
        'Collected usage may be delayed or incomplete. This report is not a settlement ledger.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'Payment amounts and credited units vary by provider and are not summed.'
      )
    ).toBeVisible()
    expect(get).toHaveBeenCalledWith('/api/user/wallet/monthly', {
      params: { month: currentMonth },
    })
  })

  it('requires applying a valid changed month before allowing its export', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    renderReport()
    await screen.findByRole('table', { name: 'Monthly usage breakdown' })
    const input = screen.getByLabelText('Month (UTC)')
    fireEvent.change(input, { target: { value: '2001-02' } })
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Query' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/user/wallet/monthly', {
        params: { month: '2001-02' },
      })
    )
    fireEvent.change(input, { target: { value: '9999-01' } })
    expect(screen.getByRole('button', { name: 'Query' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(
      screen.getByText('Choose a valid month up to the current UTC month.')
    ).toBeVisible()
  })

  it('does not report missing or disabled collection as proof of no activity', async () => {
    mockReport({
      collection_enabled: false,
      rows: [],
      summary: { quota: 0, count: 0, token_used: 0 },
    })
    renderReport()
    expect(
      await screen.findByText('No collected usage in this month')
    ).toBeVisible()
    expect(
      screen.getByText(
        'Usage collection is disabled. Only previously collected usage is shown.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'No recorded usage does not prove there was no account activity.'
      )
    ).toBeVisible()
  })

  it('keeps failures separate from empty data and retries a business failure', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    get.mockResolvedValueOnce({
      data: { success: false, message: 'Report unavailable' },
    })
    renderReport()
    expect(
      await screen.findByText('Unable to load monthly usage report')
    ).toBeVisible()
    expect(
      screen.queryByText('No collected usage in this month')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('table', { name: 'Monthly usage breakdown' })
    ).toBeVisible()
  })

  it('retains old records after a failed refresh and blocks exporting stale data', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    renderReport()
    await screen.findByRole('table', { name: 'Monthly usage breakdown' })
    get.mockResolvedValue({
      data: { success: false, message: 'Report unavailable' },
    })
    await user.click(screen.getByRole('button', { name: 'Query' }))
    expect(
      await screen.findByText(
        'Unable to refresh this report. Export is disabled until it refreshes successfully.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('table', { name: 'Monthly usage breakdown' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('labels truncation and blocks an incomplete CSV instead of silently dropping groups', async () => {
    mockReport({ truncated: true })
    renderReport()
    expect(
      await screen.findByText(
        /This view is truncated and CSV export is disabled/
      )
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('paginates collected groups using the shared controls and contains long labels in the table', async () => {
    const user = userEvent.setup()
    mockReport({
      rows: Array.from({ length: 11 }, (_, index) => ({
        ...fixture.rows[0],
        model_name: index === 10 ? 'long-model-'.repeat(50) : `model-${index}`,
      })),
    })
    renderReport()
    await screen.findByText('model-0')
    expect(screen.queryByText('long-model-'.repeat(50))).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getByText('long-model-'.repeat(50))).toHaveClass(
      'truncate',
      'max-w-64'
    )
    expect(screen.queryByText('model-0')).not.toBeInTheDocument()
  })

  it('exports UTF-8 CSV through the existing browser-download boundary', async () => {
    const user = userEvent.setup()
    mockReport()
    const objectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:report')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    renderReport()
    await screen.findByRole('table', { name: 'Monthly usage breakdown' })
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(objectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledTimes(1)
    expect(click.mock.instances[0]).toHaveAttribute(
      'download',
      `monthly-usage-${currentMonth}.csv`
    )
  })
})

describe('monthly CSV contract', () => {
  it('preserves exact quota units, UTC bounds and source limitations while escaping formula-like model names', () => {
    const report = {
      ...fixture,
      rows: [
        {
          ...fixture.rows[0],
          model_name: '=SUM(1,2)',
          token_name: 'quote "token"',
        },
      ],
    }
    const csv = buildMonthlyReportCsv(report, (key) => key).join('')
    expect(csv).toContain('"Quota units"')
    expect(csv).toContain('"1000000"')
    expect(csv).toContain('"2026-02-01T00:00:00.000Z"')
    expect(csv).toContain('"quota_data"')
    expect(csv).toContain(`"'=SUM(1,2)"`)
    expect(csv).toContain('"quote ""token"""')
    expect(csv).toContain('not a settlement ledger')
  })
})
