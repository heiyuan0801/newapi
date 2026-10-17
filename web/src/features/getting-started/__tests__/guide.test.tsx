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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { GettingStartedGuide } from '..'

let client: QueryClient
let created = false
beforeEach(() => {
  created = false
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {
    server_address: 'https://api.example/proxy/',
  })
  useAuthStore
    .getState()
    .auth.setUser({ id: 2, username: 'viewer', group: 'default', role: 1 })
})
afterEach(() => {
  client.clear()
  useAuthStore.getState().auth.setUser(null)
})

function fixtures() {
  return vi.spyOn(api, 'get').mockImplementation(async (path, config) => {
    if (path === '/api/status') {
      return {
        data: {
          success: true,
          data: { server_address: 'https://api.example/proxy/' },
        },
      } as Awaited<ReturnType<typeof api.get>>
    }
    if (path === '/api/user/self/groups') {
      return {
        data: {
          success: true,
          data: {
            default: { desc: 'Standard', ratio: 1 },
            vip: { desc: 'Priority', ratio: 2 },
          },
        },
      } as Awaited<ReturnType<typeof api.get>>
    }
    if (path === '/api/user/models') {
      return {
        data: {
          success: true,
          data:
            config?.params?.group === 'vip' ? ['vip-model'] : ['default-model'],
        },
      } as Awaited<ReturnType<typeof api.get>>
    }
    if (String(path).startsWith('/api/token/?')) {
      return {
        data: {
          success: true,
          data: {
            items: created
              ? [
                  {
                    id: 1,
                    name: 'Guide key',
                    group: 'default',
                    status: 1,
                    expired_time: -1,
                    key: 'masked-should-never-display',
                  },
                ]
              : [],
          },
        },
      } as Awaited<ReturnType<typeof api.get>>
    }
    if (path === '/api/token/auto-groups') {
      return {
        data: { success: true, data: { groups: ['default'], max_count: 5 } },
      } as Awaited<ReturnType<typeof api.get>>
    }
    throw new Error(`Unexpected guide request ${path}`)
  })
}

function guide(onPlayground = vi.fn()) {
  return (
    <QueryClientProvider client={client}>
      <GettingStartedGuide onPlayground={onPlayground} />
    </QueryClientProvider>
  )
}

it('shows configured BaseURL and selected model while keeping keys out of examples and storage', async () => {
  const get = fixtures()
  const post = vi.spyOn(api, 'post')
  const onPlayground = vi.fn()
  render(guide(onPlayground))
  expect(await screen.findByLabelText('Safe curl example')).toHaveTextContent(
    'https://api.example/proxy/v1/chat/completions'
  )
  expect(screen.getByLabelText('Safe curl example')).toHaveTextContent(
    'default-model'
  )
  expect(screen.getByLabelText('Safe curl example')).toHaveTextContent(
    '$NEW_API_KEY'
  )
  expect(post).not.toHaveBeenCalled()
  expect(onPlayground).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('button', { name: 'Open Playground with selection' })
  )
  expect(onPlayground).toHaveBeenCalledWith('default-model', 'default')
  expect(post).not.toHaveBeenCalled()
  expect(get.mock.calls.every(([url]) => !String(url).endsWith('/key'))).toBe(
    true
  )
  expect(JSON.stringify(localStorage)).not.toContain(
    'masked-should-never-display'
  )
})

