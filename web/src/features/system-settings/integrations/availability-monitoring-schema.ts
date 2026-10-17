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
import { z } from 'zod'

import type { AvailabilityMonitoringSettings } from '../types'

export const AVAILABILITY_MONITORING_DEFAULTS: AvailabilityMonitoringSettings =
  {
    'availability_setting.probe_enabled': false,
    'availability_setting.probe_interval_minutes': 10,
    'availability_setting.probe_timeout_seconds': 30,
    'availability_setting.probe_concurrency': 1,
    'availability_setting.probe_models': [],
    'availability_setting.probe_groups': [],
    'availability_setting.probe_all_models': false,
    'availability_setting.probe_all_groups': false,
    'availability_setting.probe_max_pairs': 20,
    'availability_setting.alerts_enabled': false,
    'availability_setting.success_rate_threshold': 95,
    'availability_setting.minimum_samples': 5,
    'availability_setting.evaluation_window_minutes': 5,
    'availability_setting.failure_threshold': 3,
    'availability_setting.recovery_threshold': 2,
    'availability_setting.notification_cooldown_minutes': 30,
    'availability_setting.silence_until': 0,
    'availability_setting.retention_days': 30,
  }

export const availabilityMonitoringSchema = z
  .object({
    availability_setting: z.object({
      probe_enabled: z.boolean(),
      probe_interval_minutes: z.number(),
      probe_timeout_seconds: z.number(),
      probe_concurrency: z.number(),
      probe_models: z.string(),
      probe_groups: z.string(),
      probe_all_models: z.boolean(),
      probe_all_groups: z.boolean(),
      probe_max_pairs: z.number(),
      alerts_enabled: z.boolean(),
      success_rate_threshold: z.number(),
      minimum_samples: z.number(),
      evaluation_window_minutes: z.number(),
      failure_threshold: z.number(),
      recovery_threshold: z.number(),
      notification_cooldown_minutes: z.number(),
      silence_until: z.number(),
      retention_days: z.number(),
    }),
  })
  .superRefine((values, context) => {
    const settings = values.availability_setting
    const limits = {
      probe_interval_minutes: [1, 1440],
      probe_timeout_seconds: [1, 120],
      probe_concurrency: [1, 8],
      probe_max_pairs: [1, 200],
      success_rate_threshold: [0, 100],
      minimum_samples: [1, 100000],
      evaluation_window_minutes: [1, 1440],
      failure_threshold: [1, 20],
      recovery_threshold: [1, 20],
      notification_cooldown_minutes: [0, 10080],
      silence_until: [0, 4102444800],
      retention_days: [1, 365],
    } as const
    for (const [name, [minimum, maximum]] of Object.entries(limits)) {
      const key = name as keyof typeof limits
      if (key.startsWith('probe_') && !settings.probe_enabled) continue
      if (
        !key.startsWith('probe_') &&
        key !== 'retention_days' &&
        !settings.alerts_enabled
      ) {
        continue
      }
      const value = settings[key]
      if (
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum ||
        (key !== 'success_rate_threshold' && !Number.isInteger(value))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['availability_setting', key],
          message: 'Enter a value within the displayed limits',
        })
      }
    }
    if (!settings.probe_enabled) return
    for (const [key, maximum] of [
      ['probe_models', 255],
      ['probe_groups', 64],
    ] as const) {
      const all =
        key === 'probe_models'
          ? settings.probe_all_models
          : settings.probe_all_groups
      if (all) continue
      const names = parseProbeScope(settings[key])
      if (new TextEncoder().encode(JSON.stringify(names)).length > 65536) {
        context.addIssue({
          code: 'custom',
          path: ['availability_setting', key],
          message: 'Probe scope JSON must not exceed 64 KiB',
        })
        continue
      }
      if (
        names.length > 200 ||
        names.some((name) => [...name].length > maximum || /\p{Cc}/u.test(name))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['availability_setting', key],
          message: 'Use at most 200 names within the displayed length limit',
        })
      }
    }
  })

export type AvailabilityMonitoringFormValues = z.infer<
  typeof availabilityMonitoringSchema
>

export function parseProbeScope(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ]
}

export function availabilityFormDefaults(
  defaults: AvailabilityMonitoringSettings
): AvailabilityMonitoringFormValues {
  const setting: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(defaults)) {
    if (!key.startsWith('availability_setting.')) continue
    setting[key.slice('availability_setting.'.length)] = Array.isArray(value)
      ? value.join('\n')
      : value
  }
  return { availability_setting: setting } as AvailabilityMonitoringFormValues
}

export function serializeAvailabilitySettings(
  values: AvailabilityMonitoringFormValues,
  baseline: AvailabilityMonitoringSettings
): AvailabilityMonitoringSettings {
  const result = { ...baseline }
  const settings = values.availability_setting
  for (const [key, value] of Object.entries(settings)) {
    if (
      key.startsWith('probe_') &&
      key !== 'probe_enabled' &&
      !settings.probe_enabled
    ) {
      continue
    }
    if (
      !key.startsWith('probe_') &&
      key !== 'alerts_enabled' &&
      key !== 'retention_days' &&
      !settings.alerts_enabled
    ) {
      continue
    }
    if (key === 'probe_models' && settings.probe_all_models) continue
    if (key === 'probe_groups' && settings.probe_all_groups) continue
    const flatKey =
      `availability_setting.${key}` as keyof AvailabilityMonitoringSettings
    Object.assign(result, {
      [flatKey]: typeof value === 'string' ? parseProbeScope(value) : value,
    })
  }
  return result
}
