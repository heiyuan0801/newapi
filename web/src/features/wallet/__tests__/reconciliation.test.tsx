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

import { WalletReconciliationReport } from '../components/wallet-reconciliation-report'
import type { ReconciliationReport } from '../report-api'

const currentMonth = new Date().toISOString().slice(0, 7)
const fixture: ReconciliationReport = {
  month: currentMonth,
  summary: {
    consume_quota: 500000,
    refund_quota: 100000,
    net_log_quota: 400000,
    collected_quota: 450000,
    collection_difference: -50000,
    completed_topups: 1,
    redemption_quota: 0,
    reward_quota: 50000,
  },
  coverage: {
    complete_ledger: false,
    consume_logs_enabled: true,
    collection_enabled: true,
    flush_interval_minutes: 5,
    limitations: [
      'logs_may_be_retained_or_disabled',
      'collected_usage_may_lag',
      'historical_topup_credit_unknown',
      'historical_rewards_untracked',
      'wallet_adjustments_not_fully_covered',
      'funding_sources_mixed',
      'non_atomic_cross_database_snapshot',
      'pending_tasks_and_reservations_not_reconciled',
    ],
  },
  events: [
    {
      source: 'consume',
      id: 11,
      occurred_at: 1767225600,
      quota: 500000,
      reference: 'req-abc-123',
      request_id: 'req-abc-123',
      task_id: 'task-precise-456',
      model_name: 'model-a',
      use_group: 'default',
      token_name: 'primary',
      billing_source: 'wallet',
    },
    {
      source: 'topup',
      id: 12,
      occurred_at: 1767225600,
      quota: null,
      reference: 'order-789',
      request_id: '',
      task_id: '',
      model_name: '',
      use_group: '',
      token_name: '',
      billing_source: 'unknown',
    },
  ],
  source: 'all',
  total: 3,
  page_size: 20,
  has_more: true,
  next_cursor: 'next-opaque-cursor',
}
const clients: QueryClient[] = []
function renderReport() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <WalletReconciliationReport />
    </QueryClientProvider>
  )
}
function mockReport(overrides: Partial<ReconciliationReport> = {}) {
  return vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { ...fixture, ...overrides } },
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