it('loads models separately after selecting another group before launching Playground', async () => {
  fixtures()
  const onPlayground = vi.fn()
  render(guide(onPlayground))
  await screen.findByLabelText('Safe curl example')
  await userEvent.click(screen.getByRole('combobox'))
  await userEvent.click(screen.getByRole('button', { name: 'vip' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Safe curl example')).toHaveTextContent(
      'vip-model'
    )
  )
  await userEvent.keyboard('{Escape}')
  await userEvent.click(
    screen.getByRole('button', { name: 'Open Playground with selection' })
  )
  expect(onPlayground).toHaveBeenCalledWith('vip-model', 'vip')
})

it('refreshes completed key metadata after creating through the shared drawer', async () => {
  fixtures()
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    expect(url).toBe('/api/token/')
    created = true
    return { data: { success: true, data: {} } } as Awaited<
      ReturnType<typeof api.post>
    >
  })
  render(guide())
  await screen.findByLabelText('Safe curl example')
  await userEvent.click(screen.getByRole('button', { name: 'Create API Key' }))
  const input = await screen.findByRole('textbox', { name: 'Name' })
  await userEvent.type(input, 'Guide key')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(
    await screen.findByText('Existing key for this group: Guide key')
  ).toBeVisible()
  expect(
    screen.queryByText('masked-should-never-display')
  ).not.toBeInTheDocument()
  expect(post).toHaveBeenCalledTimes(1)
  expect(
    screen.getByRole('button', { name: 'Create another API key' })
  ).toBeEnabled()
})

it('retains an existing group key and does not force another creation', async () => {
  fixtures()
  created = true
  const post = vi.spyOn(api, 'post')
  render(guide())
  expect(
    await screen.findByText('Existing key for this group: Guide key')
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Create another API key' })
  ).toBeEnabled()
  expect(post).not.toHaveBeenCalled()
})

it('honors disabled key and Playground modules without fetching key metadata or enabling hidden actions', async () => {
  const get = fixtures()
  client.setQueryData(['status'], {
    server_address: 'https://api.example',
    SidebarModulesAdmin: JSON.stringify({
      console: { enabled: true, token: false },
      chat: { enabled: true, playground: false },
    }),
  })
  render(guide())
  await screen.findByLabelText('Safe curl example')
  expect(screen.getByRole('button', { name: 'Create API Key' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Manage and copy API keys' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Open Playground with selection' })
  ).toBeDisabled()
  expect(
    get.mock.calls.some(([path]) => String(path).startsWith('/api/token/'))
  ).toBe(false)
})

it('keeps manual testing disabled when the model query fails and permits retry', async () => {
  const get = fixtures()
  const success = get.getMockImplementation()
  if (!success) throw new Error('Missing API fixture')
  get.mockImplementation(async (path) => {
    if (path === '/api/user/self/groups') {
      return { data: { success: false, message: 'unavailable' } } as Awaited<
        ReturnType<typeof api.get>
      >
    }
    return { data: { success: true, data: { items: [] } } } as Awaited<
      ReturnType<typeof api.get>
    >
  })
  render(guide())
  expect(
    await screen.findByText('Unable to load available models and groups')
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Open Playground with selection' })
  ).toBeDisabled()
  expect(screen.queryByLabelText('Safe curl example')).not.toBeInTheDocument()
  get.mockImplementation(success)
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByLabelText('Safe curl example')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Open Playground with selection' })
  ).toBeEnabled()
})

it('keeps testing unavailable for an empty model group without substituting a model from another group', async () => {
  const get = fixtures()
  const success = get.getMockImplementation()
  if (!success) throw new Error('Missing API fixture')
  get.mockImplementation(async (path, config) =>
    path === '/api/user/models'
      ? ({ data: { success: true, data: [] } } as Awaited<
          ReturnType<typeof api.get>
        >)
      : success(path, config)
  )
  render(guide())
  expect(
    await screen.findByText('No available models in this group')
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Open Playground with selection' })
  ).toBeDisabled()
  expect(screen.queryByLabelText('Safe curl example')).not.toBeInTheDocument()
})

it('retains an editable drawer and unfinished key step when the server refuses key creation', async () => {
  fixtures()
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'creation disabled' },
  })
  render(guide())
  await screen.findByLabelText('Safe curl example')
  await userEvent.click(screen.getByRole('button', { name: 'Create API Key' }))
  await userEvent.type(
    await screen.findByRole('textbox', { name: 'Name' }),
    'Denied key'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(
    screen.queryByText(/Existing key for this group:/)
  ).not.toBeInTheDocument()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  )
})
