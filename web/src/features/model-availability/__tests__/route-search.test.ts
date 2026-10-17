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
import { describe, expect, it, vi } from 'vitest'

import { modelAvailabilitySearchSchema } from '@/routes/_authenticated/model-availability'

vi.mock('@/features/model-availability', () => ({
  ModelAvailabilityPage: () => null,
}))

describe('model availability route search', () => {
  it('opens the default 24-hour view without query parameters', () => {
    expect(modelAvailabilitySearchSchema.parse({})).toEqual({
      source: 'real',
      hours: 24,
      status: 'all',
      q: '',
      group: '',
      page: 1,
    })
  })

  it('restores a shared seven-day filtered page and trims the model search', () => {
    expect(
      modelAvailabilitySearchSchema.parse({
        hours: '168',
        status: 'degraded',
        q: '  gemini-4  ',
        page: '2',
        group: 'vip',
      })
    ).toEqual({
      source: 'real',
      hours: 168,
      status: 'degraded',
      q: 'gemini-4',
      group: 'vip',
      page: 2,
    })
  })

  it.each([
    { hours: 720, status: 'invalid', q: 42, page: 0 },
    { hours: 'NaN', status: [], q: 'x'.repeat(201), page: 1.5 },
    { hours: Infinity, status: null, q: null, page: -5 },
  ])('recovers unsupported or malformed query values (%j)', (search) => {
    expect(modelAvailabilitySearchSchema.parse(search)).toEqual({
      source: 'real',
      hours: 24,
      status: 'all',
      q: '',
      group: '',
      page: 1,
    })
  })
})

it('restores the probe source and defaults unknown sources to real requests', () => {
  expect(modelAvailabilitySearchSchema.parse({ source: 'probe' }).source).toBe(
    'probe'
  )
  expect(
    modelAvailabilitySearchSchema.parse({ source: 'unknown' }).source
  ).toBe('real')
})
