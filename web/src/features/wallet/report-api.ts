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
import { api } from '@/lib/api'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

export interface MonthlyUsageTotals {
  quota: number
  count: number
  token_used: number
}

export interface MonthlyUsageRow extends MonthlyUsageTotals {
  model_name: string
  use_group: string
  token_id: number
  token_name: string
}

export interface MonthlyWalletReport {
  month: string
  window_start: number
  window_end: number
  generated_at: number
  source: 'quota_data'
  collection_enabled: boolean
  flush_interval_minutes: number
  truncated: boolean
  row_limit: number
  page?: number
  page_size?: number
  total?: number
  page_count?: number
  summary: MonthlyUsageTotals
  completed_topups: number
  rows: MonthlyUsageRow[]
}

export interface AffiliateReward {
  id: number
  quota: number
  created_at: number
}

export async function getMonthlyWalletReport(
  month: string,
  page = 1,
  pageSize = 50
) {
  const response = await api.get<{
    success: boolean
    message?: string
    data: MonthlyWalletReport
  }>('/api/user/wallet/monthly', {
    params: { month, p: page, page_size: pageSize },
  })
  return response.data
}

export async function getAffiliateRewards(page: number, pageSize: number) {
  const response = await api.get<{
    success: boolean
    message?: string
    data: {
      items: AffiliateReward[]
      total: number
      page: number
      page_size: number
    }
  }>('/api/user/aff/rewards', { params: { p: page, page_size: pageSize } })
  return response.data
}

export async function exportMonthlyWalletReport(
  month: string,
  signal?: AbortSignal
) {
  const response = await api.get<Blob>('/api/user/wallet/monthly/export', {
    params: { month },
    responseType: 'blob',
    timeout: 330000,
    signal,
  })
  if (
    !String(response.headers?.['content-type']).includes('text/csv') ||
    response.headers?.['x-export-status'] !== 'complete'
  ) {
    let failure: unknown = null
    try {
      failure = JSON.parse(await response.data.text())
    } catch {
      /* malformed errors use the shared fallback */
    }
    throw createServerError(failure, 'Unable to export monthly usage report')
  }
  return response.data
}
export type ReconciliationEvent = {
  source: string
  id: number
  occurred_at: number
  quota: number | null
  reference: string
  request_id: string
  task_id: string
  model_name: string
  use_group: string
  token_name: string
  billing_source: string
}
export type ReconciliationReport = {
  month: string
  summary: {
    consume_quota: number
    refund_quota: number
    net_log_quota: number
    collected_quota: number
    collection_difference: number
    completed_topups: number
    redemption_quota: number
    reward_quota: number
  }
  coverage: {
    unlinked_log_events?: number
    complete_ledger: boolean
    consume_logs_enabled: boolean
    collection_enabled: boolean
    flush_interval_minutes: number
    limitations: string[]
  }
  events: ReconciliationEvent[]
  source: string
  total: number
  page_size: number
  has_more: boolean
  next_cursor: string
}
export async function getWalletReconciliation(
  month: string,
  source: string,
  cursor: string
) {
  return requireServerSuccess(
    (
      await api.get<{
        success: boolean
        message?: string
        data: ReconciliationReport
      }>('/api/user/wallet/reconciliation', {
        params: { month, source, cursor, page_size: 20 },
      })
    ).data
  ).data
}
