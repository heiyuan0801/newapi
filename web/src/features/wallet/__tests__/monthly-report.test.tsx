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
  return vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/wallet/monthly/export') {
      return {
        data: new Blob(['month_utc,model\n'], { type: 'text/csv' }),
        headers: { 'content-type': 'text/csv', 'x-export-status': 'complete' },
      }
    }
    return {
      data: {
        success: true,
        data: {
          ...fixture,
          page: 1,
          page_size: 50,
          total: fixture.rows.length,
          ...data,
        },
      },
    }
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
  it('shows the monthly statistics without rendering model, group or token detail rows', async () => {
    const get = mockReport({
      rows: [
        { ...fixture.rows[0], model_name: 'demo-historical-model-001' },
        fixture.rows[1],
      ],
    })
    renderReport()
    const summary = await screen.findByLabelText('Monthly usage summary')
    expect(within(summary).getByText('$3')).toBeVisible()
    expect(within(summary).getByText('8')).toBeVisible()
    expect(within(summary).getByText('1,234')).toBeVisible()
    expect(within(summary).getByText('2')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    for (const detail of [
      'demo-historical-model-001',
      'model-a',
      'default',
      'vip',
      'primary',
      'Deleted token #12',
    ]) {
      expect(screen.queryByText(detail)).not.toBeInTheDocument()
    }
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
      params: { month: currentMonth, p: 1, page_size: 50 },
    })
  })

  it('requires applying a valid changed month before allowing its export', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    renderReport()
    await screen.findByLabelText('Monthly usage summary')
    const input = screen.getByLabelText('Month (UTC)')
    fireEvent.change(input, { target: { value: '2001-02' } })
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Query' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/user/wallet/monthly', {
        params: { month: '2001-02', p: 1, page_size: 50 },
      })
    )
    fireEvent.change(input, { target: { value: '9999-01' } })
    expect(screen.getByRole('button', { name: 'Query' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(
      screen.getByText('Choose a valid month up to the current UTC month.')
    ).toBeVisible()
  })

  it('keeps zero statistics and the collection warning when collection is disabled', async () => {
    mockReport({
      collection_enabled: false,
      rows: [],
      summary: { quota: 0, count: 0, token_used: 0 },
    })
    renderReport()
    const summary = await screen.findByLabelText('Monthly usage summary')
    expect(within(summary).getByText('$0')).toBeVisible()
    expect(within(summary).getAllByText('0')).toHaveLength(2)
    expect(
      screen.getByText(
        'Usage collection is disabled. Only previously collected usage is shown.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'Collected usage may be delayed or incomplete. This report is not a settlement ledger.'
      )
    ).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
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
    expect(await screen.findByLabelText('Monthly usage summary')).toBeVisible()
  })

  it('retains the old statistics after a failed refresh and blocks exporting stale data', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    renderReport()
    await screen.findByLabelText('Monthly usage summary')
    get.mockResolvedValue({
      data: { success: false, message: 'Report unavailable' },
    })
    await user.click(screen.getByRole('button', { name: 'Query' }))
    expect(
      await screen.findByText(
        'Unable to refresh this report. Export is disabled until it refreshes successfully.'
      )
    ).toBeVisible()
    expect(screen.getByLabelText('Monthly usage summary')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('blocks an export flagged incomplete while keeping its recorded summary', async () => {
    mockReport({ truncated: true })
    renderReport()
    expect(
      within(await screen.findByLabelText('Monthly usage summary')).getByText(
        '$3'
      )
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  it('does not add detail pagination for large monthly reports and keeps complete CSV export available', async () => {
    mockReport({ total: 5101, page_count: 103 })
    renderReport()
    await screen.findByLabelText('Monthly usage summary')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Go to next page' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Go to previous page' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('model-a')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
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
    await screen.findByLabelText('Monthly usage summary')
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() =>
      expect(objectURL).toHaveBeenCalledWith(expect.any(Blob))
    )
    expect(click).toHaveBeenCalledTimes(1)
    expect(click.mock.instances[0]).toHaveAttribute(
      'download',
      `monthly-usage-${currentMonth}.csv`
    )
  })
  it('keeps the requested export month when another month is opened before download', async () => {
    const user = userEvent.setup()
    let completeExport!: (response: {
      data: Blob
      headers: Record<string, string>
    }) => void
    const pendingExport = new Promise<{
      data: Blob
      headers: Record<string, string>
    }>((resolve) => {
      completeExport = resolve
    })
    const get = mockReport()
    get.mockImplementation(async (url) =>
      url === '/api/user/wallet/monthly/export'
        ? pendingExport
        : { data: { success: true, data: fixture } }
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:delayed-report')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    renderReport()
    await screen.findByLabelText('Monthly usage summary')
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Month (UTC)'), {
      target: { value: '2001-02' },
    })
    await user.click(screen.getByRole('button', { name: 'Query' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/user/wallet/monthly', {
        params: { month: '2001-02', p: 1, page_size: 50 },
      })
    )
    completeExport({
      data: new Blob(['original month']),
      headers: { 'content-type': 'text/csv', 'x-export-status': 'complete' },
    })
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(click.mock.instances[0]).toHaveAttribute(
      'download',
      `monthly-usage-${currentMonth}.csv`
    )
  })
  it('never downloads a JSON export failure as a CSV file', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    const objectURL = vi.spyOn(URL, 'createObjectURL')
    renderReport()
    await screen.findByLabelText('Monthly usage summary')
    get.mockResolvedValueOnce({
      data: new Blob(
        [
          JSON.stringify({
            success: false,
            message: 'Monthly report export is busy. Try again later.',
          }),
        ],
        { type: 'application/json' }
      ),
      headers: { 'content-type': 'application/json' },
    })
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(
      await screen.findByText('Monthly report export is busy. Try again later.')
    ).toBeVisible()
    expect(objectURL).not.toHaveBeenCalled()
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
