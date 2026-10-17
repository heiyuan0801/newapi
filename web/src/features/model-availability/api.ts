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
import type {
  PerformanceMetricsData,
  PerfSummaryAllData,
} from '@/features/performance-metrics/types'
import { api } from '@/lib/api'

export type AvailabilitySource = 'real' | 'probe'
export type AvailabilityIncidentStatus = 'all' | 'open' | 'resolved'

export type AvailabilityMonitorResponse = {
  success: boolean
  message?: string
  data: {
    probe_enabled: boolean
    alerts_enabled: boolean
    last_run_at: number
    last_probe_at: number
    running: boolean
    effective_evaluation_window_minutes?: number
    probe: PerfSummaryAllData['data']
  }
}

export type AvailabilityIncident = {
  id: number
  model_name: string
  group: string
  source: AvailabilitySource
  status: 'open' | 'resolved'
  started_at: number
  last_observed_at: number
  resolved_at: number
  success_rate: number
  reason_code: string
}

export type AvailabilityIncidentsResponse = {
  success: boolean
  message?: string
  data: {
    items: AvailabilityIncident[]
    total: number
    page: number
    page_size: number
  }
}

export async function getAvailabilityMonitor(hours: 24 | 168) {
  const response = await api.get<AvailabilityMonitorResponse>(
    '/api/model-availability/monitor',
    { params: { hours } }
  )
  return response.data
}

export async function getProbeMetrics(
  modelName: string,
  group: string,
  hours: 24 | 168
) {
  const response = await api.get<PerformanceMetricsData>(
    '/api/model-availability/probes',
    { params: { model: modelName, group, hours } }
  )
  return response.data
}

export async function getAvailabilityIncidents(params: {
  source: AvailabilitySource | 'all'
  status: AvailabilityIncidentStatus
  group: string
  page: number
  page_size: number
}) {
  const response = await api.get<AvailabilityIncidentsResponse>(
    '/api/model-availability/incidents',
    { params }
  )
  return response.data
}
