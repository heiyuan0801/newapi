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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { HeroTerminalDemo } from '../components/hero-terminal-demo'

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(STATUS_QUERY_KEY, {
    server_address: 'https://gateway.example/',
  })
})
afterEach(() => client.clear())

function renderExamples() {
  return render(
    <QueryClientProvider client={client}>
      <HeroTerminalDemo />
    </QueryClientProvider>
  )
}

describe('public API examples', () => {
  it('copies a valid multiline curl request using the configured gateway', async () => {
    const user = userEvent.setup()
    renderExamples()
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }))
    const value = await navigator.clipboard.readText()
    expect(value).toContain('https://gateway.example/v1/chat/completions')
    expect(value).toContain('Content-Type: application/json')
    expect(value).toContain('Authorization: Bearer YOUR_API_KEY')
    expect(value).toContain(String.fromCharCode(92, 10))
    expect(value).not.toContain(String.fromCharCode(92, 110))
    const payload = value.split("-d '")[1].slice(0, -1)
    expect(JSON.parse(payload)).toEqual({
      model: 'YOUR_MODEL',
      messages: [{ role: 'user', content: 'Hello!' }],
    })
  })

  it('switches protocol tabs with the keyboard and copies the required Claude header', async () => {
    const user = userEvent.setup()
    renderExamples()
    screen.getByRole('tab', { name: /^Chat$/ }).focus()
    await user.keyboard('{ArrowRight}{Enter}')
    expect(screen.getByRole('tab', { name: 'Responses' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await user.click(screen.getByRole('tab', { name: 'Claude' }))
    await user.click(screen.getByRole('button', { name: 'Copy to clipboard' }))
    const value = await navigator.clipboard.readText()
    expect(value).toContain('/v1/messages')
    expect(value).toContain('anthropic-version: 2023-06-01')
    expect(value).toContain('x-api-key: YOUR_API_KEY')
    expect(screen.getByRole('tab', { name: 'Claude' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('shows the correct Gemini request without invented response or latency metrics', async () => {
    const user = userEvent.setup()
    renderExamples()
    await user.click(screen.getByRole('tab', { name: 'Gemini' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      '/v1beta/models/YOUR_MODEL:generateContent'
    )
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'x-goog-api-key: YOUR_API_KEY'
    )
    expect(screen.queryByText('200 ok')).not.toBeInTheDocument()
  })

  it('falls back to the current origin when no gateway address is configured', () => {
    client.setQueryData(STATUS_QUERY_KEY, { server_address: null })
    renderExamples()
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      `${window.location.origin}/v1/chat/completions`
    )
  })
})
