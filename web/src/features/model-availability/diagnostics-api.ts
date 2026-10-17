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

import type { AvailabilitySource } from './api'

export type AvailabilityDiagnosticsData = {
  model_name: string
  group: string
  source: AvailabilitySource
  window_start: number
  window_end: number
  request_count: number
  success_count: number
  failure_count: number
  unsupported_count: number
  latency_sample_count: number
  p50_latency_ms: number | null
  p95_latency_ms: number | null
  p99_latency_ms: number | null
  latest_sample_at: number
  latest_bucket_at: number
  collection_delay_seconds: number
  sample_limit: number
  truncated: boolean
  percentile_unavailable_reason: string
  error_categories: { category: string; count: number }[]
  affected_channels: { id: number; name: string; failures: number }[]
  affected_channels_truncated: boolean
  unattributed_failures: number
}

export async function getAvailabilityDiagnostics(params: {
  model: string
  group: string
  source: AvailabilitySource
  hours: 24 | 168
}) {
  const response = await api.get<{
    success: boolean
    message?: string
    data: AvailabilityDiagnosticsData
  }>('/api/model-availability/diagnostics', { params })
  return response.data
}
