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
import { expect, it } from 'vitest'

import {
  formatSuccessRate,
  getAvailabilityStatus,
  groupAvailabilityModels,
  type AvailabilityModel,
} from '../lib/availability'

it.each([
  [0, 'critical'],
  [69.99, 'critical'],
  [70, 'degraded'],
  [89.99, 'degraded'],
  [90, 'healthy'],
  [100, 'healthy'],
  [undefined, 'unknown'],
  [Number.NaN, 'unknown'],
  [101, 'unknown'],
  [-1, 'unknown'],
] as const)(
  'classifies a reported rate of %s as %s at the public color boundaries',
  (rate, expected) => {
    expect(getAvailabilityStatus(rate)).toBe(expected)
  }
)

it('formats missing or invalid success rates as unknown without dropping a genuine zero', () => {
  expect(formatSuccessRate(undefined)).toBe('—')
  expect(formatSuccessRate(101)).toBe('—')
  expect(formatSuccessRate(0)).toBe('0.00%')
})

it('groups repeated model names together while preserving each group status and metrics', () => {
  const defaultGroup: AvailabilityModel = {
    model: { model_name: 'alpha-model' },
    group: 'default',
    metrics: {
      model_name: 'alpha-model',
      group: 'default',
      success_rate: 100,
      avg_latency_ms: 1000,
      avg_tps: 5,
    },
    status: 'healthy',
  }
  const betaGroup: AvailabilityModel = {
    model: { model_name: 'beta-model' },
    group: 'default',
    metrics: undefined,
    status: 'unknown',
  }
  const vipGroup: AvailabilityModel = {
    model: { model_name: 'alpha-model' },
    group: 'vip',
    metrics: {
      model_name: 'alpha-model',
      group: 'vip',
      success_rate: 0,
      avg_latency_ms: 6000,
      avg_tps: 0,
    },
    status: 'critical',
  }

  expect(groupAvailabilityModels([defaultGroup, betaGroup, vipGroup])).toEqual([
    { model: defaultGroup.model, groups: [defaultGroup, vipGroup] },
    { model: betaGroup.model, groups: [betaGroup] },
  ])
  expect(groupAvailabilityModels([])).toEqual([])
})