describe('wallet recorded-source reconciliation', () => {
  it('shows source statistics and coverage while omitting all recorded event rows and controls', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    renderReport()
    const summary = await screen.findByLabelText('Reconciliation summary')
    expect(within(summary).getByText('$0.8')).toBeVisible()
    expect(within(summary).getByText('$1')).toBeVisible()
    expect(within(summary).getByText('$0.2')).toBeVisible()
    expect(within(summary).getByText('$0.9')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: 'Reconciliation source' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Reconciliation pagination')
    ).not.toBeInTheDocument()
    for (const detail of [
      'req-abc-123',
      'task-precise-456',
      'order-789',
      'model-a',
      'Credited quota not recorded',
    ]) {
      expect(screen.queryByText(detail)).not.toBeInTheDocument()
    }
    expect(
      screen.queryByRole('button', { name: /Copy reference|Copy task/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'This is a recorded-source comparison, not a complete settlement ledger.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'Source differences can reflect retention or collection delays. They do not prove a wallet balance error.'
      )
    ).toBeVisible()
    expect(
      screen.queryByText(
        'Summary covers all recorded sources. The source filter applies to the event list.'
      )
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Logs can be disabled or removed by retention, so historical records may be missing.'
      )
    ).not.toBeInTheDocument()
    const disclosure = screen.getByRole('button', {
      name: 'Source coverage and limitations',
    })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await user.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(
      await screen.findByText(
        'Older top-up orders do not record credited quota consistently; their amounts are not reconstructed.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'Pending tasks and in-flight reservations are not reconciled as final wallet movements.'
      )
    ).toBeVisible()
    expect(get).toHaveBeenCalledWith('/api/user/wallet/reconciliation', {
      params: { month: currentMonth, source: 'all', cursor: '', page_size: 20 },
    })
  })

  it('queries only the applied UTC month across all sources and rejects a future month', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    renderReport()
    await screen.findByLabelText('Reconciliation summary')
    fireEvent.change(screen.getByLabelText('Reconciliation month (UTC)'), {
      target: { value: '2001-02' },
    })
    await user.click(screen.getByRole('button', { name: 'Query' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/user/wallet/reconciliation', {
        params: { month: '2001-02', source: 'all', cursor: '', page_size: 20 },
      })
    )
    fireEvent.change(screen.getByLabelText('Reconciliation month (UTC)'), {
      target: { value: '9999-01' },
    })
    expect(screen.getByRole('button', { name: 'Query' })).toBeDisabled()
    expect(
      screen.getByText('Choose a valid month up to the current UTC month.')
    ).toBeVisible()
    const requests = get.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Query' }))
    expect(get.mock.calls).toHaveLength(requests)
  })

  it('keeps a failed load distinct from zero statistics and allows retry', async () => {
    const user = userEvent.setup()
    mockReport().mockResolvedValueOnce({
      data: { success: false, message: 'Sources temporarily unavailable' },
    })
    renderReport()
    expect(
      await screen.findByText('Unable to load wallet reconciliation')
    ).toBeVisible()
    expect(
      screen.queryByLabelText('Reconciliation summary')
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      within(await screen.findByLabelText('Reconciliation summary')).getByText(
        '$0.8'
      )
    ).toBeVisible()
  })

  it('keeps previously loaded statistics after a failed refresh without restoring event rows', async () => {
    const user = userEvent.setup()
    const get = mockReport()
    renderReport()
    await screen.findByLabelText('Reconciliation summary')
    get.mockResolvedValue({
      data: { success: false, message: 'Sources temporarily unavailable' },
    })
    await user.click(screen.getByRole('button', { name: 'Query' }))
    expect(
      await screen.findByText(
        'Unable to refresh reconciliation. Showing the last loaded records.'
      )
    ).toBeVisible()
    expect(
      within(screen.getByLabelText('Reconciliation summary')).getByText('$0.8')
    ).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('req-abc-123')).not.toBeInTheDocument()
  })

  it('retains source statistics when event rows are empty and explains disabled collection', async () => {
    mockReport({
      events: [],
      total: 0,
      has_more: false,
      next_cursor: '',
      coverage: {
        ...fixture.coverage,
        consume_logs_enabled: false,
        collection_enabled: false,
      },
    })
    const user = userEvent.setup()
    renderReport()
    expect(
      within(await screen.findByLabelText('Reconciliation summary')).getByText(
        '$0.8'
      )
    ).toBeVisible()
    expect(
      screen.queryByText('No recorded source events in this month')
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Source coverage and limitations' })
    )
    expect(
      await screen.findByText('Consumption logging is currently disabled.')
    ).toBeVisible()
    expect(
      screen.getByText(
        'Usage collection is disabled. Only previously collected usage is shown.'
      )
    ).toBeVisible()
  })

  it('preserves the legacy-log coverage warning and summary amounts without showing a transaction table', async () => {
    const user = userEvent.setup()
    mockReport({
      coverage: {
        ...fixture.coverage,
        unlinked_log_events: 2,
        limitations: [
          ...fixture.coverage.limitations,
          'legacy_log_events_without_identifiers',
        ],
      },
    })
    renderReport()
    expect(
      await screen.findByText(
        'Older logs without stable identifiers: 2. Their amounts are included in totals; their events are omitted from pagination.'
      )
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Source coverage and limitations' })
    )
    expect(
      await screen.findByText(
        'Older log rows without stable IDs are included in summary amounts but cannot be paged reliably.'
      )
    ).toBeVisible()
    expect(
      within(screen.getByLabelText('Reconciliation summary')).getByText('$0.8')
    ).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
