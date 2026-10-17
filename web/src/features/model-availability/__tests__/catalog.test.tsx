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
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { useAvailabilityCatalog } from '../hooks/use-availability-catalog'

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {
    HeaderNavModules: { pricing: { enabled: false, requireAuth: false } },
  })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'viewer',
    role: 1,
    group: 'default',
  })
})
afterEach(() => {
  client.clear()
  useAuthStore.getState().auth.reset()
})

function wrapper(props: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}

it('preserves the same model in two real groups without requesting a disabled public directory', async () => {
  const request = vi
    .spyOn(api, 'get')
    .mockImplementation(async (url, config) => {
      if (url === '/api/user/self/groups') {
        return {
          data: {
            success: true,
            data: {
              default: { desc: 'Standard', ratio: 1 },
              vip: { desc: 'Premium', ratio: 2 },
              auto: { desc: 'Automatic', ratio: 'auto' },
            },
          },
        }
      }
      if (url === '/api/user/models' && config?.params?.group) {
        return { data: { success: true, data: ['shared-model'] } }
      }
      throw new Error(`Unexpected API: ${url}`)
    })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.hasData).toBe(true))
  expect(result.current.models).toEqual([
    {
      model_name: 'shared-model',
      enable_groups: ['auto', 'default', 'vip'],
    },
  ])
  expect(request).toHaveBeenCalledWith('/api/user/models', {
    params: { group: 'auto' },
  })
  expect(request).not.toHaveBeenCalledWith('/api/pricing')
})

it('reports a failed group request as an error rather than a successful empty directory', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/user/self/groups') {
      return {
        data: { success: true, data: { default: {}, vip: {} } },
      }
    }
    if (config?.params?.group === 'vip') {
      return {
        data: { success: false, message: 'Group directory unavailable' },
      }
    }
    return { data: { success: true, data: ['shared-model'] } }
  })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.error).toBeTruthy())
  expect(result.current.hasData).toBe(false)
  expect(result.current.isLoading).toBe(false)
})

it('refreshes the group directory and every group model list including a newly added group', async () => {
  let expanded = false
  const request = vi
    .spyOn(api, 'get')
    .mockImplementation(async (url, config) => {
      if (url === '/api/user/self/groups') {
        return {
          data: {
            success: true,
            data: expanded ? { default: {}, vip: {} } : { default: {} },
          },
        }
      }
      return {
        data: {
          success: true,
          data: [`${config?.params?.group}-model`],
        },
      }
    })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.hasData).toBe(true))
  expanded = true
  request.mockClear()
  await act(async () => {
    await result.current.refetch()
  })
  await waitFor(() => expect(result.current.models).toHaveLength(2))
  expect(request).toHaveBeenCalledWith('/api/user/self/groups')
  expect(request).toHaveBeenCalledWith('/api/user/models', {
    params: { group: 'default' },
  })
  expect(request).toHaveBeenCalledWith('/api/user/models', {
    params: { group: 'vip' },
  })
})

it('preserves the last loaded group models when a background refresh fails', async () => {
  let failed = false
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self/groups') {
      return { data: { success: true, data: { vip: {} } } }
    }
    if (failed) throw new Error('Temporary group failure')
    return { data: { success: true, data: ['shared-model'] } }
  })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.hasData).toBe(true))
  failed = true
  await act(async () => {
    await result.current.refetch()
  })
  await waitFor(() => expect(result.current.error).toBeTruthy())
  expect(result.current.hasData).toBe(true)
  expect(result.current.models).toEqual([
    { model_name: 'shared-model', enable_groups: ['vip'] },
  ])
})

it('keeps the complete previous catalog when a newly added group fails and replaces it after a successful retry', async () => {
  let expanded = false
  let vipFailed = true
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/user/self/groups') {
      return {
        data: {
          success: true,
          data: expanded ? { default: {}, vip: {} } : { default: {} },
        },
      }
    }
    if (config?.params?.group === 'vip' && vipFailed) {
      return { data: { success: false, message: 'New group unavailable' } }
    }
    const name = expanded ? `${config?.params?.group}-new` : 'original-model'
    return { data: { success: true, data: [name] } }
  })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.hasData).toBe(true))
  expanded = true
  await act(async () => {
    await result.current.refetch()
  })
  await waitFor(() => expect(result.current.error).toBeTruthy())
  expect(result.current.hasData).toBe(true)
  expect(result.current.models).toEqual([
    { model_name: 'original-model', enable_groups: ['default'] },
  ])

  vipFailed = false
  await act(async () => {
    await result.current.refetch()
  })
  await waitFor(() => expect(result.current.error).toBeNull())
  expect(result.current.models).toEqual([
    { model_name: 'default-new', enable_groups: ['default'] },
    { model_name: 'vip-new', enable_groups: ['vip'] },
  ])
})

it('removes departed groups and commits an empty catalog after a successful empty group refresh', async () => {
  let groups = { default: {}, vip: {} } as Record<string, object>
  const request = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self/groups') {
      return { data: { success: true, data: groups } }
    }
    return { data: { success: true, data: ['shared-model'] } }
  })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.hasData).toBe(true))
  groups = { vip: {} }
  await act(async () => {
    await result.current.refetch()
  })
  await waitFor(() =>
    expect(result.current.models).toEqual([
      { model_name: 'shared-model', enable_groups: ['vip'] },
    ])
  )

  groups = {}
  request.mockClear()
  await act(async () => {
    await result.current.refetch()
  })
  await waitFor(() => expect(result.current.models).toEqual([]))
  expect(result.current.hasData).toBe(true)
  expect(result.current.error).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('/api/user/self/groups')
})

it('keeps a genuine empty group directory empty without inventing a default group', async () => {
  const request = vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: {} },
  })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.hasData).toBe(true))
  expect(result.current.models).toEqual([])
  expect(result.current.isLoading).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('/api/user/self/groups')
})

it('keeps the enabled pricing directory groups and vendor metadata without fallback requests', async () => {
  client.setQueryData(['status'], {})
  const request = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          model_name: 'shared-model',
          vendor_id: 1,
          enable_groups: ['default', 'vip'],
        },
      ],
      vendors: [{ id: 1, name: 'Example AI' }],
    },
  })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() => expect(result.current.hasData).toBe(true))
  expect(result.current.models).toEqual([
    expect.objectContaining({
      model_name: 'shared-model',
      enable_groups: ['default', 'vip'],
      vendor_name: 'Example AI',
    }),
  ])
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledWith('/api/pricing')
})

it('isolates the authenticated directory cache when the active user changes', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    const userId = useAuthStore.getState().auth.user?.id
    if (url === '/api/user/self/groups') {
      return { data: { success: true, data: { [`group-${userId}`]: {} } } }
    }
    return { data: { success: true, data: [`model-${userId}`] } }
  })
  const { result } = renderHook(useAvailabilityCatalog, { wrapper })
  await waitFor(() =>
    expect(result.current.models[0]?.model_name).toBe('model-1')
  )
  act(() => {
    useAuthStore.getState().auth.setUser({
      id: 2,
      username: 'another-viewer',
      role: 1,
      group: 'vip',
    })
  })
  await waitFor(() =>
    expect(result.current.models[0]?.model_name).toBe('model-2')
  )
  expect(result.current.models).toEqual([
    { model_name: 'model-2', enable_groups: ['group-2'] },
  ])
})
