import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AvailabilityTimeline } from '../components/availability-timeline'

const HOUR = 3_600
const START = 1_792_180_800

afterEach(() => vi.restoreAllMocks())

describe('hourly model availability timeline', () => {
  it.each([1, 24, 168])(
    'includes the current sample in a %i-hour window ending exactly on an hour boundary',
    async (hourCount) => {
      const user = userEvent.setup()
      const windowEnd = START + (hourCount - 1) * HOUR
      vi.spyOn(Date, 'now').mockReturnValue(windowEnd * 1_000)
      render(
        <AvailabilityTimeline
          modelName='boundary-model'
          windowStart={START}
          windowEnd={windowEnd}
          series={[{ ts: windowEnd, success_rate: 100 }]}
        />
      )

      const hours = screen
        .getByRole('button')
        .querySelectorAll('[data-slot="availability-hour"]')
      expect(hours).toHaveLength(hourCount)
      expect(hours[hourCount - 1]).toHaveClass('bg-emerald-500')
      await user.tab()
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Success rate: 100%'
      )
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Current hour is still in progress'
      )
    }
  )

  it('keeps missing hours gray when samples arrive out of order', async () => {
    const user = userEvent.setup()
    render(
      <AvailabilityTimeline
        modelName='gemini-test'
        windowStart={START}
        windowEnd={START + 4 * HOUR - 1}
        series={[
          { ts: START + 3 * HOUR, success_rate: 100 },
          { ts: START, success_rate: 0 },
          { ts: START - HOUR, success_rate: 100 },
        ]}
      />
    )

    const timeline = screen.getByRole('button', {
      name: 'Hourly availability for gemini-test',
    })
    const hours = timeline.querySelectorAll('[data-slot="availability-hour"]')
    expect(hours).toHaveLength(4)
    expect(hours[0]).toHaveClass('bg-red-500')
    expect(hours[1]).toHaveAttribute('data-status', 'unknown')
    expect(hours[2]).toHaveAttribute('data-status', 'unknown')
    expect(hours[3]).toHaveClass('bg-emerald-500')

    await user.tab()
    await user.keyboard('{Home}{ArrowRight}')
    expect(
      within(await screen.findByRole('tooltip')).getByText(
        'No samples in this hour'
      )
    ).toBeVisible()
  })

  it('uses shared green, yellow and red boundaries without treating zero as missing', async () => {
    const user = userEvent.setup()
    render(
      <AvailabilityTimeline
        modelName='threshold-model'
        windowStart={START}
        windowEnd={START + 4 * HOUR - 1}
        series={[
          { ts: START, success_rate: 90 },
          { ts: START + HOUR, success_rate: 70 },
          { ts: START + 2 * HOUR, success_rate: 69.9 },
          { ts: START + 3 * HOUR, success_rate: 0 },
        ]}
      />
    )

    const hours = screen
      .getByRole('button')
      .querySelectorAll('[data-slot="availability-hour"]')
    expect(hours[0]).toHaveClass('bg-emerald-400')
    expect(hours[1]).toHaveClass('bg-amber-500')
    expect(hours[2]).toHaveClass('bg-red-500')
    expect(hours[3]).toHaveClass('bg-red-500')
    await user.tab()
    expect(
      within(await screen.findByRole('tooltip')).getByText('Success rate: 0%')
    ).toBeVisible()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Success rate: 90%')
  })

  it('shows invalid and out-of-range rates as gray hours with no sample value', async () => {
    const user = userEvent.setup()
    render(
      <AvailabilityTimeline
        modelName='invalid-model'
        windowStart={START}
        windowEnd={START + 4 * HOUR - 1}
        series={[
          { ts: START, success_rate: Number.NaN },
          { ts: START + HOUR, success_rate: Number.POSITIVE_INFINITY },
          { ts: START + 2 * HOUR, success_rate: -1 },
          { ts: START + 3 * HOUR, success_rate: 101 },
        ]}
      />
    )

    const hours = screen
      .getByRole('button')
      .querySelectorAll('[data-slot="availability-hour"]')
    for (const hour of hours) {
      expect(hour).toHaveAttribute('data-status', 'unknown')
    }
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'No samples in this hour'
    )
    expect(screen.queryByText(/101%|NaN|Infinity/)).not.toBeInTheDocument()
  })

  it('draws an empty seven-day strip within its container with only one tab stop', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AvailabilityTimeline
          modelName='empty-model'
          windowStart={START}
          windowEnd={START + 167 * HOUR}
          series={[]}
        />
        <a href='#after'>After timeline</a>
      </>
    )

    const timeline = screen.getByRole('button')
    const hours = timeline.querySelectorAll('[data-slot="availability-hour"]')
    expect(hours).toHaveLength(168)
    expect(timeline).toHaveClass('w-full', 'min-w-0')
    for (const hour of hours) {
      expect(hour).toHaveClass('min-w-0', 'flex-1')
      expect(hour).toHaveAttribute('data-status', 'unknown')
    }
    await user.tab()
    expect(timeline).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'After timeline' })).toHaveFocus()
  })

  it('lets pointer and keyboard users inspect the current unfinished hour', async () => {
    const user = userEvent.setup()
    vi.spyOn(Date, 'now').mockReturnValue((START + 2 * HOUR + 900) * 1_000)
    render(
      <AvailabilityTimeline
        modelName='current-model'
        windowStart={START}
        windowEnd={START + 2 * HOUR + 900}
        series={[
          { ts: START, success_rate: 75 },
          { ts: START + 2 * HOUR, success_rate: 98.5 },
        ]}
      />
    )

    const timeline = screen.getByRole('button')
    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Success rate: 98.5%'
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Current hour is still in progress'
    )
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Success rate: 98.5%')
    await user.keyboard('{Home}{ArrowLeft}')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Success rate: 75%')
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(
      'Current hour is still in progress'
    )
    const currentHour = timeline.querySelectorAll(
      '[data-slot="availability-hour"]'
    )[2]
    fireEvent.pointerEnter(currentHour)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Success rate: 98.5%')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.click(
      timeline.querySelectorAll('[data-slot="availability-hour"]')[0]
    )
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Success rate: 75%'
    )
  })
})

it('translates the success-rate tooltip when the interface language changes to Chinese', async () => {
  const zh = await import('@/i18n/locales/zh.json')
  i18next.addResourceBundle(
    'zh',
    'translation',
    zh.default.translation,
    true,
    true
  )
  await i18next.changeLanguage('zh')
  try {
    render(
      <AvailabilityTimeline
        modelName='translated-model'
        windowStart={1789387200}
        windowEnd={1789389000}
        series={[{ ts: 1789387200, success_rate: 100 }]}
      />
    )
    await userEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('成功率: 100%')
  } finally {
    await i18next.changeLanguage('en')
  }
})
