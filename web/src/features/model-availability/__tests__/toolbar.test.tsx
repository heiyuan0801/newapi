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
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AvailabilityToolbar } from '../components/availability-toolbar'

describe('model availability search toolbar', () => {
  it('preserves spaces while drafting a multiword query and only applies it on Search', async () => {
    const apply = vi.fn()
    function RouterControlledToolbar() {
      const [query, setQuery] = useState('')
      return (
        <AvailabilityToolbar
          group=''
          groups={['default', 'vip']}
          onGroupChange={vi.fn()}
          query={query}
          status='all'
          onStatusChange={vi.fn()}
          onQueryChange={(value) => {
            apply(value)
            setQuery(value.trim())
          }}
        />
      )
    }
    render(<RouterControlledToolbar />)
    const user = userEvent.setup()
    const input = screen.getByRole('searchbox', { name: 'Search models' })
    await user.type(input, '  Zhipu AI  ')
    expect(input).toHaveValue('  Zhipu AI  ')
    expect(apply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(apply).toHaveBeenCalledExactlyOnceWith('Zhipu AI')
    expect(input).toHaveValue('Zhipu AI')
  })

  it('does not submit while Enter confirms an input method composition', async () => {
    const apply = vi.fn()
    render(
      <AvailabilityToolbar
        group=''
        groups={['default', 'vip']}
        onGroupChange={vi.fn()}
        query=''
        status='all'
        onStatusChange={vi.fn()}
        onQueryChange={apply}
      />
    )
    const input = screen.getByRole('searchbox', { name: 'Search models' })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '智谱 AI' } })
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(
      false
    )
    expect(apply).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    await userEvent.setup().type(input, '{Enter}')
    expect(apply).toHaveBeenCalledExactlyOnceWith('智谱 AI')
  })

  it('updates the draft when an external route change clears the applied query', async () => {
    const props = {
      group: '',
      groups: ['default', 'vip'],
      onGroupChange: vi.fn(),
      status: 'all' as const,
      onStatusChange: vi.fn(),
      onQueryChange: vi.fn(),
    }
    const view = render(<AvailabilityToolbar {...props} query='gemini' />)
    const input = screen.getByRole('searchbox', { name: 'Search models' })
    await userEvent.setup().type(input, ' draft')
    expect(input).toHaveValue('gemini draft')
    view.rerender(<AvailabilityToolbar {...props} query='' />)
    expect(input).toHaveValue('')
    expect(props.onQueryChange).not.toHaveBeenCalled()
  })

  it('applies an empty query when the search input is cleared and submitted', async () => {
    const apply = vi.fn()
    render(
      <AvailabilityToolbar
        group=''
        groups={['default', 'vip']}
        onGroupChange={vi.fn()}
        query='claude'
        status='all'
        onStatusChange={vi.fn()}
        onQueryChange={apply}
      />
    )
    const user = userEvent.setup()
    const input = screen.getByRole('searchbox', { name: 'Search models' })
    await user.clear(input)
    expect(apply).not.toHaveBeenCalled()
    await user.type(input, '{Enter}')
    expect(apply).toHaveBeenCalledExactlyOnceWith('')
  })

  it('clears an unsubmitted draft when filters reset without changing the applied query', async () => {
    const props = {
      group: '',
      groups: ['default', 'vip'],
      onGroupChange: vi.fn(),
      query: '',
      status: 'healthy' as const,
      onStatusChange: vi.fn(),
      onQueryChange: vi.fn(),
    }
    const view = render(<AvailabilityToolbar {...props} resetToken={0} />)
    const input = screen.getByRole('searchbox', { name: 'Search models' })
    await userEvent.setup().type(input, 'unsubmitted draft')
    expect(input).toHaveValue('unsubmitted draft')
    view.rerender(
      <AvailabilityToolbar {...props} status='all' resetToken={1} />
    )
    expect(input).toHaveValue('')
    expect(props.onQueryChange).not.toHaveBeenCalled()
  })
})
