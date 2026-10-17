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
  summary: MonthlyUsageTotals
  completed_topups: number
  rows: MonthlyUsageRow[]
}

export interface AffiliateReward {
  id: number
  quota: number
  created_at: number
}

export async function getMonthlyWalletReport(month: string) {
  const response = await api.get<{
    success: boolean
    message?: string
    data: MonthlyWalletReport
  }>('/api/user/wallet/monthly', { params: { month } })
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
