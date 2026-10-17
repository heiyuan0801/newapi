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
import { getSuccessRateLevel } from '@/features/performance-metrics/lib/format'
import type { PerfModelGroupSummary } from '@/features/performance-metrics/types'
import type { PricingModel } from '@/features/pricing/types'

export type AvailabilityStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

export type AvailabilityCatalogModel = Pick<
  PricingModel,
  'model_name' | 'icon' | 'vendor_name' | 'vendor_icon'
> & { enable_groups?: string[]; supported_endpoint_types?: string[] }

export type AvailabilityModel = {
  model: AvailabilityCatalogModel
  group: string
  metrics: PerfModelGroupSummary | undefined
  status: AvailabilityStatus
}

export type GroupedAvailabilityModel = {
  model: AvailabilityCatalogModel
  groups: AvailabilityModel[]
}

export const AVAILABILITY_STATUS_LABELS = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'High failure rate',
  unknown: 'No samples',
} as const

export const availabilityDotStyles: Record<AvailabilityStatus, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-muted-foreground/40',
}

export function getAvailabilityStatus(
  rate: number | undefined
): AvailabilityStatus {
  if (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    return 'unknown'
  }
  const level = getSuccessRateLevel(rate)
  if (level === 'excellent' || level === 'good') return 'healthy'
  if (level === 'warning') return 'degraded'
  if (level === 'critical') return 'critical'
  return 'unknown'
}

export function formatSuccessRate(rate: number | undefined): string {
  if (rate === undefined || getAvailabilityStatus(rate) === 'unknown') {
    return '—'
  }
  return `${rate.toFixed(2)}%`
}

/** Only catalog models are displayed, including models with no traffic. */
export function buildAvailabilityModels(
  catalog: AvailabilityCatalogModel[],
  metrics: PerfModelGroupSummary[]
): AvailabilityModel[] {
  const metricsByGroup = new Map(
    metrics.map((item) => [JSON.stringify([item.model_name, item.group]), item])
  )
  const models = new Map<string, AvailabilityCatalogModel>()
  for (const model of catalog) {
    if (model.model_name?.trim()) models.set(model.model_name, model)
  }
  return [...models.values()]
    .sort((a, b) => a.model_name.localeCompare(b.model_name))
    .flatMap((model) =>
      [...new Set(model.enable_groups ?? [])]
        .filter((group) => group.trim().length > 0)
        .sort((a, b) => a.localeCompare(b))
        .map((group) => {
          const perf = metricsByGroup.get(
            JSON.stringify([model.model_name, group])
          )
          return {
            model,
            group,
            metrics: perf,
            status: getAvailabilityStatus(perf?.success_rate),
          }
        })
    )
}

/** Keep a model's independently measured groups together for rendering and pagination. */
export function groupAvailabilityModels(
  items: AvailabilityModel[]
): GroupedAvailabilityModel[] {
  const models = new Map<string, GroupedAvailabilityModel>()
  for (const item of items) {
    const model = models.get(item.model.model_name)
    if (model) {
      model.groups.push(item)
    } else {
      models.set(item.model.model_name, { model: item.model, groups: [item] })
    }
  }
  return [...models.values()]
}
